import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decreaseWeight,
  defaultRule,
  deloadSets,
  deloadWeight,
  describeRule,
  isOverload,
  nextSession,
  nextSet,
  overloadLimitKg,
  progressionOf,
  roundDownToStep,
  warmupSets,
  type Effort,
  type LoadSpec,
  type ProgressionRule,
  type SessionResult,
} from './progression.ts';

const barbell: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 2.5, minLoadKg: 20 };
const dumbbell: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 2, minLoadKg: 0 };
const bodyweight: LoadSpec = { trackingType: 'bodyweight_reps', loadStepKg: 0, minLoadKg: 0 };
const timed: LoadSpec = { trackingType: 'duration', loadStepKg: 0, minLoadKg: 0 };

const double: ProgressionRule = { scheme: 'double', targetMin: 8, targetMax: 12, targetRir: 2 };
const linear: ProgressionRule = { scheme: 'linear', targetMin: 5, targetMax: 5, targetRir: 2 };

/** `sets(60, [12, 12, 12])` → 60 kg ile üç set. */
function sets(weightKg: number, values: number[], effort: Effort = 'good'): SessionResult {
  return values.map((value) => ({ weightKg, value, effort }));
}

describe('yuvarlama ve hafifletme', () => {
  test('adıma aşağı yuvarlar, kayan nokta artığı bırakmaz', () => {
    assert.equal(roundDownToStep(51, 2.5), 50);
    assert.equal(roundDownToStep(47.5, 2.5), 47.5);
    assert.equal(roundDownToStep(0.3 * 3, 0.1), 0.9);
    assert.equal(roundDownToStep(13, 0), 13);
  });

  test('hafifletme %15 düşürür ve adıma aşağı yuvarlar (v1 K16)', () => {
    assert.equal(deloadWeight(100, barbell), 85);
    assert.equal(deloadWeight(60, barbell), 50); // 51 → 50
  });

  test('hafifletme tabanın altına düşürmez: ağırlık korunur', () => {
    assert.equal(deloadWeight(22.5, barbell), 22.5); // 19.1 → 17.5 < 20
    assert.equal(deloadWeight(2, dumbbell), 2); // 1.7 → 0
  });

  test('hafifletmede set sayısı üçte ikiye iner, en az 1', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(deloadSets), [0, 1, 1, 2, 3, 3]);
  });

  test('azaltma ~%5, en yakın adıma, en az bir adım', () => {
    assert.equal(decreaseWeight(60, barbell), 57.5);
    assert.equal(decreaseWeight(200, barbell), 190);
    assert.equal(decreaseWeight(30, dumbbell), 28); // 28,5 → 28
    assert.equal(decreaseWeight(20, barbell), 20); // boş bar: iner yer yok
  });
});

describe('bir sonraki antrenman — ağırlıklı', () => {
  test('geçmiş yoksa başlangıç ağırlığı ya da taban', () => {
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: [] }), {
      weightKg: 20,
      target: 8,
      reason: 'first_time',
    });
    assert.equal(nextSession({ spec: barbell, rule: double, history: [], startWeightKg: 41 }).weightKg, 40);
  });

  test('çift ilerleme: bütün setler tepede → bir adım artar, tekrar alta döner', () => {
    const suggestion = nextSession({ spec: barbell, rule: double, history: [sets(60, [12, 12, 12])] });
    assert.deepEqual(suggestion, { weightKg: 62.5, target: 8, reason: 'increase' });
  });

  test('çift ilerleme: tepede ve çok kolay → iki adım', () => {
    const suggestion = nextSession({ spec: barbell, rule: double, history: [sets(60, [12, 12, 12], 'easy')] });
    assert.equal(suggestion.weightKg, 65);
  });

  test('çift ilerleme: aralıkta ama tepede değil → aynı ağırlık, en düşük tekrar + 1', () => {
    const suggestion = nextSession({ spec: barbell, rule: double, history: [sets(60, [11, 10, 9])] });
    assert.deepEqual(suggestion, { weightKg: 60, target: 10, reason: 'add_rep' });
  });

  test('bir set hedefin altında → ağırlık korunur', () => {
    const suggestion = nextSession({ spec: barbell, rule: double, history: [sets(60, [9, 8, 6])] });
    assert.deepEqual(suggestion, { weightKg: 60, target: 8, reason: 'hold' });
  });

  test('"başaramadım" işaretli set hedefte olsa da tıkanma sayılır', () => {
    const history = [[...sets(60, [12, 12]), { weightKg: 60, value: 12, effort: 'fail' as const }]];
    assert.equal(nextSession({ spec: barbell, rule: double, history }).reason, 'hold');
  });

  test('hiçbir set hedefe ulaşmadı → ~%5 iner', () => {
    const suggestion = nextSession({ spec: barbell, rule: double, history: [sets(60, [6, 5, 5], 'hard')] });
    assert.deepEqual(suggestion, { weightKg: 57.5, target: 8, reason: 'decrease' });
  });

  test('3 antrenman üst üste tıkanınca hafifletilir', () => {
    const stuck = sets(80, [9, 8, 7]);
    const suggestion = nextSession({ spec: barbell, rule: double, history: [sets(80, [10, 9, 8]), stuck, stuck, stuck] });
    assert.deepEqual(suggestion, { weightKg: 67.5, target: 8, reason: 'deload' });
  });

  test('tıkanma serisi başarılı bir antrenmanla sıfırlanır', () => {
    const stuck = sets(80, [9, 8, 7]);
    const history = [stuck, stuck, sets(80, [10, 9, 8]), stuck];
    assert.equal(nextSession({ spec: barbell, rule: double, history }).reason, 'hold');
  });

  test('doğrusal: bütün setler hedefte → bir adım', () => {
    const suggestion = nextSession({ spec: barbell, rule: linear, history: [sets(100, [5, 5, 5, 5, 5])] });
    assert.deepEqual(suggestion, { weightKg: 102.5, target: 5, reason: 'increase' });
  });

  test('çalışma ağırlığı en ağır settir; boş antrenmanlar yok sayılır', () => {
    const history = [[{ weightKg: 55, value: 12, effort: 'good' as const }, { weightKg: 60, value: 12, effort: 'good' as const }], []];
    assert.equal(nextSession({ spec: barbell, rule: double, history }).weightKg, 62.5);
  });

  test('ilerleme yok → aynı ağırlık ve hedef', () => {
    const rule: ProgressionRule = { ...double, scheme: 'none' };
    assert.deepEqual(nextSession({ spec: barbell, rule, history: [sets(40, [12, 12])] }), {
      weightKg: 40,
      target: 8,
      reason: 'no_progression',
    });
  });

  test('dambılda adım 2 kg', () => {
    assert.equal(nextSession({ spec: dumbbell, rule: double, history: [sets(14, [12, 12, 12])] }).weightKg, 16);
  });
});

describe('bir sonraki antrenman — ağırlıksız', () => {
  test('vücut ağırlığı: aralıkta → bir tekrar eklenir', () => {
    assert.deepEqual(nextSession({ spec: bodyweight, rule: double, history: [sets(0, [9, 8, 8])] }), {
      weightKg: 0,
      target: 9,
      reason: 'add_rep',
    });
  });

  test('vücut ağırlığı: tepede → ağırlık ekle ya da zor varyasyon', () => {
    assert.equal(nextSession({ spec: bodyweight, rule: double, history: [sets(0, [12, 12])] }).reason, 'harder_variant');
  });

  test('süre: 5 sn eklenir, üst sınırı geçmez', () => {
    const rule: ProgressionRule = { scheme: 'double', targetMin: 30, targetMax: 60, targetRir: 2 };
    assert.deepEqual(nextSession({ spec: timed, rule, history: [sets(0, [40, 35])] }), {
      weightKg: 0,
      target: 40,
      reason: 'add_time',
    });
    assert.equal(nextSession({ spec: timed, rule, history: [sets(0, [58, 59])] }).target, 60);
  });

  test('adımı 0 olan ağırlıklı hareket (bant) tekrarla ilerler', () => {
    const band: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 0, minLoadKg: 0 };
    assert.equal(nextSession({ spec: band, rule: double, history: [sets(0, [10, 10])] }).reason, 'add_rep');
  });
});

describe('aynı antrenmanda bir sonraki set', () => {
  const plan = { weightKg: 60, target: 8 };

  test('ilk set plana göre', () => {
    assert.deepEqual(nextSet({ spec: barbell, rule: double, plan, done: [] }), { ...plan, reason: 'hold' });
  });

  test('normal set → aynı ağırlık', () => {
    assert.equal(nextSet({ spec: barbell, rule: double, plan, done: sets(60, [9]) }).reason, 'hold');
  });

  test('başarısız set → ~%5 aşağı', () => {
    const suggestion = nextSet({ spec: barbell, rule: double, plan, done: sets(60, [6], 'fail') });
    assert.deepEqual(suggestion, { weightKg: 57.5, target: 8, reason: 'decrease' });
  });

  test('hedefin 3+ altı → aşağı; 1–2 altı → aynı', () => {
    assert.equal(nextSet({ spec: barbell, rule: double, plan, done: sets(60, [5], 'hard') }).reason, 'decrease');
    assert.equal(nextSet({ spec: barbell, rule: double, plan, done: sets(60, [7], 'hard') }).reason, 'hold');
  });

  test('kolay ve tepede → bir adım yukarı', () => {
    assert.equal(nextSet({ spec: barbell, rule: double, plan, done: sets(60, [12], 'easy') }).weightKg, 62.5);
  });
});

describe('ısınma (v1 §7.8)', () => {
  const base = { spec: barbell, isBarbell: true, isCompound: true, isFirstForMuscle: true };

  test('40 kg altında, dambılda, izolasyonda ya da kasın ilk hareketi değilse yok', () => {
    assert.deepEqual(warmupSets({ ...base, workWeightKg: 37.5 }), []);
    assert.deepEqual(warmupSets({ ...base, workWeightKg: 60, isBarbell: false }), []);
    assert.deepEqual(warmupSets({ ...base, workWeightKg: 60, isCompound: false }), []);
    assert.deepEqual(warmupSets({ ...base, workWeightKg: 60, isFirstForMuscle: false }), []);
  });

  test('80 kg altı: bar + %65', () => {
    assert.deepEqual(warmupSets({ ...base, workWeightKg: 60 }), [
      { weightKg: 20, target: 10 },
      { weightKg: 37.5, target: 5 },
    ]);
  });

  test('120 kg ve üstü: bar + %40 / %60 / %80', () => {
    // 56 → 55, 84 → 82,5, 112 → 110
    assert.deepEqual(warmupSets({ ...base, workWeightKg: 140 }), [
      { weightKg: 20, target: 10 },
      { weightKg: 55, target: 5 },
      { weightKg: 82.5, target: 3 },
      { weightKg: 110, target: 2 },
    ]);
  });
});

describe('aşırı yük (v1 K14)', () => {
  test('hedef + max(%20, 5 kg); sınırın kendisi aşırı değil', () => {
    assert.equal(overloadLimitKg(20), 25);
    assert.equal(overloadLimitKg(100), 120);
    assert.equal(isOverload(100, 120), false);
    assert.equal(isOverload(100, 120.5), true);
  });
});

describe('varsayılan kural ve anlatım', () => {
  test('türe göre varsayılan', () => {
    assert.deepEqual(defaultRule('compound', 'weight_reps'), { scheme: 'double', targetMin: 6, targetMax: 10, targetRir: 2 });
    assert.deepEqual(defaultRule('isolation', 'weight_reps'), { scheme: 'double', targetMin: 10, targetMax: 15, targetRir: 1 });
    assert.equal(defaultRule('warmup', 'duration').scheme, 'none');
    assert.equal(defaultRule('cooldown', 'bodyweight_reps').scheme, 'none');
  });

  test('egzersizin kendi kuralı varsayılanı ezer', () => {
    const own: ProgressionRule = { scheme: 'linear', targetMin: 5, targetMax: 5, targetRir: 1 };
    assert.deepEqual(progressionOf({ category: 'compound', trackingType: 'weight_reps', progression: own }), own);
    assert.deepEqual(progressionOf({ category: 'compound', trackingType: 'weight_reps' }), defaultRule('compound', 'weight_reps'));
  });

  test('anlatım adımı ve aralığı içerir', () => {
    const text = describeRule(double, barbell);
    assert.match(text, /8–12 tekrar/);
    assert.match(text, /2,5 kg/);
    assert.match(text, /%15 hafifletilir/);
    assert.match(describeRule({ ...double, targetMin: 30, targetMax: 60 }, timed), /5 sn eklenir/);
  });
});
