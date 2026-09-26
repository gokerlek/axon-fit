import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deloadHints, loadComparison, thisWeekLoad } from './program-insights.ts';
import type { SessionIndexExercise, SessionIndexRow } from './schemas/session.ts';
import type { PlanExercise } from './template-plan.ts';

const exercise = (id: string, category: PlanExercise['category'], primary: string[], secondary: string[] = []): PlanExercise => ({
  id,
  title: id,
  category,
  trackingType: 'weight_reps',
  equipment: 'barbell',
  primaryMuscles: primary,
  secondaryMuscles: secondary,
});
const CATALOG = new Map([
  ['bench-press', exercise('bench-press', 'compound', ['chest_upper'], ['triceps_long'])],
  ['warmup-row', exercise('warmup-row', 'warmup', ['back_mid'])],
]);
const setWeights = (item: PlanExercise) => ({
  ...Object.fromEntries(item.primaryMuscles.map((muscle) => [muscle, 1])),
  ...Object.fromEntries(item.secondaryMuscles.map((muscle) => [muscle, 0.5])),
});

let count = 0;
function row(date: string, exercises: Partial<SessionIndexExercise>[], finished = true): SessionIndexRow {
  count += 1;
  const id = `s_${count.toString(36).padStart(8, '0')}`;
  return {
    id,
    sha: '0'.repeat(40),
    path: `sessions/${id}.json`,
    date,
    startedAt: `${date}T10:00:00.000Z`,
    ...(finished ? { finishedAt: `${date}T11:00:00.000Z` } : {}),
    otherDay: false,
    unfinished: false,
    volumeKg: 1000,
    sets: 3,
    water: 0,
    exercises: exercises.map((item) => ({ exerciseId: 'bench-press', sets: 3, full: true, ...item })),
    notices: [],
  };
}

describe('Program sekmesi: bu haftanın kas yükü', () => {
  test('yalnız bu haftanın bitmiş antrenmanları, İlerleme ile aynı hesap; ısınma hareketi sayılmaz', () => {
    const week = thisWeekLoad({
      index: {
        items: [
          row('2026-09-21', [{ sets: 3 }, { exerciseId: 'warmup-row', sets: 2 }]),
          row('2026-09-24', [{ sets: 4 }]),
          // Geçen hafta ve bitmemiş antrenman sayılmaz.
          row('2026-09-19', [{ sets: 5 }]),
          row('2026-09-26', [{ sets: 2 }], false),
        ],
      },
      today: '2026-09-26',
      exercises: CATALOG,
      setWeightsOf: setWeights,
    });
    assert.equal(week.weekStart, '2026-09-21');
    assert.equal(week.sessions, 2);
    assert.deepEqual(week.muscles, { chest_upper: 7, triceps_long: 3.5 });
  });

  test('hiç antrenman yoksa sıfır hafta', () => {
    const week = thisWeekLoad({ index: { items: [] }, today: '2026-09-26', exercises: CATALOG, setWeightsOf: setWeights });
    assert.deepEqual(week, { weekStart: '2026-09-21', weekEnd: '2026-09-27', sessions: 0, days: 0, volumeKg: 0, sets: 0, muscles: {} });
  });

  test('plan ve yapılan: planı çok olandan aza, planda olmayan yapılan da; kardiyo yok', () => {
    assert.deepEqual(loadComparison({ chest_upper: 9, quads: 12, cardio: 2 }, { chest_upper: 4, lats: 3 }), [
      { muscle: 'quads', planned: 12, done: 0 },
      { muscle: 'chest_upper', planned: 9, done: 4 },
      { muscle: 'lats', planned: 0, done: 3 },
    ]);
  });
});

describe('Program sekmesi: hafifletme ipucu (İleri aşama)', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');
  // 41 seans, 10 günde bir (≈ 57 hafta): İleri.
  const dates = Array.from({ length: 41 }, (_, index) => new Date(now.getTime() - (index + 1) * 10 * 86_400_000).toISOString().slice(0, 10)).reverse();

  test('son hafifletmeden 4 hafta sonra; Orta aşamada ipucu yok', () => {
    const deloadAt = dates.length - 5; // ≈ 50 gün önce
    const items = dates.map((date, index) => row(date, [{ reason: index === deloadAt ? 'deload' : 'increase' }]));
    assert.deepEqual(deloadHints({ exerciseIds: ['bench-press', 'bench-press', 'squat'], index: { items }, now }), [
      { exerciseId: 'bench-press', weeks: 7, since: 'deload' },
    ]);
    // Aynı sayıda seans 20 haftaya sığarsa Orta: ipucu yok.
    const short = Array.from({ length: 41 }, (_, index) => row(new Date(now.getTime() - (index + 1) * 3 * 86_400_000).toISOString().slice(0, 10), [{ reason: 'increase' }]));
    assert.deepEqual(deloadHints({ exerciseIds: ['bench-press'], index: { items: short }, now }), []);
  });

  test('hiç hafifletme yoksa ilk seanstan sayılır', () => {
    const items = dates.map((date) => row(date, [{ reason: 'increase' }]));
    const [hint] = deloadHints({ exerciseIds: ['bench-press'], index: { items }, now });
    assert.equal(hint?.since, 'start');
    assert.equal(hint?.weeks, 58);
  });
});
