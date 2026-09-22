import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByEquipment, rankAlternatives, type AlternativeCandidate } from './alternatives.ts';

const FAMILIES: Record<string, string> = {
  chest_upper: 'chest',
  chest_lower: 'chest',
  triceps_long: 'triceps',
  triceps_lateral: 'triceps',
  lats_upper: 'lats',
  lats_mid: 'lats',
  lats_lower: 'lats',
};
const familyOf = (muscle: string) => FAMILIES[muscle] ?? muscle;

function exercise(id: string, fields: Partial<AlternativeCandidate>): AlternativeCandidate {
  return {
    id,
    title: id,
    category: 'compound',
    equipment: 'barbell',
    primaryMuscles: [],
    secondaryMuscles: [],
    stabilizerMuscles: [],
    ...fields,
  };
}

const bench = exercise('bench', {
  pattern: 'horizontal_push',
  primaryMuscles: ['chest_lower'],
  secondaryMuscles: ['chest_upper', 'delt_front', 'triceps_long', 'triceps_lateral'],
});
const dumbbellPress = exercise('dambil-press', {
  equipment: 'dumbbell',
  pattern: 'horizontal_push',
  primaryMuscles: ['chest_upper'],
  secondaryMuscles: ['chest_lower', 'delt_front', 'triceps_long', 'triceps_lateral'],
});
const pushUp = exercise('sinav', {
  equipment: 'bodyweight',
  pattern: 'horizontal_push',
  primaryMuscles: ['chest_lower'],
  secondaryMuscles: ['chest_upper', 'delt_front', 'triceps_long', 'triceps_lateral'],
  stabilizerMuscles: ['abs_upper', 'abs_lower'],
});
const fly = exercise('fly', {
  equipment: 'dumbbell',
  category: 'isolation',
  pattern: 'chest_fly',
  primaryMuscles: ['chest_lower'],
  secondaryMuscles: ['chest_upper', 'delt_front'],
});
const stretch = exercise('esneme', {
  equipment: 'bodyweight',
  category: 'cooldown',
  pattern: 'mobility',
  primaryMuscles: ['chest_lower', 'chest_upper'],
});
const pushdown = exercise('pushdown', {
  equipment: 'cable',
  category: 'isolation',
  pattern: 'elbow_extension',
  primaryMuscles: ['triceps_lateral'],
  secondaryMuscles: ['triceps_long'],
});
const dips = exercise('dips', {
  equipment: 'bodyweight',
  pattern: 'vertical_push',
  primaryMuscles: ['triceps_long', 'triceps_lateral'],
  secondaryMuscles: ['chest_lower', 'delt_front'],
});
const overheadPress = exercise('omuz-pres', {
  pattern: 'vertical_push',
  primaryMuscles: ['delt_front'],
  secondaryMuscles: ['delt_side', 'triceps_long', 'triceps_lateral'],
});
const pulldown = exercise('pulldown', {
  equipment: 'cable',
  pattern: 'vertical_pull',
  primaryMuscles: ['lats_upper', 'lats_mid', 'lats_lower'],
});
const pullUp = exercise('barfiks', {
  equipment: 'bodyweight',
  pattern: 'vertical_pull',
  primaryMuscles: ['lats_upper', 'lats_mid', 'lats_lower'],
  secondaryMuscles: ['biceps'],
});
const rower = exercise('kurek', { equipment: 'cardio_machine', category: 'warmup', pattern: 'cardio', primaryMuscles: ['cardio'] });
const bike = exercise('bisiklet', { equipment: 'cardio_machine', category: 'warmup', pattern: 'cardio', primaryMuscles: ['cardio'] });

const all = [bench, dumbbellPress, pushUp, fly, stretch, pushdown, dips, overheadPress, pulldown, pullUp, rower, bike];
const ids = (list: { exercise: AlternativeCandidate }[]) => list.map((item) => item.exercise.id);

describe('muadil sıralama', () => {
  test('aynı kalıp ve aynı hedef kas önce; kendisi yok', () => {
    const result = rankAlternatives(bench, all, familyOf);
    assert.deepEqual(ids(result).slice(0, 3), ['sinav', 'dambil-press', 'fly']);
    assert.ok(!ids(result).includes('bench'));
  });

  test('hedef kası paylaşmayan önerilmez (bench → omuz pres ya da barfiks değil)', () => {
    const result = ids(rankAlternatives(bench, all, familyOf));
    assert.ok(!result.includes('omuz-pres'));
    assert.ok(!result.includes('barfiks'));
  });

  test('güç hareketine esneme, esnemeye güç hareketi önerilmez', () => {
    assert.ok(!ids(rankAlternatives(bench, all, familyOf)).includes('esneme'));
    assert.deepEqual(ids(rankAlternatives(stretch, all, familyOf)), []);
  });

  test('kas ailesi eşleşir: üç kanat parçası aynı aile', () => {
    assert.deepEqual(ids(rankAlternatives(pulldown, all, familyOf)), ['barfiks']);
  });

  test('dips → aynı kalıptaki omuz pres değil, triceps hareketi', () => {
    const result = ids(rankAlternatives(dips, all, familyOf));
    assert.equal(result[0], 'pushdown');
    assert.ok(!result.includes('omuz-pres'));
  });

  test('kardiyo kardiyoyla eşleşir', () => {
    assert.deepEqual(ids(rankAlternatives(rower, all, familyOf)), ['bisiklet']);
  });

  test('PT sabitledikleri en başta, sırası korunur; bilinmeyen kimlik yok sayılır', () => {
    const pinned = { ...bench, alternatives: ['fly', 'yok-boyle-bir-sey', 'dambil-press'] };
    const result = rankAlternatives(pinned, all, familyOf);
    assert.deepEqual(ids(result).slice(0, 3), ['fly', 'dambil-press', 'sinav']);
    assert.deepEqual(result.slice(0, 2).map((item) => item.pinned), [true, true]);
    assert.equal(ids(result).filter((id) => id === 'fly').length, 1);
  });

  test('sınır: en fazla `limit` öneri', () => {
    assert.equal(rankAlternatives(bench, all, familyOf, { limit: 2 }).length, 2);
  });
});

test('aynı aile içinde tam aynı hedef kas önce (yana açış → arka omuzdan önce yan omuzlu hareket)', () => {
  const lateral = exercise('yana-acis', { equipment: 'dumbbell', category: 'isolation', pattern: 'lateral_raise', primaryMuscles: ['delt_side'] });
  const cableLateral = exercise('kablo-yana-acis', { equipment: 'cable', category: 'isolation', pattern: 'other', primaryMuscles: ['delt_side'] });
  const facePull = exercise('face-pull', { equipment: 'cable', category: 'isolation', pattern: 'rear_delt', primaryMuscles: ['delt_rear'] });
  const deltFamily = (muscle: string) => (muscle.startsWith('delt_') ? 'delts' : familyOf(muscle));
  const result = rankAlternatives(lateral, [lateral, facePull, cableLateral], deltFamily);
  assert.deepEqual(ids(result), ['kablo-yana-acis', 'face-pull']);
});

describe('ekipmana göre gruplama', () => {
  test('ekipmansız grup en başta, diğerleri en iyi önerinin sırasıyla', () => {
    const groups = groupByEquipment(rankAlternatives(bench, all, familyOf));
    assert.deepEqual(groups.map(([equipment]) => equipment), ['bodyweight', 'dumbbell']);
    assert.deepEqual(ids(groups[1]?.[1] ?? []), ['dambil-press', 'fly']);
  });
});
