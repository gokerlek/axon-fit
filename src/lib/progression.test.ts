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
  REASON_LABELS,
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

/** Kayda yapıldığı günkü hedefi yazar: `inRange(sets(100, [5, 5, 5]), 4, 6)`. */
function inRange(session: SessionResult, min: number, max: number): SessionResult {
  return session.map((set) => ({ ...set, target: { min, max } }));
}

/** Kaydı satıra bağlar (SPEC §7.4, `r_` kimliği). */
function onRow(session: SessionResult, rowId: string): SessionResult {
  return session.map((set) => ({ ...set, rowId }));
}

/** O günkü plandaki set sayısını yazar (`SessionPlan.sets.length`). */
function withPlan(session: SessionResult, plannedSetCount: number): SessionResult {
  return session.map((set) => ({ ...set, plannedSetCount }));
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

  test('hafifletme %15\'i tabanın altına düşerse tabana iner; sıfıra inmez, inecek yer yoksa korunur', () => {
    assert.equal(deloadWeight(22.5, barbell), 20); // 19,1 < 20 → boş bar (v1'de 22,5 kalırdı)
    assert.equal(deloadWeight(20, barbell), 20); // boş bar: inecek yer yok
    assert.equal(deloadWeight(2, dumbbell), 2); // 1,7 → 0: sıfıra inmez
    assert.equal(deloadWeight(55, { trackingType: 'weight_reps', loadStepKg: 5, minLoadKg: 50 }), 50); // kızak 50
  });

  test('hafifletme monoton ve %5 azaltmadan zayıf değil (h3)', () => {
    // Eskiden 25 → 20 iken 22,5 → 22,5 kalıyordu; %5 azaltma ise 22,5'i 20'ye indiriyordu.
    assert.ok(deloadWeight(25, barbell) <= deloadWeight(22.5, barbell));
    const weights = [20, 22.5, 25, 27.5, 30, 42.5, 60, 100];
    const deloads = weights.map((kg) => deloadWeight(kg, barbell));
    deloads.forEach((kg, index) => {
      if (index > 0) assert.ok(kg >= (deloads[index - 1] as number), `${weights[index]} kg`);
      const weight = weights[index] as number;
      assert.ok(kg <= decreaseWeight(weight, barbell), `${weight} kg: hafifletme ${kg}, azaltma ${decreaseWeight(weight, barbell)}`);
    });
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

describe('ızgara tabandan sayılır (bar, kızak)', () => {
  // Cihazsız EZ-bar curl: bar 7 kg, adım 2,5 → kurulabilen 7, 9,5, 12 … 29,5, 32 … 42 (h9).
  const ez: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 2.5, minLoadKg: 7 };
  const curl: ProgressionRule = { scheme: 'double', targetMin: 8, targetMax: 12, targetRir: 1 };

  test('aşağı yuvarlama tabandan sayar; taban verilmezse 0', () => {
    assert.equal(roundDownToStep(100, 5, 37), 97);
    assert.equal(roundDownToStep(35.7, 2.5, 7), 34.5);
    assert.equal(roundDownToStep(51, 2.5), 50);
  });

  test('başlangıç, yüzde, hafifletme ve azaltma barın ağırlığından sayılır', () => {
    assert.equal(nextSession({ spec: ez, rule: curl, history: [], startWeightKg: 30 }).weightKg, 29.5);
    assert.equal(percentOfTop(42, 85, ez), 34.5); // 35,7
    assert.equal(deloadWeight(42, ez), 34.5); // 35,7
    assert.equal(decreaseWeight(42, ez), 39.5); // 39,9
    assert.equal(nextSession({ spec: ez, rule: curl, history: [sets(29.5, [12, 12, 12])] }).weightKg, 32);
  });

  test('ızgara dışındaki kayıttan bir üstteki ve bir alttaki kurulabilen ağırlık', () => {
    assert.equal(nextSession({ spec: ez, rule: curl, history: [sets(30, [12, 12, 12])] }).weightKg, 32);
    assert.equal(decreaseWeight(30, ez), 29.5); // hedef 28,5: 29,5 daha yakın
  });

  test('üst sınır geçilmez; adımın katı değilse altındaki son ağırlık', () => {
    const hack: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 5, minLoadKg: 40, maxLoadKg: 152 };
    assert.equal(nextSession({ spec: hack, rule: double, history: [], startWeightKg: 180 }).weightKg, 150);
    assert.equal(nextSession({ spec: hack, rule: double, history: [sets(145, [12, 12, 12], 'easy')] }).weightKg, 150);
    assert.equal(percentOfTop(150, 85, hack), 125); // 127,5
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

describe('geçmiş aralığa göre okunur', () => {
  const heavy: ProgressionRule = { scheme: 'double', targetMin: 4, targetMax: 6, targetRir: 2 };
  // Güç evresi 4–6: üç başarılı antrenman (h8).
  const strength = [inRange(sets(100, [5, 5, 5]), 4, 6), inRange(sets(100, [6, 6, 5]), 4, 6), inRange(sets(102.5, [5, 5, 5]), 4, 6)];

  test('satır 4–6\'dan 8–12\'ye çevrildi: tıkanma yok, ilk kez, ağırlık çevrilir', () => {
    // 102,5 × (30 + 5) / (30 + 8) = 94,4 → 92,5.
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: strength }), { weightKg: 92.5, target: 8, reason: 'first_time' });
    const plan = planSession({ spec: barbell, rule: double, sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }], history: strength });
    assert.deepEqual(
      { reason: plan.reason, top: plan.topWeightKg, sets: plan.sets.length },
      { reason: 'first_time', top: 92.5, sets: 3 },
    );
  });

  test('ters yön: 8–12\'den 4–6\'ya, 80 × 12 → Epley 97,5 ama en çok iki adım: 85 × 4, artış gerekçesiyle', () => {
    assert.deepEqual(nextSession({ spec: barbell, rule: heavy, history: [inRange(sets(80, [12, 12, 12]), 8, 12)] }), {
      weightKg: 85,
      target: 4,
      reason: 'range_increase',
    });
  });

  // Aynı hareket Gün A'da 4–6, Gün B'de 8–12; geçmiş egzersiz + cihaz bazında (h10). Günler satır kimliğiyle ayrılır.
  const rowA = 'r_gunaaa';
  const rowB = 'r_gunbbb';
  const dayA = onRow(inRange(sets(100, [5, 5, 5]), 4, 6), rowA);
  const dayB = onRow(inRange(sets(80, [10, 10, 9]), 8, 12), rowB);
  const dayA2 = onRow(inRange(sets(100, [6, 5, 5]), 4, 6), rowA);

  test('Gün A / Gün B: her satır kendi serisinden (satır kimliğiyle)', () => {
    assert.deepEqual(nextSession({ spec: barbell, rule: heavy, history: [dayA, dayB], rowId: rowA }), {
      weightKg: 100,
      target: 6,
      reason: 'add_rep',
    });
    const history = [dayA, dayB, dayA2];
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history, rowId: rowB }), { weightKg: 80, target: 10, reason: 'add_rep' });
    const S3: SetTarget[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }];
    const plan = planSession({ spec: barbell, rule: double, sets: S3, history, rowId: rowB });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg }, { reason: 'add_rep', top: 80 });
  });

  test('satır kimliği yoksa araya giren başka aralık seriyi keser: en yeni antrenmandan çevrilir', () => {
    const history = [dayA, dayB, dayA2].map((session) => session.map(({ rowId: _rowId, ...set }) => set));
    // Gün B'nin (8–12) önerisi Gün A'nın 100 × 6/5/5'inden: 100 × 35 / 38 = 92,1 → 90; hafif çeviri.
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history }), { weightKg: 90, target: 8, reason: 'first_time' });
  });

  test('tıkanma serisi araya giren başka satırın antrenmanıyla bozulmaz, ona da taşmaz', () => {
    const stuckA = onRow(inRange(sets(100, [5, 4, 3]), 4, 6), rowA);
    const goodB = onRow(inRange(sets(80, [10, 10, 10]), 8, 12), rowB);
    const history = [stuckA, goodB, stuckA, goodB, stuckA, goodB];
    assert.deepEqual(nextSession({ spec: barbell, rule: heavy, history, rowId: rowA }), { weightKg: 85, target: 4, reason: 'deload' });
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history, rowId: rowB }), { weightKg: 80, target: 11, reason: 'add_rep' });
  });

  test('hedefsiz eski kayıtlar güncel hedefle değerlendirilir (eski davranış)', () => {
    const legacy = strength.map((session) => sets(session[0]?.weightKg ?? 0, session.map((set) => set.value)));
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: legacy }), { weightKg: 85, target: 8, reason: 'deload' });
    // Hedefli ve hedefsiz karışık: hedefsiz kayıt güncel aralıkta sayılır.
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: [sets(60, [12, 12, 12]), inRange(sets(60, [12, 12, 12]), 8, 12)] }), {
      weightKg: 62.5,
      target: 8,
      reason: 'increase',
    });
  });

  test('set kendi hedefiyle değerlendirilir: kayıtta AMRAP olan set "başaramadım"la tıkanmaz', () => {
    const S3: SetTarget[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }];
    const rule = { scheme: 'double' as const, targetRir: 2 };
    const failedLast = { weightKg: 60, value: 12, effort: 'fail' as const };
    const done = [...sets(60, [12, 12]), failedLast];
    const amrapThen = [...sets(60, [12, 12]), { ...failedLast, target: { min: 8, max: 12, amrap: true } }];
    assert.equal(planSession({ spec: barbell, rule, sets: S3, history: [amrapThen] }).reason, 'increase');
    assert.equal(planSession({ spec: barbell, rule, sets: S3, history: [done] }).reason, 'hold');
  });

  test('aynı antrenmanda: yapılan set kendi hedefiyle (satır sonradan 12–15 oldu)', () => {
    const raised: SetTarget[] = [{ min: 12, max: 15 }, { min: 12, max: 15 }];
    const plan: SessionPlan = {
      sets: raised.map((_, setIndex) => ({ weightKg: 60, target: 12, amrap: false, setIndex })),
      topWeightKg: 60,
      reason: 'hold',
    };
    const done = inRange(sets(60, [12], 'easy'), 8, 12);
    const next = nextSetInPlan({ spec: barbell, rule: { scheme: 'double' }, sets: raised, plan, done });
    assert.deepEqual([next.weightKg, next.reason], [62.5, 'increase']);
    assert.equal(nextSet({ spec: barbell, rule: { ...double, targetMin: 12, targetMax: 15 }, plan: { weightKg: 60, target: 12 }, done }).reason, 'increase');
  });

  test('ısınma, planın aynı modelle bulduğu ağırlıktan', () => {
    const history = [dayA, dayB, dayA2];
    const warmupFor = (rule: ProgressionRule, rowId: string) => {
      const plan = planSession({ spec: barbell, rule, sets: [{ min: rule.targetMin, max: rule.targetMax }], history, rowId });
      return warmupSets({ workWeightKg: plan.topWeightKg, spec: barbell, isBarbell: true, isCompound: true, isFirstForMuscle: true });
    };
    assert.deepEqual(warmupFor(heavy, rowA).map((set) => set.weightKg), [20, 50, 75]); // Gün A: 100
    assert.deepEqual(warmupFor(double, rowB).map((set) => set.weightKg), [20, 40, 60]); // Gün B: 80
  });
});

describe('kesişen aralık aynı seridir', () => {
  const range = (min: number, max: number): ProgressionRule => ({ scheme: 'double', targetMin: min, targetMax: max, targetRir: 2 });
  const planRule = { scheme: 'double' as const, targetRir: 2 };
  const uniform = (n: number, min: number, max: number): SetTarget[] => Array.from({ length: n }, () => ({ min, max }));
  // Son antrenman 100 × 12/12/12, satır 8–12 (range.ts §1).
  const top = [inRange(sets(100, [12, 12, 12]), 8, 12)];

  test('genişletilen aralıkta bir tekrar daha, daraltılanda artış; Epley sıçraması ve "ilk kez" yok', () => {
    assert.deepEqual(nextSession({ spec: barbell, rule: range(8, 15), history: top }), { weightKg: 100, target: 13, reason: 'add_rep' });
    assert.deepEqual(nextSession({ spec: barbell, rule: range(12, 15), history: top }), { weightKg: 100, target: 13, reason: 'add_rep' });
    assert.deepEqual(nextSession({ spec: barbell, rule: range(8, 10), history: top }), { weightKg: 102.5, target: 8, reason: 'increase' });
    assert.deepEqual(nextSession({ spec: barbell, rule: range(6, 12), history: top }), { weightKg: 102.5, target: 6, reason: 'increase' });
    const wider = planSession({ spec: barbell, rule: planRule, sets: uniform(3, 8, 15), history: top });
    assert.deepEqual({ reason: wider.reason, top: wider.topWeightKg, targets: wider.sets.map((set) => set.target) }, {
      reason: 'add_rep',
      top: 100,
      targets: [13, 13, 13],
    });
  });

  test('tıkanma kaydın kendi hedefine göre: 8–12\'de 9 tekrar, satır 10–12 oldu → tıkanma değil, hafifletme de yok', () => {
    const nine = inRange(sets(100, [9, 9, 9]), 8, 12);
    assert.deepEqual(nextSession({ spec: barbell, rule: range(10, 12), history: [nine] }), { weightKg: 100, target: 10, reason: 'add_rep' });
    assert.equal(nextSession({ spec: barbell, rule: range(10, 12), history: [nine, nine, nine] }).reason, 'add_rep');
  });

  test('yalnız bir setin aralığı değişince seri sürer (3. set 6–8 AMRAP, oneset.ts)', () => {
    const before = uniform(3, 8, 12);
    const after: SetTarget[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 6, max: 8, amrap: true }];
    const record = (kg: number, values: number[]): SessionResult =>
      values.map((value, setIndex) => ({ weightKg: kg, value, effort: 'good', setIndex, target: before[setIndex] }));
    const history = [record(95, [10, 10, 9]), record(97.5, [9, 9, 8]), record(100, [11, 10, 10])];
    const plan = planSession({ spec: barbell, rule: planRule, sets: after, history });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg, targets: plan.sets.map((set) => set.target) }, {
      reason: 'add_rep',
      top: 100,
      targets: [11, 11, 6],
    });
  });

  test('ağırlıksız ve süreli harekette hedef son performanstan, bugünkü aralığa kırpılır', () => {
    // Kesişen: 12–15'te 15/15 → 6–12 tepede, hedef 12; süreli 30–60'ta 60 sn → 20–45 tepede, hedef 45 (alt sınır değil).
    assert.deepEqual(nextSession({ spec: bodyweight, rule: range(6, 12), history: [inRange(sets(0, [15, 15]), 12, 15)] }), {
      weightKg: 0,
      target: 12,
      reason: 'harder_variant',
    });
    assert.deepEqual(nextSession({ spec: timed, rule: range(20, 45), history: [inRange(sets(0, [60, 60]), 30, 60)] }), {
      weightKg: 0,
      target: 45,
      reason: 'harder_variant',
    });
    const timedPlan = planSession({ spec: timed, rule: planRule, sets: [{ min: 20, max: 45 }], history: [inRange(sets(0, [60, 60]), 30, 60)] });
    assert.deepEqual(timedPlan.sets.map((set) => set.target), [45]);
    // Kesişmeyen: 15–20'de 18/17 → 6–10: hedef 10; 4–6'da 5/5 → 8–12: hedef 8.
    assert.deepEqual(nextSession({ spec: bodyweight, rule: range(6, 10), history: [inRange(sets(0, [18, 17]), 15, 20)] }), {
      weightKg: 0,
      target: 10,
      reason: 'first_time',
    });
    assert.equal(nextSession({ spec: bodyweight, rule: range(8, 12), history: [inRange(sets(0, [5, 5]), 4, 6)] }).target, 8);
  });

  test('kesişmeyen aralıkta çeviri: son ağırlıktan en çok iki adım, ağırsa artış gerekçesi', () => {
    const heavy = range(4, 6);
    // 80 × 12 (8–12) → 4–6: Epley 97,5 → 85.
    assert.deepEqual(nextSession({ spec: barbell, rule: heavy, history: [inRange(sets(80, [12, 12, 12]), 8, 12)] }), {
      weightKg: 85,
      target: 4,
      reason: 'range_increase',
    });
    // Tek set AMRAP 25 tekrar (60 kg) → 4–6: Epley 97 → 65.
    const amrap: SessionResult = [{ weightKg: 60, value: 25, effort: 'good', target: { min: 8, max: 12, amrap: true } }];
    const plan = planSession({ spec: barbell, rule: planRule, sets: [{ min: 4, max: 6 }], history: [amrap] });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg }, { reason: 'range_increase', top: 65 });
    // Hafif çeviri (4–6 → 8–12) sınırsız ve "ilk kez".
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: [inRange(sets(100, [1]), 4, 6)] }), {
      weightKg: 80,
      target: 8,
      reason: 'first_time',
    });
  });

  test('PT\'nin başlangıç ağırlığı çeviriden önce gelir', () => {
    const other = [inRange(sets(100, [5, 5, 5]), 4, 6)];
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: other, startWeightKg: 70 }), {
      weightKg: 70,
      target: 8,
      reason: 'first_time',
    });
    const plan = planSession({ spec: barbell, rule: planRule, sets: uniform(3, 8, 12), history: other, startWeightKg: 70 });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg }, { reason: 'first_time', top: 70 });
  });
});

describe('seri en yeni uyumsuz antrenmanda kesilir', () => {
  const planRule = { scheme: 'double' as const, targetRir: 2 };
  const S3: SetTarget[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }];
  const in812 = (kg: number, values: number[]) => inRange(sets(kg, values), 8, 12);
  const in46 = (kg: number, values: number[]) => inRange(sets(kg, values), 4, 6);
  // range.ts §2: 8–12 (60 kg'da bitti) → 4–6 (90'dan 102,5'e) → yeniden 8–12.
  const phase1 = [in812(57.5, [12, 11, 11]), in812(60, [10, 9, 9]), in812(60, [12, 12, 12])];
  const phase2 = [in46(90, [5, 5, 5]), in46(92.5, [6, 6, 6]), in46(95, [5, 5, 5]), in46(97.5, [6, 6, 6]), in46(100, [5, 5, 5]), in46(102.5, [5, 5, 4])];

  test('eski aralığa dönüş: önceki evrenin 60 kg\'ı referans olmaz, en yeni antrenmandan çevrilir', () => {
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: [...phase1, ...phase2] }), {
      weightKg: 90,
      target: 8,
      reason: 'first_time',
    });
    const plan = planSession({ spec: barbell, rule: planRule, sets: S3, history: [...phase1, ...phase2] });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg }, { reason: 'first_time', top: 90 });
  });

  test('önceki evrenin tıkanmaları yeni evreye taşınmaz (range.ts §3)', () => {
    const stuck = [in812(60, [9, 8, 7]), in812(60, [8, 8, 7])];
    const history = [...stuck, in46(90, [5, 5, 5]), in46(92.5, [5, 5, 5]), in46(95, [5, 5, 5]), in812(60, [9, 8, 7])];
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history }), { weightKg: 60, target: 8, reason: 'hold' });
    assert.equal(planSession({ spec: barbell, rule: planRule, sets: S3, history }).reason, 'hold');
  });

  test('satır kimliği: yeni satırın ilk antrenmanı bütün geçmişe bakar, sonra yalnız kendi serisine', () => {
    const history = [...phase1.map((session) => onRow(session, 'r_evre1a')), ...phase2.map((session) => onRow(session, 'r_evre2a'))];
    // Evre 3'ün satırı yeni: en yeni antrenman (evre 2, 4–6) kesişmiyor → çeviri.
    assert.equal(nextSession({ spec: barbell, rule: double, history, rowId: 'r_evre3a' }).weightKg, 90);
    // Bir antrenman sonra yalnız kendi kaydı: evre 1'in 8–12 kayıtları seriye girmez.
    const next = [...history, onRow(in812(90, [10, 10, 9]), 'r_evre3a')];
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: next, rowId: 'r_evre3a' }), {
      weightKg: 90,
      target: 10,
      reason: 'add_rep',
    });
    const plan = planSession({ spec: barbell, rule: planRule, sets: S3, history: next, rowId: 'r_evre3a' });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg }, { reason: 'add_rep', top: 90 });
  });
});

describe('yarıda bırakılan antrenman', () => {
  const planRule = { scheme: 'double' as const, targetRir: 2 };
  const S3: SetTarget[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }];
  const stuck = sets(80, [9, 8, 7]);
  const pick = (plan: SessionPlan) => ({ reason: plan.reason, top: plan.topWeightKg });

  test('planın tam yük seti yapılmadı: artış yok, ağırlık korunur (3×8–12\'de tek set 60 × 12, h4 A)', () => {
    const partial = [sets(60, [12])];
    assert.deepEqual(pick(planSession({ spec: barbell, rule: planRule, sets: S3, history: partial })), { reason: 'incomplete', top: 60 });
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: partial, setCount: 3 }), {
      weightKg: 60,
      target: 8,
      reason: 'incomplete',
    });
    // Set sayısı bilinmiyorsa antrenman tamam sayılır (eski çağrı).
    assert.equal(nextSession({ spec: barbell, rule: double, history: partial }).reason, 'increase');
  });

  test('yapılan set tıkandıysa gerekçe "hedefin altında"; bütün setler tıkanmadığı için iniş yok', () => {
    const partial = [sets(60, [6], 'fail')];
    assert.deepEqual(pick(planSession({ spec: barbell, rule: planRule, sets: S3, history: partial })), { reason: 'hold', top: 60 });
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: partial, setCount: 3 }), { weightKg: 60, target: 8, reason: 'hold' });
  });

  test('tıkanma serisinde nötr: araya giren eksik antrenman seriyi ne sıfırlar ne artırır (h4 B)', () => {
    const history = [stuck, stuck, sets(80, [9]), stuck];
    assert.equal(nextSession({ spec: barbell, rule: double, history, setCount: 3 }).reason, 'deload');
    assert.equal(planSession({ spec: barbell, rule: planRule, sets: S3, history }).reason, 'deload');
    const twoAndPartial = [stuck, stuck, sets(80, [5], 'fail')];
    assert.equal(nextSession({ spec: barbell, rule: double, history: twoAndPartial, setCount: 3 }).reason, 'hold');
    assert.equal(planSession({ spec: barbell, rule: planRule, sets: S3, history: twoAndPartial }).reason, 'hold');
  });

  test('hafifletme antrenmanı planı gereği az setli: tamam sayılır, seriyi sıfırlar, yeniden hafifletme yok', () => {
    const deload = withPlan(sets(67.5, [12, 12]), 2);
    assert.deepEqual(nextSession({ spec: barbell, rule: double, history: [stuck, stuck, stuck, deload], setCount: 3 }), {
      weightKg: 70,
      target: 8,
      reason: 'increase',
    });
    assert.deepEqual(pick(planSession({ spec: barbell, rule: planRule, sets: S3, history: [stuck, stuck, stuck, deload] })), {
      reason: 'increase',
      top: 70,
    });
    // Kayıtta o günkü plan yoksa da: üç tıkanmanın ardından gelen eksik antrenman hafifletme sayılır.
    const bare = sets(67.5, [12, 12]);
    assert.equal(nextSession({ spec: barbell, rule: double, history: [stuck, stuck, stuck, bare], setCount: 3 }).weightKg, 70);
    assert.deepEqual(pick(planSession({ spec: barbell, rule: planRule, sets: S3, history: [stuck, stuck, stuck, bare] })), {
      reason: 'increase',
      top: 70,
    });
  });

  test('satıra sonradan set eklendi: o günkü planını tamamlayan antrenman eksik sayılmaz', () => {
    const done = withPlan(sets(60, [12, 12, 12]), 3);
    const four: SetTarget[] = [...S3, { min: 8, max: 12 }];
    assert.equal(planSession({ spec: barbell, rule: planRule, sets: four, history: [done] }).reason, 'increase');
    assert.equal(nextSession({ spec: barbell, rule: double, history: [done], setCount: 4 }).reason, 'increase');
    // O günkü plan da eksikse (3 planlandı, 2 yapıldı) yarıda: set sayısı verilmese de kayıt söyler.
    assert.equal(nextSession({ spec: barbell, rule: double, history: [withPlan(sets(60, [12, 12]), 3)] }).reason, 'incomplete');
  });

  test('yalnız back-off seti yapılmadıysa yarıda sayılmaz: karar tam yük setinden', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 8, loadPct: 85 }];
    const history: SessionResult[] = [[{ weightKg: 100, value: 5, effort: 'good' }, { weightKg: 85, value: 8, effort: 'good' }]];
    assert.deepEqual(pick(planSession({ spec: barbell, rule: planRule, sets: backoff, history })), { reason: 'increase', top: 102.5 });
  });
});

describe('cihazın en ağır ayarı', () => {
  // Halter ızgarası 60'ta biter (range.ts §6).
  const capped: LoadSpec = { ...barbell, maxLoadKg: 60 };
  const planRule = { scheme: 'double' as const, targetRir: 2 };
  const S3: SetTarget[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }];

  test('tepede: ayrı gerekçe, hedef tepede; kayıt tavanın üstündeyse ağırlık tavana çekilir', () => {
    assert.deepEqual(nextSession({ spec: capped, rule: double, history: [sets(62.5, [12, 12, 12])] }), {
      weightKg: 60,
      target: 12,
      reason: 'device_max',
    });
    assert.deepEqual(nextSession({ spec: capped, rule: double, history: [sets(60, [12, 12, 12])] }), {
      weightKg: 60,
      target: 12,
      reason: 'device_max',
    });
  });

  test('tepede değil ama kayıt tavanın üstünde: kurulamayan 62,5 değil, 60 ve bir tekrar daha', () => {
    assert.deepEqual(nextSession({ spec: capped, rule: double, history: [sets(62.5, [10, 10, 10])] }), {
      weightKg: 60,
      target: 11,
      reason: 'device_max',
    });
    const plan = planSession({ spec: capped, rule: planRule, sets: S3, history: [sets(62.5, [10, 10, 10])] });
    assert.deepEqual({ reason: plan.reason, top: plan.topWeightKg, weights: plan.sets.map((set) => set.weightKg) }, {
      reason: 'device_max',
      top: 60,
      weights: [60, 60, 60],
    });
    // Hedefin altında kaldıysa gerekçe korunur, ağırlık yine kurulabilen en ağır.
    assert.deepEqual(nextSession({ spec: capped, rule: double, history: [sets(62.5, [10, 9, 7])] }), { weightKg: 60, target: 8, reason: 'hold' });
  });

  test('metin cihazı söyler, "ağırlık ekle" demez; ağırlıksız harekette zor varyasyon kalır', () => {
    assert.match(REASON_LABELS.device_max, /en ağır ayar/);
    assert.doesNotMatch(REASON_LABELS.device_max, /ağırlık ekle/);
    assert.equal(nextSession({ spec: bodyweight, rule: double, history: [sets(0, [12, 12])] }).reason, 'harder_variant');
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
    // En ağır ayarı olan cihazlar: halter ızgarası 60'ta biter; kettlebell seti 32'de.
    const capped: LoadSpec = { ...barbell, maxLoadKg: 60 };
    const kettlebells: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 0, minLoadKg: 0, loadsKg: [16, 20, 24, 28, 32] };
    const linearRange: ProgressionRule = { scheme: 'linear', targetMin: 8, targetMax: 12, targetRir: 2 };
    const stuck = sets(80, [9, 8, 7]);
    const timedRule: ProgressionRule = { scheme: 'double', targetMin: 30, targetMax: 60, targetRir: 2 };
    const range = (min: number, max: number): ProgressionRule => ({ scheme: 'double', targetMin: min, targetMax: max, targetRir: 2 });
    // Evreler: 8–12 (60 kg'da bitti) → 4–6 (90'dan 102,5'e) → yeniden 8–12 (range.ts §2).
    const phases = [
      inRange(sets(60, [12, 12, 12]), 8, 12),
      inRange(sets(90, [5, 5, 5]), 4, 6),
      inRange(sets(102.5, [5, 5, 4]), 4, 6),
    ];
    const cases: {
      name: string;
      spec: LoadSpec;
      rule: ProgressionRule;
      history: SessionResult[];
      n?: number;
      start?: number;
      rowId?: string;
    }[] = [
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
      { name: 'boş antrenman yok sayılır', spec: barbell, rule: double, history: [[one(55, 12), one(60, 12)], []], n: 2 },
      { name: 'ilerleme yok', spec: barbell, rule: { ...double, scheme: 'none' }, history: [sets(40, [12, 12])] },
      { name: 'dambıl +2', spec: dumbbell, rule: double, history: [sets(14, [12, 12, 12])] },
      { name: 'vücut ağırlığı +1', spec: bodyweight, rule: double, history: [sets(0, [9, 8, 8])] },
      { name: 'vücut ağırlığı tepede', spec: bodyweight, rule: double, history: [sets(0, [12, 12])], n: 2 },
      { name: 'süre +5 sn', spec: timed, rule: timedRule, history: [sets(0, [40, 35])], n: 2 },
      { name: 'süre üst sınırı geçmez', spec: timed, rule: timedRule, history: [sets(0, [58, 59])], n: 2 },
      { name: 'bant tekrarla', spec: band, rule: double, history: [sets(0, [10, 10])], n: 2 },
      { name: 'en ağır ayarda tepede', spec: capped, rule: double, history: [sets(60, [12, 12, 12])] },
      { name: 'en ağır ayarda doğrusal, tepede değil', spec: capped, rule: linearRange, history: [sets(60, [10, 10, 9])] },
      { name: 'en ağır ayarın üstünde, tepede değil', spec: capped, rule: double, history: [sets(62.5, [10, 10, 10])] },
      { name: 'geçmiş listenin tepesinden ağır', spec: kettlebells, rule: double, history: [sets(34, [12, 12, 12])] },
      { name: 'hedefli kayıt, aynı aralık', spec: barbell, rule: double, history: [inRange(sets(60, [12, 12, 12]), 8, 12)] },
      {
        name: 'yalnız başka aralıkta: ilk kez, çevrilir',
        spec: barbell,
        rule: double,
        history: [inRange(sets(100, [6, 6, 5]), 4, 6), inRange(sets(102.5, [5, 5, 4]), 4, 6)],
      },
      {
        name: 'Gün A / Gün B (satır kimliğiyle)',
        spec: barbell,
        rule: double,
        history: [onRow(inRange(sets(80, [12, 12, 11]), 8, 12), 'r_gunbbb'), onRow(inRange(sets(100, [5, 5, 5]), 4, 6), 'r_gunaaa')],
        rowId: 'r_gunbbb',
      },
      { name: 'kesişen aralık, vücut ağırlığı', spec: bodyweight, rule: double, history: [inRange(sets(0, [15, 15]), 12, 15)], n: 2 },
      { name: 'genişletilen aralık: bir tekrar daha', spec: barbell, rule: range(8, 15), history: [inRange(sets(100, [12, 12, 12]), 8, 12)] },
      { name: 'daraltılan aralık: artış', spec: barbell, rule: range(8, 10), history: [inRange(sets(100, [12, 12, 12]), 8, 12)] },
      { name: 'eski aralığa dönüş: seri kesilir, çevrilir', spec: barbell, rule: double, history: phases },
      { name: 'kesişmeyen aralıktan ağır çeviri', spec: barbell, rule: range(4, 6), history: [inRange(sets(80, [12, 12, 12]), 8, 12)] },
      { name: 'başlangıç ağırlığı çeviriden önce', spec: barbell, rule: double, history: phases.slice(1), start: 70 },
      { name: 'süreli, kesişen aralık tepede', spec: timed, rule: range(20, 45), history: [inRange(sets(0, [60, 60]), 30, 60)], n: 2 },
      { name: 'vücut ağırlığı, kesişmeyen aralık', spec: bodyweight, rule: range(6, 10), history: [inRange(sets(0, [18, 17]), 15, 20)], n: 2 },
      { name: 'yarıda bırakıldı', spec: barbell, rule: double, history: [sets(60, [12])] },
      { name: 'yarıda bırakıldı, yapılan set tıkandı', spec: barbell, rule: double, history: [sets(60, [6], 'fail')] },
      { name: 'eksik antrenman seride nötr', spec: barbell, rule: double, history: [stuck, stuck, sets(80, [9]), stuck] },
      { name: 'hafifletme antrenmanı eksik setli', spec: barbell, rule: double, history: [stuck, stuck, stuck, sets(67.5, [12, 12])] },
      { name: 'o günkü plan tamam, sonradan set eklendi', spec: barbell, rule: double, history: [withPlan(sets(60, [12, 12, 12]), 3)], n: 4 },
    ];
    for (const item of cases) {
      test(item.name, () => {
        const n = item.n ?? 3;
        const legacy = nextSession({
          spec: item.spec,
          rule: item.rule,
          history: item.history,
          startWeightKg: item.start,
          setCount: n,
          rowId: item.rowId,
        });
        const plan = planSession({
          spec: item.spec,
          rule: item.rule,
          sets: uniform(n, item.rule.targetMin, item.rule.targetMax),
          history: item.history,
          startWeightKg: item.start,
          rowId: item.rowId,
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
    const setCases: { name: string; done: SessionResult; spec?: LoadSpec }[] = [
      { name: 'ilk set', done: [] },
      { name: 'normal set', done: sets(60, [9]) },
      { name: 'başarısız', done: sets(60, [6], 'fail') },
      { name: '3+ altı', done: sets(60, [5], 'hard') },
      { name: '1–2 altı', done: sets(60, [7], 'hard') },
      { name: 'kolay ve tepede', done: sets(60, [12], 'easy') },
      { name: 'kolay ve tepede, en ağır ayarda', done: sets(60, [12], 'easy'), spec: capped },
    ];
    for (const item of setCases) {
      test(`aynı antrenmanda: ${item.name}`, () => {
        const spec = item.spec ?? barbell;
        const legacy = nextSet({ spec, rule: double, plan: { weightKg: 60, target: 8 }, done: item.done });
        const next = nextSetInPlan({ spec, rule, sets: S3, plan: planned(60, 8), done: item.done });
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

  test('back-off setlerindeki yorgunluk üst setin tekrar hedefini düşürmez', () => {
    const backoff: SetTarget[] = [{ min: 6, max: 10 }, { min: 6, max: 10, loadPct: 85 }, { min: 6, max: 10, loadPct: 85 }];
    const plan = planSession({ spec: barbell, rule, sets: backoff, history: [[one(100, 9), one(85, 6, 'hard'), one(85, 6, 'hard')]] });
    assert.equal(plan.reason, 'add_rep');
    assert.deepEqual(targets(plan), [10, 7, 7]);
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

  test('piramit tepeye varmadan bitti: yarıda bırakılmış, artış yok; referans kayıttaki planlanan üst ağırlık', () => {
    // Üst 100 planlanmıştı: 80 / 90 yapıldı, iki basamak tamam ama tam yük seti yapılmadı → 100'de kalır (eskiden 102,5).
    const planned100 = [{ ...one(80, 12), topWeightKg: 100 }, { ...one(90, 10), topWeightKg: 100 }];
    const plan = planSession({ spec: barbell, rule, sets: pyramid, history: [planned100] });
    assert.deepEqual(
      { reason: plan.reason, top: plan.topWeightKg, weights: weights(plan) },
      { reason: 'incomplete', top: 100, weights: [80, 90, 100] },
    );
    // Üst 102,5 planlanmıştı (basamaklar yine 80 / 90, h4 C): basamak kaçtıysa korunur; tamamsa da artmaz (eskiden 105).
    const at = (second: number) => [{ ...one(80, 12), topWeightKg: 102.5 }, { ...one(90, second), topWeightKg: 102.5 }];
    const hold = planSession({ spec: barbell, rule, sets: pyramid, history: [at(9)] });
    assert.deepEqual({ reason: hold.reason, top: hold.topWeightKg }, { reason: 'hold', top: 102.5 });
    const done = planSession({ spec: barbell, rule, sets: pyramid, history: [at(10)] });
    assert.deepEqual({ reason: done.reason, top: done.topWeightKg }, { reason: 'incomplete', top: 102.5 });
  });

  test('piramit tepeye varmadan bitti, üst ağırlık yazılmamış: kayıtla birebir tutan en hafif üst ağırlıkta kalır', () => {
    // 80 / 90 hem 100'ün hem 102,5'in %80 / %90'ı: korunan öneride en hafifi, 100 (planlanan 100 ise yukarı kaymaz).
    const hold = planSession({ spec: barbell, rule, sets: pyramid, history: [[one(80, 12), one(90, 9)]] });
    assert.deepEqual(
      { reason: hold.reason, top: hold.topWeightKg, weights: weights(hold) },
      { reason: 'hold', top: 100, weights: [80, 90, 100] },
    );
    const done = planSession({ spec: barbell, rule, sets: pyramid, history: [[one(80, 12), one(90, 10)]] });
    assert.deepEqual({ reason: done.reason, top: done.topWeightKg }, { reason: 'incomplete', top: 100 });
    // Hepsi tıkandı ama tam yük seti yapılmadı: yarıda bırakılan antrenmanda iniş yok, 100'de korunur (97,5 değil).
    const failed = planSession({ spec: barbell, rule, sets: pyramid, history: [[one(80, 8, 'fail'), one(90, 6, 'fail')]] });
    assert.deepEqual({ reason: failed.reason, top: failed.topWeightKg }, { reason: 'hold', top: 100 });
    // Bir basamak plandan hafif yapıldıysa birebir tutan yok: hiçbir basamağı yapılandan ağır planlamayan en ağır üst (77,5 → 97,5).
    assert.equal(planSession({ spec: barbell, rule, sets: pyramid, history: [[one(77.5, 12), one(90, 9)]] }).topWeightKg, 97.5);
  });

  test('belirsiz referans, tamamlanmış antrenman: iniş en hafif tutandan, artış en ağır tutana kadar (bir adım)', () => {
    // Piramidin iki basamağı yapıldı; satır sonradan iki sete indi, ikinci set tam yükte. Kayıtlar kendi yüzdesini taşır.
    const twoSets: SetTarget[] = [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10 }];
    const record = (first: number, second: number, effort: Effort = 'good'): SessionResult => [
      { ...one(80, first, effort), setIndex: 0, target: { min: 12, max: 12, loadPct: 80 } },
      { ...one(90, second, effort), setIndex: 1, target: { min: 10, max: 10, loadPct: 90 } },
    ];
    // İkisi de tepede: 100 ya da 102,5 tutar → 102,5 (en hafiften bir adım), 105 değil.
    const up = planSession({ spec: barbell, rule, sets: twoSets, history: [record(12, 10)] });
    assert.deepEqual({ reason: up.reason, top: up.topWeightKg, weights: weights(up) }, { reason: 'increase', top: 102.5, weights: [80, 102.5] });
    // Hepsi tıkandı: en hafif tutan 100'den ~%5 → 95 (97,5 değil).
    const down = planSession({ spec: barbell, rule, sets: twoSets, history: [record(8, 6, 'fail')] });
    assert.deepEqual({ reason: down.reason, top: down.topWeightKg }, { reason: 'decrease', top: 95 });
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
