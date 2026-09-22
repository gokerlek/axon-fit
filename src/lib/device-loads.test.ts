import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDeviceLoads, deviceLoads, effectiveLoadKg, type DeviceLoadSettings } from './device-loads.ts';
import { decreaseWeight, deloadWeight, nextSession, nextSet, type LoadSpec, type ProgressionRule, type SessionResult } from './progression.ts';

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

  test('listenin tepesinde artacak yer yoksa en ağırda kalır', () => {
    assert.equal(nextSession({ spec: spec(stack), rule, history: [sets(50, [12, 12])] }).weightKg, 50);
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
