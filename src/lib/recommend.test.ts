import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exposure, Stage } from './exposure.ts';
import {
  planSession,
  type Effort,
  type LoadSpec,
  type ProgressionRule,
  type SessionResult,
  type SetTarget,
} from './progression.ts';
import {
  deloadHintDue,
  increasePct,
  increaseTo,
  muscleSetsSince,
  RECOMMEND_TUNING,
  recommend,
  setIncreaseCandidates,
  stallCounts,
  type RecommendExercise,
  type SetIncreaseRow,
} from './recommend.ts';
import type { SessionIndex, SessionIndexExercise, SessionIndexRow } from './schemas/session.ts';

const barbell: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 2.5, minLoadKg: 20 };
/** Ağırlık bloklu makine: 30–60, 5 kg adım (30 kg'da tek adım %17). */
const machine: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 0, minLoadKg: 30, loadsKg: [30, 35, 40, 45, 50, 55, 60] };
const dumbbells: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 0, minLoadKg: 10, loadsKg: [10, 12.5, 15, 17.5, 20, 22.5, 25] };
const bodyweight: LoadSpec = { trackingType: 'bodyweight_reps', loadStepKg: 0, minLoadKg: 0 };

const SQUAT: RecommendExercise = { category: 'compound', pattern: 'squat' };
const BENCH: RecommendExercise = { category: 'compound', pattern: 'horizontal_push' };
const CURL: RecommendExercise = { category: 'isolation', pattern: 'elbow_flexion' };

const double: Pick<ProgressionRule, 'scheme' | 'targetRir'> = { scheme: 'double', targetRir: 2 };
const linear: Pick<ProgressionRule, 'scheme' | 'targetRir'> = { scheme: 'linear', targetRir: 2 };
const S3: SetTarget[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }];
const FIVES: SetTarget[] = [{ min: 5, max: 5 }, { min: 5, max: 5 }, { min: 5, max: 5 }];

/** `sets(60, [12, 12, 12])` → 60 kg ile üç set; `flags` her sete (hafif, Tanışma, planın üst ağırlığı). */
function sets(weightKg: number, values: number[], effort: Effort = 'good', flags: Partial<SessionResult[number]> = {}): SessionResult {
  return values.map((value, setIndex) => ({ weightKg, value, effort, setIndex, ...flags }));
}

function exposure(stage: Stage, extra: Partial<Exposure> = {}): Exposure {
  return {
    exerciseId: 'x',
    sessions: stage === 'intro' ? 1 : 10,
    firstAt: '2026-08-01T10:00:00.000Z',
    lastAt: '2026-09-23T10:00:00.000Z',
    weeks: stage === 'intro' ? 1 : 8,
    gapDays: 3,
    deloads: 0,
    lastDeloadAt: null,
    base: stage,
    stage,
    calibrate: false,
    returning: false,
    introLength: 4,
    ...extra,
  };
}

type Case = {
  name: string;
  stage: Stage | Exposure;
  history: SessionResult[];
  spec?: LoadSpec;
  exercise?: RecommendExercise;
  rule?: Pick<ProgressionRule, 'scheme' | 'targetRir'>;
  sets?: SetTarget[];
  reason: string;
  top: number;
  targets?: number[];
};

function run(item: Omit<Case, 'name' | 'reason' | 'top' | 'targets'>) {
  return recommend({
    spec: item.spec ?? barbell,
    rule: item.rule ?? double,
    sets: item.sets ?? S3,
    history: item.history,
    exercise: item.exercise ?? SQUAT,
    exposure: typeof item.stage === 'string' ? exposure(item.stage) : item.stage,
  });
}

function table(cases: Case[]) {
  for (const item of cases) {
    test(item.name, () => {
      const { plan } = run(item);
      assert.equal(plan.reason, item.reason);
      assert.equal(plan.topWeightKg, item.top);
      if (item.targets) assert.deepEqual(plan.sets.map((set) => set.target), item.targets);
    });
  }
}

describe('artış miktarı inc(W) (§5.4: mutlak yük, ızgara, %10 sınırı)', () => {
  test('yüzde: alt vücut bileşiği %5, diğerleri %2,5', () => {
    assert.equal(increasePct(SQUAT), 0.05);
    for (const pattern of ['hinge', 'lunge', 'hip_extension']) assert.equal(increasePct({ category: 'compound', pattern }), 0.05);
    assert.equal(increasePct({ category: 'isolation', pattern: 'squat' }), 0.025);
    assert.equal(increasePct(BENCH), 0.025);
    assert.equal(increasePct({ category: 'compound' }), 0.025);
    assert.equal(increasePct(CURL), 0.025);
  });

  const cases: { name: string; weight: number; spec: LoadSpec; pct: number; factor?: 1 | 2; expected: ReturnType<typeof increaseTo> }[] = [
    { name: 'squat 100: %5 → 105 (lo 102,5, hi 110)', weight: 100, spec: barbell, pct: 0.05, expected: { kind: 'step', weightKg: 105 } },
    { name: 'bench 60: %2,5 = 61,5 → ızgarada 60, en az bir adım → 62,5', weight: 60, spec: barbell, pct: 0.025, expected: { kind: 'step', weightKg: 62.5 } },
    { name: 'bench 140: %2,5 = 143,5 → 142,5', weight: 140, spec: barbell, pct: 0.025, expected: { kind: 'step', weightKg: 142.5 } },
    { name: 'iki kat, squat 100: 110 (%10 sınırında)', weight: 100, spec: barbell, pct: 0.05, factor: 2, expected: { kind: 'step', weightKg: 110 } },
    { name: 'iki kat, bench 60: en az iki adım → 65', weight: 60, spec: barbell, pct: 0.025, factor: 2, expected: { kind: 'step', weightKg: 65 } },
    { name: 'iki kat, bench 40: %10 sınırı bir adımda keser → 42,5', weight: 40, spec: barbell, pct: 0.025, factor: 2, expected: { kind: 'step', weightKg: 42.5 } },
    { name: 'makine 50: tek adım tam %10 → 55', weight: 50, spec: machine, pct: 0.025, expected: { kind: 'step', weightKg: 55 } },
    { name: 'makine 30: tek adım %17 > %10 → önce tekrar (sonra 35)', weight: 30, spec: machine, pct: 0.025, expected: { kind: 'reps_first', nextKg: 35 } },
    { name: 'dambıl 20: sonraki 22,5 (%12,5) → önce tekrar', weight: 20, spec: dumbbells, pct: 0.025, expected: { kind: 'reps_first', nextKg: 22.5 } },
    { name: 'cihazın en ağır ayarı (60) → device_max', weight: 60, spec: machine, pct: 0.025, expected: { kind: 'device_max' } },
    { name: 'ağırlıksız → yok', weight: 0, spec: bodyweight, pct: 0.025, expected: null },
  ];
  for (const item of cases) {
    test(item.name, () => {
      assert.deepEqual(increaseTo(item.weight, item.spec, item.pct, item.factor ? { factor: item.factor } : {}), item.expected);
    });
  }

  test('sonuç her zaman cihazda kurulabilen ağırlık', () => {
    const loads = new Set(machine.loadsKg);
    for (const weight of [35, 40, 45, 50, 55]) {
      const result = increaseTo(weight, machine, 0.05, { factor: 2 });
      if (result?.kind === 'step') assert.ok(loads.has(result.weightKg), `${weight} → ${result.weightKg}`);
    }
  });
});

describe('Tanışma (§5.3)', () => {
  test('motorun "Kolay → iki adım"ı Tanışma\'da bir adım (motor tek başına 65 der)', () => {
    assert.equal(planSession({ spec: barbell, rule: double, sets: S3, history: [sets(60, [12, 12, 12], 'easy')] }).topWeightKg, 65);
  });

  table([
    { name: 'ilk kez: motorun başlangıcı (boş bar)', stage: 'intro', history: [], reason: 'first_time', top: 20, targets: [8, 8, 8] },
    { name: 'tepede ve İyi → bir ızgara adımı', stage: 'intro', history: [sets(60, [12, 12, 12])], reason: 'increase', top: 62.5, targets: [8, 8, 8] },
    { name: 'tepede ve Kolay → yine bir adım', stage: 'intro', history: [sets(60, [12, 12, 12], 'easy')], reason: 'increase', top: 62.5 },
    {
      name: 'tepede ama Zor → artış yok, aynı ağırlıkla tepe bir kez daha',
      stage: 'intro',
      history: [[...sets(60, [12, 12], 'good'), { weightKg: 60, value: 12, effort: 'hard', setIndex: 2 }]],
      reason: 'confirm_increase',
      top: 60,
      targets: [12, 12, 12],
    },
    { name: 'bir set alt sınırın altında → hemen ~%5 aşağı (motor tek başına korurdu)', stage: 'intro', history: [sets(60, [12, 12, 7])], reason: 'decrease', top: 57.5 },
    {
      name: 'üç kaçırma (eski kayıt, işaretsiz) → hafifletme yok, ~%5 iniş; setler tam',
      stage: 'intro',
      history: [sets(60, [6, 6, 6]), sets(60, [6, 6, 6]), sets(60, [6, 6, 6])],
      reason: 'decrease',
      top: 57.5,
      targets: [8, 8, 8],
    },
    { name: 'aralıkta → motor (+1 tekrar)', stage: 'intro', history: [sets(60, [10, 9, 9])], reason: 'add_rep', top: 60, targets: [10, 10, 10] },
  ]);
});

describe('Başlangıç (§5.3: tek seans yeter, inc(W), hepsi Kolay → 2 × inc)', () => {
  table([
    { name: 'squat 100 tepede → 105', stage: 'novice', history: [sets(100, [12, 12, 12])], reason: 'increase', top: 105 },
    { name: 'bench 60 tepede → 62,5', stage: 'novice', exercise: BENCH, history: [sets(60, [12, 12, 12])], reason: 'increase', top: 62.5 },
    { name: 'squat 100 hepsi Kolay → 110 (%10 sınırı)', stage: 'novice', history: [sets(100, [12, 12, 12], 'easy')], reason: 'increase', top: 110 },
    { name: 'bench 60 hepsi Kolay → 65', stage: 'novice', exercise: BENCH, history: [sets(60, [12, 12, 12], 'easy')], reason: 'increase', top: 65 },
    {
      name: 'biri İyi → iki kat yok (motorun ortalama RIR kuralı yerine aşama kuralı)',
      stage: 'novice',
      exercise: BENCH,
      history: [[...sets(60, [12, 12], 'easy'), { weightKg: 60, value: 12, effort: 'good', setIndex: 2 }]],
      reason: 'increase',
      top: 62.5,
    },
    {
      name: 'AMRAP tepe + 3 → iki kat',
      stage: 'novice',
      exercise: BENCH,
      sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12, amrap: true }],
      history: [sets(60, [12, 12, 15])],
      reason: 'increase',
      top: 65,
    },
    { name: 'bir set altta → motor: aynı ağırlık', stage: 'novice', history: [sets(100, [12, 12, 7])], reason: 'hold', top: 100 },
    { name: 'hiçbiri ulaşmadı → motor: ~%5 iniş', stage: 'novice', history: [sets(100, [6, 6, 6], 'hard')], reason: 'decrease', top: 95 },
    { name: 'doğrusal 5×5, squat 100 başarılı → inc(W) 105', stage: 'novice', rule: linear, sets: FIVES, history: [sets(100, [5, 5, 5])], reason: 'increase', top: 105 },
    { name: 'cihazın en ağır ayarı → motor (device_max)', stage: 'novice', spec: machine, history: [sets(60, [12, 12, 12])], reason: 'device_max', top: 60 },
  ]);
});

describe('Orta ve İleri (§5.3: 2-for-2)', () => {
  table([
    {
      name: 'Orta: tepede ama önceki seans başka ağırlıkta → bir kez daha',
      stage: 'intermediate',
      history: [sets(97.5, [12, 12, 12]), sets(100, [12, 12, 12])],
      reason: 'confirm_increase',
      top: 100,
      targets: [12, 12, 12],
    },
    { name: 'Orta: tek seans → bir kez daha', stage: 'intermediate', history: [sets(100, [12, 12, 12])], reason: 'confirm_increase', top: 100 },
    { name: 'Orta: aynı ağırlıkta iki seans tepede → inc(W) 105', stage: 'intermediate', history: [sets(100, [12, 12, 12]), sets(100, [12, 12, 12])], reason: 'increase', top: 105 },
    {
      name: 'Orta: önceki aynı ağırlıkta ama bir set altta → bir kez daha',
      stage: 'intermediate',
      history: [sets(100, [12, 12, 7]), sets(100, [12, 12, 12])],
      reason: 'confirm_increase',
      top: 100,
    },
    {
      name: 'Orta: önceki aynı ağırlıkta yarım (eksik) → bir kez daha',
      stage: 'intermediate',
      history: [sets(100, [12, 12]), sets(100, [12, 12, 12])],
      reason: 'confirm_increase',
      top: 100,
    },
    { name: 'Orta: hepsi Kolay → iki kat yok (105)', stage: 'intermediate', history: [sets(100, [12, 12, 12], 'easy'), sets(100, [12, 12, 12], 'easy')], reason: 'increase', top: 105 },
    { name: 'Orta doğrusal: iki başarılı seans aynı ağırlıkta → 105', stage: 'intermediate', rule: linear, sets: FIVES, history: [sets(100, [5, 5, 5]), sets(100, [5, 5, 5])], reason: 'increase', top: 105 },
    { name: 'Orta doğrusal: tek başarılı seans → bir kez daha', stage: 'intermediate', rule: linear, sets: FIVES, history: [sets(97.5, [5, 5, 5]), sets(100, [5, 5, 5])], reason: 'confirm_increase', top: 100, targets: [5, 5, 5] },
    { name: 'İleri: 2-for-2 → bir ızgara adımı (102,5, %5 değil)', stage: 'advanced', history: [sets(100, [12, 12, 12]), sets(100, [12, 12, 12])], reason: 'increase', top: 102.5 },
    { name: 'İleri: tek seans → bir kez daha', stage: 'advanced', history: [sets(100, [12, 12, 12])], reason: 'confirm_increase', top: 100 },
    { name: 'Orta: kaçırma → motor', stage: 'intermediate', history: [sets(100, [12, 12, 12]), sets(100, [12, 12, 7])], reason: 'hold', top: 100 },
  ]);
});

describe('önce tekrar (§5.4: tek adım %10\'dan büyükse, tepe + 2 tekrarda adım)', () => {
  table([
    { name: 'makine 30, hepsi 12 → aynı ağırlık, hedef 13', stage: 'novice', spec: machine, exercise: CURL, history: [sets(30, [12, 12, 12])], reason: 'reps_first', top: 30, targets: [13, 13, 13] },
    { name: 'hepsi 13 → hedef 14 (tepe + 2 ile sınırlı)', stage: 'novice', spec: machine, exercise: CURL, history: [sets(30, [13, 13, 13])], reason: 'reps_first', top: 30, targets: [14, 14, 14] },
    { name: '14 · 14 · 13 → hâlâ tekrar, hedef 14', stage: 'novice', spec: machine, exercise: CURL, history: [sets(30, [14, 14, 13])], reason: 'reps_first', top: 30, targets: [14, 14, 14] },
    { name: 'hepsi 14 (tepe + 2) → adım: 35', stage: 'novice', spec: machine, exercise: CURL, history: [sets(30, [14, 14, 14])], reason: 'increase', top: 35, targets: [8, 8, 8] },
    { name: 'Orta\'da önce 2-for-2, sonra tekrar kuralı', stage: 'intermediate', spec: machine, exercise: CURL, history: [sets(30, [12, 12, 12]), sets(30, [12, 12, 12])], reason: 'reps_first', top: 30, targets: [13, 13, 13] },
  ]);
});

describe('ara sonrası ayar seansı (§5.2, açık soru 3: ~%90)', () => {
  const back = exposure('novice', { base: 'intermediate', calibrate: true, gapDays: 35 });

  table([
    { name: 'son üst ağırlığın %90\'ı, ızgaraya aşağı; hedef aralığın altı', stage: back, history: [sets(100, [12, 11, 10])], reason: 'calibrate', top: 90, targets: [8, 8, 8] },
    { name: 'makine 55 → 49,5 → 45', stage: back, spec: machine, exercise: CURL, history: [sets(55, [10, 10, 10])], reason: 'calibrate', top: 45 },
    { name: 'ağırlıksız: hedef aralığın altı', stage: back, spec: bodyweight, history: [sets(0, [11, 11, 11])], reason: 'calibrate', top: 0, targets: [8, 8, 8] },
    { name: 'PT\'nin kuralı ilerlemesizse dokunulmaz', stage: back, rule: { scheme: 'none', targetRir: 2 }, history: [sets(100, [10, 10, 10])], reason: 'no_progression', top: 100 },
  ]);

  test('ayarlanabilir çarpan', () => {
    const plan = recommend({ spec: barbell, rule: double, sets: S3, history: [sets(100, [12, 12, 12])], exercise: SQUAT, exposure: back, tuning: { calibrateFactor: 0.8 } }).plan;
    assert.equal(plan.topWeightKg, 80);
  });

  test('ayar ve Tanışma seansı tıkanma saymaz (`stallCounts`)', () => {
    assert.equal(stallCounts({ reason: 'calibrate', stage: 'novice' }), false);
    assert.equal(stallCounts({ reason: 'hold', stage: 'intro' }), false);
    assert.equal(stallCounts({ reason: 'hold', stage: 'novice' }), true);
    assert.equal(stallCounts(undefined), true);
  });
});

describe('tıkanma, hafifletme ve hafif seans (§5.5; açık soru 2)', () => {
  table([
    {
      name: '3 tıkanma → −%10, setler ⅔ (100 → 90, 2 set)',
      stage: 'novice',
      history: [sets(100, [7, 7, 7]), sets(100, [7, 7, 7]), sets(100, [7, 7, 7])],
      reason: 'deload',
      top: 90,
      targets: [8, 8],
    },
    {
      name: 'Tanışma\'da planlanan kaçırmalar tıkanma serisine girmez',
      stage: 'novice',
      history: [sets(100, [12, 12, 7], 'good', { noStall: true }), sets(100, [12, 12, 7], 'good', { noStall: true }), sets(100, [12, 12, 7], 'good', { noStall: true })],
      reason: 'hold',
      top: 100,
    },
    {
      name: 'ayar seansının kaçırması da girmez: 2 tıkanma + ayar + 1 tıkanma → hafifletme yok',
      stage: 'novice',
      history: [sets(100, [12, 12, 7]), sets(100, [12, 12, 7]), sets(90, [12, 12, 7], 'good', { noStall: true }), sets(90, [12, 12, 7])],
      reason: 'hold',
      top: 90,
    },
    {
      name: 'hafif seans ilk kez nötr: planın üst ağırlığıyla bir kez daha',
      stage: 'novice',
      history: [sets(100, [12, 12, 12]), sets(95, [10, 10, 10], 'good', { lighter: true, topWeightKg: 105 })],
      reason: 'lighter_retry',
      top: 105,
      targets: [8, 8, 8],
    },
    {
      name: 'üst üste ikinci hafif seans kaçırma: planın ağırlığından ~%5 iniş',
      stage: 'novice',
      history: [
        sets(100, [12, 12, 12]),
        sets(95, [10, 10, 10], 'good', { lighter: true, topWeightKg: 105 }),
        sets(95, [10, 10, 10], 'good', { lighter: true, topWeightKg: 105 }),
      ],
      reason: 'decrease',
      top: 100,
    },
    {
      name: 'araya normal seans girince yeniden nötr',
      stage: 'novice',
      history: [sets(95, [10, 10, 10], 'good', { lighter: true, topWeightKg: 105 }), sets(105, [10, 10, 9]), sets(95, [10, 10, 10], 'good', { lighter: true, topWeightKg: 105 })],
      reason: 'lighter_retry',
      top: 105,
    },
    {
      name: 'hafif seanslar üst üste 3 kaçırma sayılınca hafifletme (planın ağırlığından)',
      stage: 'novice',
      history: [1, 2, 3, 4].map(() => sets(90, [10, 10, 10], 'good', { lighter: true, topWeightKg: 100 })),
      reason: 'deload',
      top: 90,
    },
  ]);
});

describe('PT\'nin kuralı ve set düzeni hep kazanır', () => {
  test('ilerlemesiz satır: aşama ne olursa olsun aynı', () => {
    const { plan } = run({ stage: 'novice', rule: { scheme: 'none', targetRir: 2 }, history: [sets(100, [12, 12, 12], 'easy')] });
    assert.equal(plan.reason, 'no_progression');
    assert.equal(plan.topWeightKg, 100);
  });

  test('yüzdeli back-off set üst ağırlığı izler (squat 100 → 105, %80 → 82,5)', () => {
    const backoff: SetTarget[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 80 }];
    const { plan } = run({ stage: 'novice', sets: backoff, rule: linear, history: [[{ weightKg: 100, value: 5, effort: 'good', setIndex: 0 }, { weightKg: 80, value: 8, effort: 'good', setIndex: 1 }]] });
    assert.equal(plan.reason, 'increase');
    assert.deepEqual(plan.sets.map((set) => set.weightKg), [105, 82.5]);
    assert.deepEqual(plan.sets.map((set) => set.loadPct), [undefined, 80]);
  });
});

describe('ağırlıksız: motor aynı, aşama yalnız 2-for-2 onayını ekler', () => {
  table([
    { name: 'Başlangıç: tepede → zor varyasyon', stage: 'novice', spec: bodyweight, history: [sets(0, [12, 12, 12])], reason: 'harder_variant', top: 0 },
    { name: 'Orta: tek seans tepede → bir kez daha', stage: 'intermediate', spec: bodyweight, history: [sets(0, [12, 12, 12])], reason: 'confirm_increase', top: 0, targets: [12, 12, 12] },
    { name: 'Orta: iki seans tepede → zor varyasyon', stage: 'intermediate', spec: bodyweight, history: [sets(0, [12, 12, 12]), sets(0, [12, 12, 12])], reason: 'harder_variant', top: 0 },
    { name: 'Orta: +1 tekrar motorun', stage: 'intermediate', spec: bodyweight, history: [sets(0, [10, 10, 9])], reason: 'add_rep', top: 0, targets: [10, 10, 10] },
    { name: 'Tanışma: tepede ama Zor → bir kez daha', stage: 'intro', spec: bodyweight, history: [sets(0, [12, 12, 12], 'hard')], reason: 'confirm_increase', top: 0 },
  ]);
});

describe('gerekçe: danışan dilinde çip ve metin (§5.7)', () => {
  const why = (item: Omit<Case, 'name' | 'reason' | 'top' | 'targets'>) => run(item).why;

  test('Tanışma: "Tanışma n/4 · …"', () => {
    assert.deepEqual(why({ stage: exposure('intro', { sessions: 0 }), history: [] }), {
      tone: 'new',
      chip: 'Tanışma 1/4 · rahat bir ağırlık bul',
      detail:
        'Bu hareketle tanışıyorsun: doğru ağırlık küçük adımlarla bulunur. Bu harekette geçmişin yok. Rahat bir ağırlıkla başla; setler iyi geçerse sonraki sefer artar.',
    });
    assert.equal(why({ stage: exposure('intro', { sessions: 1 }), history: [sets(60, [12, 12, 12])] }).chip, 'Tanışma 2/4 · +2,5 kg');
    assert.equal(why({ stage: exposure('intro', { sessions: 2 }), history: [sets(60, [12, 12, 7])] }).chip, 'Tanışma 3/4 · −2,5 kg');
    assert.equal(why({ stage: exposure('intro', { sessions: 0, introLength: 1 }), history: [] }).chip, 'Tanışma · rahat bir ağırlık bul');
  });

  test('aradan dönüşte inen Tanışma "Aradan dönüş" der (sayaç yok)', () => {
    const back = exposure('intro', { base: 'novice', sessions: 9, returning: true });
    const result = why({ stage: back, history: [sets(90, [12, 12, 12])] });
    assert.equal(result.chip, 'Aradan dönüş · +2,5 kg');
    assert.match(result.detail, /^Aradan döndün: ilk antrenmanlarda küçük adımlarla ilerlenir\. /);
  });

  test('artış: "+5 kg · hedefe ulaştın"; 2-for-2 ve iki kat ayrı söylenir', () => {
    const one = why({ stage: 'novice', history: [sets(100, [12, 12, 12])] });
    assert.equal(one.tone, 'up');
    assert.equal(one.chip, '+5 kg · hedefe ulaştın');
    assert.equal(one.detail, 'Geçen sefer 100 kg ile bütün setlerde hedefin tepesine ulaştın (12 · 12 · 12). Ağırlık +5 kg; tekrar aralığın altından başlar.');
    assert.equal(why({ stage: 'intermediate', history: [sets(100, [12, 12, 12]), sets(100, [12, 12, 12])] }).chip, '+5 kg · 2 antrenmandır tepede');
    assert.equal(why({ stage: 'novice', history: [sets(100, [12, 12, 12], 'easy')] }).chip, '+10 kg · kolay geçti');
  });

  test('bir kez daha, önce tekrar, ayar, hafif gün', () => {
    assert.equal(why({ stage: 'intermediate', history: [sets(100, [12, 12, 12])] }).chip, 'Bir kez daha, sonra artır');
    const reps = why({ stage: 'novice', spec: machine, exercise: CURL, history: [sets(30, [12, 12, 12])] });
    assert.equal(reps.chip, 'Önce tekrar · 14 olunca +5 kg');
    assert.match(reps.detail, /%10 sınırını aşan/);
    const calibrate = why({ stage: exposure('novice', { calibrate: true, gapDays: 35.4 }), history: [sets(100, [12, 12, 12])] });
    assert.equal(calibrate.tone, 'down');
    assert.equal(calibrate.chip, 'Aradan dönüş · hafif ayar');
    assert.equal(calibrate.detail, '35 gündür bu hareketi yapmadın. Bugün son ağırlığının yaklaşık %90 kadarıyla ayar antrenmanı; zorlanırsan tıkanma sayılmaz.');
    const deload = why({ stage: 'novice', history: [sets(100, [7, 7, 7]), sets(100, [7, 7, 7]), sets(100, [7, 7, 7])] });
    assert.equal(deload.chip, 'Hafif antrenman · −10 kg');
    assert.match(deload.detail, /yaklaşık %10 az/);
  });

  test('+1 tekrar ve süre', () => {
    const rep = why({ stage: 'novice', history: [sets(100, [10, 9, 9])] });
    assert.equal(rep.chip, '+1 tekrar hedefle');
    assert.equal(rep.detail, 'Geçen sefer 10 · 9 · 9. Aynı ağırlıkta en düşük seti bir tekrar artır; bütün setlerde 12 tekrar olunca ağırlık artar.');
    const timed: LoadSpec = { trackingType: 'duration', loadStepKg: 0, minLoadKg: 0 };
    const hold = why({ stage: 'novice', spec: timed, sets: [{ min: 30, max: 60 }], history: [sets(0, [40])] });
    assert.equal(hold.chip, '+5 sn hedefle');
    assert.equal(hold.detail, 'Geçen sefer 40 sn. Her sette +5 sn; bütün setlerde 60 sn olunca zor bir varyasyon önerilir.');
  });

  test('ayarlar tek yerde', () => {
    assert.deepEqual(RECOMMEND_TUNING, { lowerBodyPct: 0.05, otherPct: 0.025, maxPct: 0.1, repsFirstExtra: 2, calibrateFactor: 0.9 });
  });
});

describe('İleri: PT\'ye hafifletme ipucu (Bell 2024)', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');
  test('son hafifletmeden (yoksa ilk seanstan) 4 hafta sonra', () => {
    assert.equal(deloadHintDue(exposure('advanced', { lastDeloadAt: '2026-08-28T12:00:00.000Z' }), now), true);
    assert.equal(deloadHintDue(exposure('advanced', { lastDeloadAt: '2026-09-06T12:00:00.000Z' }), now), false);
    assert.equal(deloadHintDue(exposure('advanced', { firstAt: '2026-06-01T12:00:00.000Z' }), now), true);
    assert.equal(deloadHintDue(exposure('intermediate', { lastDeloadAt: '2026-06-01T12:00:00.000Z' }), now), false);
  });
});

describe('set artışı adayları (§5.6: yalnız PT\'ye öneri)', () => {
  const NOW = new Date('2026-09-26T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;
  let counter = 0;
  function row(daysAgo: number, exercises: Partial<SessionIndexExercise>[], extra: Partial<SessionIndexRow> = {}): SessionIndexRow {
    counter += 1;
    const startedAt = new Date(NOW.getTime() - daysAgo * DAY).toISOString();
    const id = `s_${counter.toString(36).padStart(8, '0')}`;
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
      ...extra,
    };
  }
  const index = (...items: SessionIndexRow[]): SessionIndex => ({ version: 1, items, deleted: [] });
  const progressing = index(row(10, [{ reason: 'increase' }]), row(3, [{ reason: 'add_rep' }]));
  const bench: SetIncreaseRow = {
    rowId: 'r_aaaaaa',
    exerciseId: 'bench-press',
    title: 'Bench Press',
    setCount: 3,
    primaryMuscles: ['chest_lower'],
    exposure: exposure('intermediate', { weeks: 6 }),
  };
  const candidates = (input: Partial<Parameters<typeof setIncreaseCandidates>[0]> = {}) =>
    setIncreaseCandidates({ rows: [bench], index: progressing, now: NOW, muscleSets: { chest_lower: 6 }, ...input });

  test('hepsi doğru → "Bench Press 3 → 4 set"', () => {
    assert.deepEqual(candidates(), [
      {
        kind: 'algo_sets',
        rowId: 'r_aaaaaa',
        exerciseId: 'bench-press',
        from: 3,
        to: 4,
        text: 'Bench Press 3 → 4 set',
        why: '6 haftadır bu harekette; son 2 haftada ilerliyor. Hedef kasın son 7 günde 6 seti var (önerilen ~10).',
        muscles: ['chest_lower'],
      },
    ]);
  });

  const none: { name: string; input: Partial<Parameters<typeof setIncreaseCandidates>[0]> }[] = [
    { name: '1. aşama Başlangıç', input: { rows: [{ ...bench, exposure: exposure('novice', { weeks: 6 }) }] } },
    { name: '1. deneyim 3,9 hafta', input: { rows: [{ ...bench, exposure: exposure('intermediate', { weeks: 3.9 }) }] } },
    { name: '2. son 2 haftada hold var', input: { index: index(row(10, [{ reason: 'increase' }]), row(3, [{ reason: 'hold' }])) } },
    { name: '2. son 2 haftada hafifletme var', input: { index: index(row(10, [{ reason: 'increase' }]), row(3, [{ reason: 'deload' }])) } },
    { name: '2. hafif seans var', input: { index: index(row(10, [{ reason: 'increase' }]), row(3, [{ reason: 'add_rep', lighter: true }])) } },
    { name: '2. artış 2 haftadan eski', input: { index: index(row(15, [{ reason: 'increase' }]), row(3, [{ reason: 'confirm_increase' }])) } },
    { name: '2. artış başka satırda', input: { index: index(row(3, [{ reason: 'increase', rowId: 'r_bbbbbb' }])) } },
    { name: '3. hazır oluşluk 59', input: { readinessScore: 59 } },
    { name: '4. hedef kas 7 günde 10 set', input: { muscleSets: { chest_lower: 10 } } },
    { name: '6. satır 10 sette', input: { rows: [{ ...bench, setCount: 10 }] } },
    { name: '5. kasa bu hafta 2 öneri verildi', input: { proposedThisWeek: { chest_lower: 2 } } },
  ];
  for (const item of none) {
    test(`aday yok: ${item.name}`, () => {
      assert.deepEqual(candidates(item.input), []);
    });
  }

  test('sınırlar: hazır oluşluk 60 ve onaysız (yok) geçer; 9 sette 10\'a çıkabilir; 9,5 kesirli set geçer', () => {
    assert.equal(candidates({ readinessScore: 60 }).length, 1);
    assert.equal(candidates({ readinessScore: undefined }).length, 1);
    assert.equal(candidates({ rows: [{ ...bench, setCount: 9 }] })[0]?.to, 10);
    assert.equal(candidates({ muscleSets: { chest_lower: 9.5 } }).length, 1);
  });

  test('kas başına haftada en çok 2 öneri; satıra en çok +1', () => {
    const rows = [bench, { ...bench, rowId: 'r_bbbbbb', title: 'Incline Press' }, { ...bench, rowId: 'r_cccccc', title: 'Fly' }];
    const index3 = index(row(3, [{ reason: 'increase' }, { reason: 'increase', rowId: 'r_bbbbbb' }, { reason: 'increase', rowId: 'r_cccccc' }]));
    const result = candidates({ rows, index: index3 });
    assert.deepEqual(result.map((item) => [item.rowId, item.from, item.to]), [['r_aaaaaa', 3, 4], ['r_bbbbbb', 3, 4]]);
    assert.equal(candidates({ rows, index: index3, proposedThisWeek: { chest_lower: 1 } }).length, 1);
  });

  test('kesirli set: son 7 gün, bitmiş antrenmanlar, set × kas payı', () => {
    const weights: Record<string, Record<string, number>> = {
      'bench-press': { chest_lower: 1, triceps_long: 0.5, front_delts: 0.25 },
      'push-up': { chest_lower: 1 },
    };
    const items = index(
      row(2, [{ sets: 3 }, { exerciseId: 'push-up', sets: 2 }]),
      row(6, [{ sets: 4 }]),
      row(8, [{ sets: 5 }]), // 7 günden eski
      row(1, [{ sets: 3 }], { finishedAt: undefined }), // etkin
      row(1, [{ exerciseId: 'yok-boyle', sets: 3 }]),
    );
    assert.deepEqual(muscleSetsSince(items, NOW, (id) => weights[id]), { chest_lower: 9, triceps_long: 3.5, front_delts: 1.75 });
  });
});
