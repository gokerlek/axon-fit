import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { emptySessionIndex, sessionPath, type SessionDoc } from './schemas/session.ts';
import { durationOf, indexRowOf, removeIndexRow, repairIndex, upsertIndexRow, volumeOf, waterOf } from './session-index.ts';
import { tombstoneOf } from './session-merge.ts';
import { at, DAY_A, DAY_B, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const shaOf = (content: unknown) => gitBlobSha(jsonText(content));

function finished(id: string, minute: number, overrides: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({ id, status: 'finished', startedAt: at(minute), finishedAt: at(minute + 52), ...overrides });
}

describe('index satırı', () => {
  test('tonaj, set, su, süre, hareketler, bildirimler', () => {
    const doc = finished('s_aaaaaaaa', 0, {
      program: { revision: 3, dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A },
      entries: [
        sessionEntry('e_aaaaaa', {
          rowId: 'r_aaaaaa',
          deviceId: 'olympic-bar',
          plan: { topWeightKg: 62.5, reason: 'increase', stage: 'novice' },
          sets: [
            { id: 'st_warmup01', type: 'warmup', kg: 20, reps: 10, at: at(1) },
            workingSet('st_aaaaaaaa', 2, { kg: 62.5, reps: 10 }),
            workingSet('st_bbbbbbbb', 4, { kg: 62.5, reps: 9 }),
            workingSet('st_cccccccc', 6, { kg: 50, reps: 12, target: { min: 10, max: 12, loadPct: 80 } }),
          ],
        }),
        sessionEntry('e_bbbbbb', { exerciseId: 'plank', title: 'Plank', sets: [workingSet('st_dddddddd', 8, { kg: undefined, reps: undefined, seconds: 60 })] }),
        sessionEntry('e_cccccc', { exerciseId: 'curl', title: 'Curl', status: 'skipped' }),
      ],
      waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(2) }, { id: 'wt_bbbbbbbb', d: 1, at: at(3) }, { id: 'wt_cccccccc', d: -1, at: at(4) }],
      notices: [{ kind: 'other_day', at: at(0) }, { kind: 'unfinished', at: at(52) }, { kind: 'overload', at: at(5) }, { kind: 'overload', at: at(6) }],
    });
    const row = indexRowOf(doc, 'f'.repeat(40));
    assert.deepEqual(row, {
      id: 's_aaaaaaaa',
      sha: 'f'.repeat(40),
      path: 'sessions/s_aaaaaaaa.json',
      date: '2026-09-26',
      startedAt: at(0),
      finishedAt: at(52),
      dayId: DAY_B,
      dayName: 'Gün B',
      otherDay: true,
      unfinished: true,
      durationMin: 52,
      // 62,5×10 + 62,5×9 + 50×12; ısınma ve süreli set yok.
      volumeKg: 1787.5,
      sets: 4,
      water: 1,
      exercises: [
        { exerciseId: 'bench-press', rowId: 'r_aaaaaa', deviceId: 'olympic-bar', topKg: 62.5, sets: 3, full: true, reason: 'increase', stage: 'novice' },
        { exerciseId: 'plank', sets: 1, full: true },
      ],
      notices: ['other_day', 'overload', 'unfinished'],
    });
  });

  test('su en az 0; süre danışanın onayladığından; tonajda kaçırılan setin tekrarı sayılır', () => {
    assert.equal(waterOf({ waterTaps: [{ id: 'wt_aaaaaaaa', d: -1, at: at(1) }] }), 0);
    assert.equal(durationOf({ startedAt: at(0), finishedAt: at(80), effort: { durationMin: 55, updatedAt: at(90) } }), 55);
    assert.equal(volumeOf({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 1, { reps: 3, effort: 'fail' })] })] }), 180);
  });

  test('ekleme en yeni üstte; silme satırı çıkarır, kimliği bir kez silinenlere yazar', () => {
    const older = indexRowOf(finished('s_aaaaaaaa', 0), 'a'.repeat(40));
    const newer = indexRowOf(finished('s_bbbbbbbb', 3000), 'b'.repeat(40));
    let index = upsertIndexRow(upsertIndexRow(emptySessionIndex(), older), newer);
    assert.deepEqual(index.items.map((row) => row.id), ['s_bbbbbbbb', 's_aaaaaaaa']);
    index = removeIndexRow(index, 's_aaaaaaaa', new Date(at(4000)));
    index = removeIndexRow(index, 's_aaaaaaaa', new Date(at(5000)));
    assert.deepEqual(index.items.map((row) => row.id), ['s_bbbbbbbb']);
    assert.deepEqual(index.deleted, [{ id: 's_aaaaaaaa', at: at(4000) }]);
  });
});

describe('index onarımı', () => {
  const a = finished('s_aaaaaaaa', 0);
  const b = finished('s_bbbbbbbb', 3000);
  const c = sessionDoc({ id: 's_cccccccc', startedAt: at(6000) });
  const files = (...docs: unknown[]) =>
    docs.map((doc) => ({ path: sessionPath((doc as { id: string }).id), sha: shaOf(doc), doc }));

  test('eksik satır dosyasından kurulur; sha tutan satır okunmaz; dosyası olmayan satır düşer', async () => {
    const [fa, fb, fc] = files(a, b, c);
    const ghost = indexRowOf(finished('s_dddddddd', 100), 'd'.repeat(40));
    const index = { version: 1 as const, items: [indexRowOf(a, fa!.sha), ghost], deleted: [] };
    const reads: string[] = [];
    const result = await repairIndex(index, [fa!, fb!, fc!], async (file) => {
      reads.push(file.path);
      return [fa, fb, fc].find((item) => item?.path === file.path)?.doc;
    });
    assert.deepEqual(reads, ['sessions/s_bbbbbbbb.json', 'sessions/s_cccccccc.json']);
    assert.deepEqual(result.index.items.map((row) => row.id), ['s_cccccccc', 's_bbbbbbbb', 's_aaaaaaaa']);
    assert.deepEqual(result.rebuilt, ['s_bbbbbbbb', 's_cccccccc']);
    assert.deepEqual(result.dropped, ['s_dddddddd']);
    assert.equal(result.changed, true);
    // Etkin antrenman satırı bitiş anı olmadan (yarım).
    assert.equal(result.index.items[0]?.finishedAt, undefined);
  });

  test('sha farklıysa yeniden kurulur (PATCH sonrası eski satır)', async () => {
    const edited = { ...a, waterTaps: [{ id: 'wt_aaaaaaaa', d: 1 as const, at: at(3) }] };
    const [fe] = files(edited);
    const index = { version: 1 as const, items: [indexRowOf(a, shaOf(a))], deleted: [] };
    const result = await repairIndex(index, [fe!], async () => edited);
    assert.equal(result.index.items[0]?.water, 1);
    assert.equal(result.index.items[0]?.sha, fe!.sha);
  });

  test('iz dosyası silinenlere girer (index bozuk olsa da); silinmiş kimliğin dosyası okunmaz', async () => {
    const stone = tombstoneOf('s_aaaaaaaa', new Date(at(9000)));
    const [fs, fb] = files(stone, b);
    const rebuilt = await repairIndex(emptySessionIndex(), [fs!, fb!], async (file) => (file.path === fs!.path ? stone : b));
    assert.deepEqual(rebuilt.index.deleted, [{ id: 's_aaaaaaaa', at: at(9000) }]);
    assert.deepEqual(rebuilt.index.items.map((row) => row.id), ['s_bbbbbbbb']);

    const reads: string[] = [];
    const again = await repairIndex(rebuilt.index, [fs!, fb!], async (file) => {
      reads.push(file.path);
      return null;
    });
    assert.deepEqual(reads, []);
    assert.equal(again.changed, false);
  });

  test('okunamayan dosya: eski satır kalır, onarım durmaz', async () => {
    const [fa, fb] = files(a, b);
    const index = { version: 1 as const, items: [indexRowOf(a, 'e'.repeat(40))], deleted: [] };
    const result = await repairIndex(index, [{ ...fa!, sha: '1'.repeat(40) }, fb!], async (file) => {
      if (file.path === fa!.path) throw new Error('bozuk');
      return b;
    });
    assert.deepEqual(result.unreadable, ['s_aaaaaaaa']);
    assert.deepEqual(result.index.items.map((row) => row.id), ['s_bbbbbbbb', 's_aaaaaaaa']);
  });
});
