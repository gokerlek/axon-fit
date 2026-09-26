import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FinishFeedback, SessionIndex, SessionIndexExercise, SessionIndexRow } from './schemas/session.ts';
import { algoProposalsThisWeek, readinessFromHealth, setSuggestionsFor, verifyAlgoSets, type SuggestionExercise } from './set-suggestions.ts';
import { EXERCISES, workoutDay } from './testing/workout-fixtures.ts';
import type { WorkoutDay } from './workout-plan.ts';

const NOW = new Date('2026-09-26T16:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

let counter = 0;
function row(daysAgo: number, exercises: Partial<SessionIndexExercise>[]): SessionIndexRow {
  counter += 1;
  const id = `s_${counter.toString(36).padStart(8, '0')}`;
  const startedAt = ago(daysAgo);
  return {
    id,
    sha: '0'.repeat(40),
    path: `sessions/${id}.json`,
    date: startedAt.slice(0, 10),
    startedAt,
    finishedAt: startedAt,
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: 3,
    water: 0,
    exercises: exercises.map((item) => ({ exerciseId: 'bench-press', rowId: 'r_aaaaaa', sets: 3, full: true, ...item })),
    notices: [],
  };
}

const index = (...items: SessionIndexRow[]): SessionIndex => ({ version: 1, items, deleted: [] });
/** Bench: 30 gün önce ilk seans (deneyim 4 hafta), 3 gün önce artış; danışan 1 yıl+ (en az Orta). */
const progressing = () => index(row(30, [{ reason: 'hold' }]), row(17, [{ reason: 'hold' }]), row(3, [{ reason: 'increase' }]));
const weights = (exercise: SuggestionExercise) => ({
  ...Object.fromEntries((exercise.secondaryMuscles ?? []).map((muscle) => [muscle, 0.5])),
  ...Object.fromEntries(exercise.primaryMuscles.map((muscle) => [muscle, 1])),
});

function suggestions(input: { day?: WorkoutDay; items?: SessionIndex; readinessScore?: number; proposals?: Parameters<typeof algoProposalsThisWeek>[0]; sessionId?: string } = {}) {
  return setSuggestionsFor({
    day: input.day ?? workoutDay(),
    exercises: EXERCISES,
    index: input.items ?? progressing(),
    now: NOW,
    experience: 'one_year',
    readinessScore: input.readinessScore,
    proposals: input.proposals ?? [],
    setWeightsOf: weights,
    sessionId: input.sessionId,
  });
}

describe('set artışı adayları: günün satırları (§5.6)', () => {
  test('Orta aşama, 4 hafta, son 2 haftada artış: "3 → 4 set"; bugünün setleri haftalık yüke girer', () => {
    // Göğsün son 7 günü: 3 gün önceki 3 set + bugünün planı (3 + 2 set) = 8.
    assert.deepEqual(suggestions(), [
      { rowId: 'r_aaaaaa', from: 3, to: 4, why: '4 haftadır bu harekette; son 2 haftada ilerliyor. Hedef kasın son 7 günde 8 seti var (önerilen ~10).' },
    ]);
  });

  test('hazır oluşluk 60\'ın altı ya da bu hafta kasa 2 öneri verildiyse aday yok', () => {
    assert.deepEqual(suggestions({ readinessScore: 55 }), []);
    assert.equal(suggestions({ readinessScore: 60 }).length, 1);
    const proposal = (sessionId: string) => ({ kind: 'algo_sets' as const, at: ago(2), exerciseId: 'bench-press', sessionId });
    assert.deepEqual(suggestions({ proposals: [proposal('s_aaaaaaaa'), proposal('s_bbbbbbbb')] }), []);
    // Aynı seansın önerileri sayılmaz (bitişin yeniden denenmesi).
    assert.equal(suggestions({ proposals: [proposal('s_aaaaaaaa'), proposal('s_bbbbbbbb')], sessionId: 's_bbbbbbbb' }).length, 1);
  });

  test('bugünün planı "aynı ağırlık" ya da hafif günse ilerleme yok', () => {
    const base = workoutDay();
    const row = base.rows.r_aaaaaa;
    assert.ok(row);
    const held: WorkoutDay = { ...base, rows: { ...base.rows, r_aaaaaa: { ...row, plan: { ...row.plan, reason: 'hold' } } } };
    assert.deepEqual(suggestions({ day: held }), []);
    const lightened: WorkoutDay = { ...base, rows: { ...base.rows, r_aaaaaa: { ...row, plan: { ...row.plan, reason: 'lighten' } } } };
    assert.deepEqual(suggestions({ day: lightened }), []);
  });

  test('deneyim 4 haftadan az ya da aşama Orta\'nın altı: aday yok', () => {
    assert.deepEqual(suggestions({ items: index(row(20, [{ reason: 'hold' }]), row(3, [{ reason: 'increase' }])) }), []);
    const fresh = setSuggestionsFor({ day: workoutDay(), exercises: EXERCISES, index: progressing(), now: NOW, proposals: [], setWeightsOf: weights });
    assert.deepEqual(fresh, [], 'deneyim tabanı yoksa 3 seans Tanışma');
  });

  test('bu haftaki öneriler: yalnız algo_sets, son 7 gün, hedef kaslara', () => {
    const musclesOf = (id: string) => EXERCISES.get(id)?.primaryMuscles;
    const counts = algoProposalsThisWeek(
      [
        { kind: 'algo_sets', at: ago(1), exerciseId: 'bench-press', sessionId: 's_aaaaaaaa' },
        { kind: 'sets', at: ago(1), exerciseId: 'bench-press', sessionId: 's_aaaaaaaa' },
        { kind: 'algo_sets', at: ago(8), exerciseId: 'bench-press', sessionId: 's_bbbbbbbb' },
        { kind: 'algo_sets', at: ago(2), exerciseId: 'goblet-squat', sessionId: 's_cccccccc' },
      ],
      NOW,
      musclesOf,
    );
    assert.deepEqual(counts, { chest_lower: 1, quadriceps: 1 });
  });
});

describe('hazır oluşluk: health.json', () => {
  test('en yeni yoklamanın puanı; dosya yok ya da bozuksa yok', () => {
    const record = {
      conditions: [],
      measurements: [],
      movementScreens: [],
      checkIns: [
        { date: '2026-09-20', readiness: { sleep: 5, energy: 5, soreness: 5, stress: 5 } },
        { date: '2026-09-26', readiness: { sleep: 2, energy: 3, soreness: 3, stress: 2 } },
      ],
    };
    assert.equal(readinessFromHealth(record), 50);
    assert.equal(readinessFromHealth(null), undefined);
    assert.equal(readinessFromHealth({ checkIns: 'bozuk' }), undefined);
  });
});

describe('bitişte sunucunun denetimi', () => {
  const feedback = (count: { from: number; to: number }, apply = true): FinishFeedback => ({
    answer: 'yes',
    items: [
      { kind: 'algo_sets', apply, entryId: 'e_aaaaaa', rowId: 'r_aaaaaa', dayId: 'd_aaaaaa', exerciseId: 'bench-press', title: 'Bench Press', trackingType: 'weight_reps', count },
      { kind: 'sets', apply: true, entryId: 'e_bbbbbb', rowId: 'r_bbbbbb', dayId: 'd_aaaaaa', exerciseId: 'bench-press', title: 'Bench Press', trackingType: 'weight_reps', count: { from: 2, to: 3 } },
    ],
  });

  test('+1 set ve hazır oluşluk 60+ (ya da onaysız) geçer; aynı nesne', () => {
    const input = feedback({ from: 3, to: 4 });
    assert.equal(verifyAlgoSets(input, undefined), input);
    assert.equal(verifyAlgoSets(input, 60), input);
    assert.equal(verifyAlgoSets(undefined, 40), undefined);
  });

  test('hazır oluşluk düşükse ya da +1\'den fazlaysa algoritmik öneri uygulanmaz; öteki maddeler aynı', () => {
    assert.deepEqual(verifyAlgoSets(feedback({ from: 3, to: 4 }), 55)?.items.map((item) => [item.kind, item.apply]), [['algo_sets', false], ['sets', true]]);
    assert.deepEqual(verifyAlgoSets(feedback({ from: 3, to: 6 }), undefined)?.items.map((item) => item.apply), [false, true]);
  });
});
