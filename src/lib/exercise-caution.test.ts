import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { careInputOf, EMPTY_CARE } from './constraint-filter.ts';
import { addConstraint } from './constraints.ts';
import { cautionIds } from './exercise-caution.ts';
import type { HealthRecord } from './schemas/health.ts';

describe('kısıt rozeti', () => {
  const exercises = EXERCISE_LIBRARY.filter((exercise) => ['hack-squat', 'goblet-box-squat'].includes(exercise.id));
  const empty: HealthRecord = { version: 2, checkIns: [], measurements: [] };
  const knee = addConstraint(empty, { type: 'injury', region: 'knee', side: 'left', avoid: ['deep_knee_flexion'] }, { id: 'k_aaaaaa', now: '2026-09-27T10:00:00.000Z' });

  test('kısıtın yasakladığı hareket işaretlenir, uygun olan işaretlenmez', () => {
    assert.equal(exercises.length, 2);
    assert.deepEqual([...cautionIds(exercises, careInputOf(knee, { today: '2026-09-27', painConsent: false }))], ['hack-squat']);
  });

  test('kısıt yoksa boş', () => {
    assert.equal(cautionIds(exercises, EMPTY_CARE).size, 0);
    assert.equal(cautionIds(exercises, careInputOf(empty, { today: '2026-09-27', painConsent: false })).size, 0);
  });
});
