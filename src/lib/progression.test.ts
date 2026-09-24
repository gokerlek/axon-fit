import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decreaseWeight,
  defaultRule,
  deloadSets,
  deloadWeight,
  describeRule,
  describeSetRules,
  isOverload,
  nextSession,
  nextSet,
  nextSetInPlan,
  overloadLimitKg,
  percentOfTop,
  planSession,
  progressionOf,
  rescalePlan,
  roundDownToStep,
  warmupSets,
  type Effort,
  type LoadSpec,
  type ProgressionRule,
  type SessionPlan,
  type SessionResult,
  type SetTarget,
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
    assert.deepEqual(defaultRule('conditioning', 'duration'), { scheme: 'double', targetMin: 20, targetMax: 45, targetRir: 2 });
    assert.equal(defaultRule('conditioning', 'bodyweight_reps').targetMax, 20);
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

describe('set başına plan', () => {
  const S3: SetTarget[] = [
    { min: 8, max: 12 },
    { min: 8, max: 12 },
    { min: 8, max: 12 },
  ];
  const rule = { scheme: 'double' as const, targetRir: 2 };
  const uniform = (n: number, min: number, max: number): SetTarget[] => Array.from({ length: n }, () => ({ min, max }));
  const one = (weightKg: number, value: number, effort: Effort = 'good') => ({ weightKg, value, effort });
  const weights = (plan: SessionPlan) => plan.sets.map((set) => set.weightKg);
  const targets = (plan: SessionPlan) => plan.sets.map((set) => set.target);

  describe('düz setlerde nextSession ile aynı', () => {
    const band: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 0, minLoadKg: 0 };
    const stuck = sets(80, [9, 8, 7]);
    const timedRule: ProgressionRule = { scheme: 'double', targetMin: 30, targetMax: 60, targetRir: 2 };
    const cases: { name: string; spec: LoadSpec; rule: ProgressionRule; history: SessionResult[]; n?: number; start?: number }[] = [
      { name: 'geçmiş yok, başlangıç 41', spec: barbell, rule: double, history: [], start: 41 },
      { name: 'geçmiş yok, taban', spec: barbell, rule: double, history: [] },
      { name: 'hepsi tepede', spec: barbell, rule: double, history: [sets(60, [12, 12, 12])] },
      { name: 'tepede ve kolay', spec: barbell, rule: double, history: [sets(60, [12, 12, 12], 'easy')] },
      { name: 'aralıkta', spec: barbell, rule: double, history: [sets(60, [11, 10, 9])] },
      { name: 'bir set altta', spec: barbell, rule: double, history: [sets(60, [9, 8, 6])] },
      { name: 'son set başaramadım', spec: barbell, rule: double, history: [[...sets(60, [12, 12]), one(60, 12, 'fail')]] },
      { name: 'hiçbiri ulaşmadı', spec: barbell, rule: double, history: [sets(60, [6, 5, 5], 'hard')] },
      { name: '3 kez tıkandı', spec: barbell, rule: double, history: [sets(80, [10, 9, 8]), stuck, stuck, stuck] },
      { name: 'tıkanma serisi sıfırlanır', spec: barbell, rule: double, history: [stuck, stuck, sets(80, [10, 9, 8]), stuck] },
      { name: 'doğrusal 5×5', spec: barbell, rule: linear, history: [sets(100, [5, 5, 5, 5, 5])], n: 5 },
      { name: 'boş antrenman yok sayılır', spec: barbell, rule: double, history: [[one(55, 12), one(60, 12)], []] },
      { name: 'ilerleme yok', spec: barbell, rule: { ...double, scheme: 'none' }, history: [sets(40, [12, 12])] },
      { name: 'dambıl +2', spec: dumbbell, rule: double, history: [sets(14, [12, 12, 12])] },
      { name: 'vücut ağırlığı +1', spec: bodyweight, rule: double, history: [sets(0, [9, 8, 8])] },
      { name: 'vücut ağırlığı tepede', spec: bodyweight, rule: double, history: [sets(0, [12, 12])] },
      { name: 'süre +5 sn', spec: timed, rule: timedRule, history: [sets(0, [40, 35])] },
      { name: 'süre üst sınırı geçmez', spec: timed, rule: timedRule, history: [sets(0, [58, 59])] },
      { name: 'bant tekrarla', spec: band, rule: double, history: [sets(0, [10, 10])] },
    ];
    for (const item of cases) {
      test(item.name, () => {
        const n = item.n ?? 3;
        const legacy = nextSession({ spec: item.spec, rule: item.rule, history: item.history, startWeightKg: item.start });
        const plan = planSession({
          spec: item.spec,
          rule: item.rule,
          sets: uniform(n, item.rule.targetMin, item.rule.targetMax),
          history: item.history,
          startWeightKg: item.start,
        });
        assert.equal(plan.reason, legacy.reason);
        assert.equal(plan.topWeightKg, legacy.weightKg);
        assert.equal(plan.sets.length, legacy.reason === 'deload' ? deloadSets(n) : n);
        for (const set of plan.sets) {
          assert.equal(set.weightKg, legacy.weightKg);
          assert.equal(set.target, legacy.target);
          assert.equal(set.amrap, false);
        }
      });
    }

    test('beklenen değerler', () => {
      const plan = (history: SessionResult[], start?: number) => planSession({ spec: barbell, rule, sets: S3, history, startWeightKg: start });
      assert.equal(plan([], 41).topWeightKg, 40);
      assert.equal(plan([sets(60, [12, 12, 12])]).topWeightKg, 62.5);
      assert.equal(plan([sets(60, [12, 12, 12], 'easy')]).topWeightKg, 65);
      assert.deepEqual(targets(plan([sets(60, [11, 10, 9])])), [10, 10, 10]);
      const deload = plan([sets(80, [10, 9, 8]), sets(80, [9, 8, 7]), sets(80, [9, 8, 7]), sets(80, [9, 8, 7])]);
      assert.deepEqual({ reason: deload.reason, weights: weights(deload) }, { reason: 'deload', weights: [67.5, 67.5] });
    });

    const planned = (weightKg: number, target: number): SessionPlan => ({
      sets: S3.map((_, setIndex) => ({ weightKg, target, amrap: false, setIndex })),
      topWeightKg: weightKg,
      reason: 'hold',
    });
    const setCases: { name: string; done: SessionResult }[] = [
      { name: 'ilk set', done: [] },
      { name: 'normal set', done: sets(60, [9]) },
      { name: 'başarısız', done: sets(60, [6], 'fail') },
      { name: '3+ altı', done: sets(60, [5], 'hard') },
      { name: '1–2 altı', done: sets(60, [7], 'hard') },
      { name: 'kolay ve tepede', done: sets(60, [12], 'easy') },
    ];
    for (const item of setCases) {
      test(`aynı antrenmanda: ${item.name}`, () => {
        const legacy = nextSet({ spec: barbell, rule: double, plan: { weightKg: 60, target: 8 }, done: item.done });
        const next = nextSetInPlan({ spec: barbell, rule, sets: S3, plan: planned(60, 8), done: item.done });
        assert.deepEqual({ weightKg: next.weightKg, target: next.target, reason: next.reason }, legacy);
      });
    }
  });

  test('back-off setleri üst setin yüzdesini izler', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 8, loadPct: 85 }];
    const plan = planSession({ spec: barbell, rule, sets: backoff, history: [[one(122.5, 5), one(102.5, 8), one(102.5, 8)]] });
    // 125 × 0,85 = 106,25 → 105.
    assert.equal(plan.reason, 'increase');
    assert.equal(plan.topWeightKg, 125);
    assert.deepEqual(weights(plan), [125, 105, 105]);
    assert.deepEqual(targets(plan), [5, 8, 8]);
    assert.deepEqual(
      plan.sets.map((set) => set.loadPct),
      [undefined, 85, 85],
    );
  });

  test('back-off setinde tıkanma artışı durdurmaz', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 8, loadPct: 85 }];
    const plan = planSession({ spec: barbell, rule, sets: backoff, history: [[one(100, 5), one(85, 6, 'fail'), one(85, 5)]] });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg }, { reason: 'increase', top: 102.5 });
  });

  test('üst set tıkanınca ağırlık korunur', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 8, loadPct: 85 }];
    const plan = planSession({ spec: barbell, rule, sets: backoff, history: [[one(100, 4), one(85, 8), one(85, 8)]] });
    assert.equal(plan.reason, 'hold');
    assert.deepEqual(weights(plan), [100, 85, 85]);
  });

  const pyramid: SetTarget[] = [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10, loadPct: 90 }, { min: 8, max: 8 }];

  test('piramit: tepe setine göre artar, basamaklar yüzdeyle', () => {
    const plan = planSession({ spec: barbell, rule, sets: pyramid, history: [[one(87.5, 12), one(97.5, 10), one(110, 8)]] });
    assert.equal(plan.reason, 'increase');
    assert.deepEqual(weights(plan), [90, 100, 112.5]);
    assert.deepEqual(targets(plan), [12, 10, 8]);
  });

  test('piramit tepeye varmadan bitti: referans yüzdelerden çıkarılır', () => {
    const plan = planSession({ spec: barbell, rule, sets: pyramid, history: [[one(80, 12), one(90, 10)]] });
    assert.equal(plan.reason, 'increase');
    assert.equal(plan.topWeightKg, 102.5);
    assert.deepEqual(weights(plan), [80, 90, 102.5]);
  });

  test('piramitte 3 kez tıkanınca hafifletme: önce tepe seti kalır, AMRAP yok', () => {
    const stuck = [one(87.5, 12), one(97.5, 10), one(110, 6)];
    const withAmrap = pyramid.map((set, index) => (index === 2 ? { ...set, amrap: true } : set));
    const plan = planSession({ spec: barbell, rule, sets: withAmrap, history: [stuck, stuck, stuck] });
    assert.equal(plan.reason, 'deload');
    assert.equal(plan.topWeightKg, 92.5);
    assert.deepEqual(
      plan.sets.map((set) => set.setIndex),
      [0, 2],
    );
    assert.deepEqual(weights(plan), [72.5, 92.5]);
    assert.deepEqual(targets(plan), [12, 8]);
    assert.ok(plan.sets.every((set) => !set.amrap));
  });

  describe('AMRAP', () => {
    const lastAmrap: SetTarget[] = [...S3.slice(0, 2), { min: 8, max: 12, amrap: true }];
    const plan = (amrap: number, effort: Effort = 'fail') =>
      planSession({ spec: barbell, rule, sets: lastAmrap, history: [[one(60, 12), one(60, 12), one(60, amrap, effort)]] });

    test('aralığın 3+ üstü iki adım; zorluk düğmesi tıkanma sayılmaz', () => {
      assert.deepEqual({ reason: plan(16).reason, top: plan(16).topWeightKg }, { reason: 'increase', top: 65 });
    });

    test('tepede ama 3 tekrar üstünde değil: bir adım', () => {
      assert.equal(plan(13).topWeightKg, 62.5);
    });

    test('alt sınırın altı tıkanmadır', () => {
      assert.deepEqual({ reason: plan(7, 'good').reason, weights: weights(plan(7, 'good')) }, { reason: 'hold', weights: [60, 60, 60] });
    });

    test('plan AMRAP işaretini taşır, hedef alt sınır', () => {
      assert.deepEqual(
        plan(13).sets.map((set) => [set.amrap, set.target]),
        [
          [false, 8],
          [false, 8],
          [true, 8],
        ],
      );
    });

    test('vücut ağırlığında hepsi AMRAP: zorluk yok sayılır, tepede zor varyasyon', () => {
      const all = uniform(3, 8, 12).map((set) => ({ ...set, amrap: true }));
      const result = planSession({ spec: bodyweight, rule, sets: all, history: [sets(0, [12, 12, 12], 'fail')] });
      assert.equal(result.reason, 'harder_variant');
      assert.deepEqual(targets(result), [12, 12, 12]);
    });
  });

  test('planın set sayısından fazla sonuç karara girmez (nextSession: korunur)', () => {
    const history = [sets(60, [12, 12, 5])];
    assert.equal(nextSession({ spec: barbell, rule: double, history }).reason, 'hold');
    const plan = planSession({ spec: barbell, rule, sets: uniform(2, 8, 12), history });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg }, { reason: 'increase', top: 62.5 });
  });

  test('setIndex yapılış sırasına üstün', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }];
    // Back-off önce yapılmış: yine de tepe seti karar verir.
    const history: SessionResult[] = [[{ ...one(85, 8), setIndex: 1 }, { ...one(100, 5), setIndex: 0 }]];
    assert.equal(planSession({ spec: barbell, rule, sets: backoff, history }).topWeightKg, 102.5);
  });

  test('üst ağırlığın yüzdesi', () => {
    assert.equal(percentOfTop(100, 85, barbell), 85);
    assert.equal(percentOfTop(62.5, 85, barbell), 52.5);
    assert.equal(percentOfTop(20, 50, barbell), 20); // boş barın altına inmez
    const dumbbells: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 5, minLoadKg: 0, loadsKg: [5, 10, 15, 20, 25] };
    assert.equal(percentOfTop(20, 85, dumbbells), 15);
    assert.equal(percentOfTop(0, 50, bodyweight), 0);
    assert.equal(percentOfTop(70, undefined, barbell), 70);
    assert.equal(percentOfTop(70, 100, barbell), 70);
  });

  describe('aynı antrenmanda yüzde değişimi', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 12, loadPct: 85, amrap: true }];
    const plan: SessionPlan = {
      sets: [
        { weightKg: 100, target: 5, amrap: false, setIndex: 0 },
        { weightKg: 85, target: 8, amrap: false, loadPct: 85, setIndex: 1 },
        { weightKg: 85, target: 8, amrap: true, loadPct: 85, setIndex: 2 },
      ],
      topWeightKg: 100,
      reason: 'increase',
    };
    const next = (done: SessionResult) => nextSetInPlan({ spec: barbell, rule, sets: backoff, plan, done });

    test('üst set ağır yapıldıysa back-off onun yüzdesi', () => {
      const result = next([one(110, 5)]);
      assert.deepEqual([result.weightKg, result.reason], [92.5, 'increase']);
    });

    test('üst set tıkandıysa önce ~%5 iner', () => {
      const result = next([one(100, 2, 'fail')]);
      assert.deepEqual([result.weightKg, result.reason], [80, 'decrease']);
    });

    test('planlandığı gibi', () => {
      const result = next([one(100, 5)]);
      assert.deepEqual([result.weightKg, result.reason], [85, 'hold']);
    });

    test('sıradaki set AMRAP: işaret ve alt sınır', () => {
      const result = next([one(100, 5), one(85, 8)]);
      assert.deepEqual({ amrap: result.amrap, target: result.target, weightKg: result.weightKg }, { amrap: true, target: 8, weightKg: 85 });
    });

    test('plan bitince son set', () => {
      assert.equal(next([one(100, 5), one(85, 8), one(85, 10)]).setIndex, 2);
    });
  });

  test('üst ağırlık değişince setler yeniden hesaplanır', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }];
    const plan = planSession({ spec: barbell, rule, sets: backoff, history: [], startWeightKg: 100 });
    assert.deepEqual(weights(plan), [100, 85]);
    const lowered = rescalePlan(plan, backoff, barbell, 90, 'pain_reduce');
    assert.deepEqual(weights(lowered), [90, 75]); // 76,5 → 75
    assert.equal(lowered.reason, 'pain_reduce');
    assert.equal(lowered.topWeightKg, 90);
    assert.deepEqual(targets(lowered), targets(plan));
  });

  test('set düzeninin kuralları', () => {
    assert.equal(describeSetRules(S3, barbell), null);
    assert.match(describeSetRules([{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }], barbell) ?? '', /tam yükteki/);
    const amrap = [{ min: 8, max: 12 }, { min: 8, max: 12, amrap: true }];
    assert.match(describeSetRules(amrap, barbell) ?? '', /3\+ tekrar/);
    assert.doesNotMatch(describeSetRules(amrap, bodyweight) ?? '', /3\+/);
    assert.match(describeSetRules(amrap, bodyweight) ?? '', /AMRAP/);
  });
});
