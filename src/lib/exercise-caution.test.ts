import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { careInputOf, EMPTY_CARE } from './constraint-filter.ts';
import { addConstraint, addOverride, reportConstraint } from './constraints.ts';
import { blockedAdditions, exerciseCaution, programExerciseIds } from './exercise-caution.ts';
import type { HealthRecord } from './schemas/health.ts';

describe('kısıt rozeti ve yasak', () => {
  const exercises = EXERCISE_LIBRARY.filter((exercise) => ['hack-squat', 'goblet-box-squat'].includes(exercise.id));
  const empty: HealthRecord = { version: 2, checkIns: [], measurements: [] };
  const knee = addConstraint(empty, { type: 'injury', region: 'knee', side: 'left', avoid: ['deep_knee_flexion'] }, { id: 'k_aaaaaa', now: '2026-09-27T10:00:00.000Z' });
  const input = (record: HealthRecord) => careInputOf(record, { today: '2026-09-27', painConsent: false });

  test('kısıtın yasakladığı hareket yasak kümesinde, uygun olan hiçbirinde', () => {
    assert.equal(exercises.length, 2);
    const result = exerciseCaution(exercises, input(knee));
    assert.deepEqual([...result.blocked], ['hack-squat']);
    assert.deepEqual([...result.caution], []);
  });

  test('izin verilen yasak artık yasak değil', () => {
    const allowed = addOverride(knee, { exerciseId: 'hack-squat', source: 'k_aaaaaa' }, { now: '2026-09-27T11:00:00.000Z', title: 'Hack Squat' });
    assert.equal(exerciseCaution(exercises, input(allowed)).blocked.size, 0);
  });

  test('bekleyen bildirimin zorlayanı yalnız dikkat (rozet), yasak değil', () => {
    const reported = reportConstraint(
      empty,
      { type: 'injury', region: 'knee', side: 'left', severity: 'moderate', triggers: ['squat'] },
      { id: 'k_bbbbbb', now: '2026-09-27T10:00:00.000Z', today: '2026-09-27' },
    );
    const result = exerciseCaution(exercises, input(reported));
    assert.equal(result.blocked.size, 0);
    assert.ok(result.caution.has('hack-squat'));
  });

  test('kısıt yoksa iki küme boş', () => {
    assert.deepEqual(exerciseCaution(exercises, EMPTY_CARE), { blocked: new Set(), caution: new Set() });
    assert.equal(exerciseCaution(exercises, input(empty)).blocked.size, 0);
  });
});

describe('kayıtta eklenen yasak', () => {
  const phases = [
    {
      days: [
        { blocks: [{ rows: [{ exerciseId: 'goblet-squat' }, { exerciseId: 'jump-squat' }] }] },
        { blocks: [{ rows: [{ exerciseId: 'jump-squat' }] }, { rows: [{ exerciseId: 'push-up' }] }] },
      ],
    },
  ];

  test('yasaklı ve temelde olmayan her satır, alan yoluyla', () => {
    assert.deepEqual(blockedAdditions(phases, new Set(['jump-squat']), new Set()), [
      { path: 'phases.0.days.0.blocks.0.rows.1.exerciseId', exerciseId: 'jump-squat' },
      { path: 'phases.0.days.1.blocks.0.rows.0.exerciseId', exerciseId: 'jump-squat' },
    ]);
  });

  test('temelde (önceki kayıt, antrenörün günü, şablon) olan yasak kalır', () => {
    assert.deepEqual(blockedAdditions(phases, new Set(['jump-squat']), new Set(['jump-squat'])), []);
    assert.deepEqual(blockedAdditions(phases, new Set(), new Set()), []);
  });

  test('programın hareketleri', () => {
    assert.deepEqual([...programExerciseIds(phases)].sort(), ['goblet-squat', 'jump-squat', 'push-up']);
  });
});
