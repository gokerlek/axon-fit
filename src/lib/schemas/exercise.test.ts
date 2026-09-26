import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { customExercisesSchema, MUSCLES } from './exercise.ts';

const base = {
  id: 'neck-flexion',
  title: 'Neck Flexion',
  description: '',
  cues: [],
  category: 'isolation',
  trackingType: 'bodyweight_reps',
  equipment: 'bodyweight',
  loadStepKg: 0,
  minLoadKg: 0,
};

/** Repo'daki kaydı okur: eski adlar çevrilir, sonra şema doğrular. */
const read = (record: Record<string, unknown>) => v.parse(customExercisesSchema.item, { ...base, ...record });

describe('boyun ve ense', () => {
  test('hedef boyun + yardımcı ense okunduğu gibi kalır', () => {
    const exercise = read({ primaryMuscles: ['neck'], secondaryMuscles: ['nape'] });
    assert.deepEqual(exercise.primaryMuscles, ['neck']);
    assert.deepEqual(exercise.secondaryMuscles, ['nape']);
  });

  test('yazılıp yeniden okununca da değişmez', () => {
    const once = read({ primaryMuscles: ['neck'], secondaryMuscles: ['nape'] });
    const twice = read(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(twice.primaryMuscles, ['neck']);
    assert.deepEqual(twice.secondaryMuscles, ['nape']);
  });

  test('yalnız boyun seçilince ense eklenmez', () => {
    assert.deepEqual(read({ primaryMuscles: ['neck'], secondaryMuscles: [] }).primaryMuscles, ['neck']);
  });

  test('hedef ense + dengeleyici boyun da okunduğu gibi kalır', () => {
    const exercise = read({ primaryMuscles: ['nape'], secondaryMuscles: [], stabilizerMuscles: ['neck'] });
    assert.deepEqual(exercise.primaryMuscles, ['nape']);
    assert.deepEqual(exercise.stabilizerMuscles, ['neck']);
  });
});

describe('önceki sürümlerin kas adları', () => {
  test("12'li gruptaki tek hedef kas ve eski adım alanı çevrilir", () => {
    // İlk sürümde `loadStepKg` yoktu, adı `loadIncrementKg`'ydi.
    const exercise = read({ targetMuscle: 'chest', secondaryMuscles: ['triceps', 'front_delts'], loadStepKg: undefined, loadIncrementKg: 2.5 });
    assert.deepEqual(exercise.primaryMuscles, ['chest_upper', 'chest_lower']);
    assert.deepEqual(exercise.secondaryMuscles, ['triceps_long', 'triceps_lateral', 'delt_front']);
    assert.equal(exercise.loadStepKg, 2.5);
  });

  test("24'lü listenin adları parçalara çevrilir", () => {
    const cases: [string, string[]][] = [
      ['upper_chest', ['chest_upper']],
      ['shoulders', ['delt_front', 'delt_side', 'delt_rear']],
      ['side_delts', ['delt_side']],
      ['rear_delts', ['delt_rear']],
      ['back', ['lats_upper', 'lats_mid', 'lats_lower']],
      ['lats', ['lats_upper', 'lats_mid', 'lats_lower']],
      ['upper_traps', ['traps_upper']],
      ['mid_back', ['traps_mid', 'traps_lower']],
      ['lower_back', ['erectors', 'quadratus']],
      ['forearms', ['forearm_flexors', 'forearm_extensors']],
      ['core', ['abs_upper', 'abs_lower']],
      ['abs', ['abs_upper', 'abs_lower']],
      ['hamstrings', ['hamstrings_medial', 'hamstrings_lateral']],
      ['calves', ['gastroc_medial', 'gastroc_lateral', 'soleus']],
    ];
    for (const [legacy, parts] of cases) {
      assert.deepEqual(read({ primaryMuscles: [legacy], secondaryMuscles: [] }).primaryMuscles, parts, legacy);
    }
  });

  test('güncel kas adları olduğu gibi okunur', () => {
    for (const muscle of MUSCLES) {
      assert.deepEqual(read({ primaryMuscles: [muscle], secondaryMuscles: [] }).primaryMuscles, [muscle], muscle);
    }
  });

  test('çeviriden sonra bir kas yalnız bir seviyede kalır', () => {
    const exercise = read({ primaryMuscles: ['chest'], secondaryMuscles: ['upper_chest', 'triceps'] });
    assert.deepEqual(exercise.primaryMuscles, ['chest_upper', 'chest_lower']);
    assert.deepEqual(exercise.secondaryMuscles, ['triceps_long', 'triceps_lateral']);
  });
});
