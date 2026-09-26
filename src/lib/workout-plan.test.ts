import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionDoc, SessionIndex } from './schemas/session.ts';
import { indexRowOf } from './session-index.ts';
import { at, DAY_A, DAY_B, PHASE, programFile, sessionDoc, sessionEntry, singleBlock, workingSet } from './testing/session-fixtures.ts';
import { parsedProgram, workoutDay } from './testing/workout-fixtures.ts';
import { activeRow, dayExerciseIds, historyRows, lastTimeOf, sessionWaterOn, weekOf } from './workout-plan.ts';

let counter = 0;
const setId = () => `st_${(++counter).toString(36).padStart(8, '0')}`;

/** Bitmiş antrenman: Bench (r_aaaaaa) setleri `kg × reps`, hedef 8–10. */
function finished(id: string, minute: number, sets: { kg: number; reps: number }[], extra: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({
    id,
    status: 'finished',
    startedAt: at(minute),
    finishedAt: at(minute + 40),
    entries: [
      sessionEntry(`e_${id.slice(2, 8)}`, {
        rowId: 'r_aaaaaa',
        status: 'done',
        sets: sets.map((set, index) => workingSet(setId(), minute + index + 1, { setIndex: index, kg: set.kg, reps: set.reps, target: { min: 8, max: 10 } })),
      }),
    ],
    ...extra,
  });
}

const three = (kg: number, reps: number) => [{ kg, reps }, { kg, reps }, { kg, reps }];

describe('günün planı', () => {
  test('geçmiş yoksa sıradaki gün; ilk kez barın ağırlığı; aralığın altı', () => {
    const day = workoutDay();
    assert.equal(day.dayId, DAY_A);
    assert.equal(day.plannedDayId, DAY_A);
    assert.equal(day.phaseId, PHASE);
    assert.equal(day.revision, 7);
    assert.equal(day.blocks.length, 2);
    const row = day.rows.r_aaaaaa;
    assert.equal(row?.plan.reason, 'first_time');
    assert.equal(row?.plan.topWeightKg, 20);
    assert.deepEqual(row?.plan.sets.map((set) => set.target), [8, 8, 8]);
    assert.deepEqual(row?.lastTime, []);
    assert.equal(row?.title, 'Bench Press');
  });

  test('istenen gün; programda olmayan gün sıradakine döner', () => {
    assert.equal(workoutDay({ dayId: DAY_B }).dayId, DAY_B);
    assert.equal(workoutDay({ dayId: DAY_B }).plannedDayId, DAY_A);
    assert.equal(workoutDay({ dayId: 'd_zzzzzz' }).dayId, DAY_A);
    assert.deepEqual([...dayExerciseIds(parsedProgram(), DAY_B)], ['bench-press']);
  });

  test('kütüphanede olmayan egzersizin satırı çizilmez, boş kalan blok düşer', () => {
    const raw = programFile();
    const phases = raw.phases as { days: { blocks: unknown[] }[] }[];
    const unknown = { ...singleBlock('b_dddddd', 'r_dddddd', 2), rows: [{ id: 'r_dddddd', exerciseId: 'yok-boyle', sets: [{ min: 8, max: 10 }] }] };
    phases[0]?.days[0]?.blocks.push(unknown);
    const day = workoutDay({ raw });
    assert.deepEqual(day.blocks.map((block) => block.id), ['b_aaaaaa', 'b_bbbbbb']);
    assert.equal(day.rows.r_dddddd, undefined);
  });

  test('geçmişten: hedefe ulaşıldı → bir adım; "Önceki" geçen seferki setler', () => {
    const day = workoutDay({ history: [finished('s_aaaaaaaa', -3000, three(57.5, 9)), finished('s_bbbbbbbb', -1000, three(60, 10))] });
    const row = day.rows.r_aaaaaa;
    assert.equal(row?.plan.reason, 'increase');
    assert.equal(row?.plan.topWeightKg, 62.5);
    assert.deepEqual(row?.lastTime, [
      { setIndex: 0, kg: 60, value: 10 },
      { setIndex: 1, kg: 60, value: 10 },
      { setIndex: 2, kg: 60, value: 10 },
    ]);
  });

  test('üst üste 3 tıkanma → hafifletme: daha az set (imleç bu sayıyla yürür)', () => {
    const history = [finished('s_aaaaaaaa', -3000, three(60, 5)), finished('s_bbbbbbbb', -2000, three(60, 5)), finished('s_cccccccc', -1000, three(60, 5))];
    const row = workoutDay({ history }).rows.r_aaaaaa;
    assert.equal(row?.plan.reason, 'deload');
    assert.equal(row?.plan.sets.length, 2);
  });

  test('ağırlık geçmişi cihaza göre; etkin antrenman geçmiş sayılmaz', () => {
    const other = finished('s_aaaaaaaa', -1000, three(60, 10));
    const onDevice = { ...other, entries: other.entries.map((entry) => ({ ...entry, deviceId: 'smith-makinesi' })) };
    assert.equal(workoutDay({ history: [onDevice] }).rows.r_aaaaaa?.plan.reason, 'first_time');
    const active = { ...finished('s_bbbbbbbb', -1000, three(60, 10)), status: 'active' as const, finishedAt: undefined };
    assert.equal(workoutDay({ history: [active] }).rows.r_aaaaaa?.plan.reason, 'first_time');
  });

  test('"Önceki": satırın kaydı yoksa aynı egzersiz ve cihazın en yeni kaydı; fazladan set yok', () => {
    const doc = finished('s_aaaaaaaa', -1000, three(60, 10));
    const withExtra = {
      ...doc,
      entries: doc.entries.map((entry) => ({ ...entry, rowId: 'r_eskisii', sets: [...entry.sets, workingSet(setId(), -900, { setIndex: 3, extra: true })] })),
    };
    const previous = lastTimeOf([withExtra], { rowId: 'r_aaaaaa', exerciseId: 'bench-press' });
    assert.equal(previous.length, 3);
    assert.deepEqual(lastTimeOf([withExtra], { rowId: 'r_aaaaaa', exerciseId: 'bench-press', deviceId: 'smith-makinesi' }), []);
  });
});

describe('Bugün: index\'ten', () => {
  const sha = (n: number) => n.toString(16).padStart(40, 'a');
  const TZ = 'Europe/Istanbul';
  const row = (doc: SessionDoc, n: number) => indexRowOf(doc, sha(n));

  function index(): SessionIndex {
    const done = (id: string, iso: string, water = 0) =>
      sessionDoc({
        id,
        status: 'finished',
        date: iso.slice(0, 10),
        startedAt: iso,
        finishedAt: new Date(Date.parse(iso) + 3_600_000).toISOString(),
        waterTaps: Array.from({ length: water }, (_, i) => ({ id: `wt_${String(i).padStart(8, '0')}`, d: 1 as const, at: iso })),
        entries: [sessionEntry(`e_${id.slice(2, 8)}`, { rowId: 'r_aaaaaa', sets: [workingSet(setId(), 1)] })],
      });
    return {
      version: 1,
      items: [
        row(done('s_aaaaaaaa', '2026-09-19T15:00:00.000Z'), 1),
        row(done('s_bbbbbbbb', '2026-09-22T15:00:00.000Z'), 2),
        row(done('s_cccccccc', '2026-09-26T06:00:00.000Z', 2), 3),
        row(sessionDoc({ id: 's_dddddddd', startedAt: '2026-09-26T14:00:00.000Z' }), 4),
      ],
      deleted: [],
    };
  }

  test('yarım antrenman: bitmemiş en yeni satır', () => {
    assert.equal(activeRow(index())?.id, 's_dddddddd');
    assert.equal(activeRow({ version: 1, items: index().items.slice(0, 3), deleted: [] }), null);
  });

  test('geçmiş: bugünkü egzersizlerden birini içeren en yeni bitmiş antrenmanlar', () => {
    assert.deepEqual(historyRows(index(), new Set(['bench-press']), 2).map((item) => item.id), ['s_cccccccc', 's_bbbbbbbb']);
    assert.deepEqual(historyRows(index(), new Set(['squat'])), []);
  });

  test('"bu hafta x/3": pazartesiden; hedef evrenin sıklığı', () => {
    const now = new Date('2026-09-26T16:00:00.000Z');
    assert.deepEqual(weekOf(index(), parsedProgram(), now, TZ), { done: 2, target: null });
    const raw = programFile();
    (raw.phases as { daysPerWeek?: number }[])[0]!.daysPerWeek = 3;
    assert.deepEqual(weekOf(index(), parsedProgram(raw), now, TZ), { done: 2, target: 3 });
    assert.deepEqual(weekOf(index(), null, now, TZ), { done: 2, target: null });
  });

  test('bugünkü su: yalnız bitmiş antrenmanlar (etkinin suyu telefondaki belgeden)', () => {
    assert.equal(sessionWaterOn(index(), '2026-09-26'), 2);
    assert.equal(sessionWaterOn(index(), '2026-09-22'), 0);
  });
});
