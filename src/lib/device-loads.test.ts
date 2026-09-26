import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDeviceLoads, deviceLoads, effectiveLoadKg, loadSpecFor, type DeviceLoadSettings } from './device-loads.ts';
import {
  decreaseWeight,
  deloadWeight,
  nextSession,
  nextSet,
  nextSetInPlan,
  percentOfTop,
  planSession,
  warmupSets,
  type LoadSpec,
  type ProgressionRule,
  type SessionResult,
} from './progression.ts';

const stack: DeviceLoadSettings = { kind: 'selectorized', baseKg: 5, stepKg: 5, maxKg: 50 };
const stackWithAddOns: DeviceLoadSettings = { ...stack, addOnsKg: [1.25, 2.5] };
const doublePulley: DeviceLoadSettings = { kind: 'cable', baseKg: 2.5, stepKg: 2.5, maxKg: 50, pulleyRatio: 2 };
const dumbbells: DeviceLoadSettings = { kind: 'dumbbell', weightsKg: [16, 10, 12, 14, 20, 24] };

describe('cihazda ayarlanabilen ağırlıklar', () => {
  test('ağırlık bloğu: ilk blok, adım, en çok', () => {
    assert.deepEqual(deviceLoads(stack), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  });

  test('ara ağırlıklar tek tek ve birlikte eklenir', () => {
    const loads = deviceLoads(stackWithAddOns) ?? [];
    assert.deepEqual(loads.slice(0, 5), [5, 6.25, 7.5, 8.75, 10]);
    assert.equal(loads.at(-1), 53.75); // 50 + 1,25 + 2,5
  });

  test('+1,75 gibi ara ağırlık da olur', () => {
    const loads = deviceLoads({ ...stack, addOnsKg: [1.75] }) ?? [];
    assert.deepEqual(loads.slice(0, 4), [5, 6.75, 10, 11.75]);
  });

  test('dambıl seti sıralanır; plaka yüklemeli kızaktan başlar', () => {
    assert.deepEqual(deviceLoads(dumbbells), [10, 12, 14, 16, 20, 24]);
    assert.deepEqual(deviceLoads({ kind: 'plate_loaded', baseKg: 50, stepKg: 5, maxKg: 65 }), [50, 55, 60, 65]);
  });

  test('ağırlıksız cihaz ya da eksik ayar → liste yok', () => {
    assert.equal(deviceLoads({ kind: 'bodyweight' }), null);
    assert.equal(deviceLoads({ kind: 'selectorized', baseKg: 5 }), null);
    assert.equal(deviceLoads({ kind: 'dumbbell', weightsKg: [] }), null);
  });

  test('çift makara: kolda hissedilen, seçilenin yarısı; tek makarada aynısı', () => {
    assert.equal(effectiveLoadKg(doublePulley, 20), 10);
    assert.equal(effectiveLoadKg({ kind: 'cable', pulleyRatio: 1 }, 20), 20);
    assert.equal(effectiveLoadKg({ kind: 'selectorized' }, 20), 20);
  });

  test('anlatım', () => {
    assert.equal(describeDeviceLoads(stackWithAddOns), 'Blok 5 kg–50 kg, 5 kg adım · ara ağırlık +1,25 kg, +2,5 kg');
    assert.match(describeDeviceLoads(doublePulley), /2:1 makara — kolda yarısı hissedilir/);
    assert.equal(describeDeviceLoads(dumbbells), '6 ağırlık: 10 kg–24 kg');
  });
});

describe('öneriler cihazın ağırlıklarından seçilir', () => {
  const rule: ProgressionRule = { scheme: 'double', targetMin: 8, targetMax: 12, targetRir: 2 };
  const spec = (device: DeviceLoadSettings): LoadSpec => ({
    trackingType: 'weight_reps',
    loadStepKg: 0,
    minLoadKg: 0,
    loadsKg: deviceLoads(device) ?? [],
  });
  const sets = (weightKg: number, values: number[], effort: 'good' | 'easy' = 'good'): SessionResult =>
    values.map((value) => ({ weightKg, value, effort }));

  test('dambılda artış setteki bir sonraki ağırlık (16 → 20; 18 yok)', () => {
    const suggestion = nextSession({ spec: spec(dumbbells), rule, history: [sets(16, [12, 12, 12])] });
    assert.deepEqual(suggestion, { weightKg: 20, target: 8, reason: 'increase' });
  });

  test('ara ağırlıklı blokta artış küçük adımla (40 → 41,25)', () => {
    assert.equal(nextSession({ spec: spec(stackWithAddOns), rule, history: [sets(40, [12, 12])] }).weightKg, 41.25);
  });

  test('çok kolaysa iki ağırlık yukarı', () => {
    assert.equal(nextSession({ spec: spec(stack), rule, history: [sets(40, [12, 12], 'easy')] }).weightKg, 50);
  });

  test('listenin tepesinde artacak yer yoksa en ağırda kalır; "artış" denmez, hedef tepede', () => {
    assert.deepEqual(nextSession({ spec: spec(stack), rule, history: [sets(50, [12, 12])] }), {
      weightKg: 50,
      target: 12,
      reason: 'device_max',
    });
  });

  test('ilk kez: başlangıç ağırlığı setteki altındaki ağırlığa yuvarlanır (17 → 16)', () => {
    assert.equal(nextSession({ spec: spec(dumbbells), rule, history: [], startWeightKg: 17 }).weightKg, 16);
    assert.equal(nextSession({ spec: spec(dumbbells), rule, history: [] }).weightKg, 10);
  });

  test('azaltma ~%5, listedeki en yakın alt ağırlık (20 → 16 dambılda; 40 → 37,5 ara ağırlıkla)', () => {
    assert.equal(decreaseWeight(20, spec(dumbbells)), 16);
    assert.equal(decreaseWeight(40, spec(stackWithAddOns)), 37.5); // hedef 38: 37,5 daha yakın
    assert.equal(decreaseWeight(10, spec(dumbbells)), 10); // daha hafifi yok
  });

  test('hafifletme %15, listede altındaki ağırlık (50 → 42,5)', () => {
    assert.equal(deloadWeight(50, spec({ ...stack, addOnsKg: [2.5] })), 42.5);
    assert.equal(deloadWeight(10, spec(dumbbells)), 10); // 8,5 setin altında: korunur
  });

  test('set arası: kolay ve tepede → bir sonraki ağırlık', () => {
    const suggestion = nextSet({ spec: spec(dumbbells), rule, plan: { weightKg: 14, target: 8 }, done: sets(14, [12], 'easy') });
    assert.equal(suggestion.weightKg, 16);
  });
});

describe('bar ve plaka yüklemeli: adımlar bar/kızak ağırlığından sayılır', () => {
  const rule: ProgressionRule = { scheme: 'double', targetMin: 8, targetMax: 12, targetRir: 2 };
  const exercise = { trackingType: 'weight_reps' as const, loadStepKg: 5, minLoadKg: 0 };
  const sets = (weightKg: number, values: number[], effort: 'good' | 'easy' = 'good'): SessionResult =>
    values.map((value) => ({ weightKg, value, effort }));
  // PT kızağı kendi makinesine göre 37 kg girdi: kurulabilen 37, 42 … 97, 102 (h2).
  const legPress: DeviceLoadSettings = { kind: 'plate_loaded', baseKg: 37, stepKg: 5, maxKg: 400 };
  const spec = loadSpecFor(exercise, legPress);

  test('yük tanımı: cihazın adımı, bar/kızak ağırlığı ve (varsa) üst sınırı', () => {
    assert.deepEqual(spec, { trackingType: 'weight_reps', loadStepKg: 5, minLoadKg: 37, maxLoadKg: 400 });
    assert.deepEqual(loadSpecFor(exercise, { kind: 'barbell', baseKg: 20, stepKg: 2.5 }), {
      trackingType: 'weight_reps',
      loadStepKg: 2.5,
      minLoadKg: 20,
    });
  });

  test('kızak 37 kg: bütün öneriler cihazda kurulabilir', () => {
    const plan = planSession({
      spec,
      rule,
      sets: [{ min: 8, max: 12 }, { min: 8, max: 12, loadPct: 85 }],
      history: [],
      startWeightKg: 102,
    });
    const suggested = [
      nextSession({ spec, rule, history: [], startWeightKg: 100 }).weightKg,
      decreaseWeight(102, spec),
      deloadWeight(102, spec),
      percentOfTop(102, 85, spec),
      ...plan.sets.map((set) => set.weightKg),
    ];
    assert.deepEqual(suggested, [97, 97, 82, 82, 102, 82]);
    const loadable = new Set(deviceLoads(legPress));
    assert.ok(suggested.every((kg) => loadable.has(kg)));
  });

  test('Smith barı 7 kg: ısınma ve hafifletme bardan sayılır', () => {
    const smith = loadSpecFor({ ...exercise, loadStepKg: 2.5 }, { kind: 'plate_loaded', baseKg: 7, stepKg: 2.5, maxKg: 300 });
    assert.deepEqual(warmupSets({ workWeightKg: 102, spec: smith, isBarbell: true, isCompound: true, isFirstForMuscle: true }), [
      { weightKg: 7, target: 10 },
      { weightKg: 49.5, target: 5 },
      { weightKg: 74.5, target: 3 },
    ]);
    assert.equal(deloadWeight(102, smith), 84.5);
  });

  test('plaka yüklemelide üst sınır geçilmez (hack squat 150)', () => {
    const hack = loadSpecFor(exercise, { kind: 'plate_loaded', baseKg: 40, stepKg: 5, maxKg: 150 });
    assert.equal(nextSession({ spec: hack, rule, history: [], startWeightKg: 180 }).weightKg, 150);
    assert.equal(nextSession({ spec: hack, rule, history: [sets(145, [12, 12], 'easy')] }).weightKg, 150);
    // 150 × 12 sonrası 155 değil: artacak yer yok.
    assert.deepEqual(nextSession({ spec: hack, rule, history: [sets(150, [12, 12, 12])] }), {
      weightKg: 150,
      target: 12,
      reason: 'device_max',
    });
  });
});

describe('cihazın en ağır ayarında sahte artış yok', () => {
  // Katalogdaki kettlebell seti: en ağırı 32 kg (h7).
  const kettlebells = loadSpecFor(
    { trackingType: 'weight_reps', loadStepKg: 4, minLoadKg: 0 },
    { kind: 'kettlebell', weightsKg: [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32] },
  );
  const rule: ProgressionRule = { scheme: 'double', targetMin: 6, targetMax: 10, targetRir: 2 };
  const sets = (weightKg: number, values: number[], effort: 'good' | 'easy' = 'good'): SessionResult =>
    values.map((value) => ({ weightKg, value, effort }));

  test('tepede: en ağır ayar gerekçesi, hedef tepede kalır; öneri izlenince 6→10→6 döngüsü yok', () => {
    let history: SessionResult[] = [sets(32, [10, 10, 10])];
    for (let i = 0; i < 4; i++) {
      const next = nextSession({ spec: kettlebells, rule, history });
      assert.deepEqual(next, { weightKg: 32, target: 10, reason: 'device_max' });
      history = [...history, sets(next.weightKg, [next.target, next.target, next.target])];
    }
  });

  test('bir altındaki ağırlıktan çok kolaysa: iki adım yerine en ağır ayar, yine artış', () => {
    assert.deepEqual(nextSession({ spec: kettlebells, rule, history: [sets(28, [10, 10, 10], 'easy')] }), {
      weightKg: 32,
      target: 6,
      reason: 'increase',
    });
  });

  test('geçmiş listenin tepesinden ağırsa en ağır ayara iniş "artış" sayılmaz (h1)', () => {
    const lateral = loadSpecFor({ trackingType: 'weight_reps', loadStepKg: 5, minLoadKg: 0 }, { kind: 'selectorized', baseKg: 5, stepKg: 5, maxKg: 60 });
    const top = { scheme: 'double' as const, targetMin: 8, targetMax: 12, targetRir: 2 };
    assert.deepEqual(nextSession({ spec: lateral, rule: top, history: [sets(62.5, [12, 12, 12])] }), {
      weightKg: 60,
      target: 12,
      reason: 'device_max',
    });
    // Tepede değilse de kurulamayan 62,5 değil, en ağır ayar (60) ve bir tekrar daha (range.ts §6).
    assert.deepEqual(nextSession({ spec: lateral, rule: top, history: [sets(62.5, [10, 10, 10])] }), {
      weightKg: 60,
      target: 11,
      reason: 'device_max',
    });
    assert.ok(deviceLoads({ kind: 'selectorized', baseKg: 5, stepKg: 5, maxKg: 60 })?.includes(60));
  });

  test('doğrusal: en ağır ayarda tepedeyse hedef tepede, değilse bir tekrar daha; ikisi de en ağır ayar gerekçesi', () => {
    const linear: ProgressionRule = { ...rule, scheme: 'linear' };
    assert.equal(nextSession({ spec: kettlebells, rule: linear, history: [sets(32, [10, 10, 10])] }).reason, 'device_max');
    assert.deepEqual(nextSession({ spec: kettlebells, rule: linear, history: [sets(32, [8, 8, 7])] }), {
      weightKg: 32,
      target: 8,
      reason: 'device_max',
    });
  });

  test('set başına plan: en ağır ayar gerekçesi, bütün setlerin hedefi tepede', () => {
    const plan = planSession({ spec: kettlebells, rule, sets: [{ min: 6, max: 10 }, { min: 6, max: 10 }], history: [sets(32, [10, 10])] });
    assert.deepEqual(
      { reason: plan.reason, top: plan.topWeightKg, targets: plan.sets.map((set) => set.target) },
      { reason: 'device_max', top: 32, targets: [10, 10] },
    );
  });

  test('tepeye varmadan en ağır ayarda: artış istenmediği için "bir tekrar daha" (add_rep)', () => {
    assert.deepEqual(nextSession({ spec: kettlebells, rule, history: [sets(32, [8, 8, 7])] }), {
      weightKg: 32,
      target: 8,
      reason: 'add_rep',
    });
  });

  test('set arası: kolay ve tepede ama daha ağırı yok → aynı ağırlık', () => {
    assert.deepEqual(nextSet({ spec: kettlebells, rule, plan: { weightKg: 32, target: 6 }, done: sets(32, [10], 'easy') }), {
      weightKg: 32,
      target: 6,
      reason: 'hold',
    });
    const straight = [{ min: 6, max: 10 }, { min: 6, max: 10 }];
    const plan = planSession({ spec: kettlebells, rule, sets: straight, history: [], startWeightKg: 32 });
    const next = nextSetInPlan({ spec: kettlebells, rule, sets: straight, plan, done: sets(32, [10], 'easy') });
    assert.deepEqual([next.weightKg, next.reason], [32, 'hold']);
  });
});
