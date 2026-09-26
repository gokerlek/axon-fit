import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySessionIndex, type SessionDoc } from './schemas/session.ts';
import { indexRowOf, upsertIndexRow } from './session-index.ts';
import { deleteCopy, deletePatch, firstHistoryRows, historyList, sessionDetail, DELETE_BODY, DELETE_DETAIL, type HistoryMonth } from './session-history.ts';
import { at, DAY_A, DAY_B, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const TZ = 'Europe/Istanbul';

function finished(id: string, minute: number, overrides: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({ id, status: 'finished', startedAt: at(minute), finishedAt: at(minute + 52), ...overrides });
}

describe('geçmiş listesi', () => {
  const first = finished('s_aaaaaaaa', 0, {
    date: '2026-09-26',
    entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 1, { kg: 60, reps: 10 })] })],
  });
  const second = finished('s_bbbbbbbb', 3000, {
    date: '2026-09-28',
    program: { revision: 1, dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A, plannedDayName: 'Gün A' },
    entries: [sessionEntry('e_bbbbbb', { sets: [workingSet('st_bbbbbbbb', 3001, { kg: 62.5, reps: 10 })] })],
    notices: [{ kind: 'unfinished', at: at(3052), done: 1, planned: 3 }],
  });
  const august = finished('s_cccccccc', -60_000, {
    date: '2026-08-15',
    entries: [sessionEntry('e_cccccc', { sets: [workingSet('st_cccccccc', -59_999, { kg: 50, reps: 10 })] })],
  });
  const active = sessionDoc({ id: 's_dddddddd', startedAt: at(4000), date: '2026-09-29' });
  const index = [first, second, august, active].reduce((acc, doc, i) => upsertIndexRow(acc, indexRowOf(doc, String(i).repeat(40))), emptySessionIndex());

  test('bitmişler en yeniden eskiye, aylara bölünmüş; satırda gün, süre, set, toplam ağırlık, rekor, rozetler', () => {
    const list = historyList(index, new Date(at(4100)), TZ);
    assert.equal(list.count, 3);
    assert.deepEqual(
      list.months.map((month) => [month.label, month.rows.map((row) => row.id)]),
      [
        ['EYLÜL 2026', ['s_bbbbbbbb', 's_aaaaaaaa']],
        ['AĞUSTOS 2026', ['s_cccccccc']],
      ],
    );
    assert.deepEqual(list.months[0]?.rows[0], {
      id: 's_bbbbbbbb',
      dayOfMonth: '28',
      weekday: 'Pzt',
      title: 'Gün B · 52 dk',
      meta: '1 set · 625 kg',
      otherDay: true,
      unfinished: true,
      prs: 1,
    });
  });

  test('son 30 günün özeti; eski antrenman girmez', () => {
    assert.equal(historyList(index, new Date(at(4100)), TZ).recent, 'Son 30 gün · 2 antrenman · 1 sa 44 dk · 2 rekor');
    assert.equal(historyList(emptySessionIndex(), new Date(at(0)), TZ).recent, null);
  });
});

describe('"Daha fazla göster"', () => {
  test('ilk n satır aylara bölünmüş kalır; boş kalan ay düşer', () => {
    const month = (key: string, ids: string[]): HistoryMonth => ({
      key,
      label: key,
      rows: ids.map((id) => ({ id, dayOfMonth: '1', weekday: 'Pzt', title: 'Gün A', meta: '', otherDay: false, unfinished: false, prs: 0 })),
    });
    const months = [month('2026-09', ['a', 'b']), month('2026-08', ['c', 'd']), month('2026-07', ['e'])];
    assert.deepEqual(
      firstHistoryRows(months, 3).map((item) => [item.key, item.rows.map((row) => row.id)]),
      [
        ['2026-09', ['a', 'b']],
        ['2026-08', ['c']],
      ],
    );
    assert.equal(firstHistoryRows(months, 10).length, 3);
  });
});

describe('antrenmanın detayı', () => {
  const doc = finished('s_aaaaaaaa', 0, {
    entries: [
      sessionEntry('e_aaaaaa', {
        setupNote: 'Sehpa 3. delik',
        sets: [
          { id: 'st_warmup01', type: 'warmup', kg: 20, reps: 10, at: at(1) },
          workingSet('st_aaaaaaaa', 2, { kg: 60, reps: 10, effort: 'good', plannedSetCount: 3 }),
          workingSet('st_bbbbbbbb', 4, { kg: 60, reps: 9, effort: 'hard', plannedSetCount: 3 }),
        ],
      }),
      sessionEntry('e_bbbbbb', { exerciseId: 'plank', title: 'Plank', status: 'skipped', skip: { reason: 'busy', moved: false } }),
      sessionEntry('e_cccccc', { exerciseId: 'curl', title: 'Curl' }),
    ],
    order: { value: ['e_bbbbbb', 'e_aaaaaa', 'e_cccccc'], updatedAt: at(1) },
    waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(3) }],
    effort: { sessionRpe: 6, updatedAt: at(70) },
  });

  test('hareketler yapılış sırasıyla; ısınma ayrı; zorluk; geçilenin nedeni; boş hareket yok', () => {
    const detail = sessionDetail(doc, TZ);
    assert.equal(detail.title, 'Gün A · 26 Eylül 2026');
    assert.equal(detail.meta, '18:00–18:52 · 2 set · 1.140 kg');
    assert.equal(detail.water, 1);
    assert.equal(detail.effort, 'Zorluk 6/10');
    assert.deepEqual(
      detail.exercises.map((item) => [item.title, item.note]),
      [
        ['Plank', 'geçildi · Alet dolu'],
        ['Bench Press', '2/3 set'],
      ],
    );
    assert.equal(detail.exercises[1]?.setupNote, 'Sehpa 3. delik');
    assert.deepEqual(detail.exercises[1]?.sets, [
      { id: 'st_warmup01', label: 'Isınma', text: '20 kg × 10', effort: null, warmup: true, extra: false },
      { id: 'st_aaaaaaaa', label: '1', text: '60 kg × 10', effort: 'İyi', warmup: false, extra: false },
      { id: 'st_bbbbbbbb', label: '2', text: '60 kg × 9', effort: 'Zor', warmup: false, extra: false },
    ]);
    assert.equal(detail.subject, 'Gün A · 26 Eylül 2026 · 2 set ve özeti');
  });

  test('silme onayının metni: set, hareket, antrenman; metin "kalır" der', () => {
    const detail = sessionDetail(doc, TZ);
    assert.deepEqual(deleteCopy(detail, { kind: 'set', entryId: 'e_aaaaaa', setId: 'st_bbbbbbbb' }), {
      title: 'Bu set silinsin mi?',
      subject: 'Bench Press · Set 2 · 60 kg × 9',
    });
    assert.deepEqual(deleteCopy(detail, { kind: 'set', entryId: 'e_aaaaaa', setId: 'st_warmup01' })?.subject, 'Bench Press · Isınma · 20 kg × 10');
    assert.deepEqual(deleteCopy(detail, { kind: 'entry', entryId: 'e_aaaaaa' }), { title: 'Bu hareket silinsin mi?', subject: 'Bench Press · 2 set' });
    assert.deepEqual(deleteCopy(detail, { kind: 'entry', entryId: 'e_bbbbbb' })?.subject, 'Plank · geçildi · Alet dolu');
    assert.deepEqual(deleteCopy(detail, { kind: 'session' }), { title: 'Bu antrenman silinsin mi?', subject: 'Gün A · 26 Eylül 2026 · 2 set ve özeti' });
    assert.equal(deleteCopy(detail, { kind: 'set', entryId: 'e_aaaaaa', setId: 'st_yokyokyo' }), null);
    assert.match(DELETE_BODY, /kalır\.$/);
    assert.doesNotMatch(`${DELETE_BODY} ${DELETE_DETAIL}`, /kalabilir|kalıcı olarak silinir/);
  });

  test('silme isteği: set; hareketin son seti hareketi de siler; hareket', () => {
    assert.deepEqual(deletePatch(doc, { kind: 'set', entryId: 'e_aaaaaa', setId: 'st_bbbbbbbb' }), { deleteSetIds: ['st_bbbbbbbb'] });
    const single = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 1)] })] });
    assert.deepEqual(deletePatch(single, { kind: 'set', entryId: 'e_aaaaaa', setId: 'st_aaaaaaaa' }), { deleteEntryIds: ['e_aaaaaa'] });
    assert.deepEqual(deletePatch(doc, { kind: 'entry', entryId: 'e_bbbbbb' }), { deleteEntryIds: ['e_bbbbbb'] });
  });
});
