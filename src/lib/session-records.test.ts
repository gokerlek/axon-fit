import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySessionIndex, type SessionDoc, type SessionEntry } from './schemas/session.ts';
import { indexRowOf, removeIndexRow, upsertIndexRow } from './session-index.ts';
import {
  bestOf,
  compareWithLast,
  lacksRecords,
  mergeBest,
  oneRepMax,
  strongestOf,
  recordHits,
  sessionRecords,
  topSetOf,
  trendOf,
  withRecords,
} from './session-records.ts';
import { at, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

function finished(id: string, minute: number, entries: SessionEntry[]): SessionDoc {
  return sessionDoc({ id, status: 'finished', startedAt: at(minute), finishedAt: at(minute + 50), entries });
}

const bench = (id: string, sets: [number, number][], overrides: Partial<SessionEntry> = {}) =>
  sessionEntry(id, {
    deviceId: 'olympic-bar',
    sets: sets.map(([kg, reps], i) => workingSet(`st_${id.slice(2)}${String(i).padStart(2, '0')}`, i, { kg, reps })),
    ...overrides,
  });

function indexOf(...docs: SessionDoc[]) {
  return docs.reduce((index, doc, i) => upsertIndexRow(index, indexRowOf(doc, String(i).repeat(40))), emptySessionIndex());
}

describe('tahmini 1RM (Epley)', () => {
  test('tek tekrarda ağırlığın kendisi; 12 üstü tahmin yapılmaz; ağırlıksız ya da tekrarsız yok', () => {
    assert.equal(oneRepMax(100, 1), 100);
    assert.equal(oneRepMax(60, 8), 76);
    assert.equal(oneRepMax(62.5, 10), 83.33);
    assert.equal(oneRepMax(60, 15), null);
    assert.equal(oneRepMax(0, 10), null);
    assert.equal(oneRepMax(60, 0), null);
  });
});

describe('en iyiler', () => {
  test('ağırlık başına en çok tekrar, en uzun süre; ısınma ve 0 tekrar girmez', () => {
    const best = bestOf([
      { type: 'warmup', kg: 80, reps: 5 },
      { type: 'working', kg: 60, reps: 10 },
      { type: 'working', kg: 60, reps: 12 },
      { type: 'working', kg: 62.5, reps: 0 },
      { type: 'working', reps: 15 },
      { type: 'working', seconds: 45 },
    ]);
    assert.deepEqual(best, { sets: [{ kg: 0, reps: 15 }, { kg: 60, reps: 12 }], seconds: 45 });
    assert.deepEqual(bestOf([]), {});
  });

  test('birleşim ağırlık başına en çoğu ve en uzun süreyi tutar', () => {
    assert.deepEqual(mergeBest({ sets: [{ kg: 60, reps: 10 }], seconds: 30 }, { sets: [{ kg: 60, reps: 8 }, { kg: 65, reps: 5 }] }), {
      sets: [{ kg: 60, reps: 10 }, { kg: 65, reps: 5 }],
      seconds: 30,
    });
  });
});

describe('rekorlar', () => {
  test('ilk kayıt referanstır: rekor yok', () => {
    assert.deepEqual(recordHits(undefined, { sets: [{ kg: 60, reps: 10 }] }), []);
  });

  test('en ağır set, tahmini 1RM, o ağırlıkta tekrar; eşitlik rekor değil', () => {
    const before = { sets: [{ kg: 60, reps: 10 }, { kg: 62.5, reps: 6 }] };
    assert.deepEqual(recordHits(before, { sets: [{ kg: 60, reps: 10 }, { kg: 62.5, reps: 6 }] }), []);
    const hits = recordHits(before, { sets: [{ kg: 65, reps: 5 }] });
    assert.deepEqual(hits.map((hit) => hit.kind), ['heaviest']);
    assert.deepEqual(hits[0], { kind: 'heaviest', now: { kg: 65, reps: 5 }, before: { kg: 62.5, reps: 6 } });

    const more = recordHits(before, { sets: [{ kg: 60, reps: 12 }] });
    assert.deepEqual(more.map((hit) => hit.kind), ['e1rm', 'reps']);
    assert.deepEqual(more[0], { kind: 'e1rm', now: { kg: 60, reps: 12 }, before: { kg: 60, reps: 10 }, gainPct: 5 });
    assert.deepEqual(more[1], { kind: 'reps', now: { kg: 60, reps: 12 }, before: { kg: 60, reps: 10 } });
  });

  test('ağırlıksız tekrar ve süre rekoru', () => {
    assert.deepEqual(recordHits({ sets: [{ kg: 0, reps: 12 }] }, { sets: [{ kg: 0, reps: 15 }] }), [
      { kind: 'reps', now: { kg: 0, reps: 15 }, before: { kg: 0, reps: 12 } },
    ]);
    assert.deepEqual(recordHits({ seconds: 45 }, { seconds: 60 }), [{ kind: 'seconds', now: 60, before: 45 }]);
    assert.deepEqual(recordHits({ seconds: 60 }, { seconds: 60 }), []);
  });

  test('daha önce yapılmamış hafif ağırlık tekrar rekoru sayılmaz', () => {
    assert.deepEqual(recordHits({ sets: [{ kg: 60, reps: 10 }] }, { sets: [{ kg: 40, reps: 15 }] }), []);
  });
});

describe('index: rekor sayısı', () => {
  const first = finished('s_aaaaaaaa', 0, [bench('e_aaaaaa', [[60, 10], [60, 10]])]);
  const second = finished('s_bbbbbbbb', 3000, [
    bench('e_bbbbbb', [[62.5, 8]]),
    sessionEntry('e_cccccc', { exerciseId: 'squat', title: 'Squat', sets: [workingSet('st_cccccc01', 1, { kg: 100, reps: 5 })] }),
  ]);
  const third = finished('s_cccccccc', 6000, [bench('e_dddddd', [[62.5, 10]])]);

  test('hareket başına bir; ilk kayıt sayılmaz; sıradan bağımsız', () => {
    const index = indexOf(third, first, second);
    const prs = Object.fromEntries(index.items.map((row) => [row.id, row.prs ?? 0]));
    assert.deepEqual(prs, { s_aaaaaaaa: 0, s_bbbbbbbb: 1, s_cccccccc: 1 });
    assert.equal('prs' in (index.items.find((row) => row.id === 's_aaaaaaaa') ?? {}), false);
  });

  test('silinen antrenman rekorları düzeltir', () => {
    const index = removeIndexRow(indexOf(first, second, third), 's_bbbbbbbb', new Date(at(9000)));
    // Artık üçüncü antrenman ilkine göre: 62,5 kg daha ağır.
    assert.equal(index.items.find((row) => row.id === 's_cccccccc')?.prs, 1);
    const onlyLast = removeIndexRow(index, 's_aaaaaaaa', new Date(at(9000)));
    assert.equal(onlyLast.items[0]?.prs, undefined);
  });

  test('cihaz farklıysa ayrı hareket; etkin antrenman sayılmaz ve taban olmaz', () => {
    const cable = finished('s_dddddddd', 4000, [bench('e_eeeeee', [[80, 10]], { deviceId: 'cable-station' })]);
    const active = sessionDoc({ id: 's_eeeeeeee', startedAt: at(2000), entries: [bench('e_ffffff', [[100, 10]])] });
    const index = indexOf(first, active, cable, third);
    assert.equal(index.items.find((row) => row.id === 's_dddddddd')?.prs, undefined);
    assert.equal(index.items.find((row) => row.id === 's_cccccccc')?.prs, 1);
    assert.equal(index.items.find((row) => row.id === 's_eeeeeeee')?.prs, undefined);
  });

  test('değişiklik yoksa aynı index', () => {
    const index = indexOf(first, second);
    assert.equal(withRecords(index), index);
  });

  test('antrenmanın rekorları ve geçen sefere göre', () => {
    const index = indexOf(first, second, third);
    const records = sessionRecords(index, 's_bbbbbbbb');
    assert.equal(records.length, 1);
    assert.equal(records[0]?.exerciseId, 'bench-press');
    assert.deepEqual(records[0]?.hits.map((hit) => hit.kind), ['heaviest']);

    const compare = compareWithLast(index, 's_cccccccc');
    assert.deepEqual(compare, [
      {
        key: 'bench-press@olympic-bar',
        exerciseId: 'bench-press',
        deviceId: 'olympic-bar',
        before: { kind: 'kg', kg: 62.5, reps: 8 },
        now: { kind: 'kg', kg: 62.5, reps: 10 },
        trend: 'up',
      },
    ]);
    assert.equal(compareWithLast(index, 's_bbbbbbbb').find((item) => item.exerciseId === 'squat')?.trend, 'first');
  });
});

describe('en iyi set ve yön', () => {
  test('ağırlıklıda en ağır, ağırlıksızda tekrar, süreli harekette süre', () => {
    assert.deepEqual(topSetOf({ sets: [{ kg: 0, reps: 15 }, { kg: 10, reps: 6 }] }), { kind: 'kg', kg: 10, reps: 6 });
    assert.deepEqual(topSetOf({ sets: [{ kg: 0, reps: 15 }] }), { kind: 'reps', reps: 15 });
    assert.deepEqual(topSetOf({ seconds: 40 }), { kind: 'seconds', seconds: 40 });
    assert.equal(topSetOf({}), null);
  });

  test('ağırlık önce, aynı ağırlıkta tekrar; tür değiştiyse ilk kez', () => {
    assert.equal(trendOf({ kind: 'kg', kg: 60, reps: 10 }, { kind: 'kg', kg: 62.5, reps: 8 }), 'up');
    assert.equal(trendOf({ kind: 'kg', kg: 60, reps: 10 }, { kind: 'kg', kg: 60, reps: 9 }), 'down');
    assert.equal(trendOf({ kind: 'reps', reps: 10 }, { kind: 'reps', reps: 10 }), 'same');
    assert.equal(trendOf({ kind: 'reps', reps: 10 }, { kind: 'seconds', seconds: 30 }), 'first');
    assert.equal(trendOf(null, { kind: 'seconds', seconds: 30 }), 'first');
  });

  test('rekor girdisi olmayan eski bitmiş satır yeniden kurulur', () => {
    const row = indexRowOf(finished('s_aaaaaaaa', 0, [bench('e_aaaaaa', [[60, 10]])]), 'a'.repeat(40));
    assert.equal(lacksRecords(row), false);
    assert.equal(lacksRecords({ ...row, exercises: row.exercises.map(({ best: _best, ...rest }) => rest) }), true);
    assert.equal(lacksRecords({ finishedAt: undefined, exercises: [{ exerciseId: 'bench-press', sets: 1, full: true }] }), false);
  });
});

test('high repetition record does not erase the valid strength estimate', () => {
 const best = bestOf([{type:'working',kg:60,reps:10},{type:'working',kg:60,reps:15}]);
 assert.equal(strongestOf(best)?.e1rm,80);
 assert.equal(mergeBest(bestOf([{type:'working',kg:60,reps:10}]),bestOf([{type:'working',kg:60,reps:15}])).e1rm?.reps,10);
});
