import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoHistory } from './demo-history.ts';
import {
  circumferenceByWindow,
  circumferenceChanges,
  defaultStrengthWindow,
  exerciseStrength,
  flatGroups,
  improvedGroups,
  measurementsFor,
  muscleGroups,
  muscleStrength,
  roleOfWeight,
  STRENGTH_WINDOW_KEYS,
  strengthWindowStart,
  type ExerciseStrength,
  type StrengthSource,
  type StrengthStatus,
  type StrengthWindow,
} from './muscle-progress.ts';
import { buildProgressView, digestSession, type ExercisePoint } from './progress.ts';
import type { TrackingType } from './progression.ts';
import type { MeasurementEntry } from './schemas/health.ts';
import type { PlanExercise } from './template-plan.ts';
import { DEMO_DEVICES, DEMO_EXERCISES, DEMO_NOW, DEMO_TODAY, DEMO_TZ, demoClient, demoProgram } from './testing/demo-fixtures.ts';

const TODAY = '2026-09-27';
const DAY_MS = 86_400_000;

const close = (actual: number | null | undefined, expected: number, tolerance = 1e-9) =>
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

/** `start`tan `every` günde bir; değer kayıt türünün güç alanına (tahmini maksimum, en çok tekrar, en uzun set). */
function points(start: string, every: number, values: readonly (number | null)[], tracking: TrackingType = 'weight_reps'): ExercisePoint[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => {
    const date = new Date(base + i * every * DAY_MS).toISOString().slice(0, 10);
    const point: ExercisePoint = { date, volumeKg: 0, totalReps: 0, totalSeconds: 0, sets: 3 };
    if (value === null) return point;
    if (tracking === 'weight_reps') return { ...point, e1rm: value };
    if (tracking === 'bodyweight_reps') return { ...point, bestReps: value };
    return { ...point, bestSeconds: value };
  });
}

function source(key: string, pts: ExercisePoint[], tracking: TrackingType = 'weight_reps', muscles: Record<string, number> = {}): StrengthSource {
  return { key, exerciseId: key, title: key, trackingType: tracking, points: pts, muscles };
}

describe('pencere', () => {
  for (const [window, expected] of [
    ['4h', '2026-08-30'],
    ['8h', '2026-08-02'],
    ['12h', '2026-07-05'],
    ['tumu', undefined],
  ] as const) {
    test(`${window} → ${expected ?? 'başı yok'}`, () => assert.equal(strengthWindowStart(window, TODAY), expected));
  }
});

describe('hareketin güç kararı', () => {
  const cases: {
    name: string;
    tracking?: TrackingType;
    start: string;
    every: number;
    values: (number | null)[];
    window?: StrengthWindow;
    status: StrengthStatus;
    missing?: 'too_few_points' | 'too_short_span';
    pct?: number;
    shown?: number;
  }[] = [
    { name: 'tahmini maksimum düzenli artıyor', start: '2026-08-09', every: 7, values: [100, 102, 104, 106, 108, 110, 112, 114], status: 'improved', pct: 0.14 },
    { name: 'vücut ağırlığında en çok tekrar artıyor', tracking: 'bodyweight_reps', start: '2026-08-30', every: 7, values: [8, 9, 10, 11, 12], status: 'improved', pct: 0.5 },
    { name: 'süre hep aynı: sabit', tracking: 'duration', start: '2026-08-30', every: 7, values: [60, 60, 60, 60, 60], status: 'stable', pct: 0 },
    { name: 'düzenli düşüş: geriledi', start: '2026-09-06', every: 7, values: [100, 98, 96, 94], status: 'declined', pct: -0.06 },
    // Eğim artıda ama aralık sıfırı kapsıyor (Sen 1968): 4 oynak noktada karar "sabit".
    { name: 'oynak dört nokta: sabit', start: '2026-09-06', every: 7, values: [100, 104, 102, 106], status: 'stable' },
    { name: 'üç antrenman günü: veri az', start: '2026-09-13', every: 7, values: [100, 102, 104], status: 'insufficient', missing: 'too_few_points' },
    { name: 'dört gün ama 12 güne sıkışmış: veri az', start: '2026-09-15', every: 4, values: [100, 102, 104, 106], status: 'insufficient', missing: 'too_short_span' },
    // Yüklü seti olmayan gün (ne tahmini maksimum ne en ağır set) değer taşımaz: sayılmaz.
    { name: 'değeri olmayan günler sayılmaz', start: '2026-08-30', every: 7, values: [100, null, 104, null, 108], status: 'insufficient', missing: 'too_few_points', shown: 3 },
    { name: 'eski kayıtlar 4 haftalık pencerede yok', start: '2026-06-07', every: 7, values: [100, 102, 104, 106, 108], window: '4h', status: 'insufficient', missing: 'too_few_points', shown: 0 },
    { name: 'aynı kayıtlar "tümü"nde gelişti', start: '2026-06-07', every: 7, values: [100, 102, 104, 106, 108], window: 'tumu', status: 'improved', pct: 0.08 },
    // Bugünden sonraki gün (saat dilimi, elle düzeltme) karara girmez.
    { name: 'bugünden sonrası sayılmaz', start: '2026-09-06', every: 7, values: [100, 102, 104, 106, 50], status: 'improved', pct: 0.06, shown: 4 },
  ];

  for (const item of cases) {
    test(item.name, () => {
      const tracking = item.tracking ?? 'weight_reps';
      const result = exerciseStrength(source('x', points(item.start, item.every, item.values, tracking), tracking), {
        today: TODAY,
        window: item.window ?? '8h',
      });
      assert.equal(result.status, item.status);
      assert.equal(result.missing, item.missing);
      if (item.pct !== undefined) close(result.fit?.changePct, item.pct);
      if (item.shown !== undefined) assert.equal(result.points.length, item.shown);
      if (item.status === 'insufficient') assert.equal(result.fit, undefined);
    });
  }

  test('çizginin başı, sonu, aralığı ve ölçünün adı', () => {
    const result = exerciseStrength(source('bench', points('2026-08-30', 7, [60, 62, 64, 66, 68])), { today: TODAY, window: '8h' });
    assert.equal(result.metric, 'e1rm');
    assert.deepEqual(
      { from: result.fit?.from, to: result.fit?.to },
      { from: '2026-08-30', to: '2026-09-27' },
    );
    close(result.fit?.start, 60);
    close(result.fit?.end, 68);
    close(result.fit?.change, 8);
    close(result.fit?.low, 8);
    close(result.fit?.high, 8);
  });

  test('high repetition sets do not invent strength estimates',()=>{
    const pts=points('2026-08-23',7,[null,null,null,null,null]).map(p=>({...p,topKg:80,topReps:15}));
    const result=exerciseStrength(source('bench',pts),{today:TODAY,window:'8h'});
    assert.equal(result.status,'insufficient');assert.deepEqual(result.points,[]);
  });

  test('tahmini maksimumu olan gün onunla, olmayan en ağır setle', () => {
    const pts = points('2026-08-30', 7, [100, null, 104, null, 108]).map((point) => (point.e1rm === undefined ? { ...point, topKg: 80, topReps: 15 } : point));
    const result = exerciseStrength(source('bench', pts), { today: TODAY, window: '8h' });
    assert.deepEqual(
      result.points.map((point) => point.value),
      [100, 104, 108],
    );
  });

  test('kas payları ve ad girdiden aynen geçer', () => {
    const result = exerciseStrength({ ...source('row', points('2026-09-06', 7, [50, 52, 54, 56]), 'weight_reps', { lats_mid: 1, biceps: 0.5 }), deviceName: 'Kablo' }, {
      today: TODAY,
      window: '8h',
    });
    assert.deepEqual(result.muscles, { lats_mid: 1, biceps: 0.5 });
    assert.equal(result.deviceName, 'Kablo');
  });
});

/** Kararı hazır hareket (kas hesabı karara, değişime ve dönemde yapılıp yapılmadığına bakar). */
function decided(key: string, status: StrengthStatus, changePct: number | null, muscles: Record<string, number>, days = status === 'insufficient' ? 2 : 4): ExerciseStrength {
  return {
    key,
    exerciseId: key,
    title: key,
    trackingType: 'weight_reps',
    metric: 'e1rm',
    points: Array.from({ length: days }, (_, i) => ({ date: `2026-09-0${i + 1}`, value: 100 })),
    status,
    muscles,
    ...(status === 'insufficient'
      ? { missing: 'too_few_points' as const }
      : { fit: { from: '2026-08-02', to: TODAY, start: 100, end: 100 * (1 + (changePct ?? 0)), change: 0, low: 0, high: 0, changePct } }),
  };
}

describe('kasın kararı', () => {
  const cases: {
    name: string;
    exercises: ExerciseStrength[];
    muscle: string;
    status: StrengthStatus;
    pct: number | null;
    strong?: boolean;
    contributors?: number;
  }[] = [
    { name: 'tek hedef hareket gelişti', exercises: [decided('bench', 'improved', 0.1, { chest_lower: 1 })], muscle: 'chest_lower', status: 'improved', pct: 0.1, strong: true },
    {
      name: 'hedef gelişti, yardımcı geriledi: gelişenin payı yarıdan fazla (1 > 0,75)',
      exercises: [decided('curl', 'improved', 0.08, { biceps: 1 }), decided('row', 'declined', -0.04, { biceps: 0.5 })],
      muscle: 'biceps',
      status: 'improved',
      // Yüzde yalnız karara uyan hareketten: gerileyen yardımcı düşürmez.
      pct: 0.08,
      strong: true,
    },
    {
      name: 'hedef sabit, yardımcı gelişti: sabit',
      exercises: [decided('curl', 'stable', 0.01, { biceps: 1 }), decided('row', 'improved', 0.1, { biceps: 0.5 })],
      muscle: 'biceps',
      status: 'stable',
      pct: (0.01 + 0.05) / 1.5,
    },
    {
      name: 'gerileyenin payı yarıdan fazla: geriledi',
      exercises: [decided('squat', 'declined', -0.05, { quadriceps: 1 }), decided('lunge', 'stable', 0.01, { quadriceps: 0.5 })],
      muscle: 'quadriceps',
      status: 'declined',
      pct: -0.05,
    },
    {
      name: 'yarı yarıya: sabit',
      exercises: [decided('a', 'improved', 0.1, { glutes: 1 }), decided('b', 'declined', -0.1, { glutes: 1 })],
      muscle: 'glutes',
      status: 'stable',
      pct: 0,
    },
    {
      name: 'yalnız dengeleyici olarak çalıştı: karar yok, katkı listede',
      exercises: [decided('squat', 'improved', 0.2, { abs_upper: 0.25 })],
      muscle: 'abs_upper',
      status: 'insufficient',
      pct: null,
      contributors: 1,
    },
    {
      name: 'hedef hareketin verisi az, dengeleyici gelişti: karar yok',
      exercises: [decided('plank', 'insufficient', null, { abs_upper: 1 }), decided('squat', 'improved', 0.2, { abs_upper: 0.25 })],
      muscle: 'abs_upper',
      status: 'insufficient',
      pct: null,
      contributors: 2,
    },
    {
      name: 'kararı olmayan hareket oylamaya girmez ama listelenir',
      exercises: [decided('bench', 'improved', 0.06, { chest_lower: 1 }), decided('push-up', 'insufficient', null, { chest_lower: 1 })],
      muscle: 'chest_lower',
      status: 'improved',
      pct: 0.06,
      strong: true,
      contributors: 2,
    },
    {
      // Hedefte küçük artış, yardımcıda büyük düşüş: "Gelişti · −%15" yazılmaz, yüzde kararla aynı işaretli.
      name: 'hedef gelişti, yardımcı çok geriledi: yüzde yine artı',
      exercises: [decided('bench', 'improved', 0.025, { chest_lower: 1 }), decided('dips', 'declined', -0.5, { chest_lower: 0.5 })],
      muscle: 'chest_lower',
      status: 'improved',
      pct: 0.025,
      strong: false,
    },
    { name: 'belirgin eşiği %5 dahil', exercises: [decided('bench', 'improved', 0.05, { chest_lower: 1 })], muscle: 'chest_lower', status: 'improved', pct: 0.05, strong: true },
    { name: 'eşiğin altı orta ton', exercises: [decided('bench', 'improved', 0.049, { chest_lower: 1 })], muscle: 'chest_lower', status: 'improved', pct: 0.049, strong: false },
  ];

  for (const item of cases) {
    test(item.name, () => {
      const result = muscleStrength(item.exercises).find((entry) => entry.muscle === item.muscle);
      assert.ok(result, item.muscle);
      assert.equal(result.status, item.status);
      if (item.pct === null) assert.equal(result.changePct, null);
      else close(result.changePct, item.pct);
      if (item.strong !== undefined) assert.equal(result.strong, item.strong);
      if (item.contributors !== undefined) assert.equal(result.contributors.length, item.contributors);
    });
  }

  test('tekrar değişimi tahmini maksimum cinsinden: 8 → 13 tekrar %62 değil ≈ %13', () => {
    const pushUp = exerciseStrength(source('push-up', points('2026-08-16', 7, [8, 9, 10, 11, 12, 13], 'bodyweight_reps'), 'bodyweight_reps', { chest_lower: 1 }), {
      today: TODAY,
      window: '8h',
    });
    close(pushUp.fit?.changePct, 5 / 8);
    const chest = muscleStrength([pushUp]).find((entry) => entry.muscle === 'chest_lower')!;
    assert.equal(chest.status, 'improved');
    close(chest.changePct, 43 / 38 - 1);
    close(chest.contributors[0]!.changePct, 43 / 38 - 1);
  });

  test('süre değişimi kas yüzdesine girmez; kararına oy verir', () => {
    const plank = exerciseStrength(source('plank', points('2026-08-16', 7, [30, 40, 50, 60, 70, 80], 'duration'), 'duration', { abs_upper: 1 }), {
      today: TODAY,
      window: '8h',
    });
    const abs = muscleStrength([plank]).find((entry) => entry.muscle === 'abs_upper')!;
    assert.equal(abs.status, 'improved');
    assert.equal(abs.changePct, null);
    assert.equal(abs.strong, false);
  });

  test('dönemde hiç yapılmamış hareket katkı vermez', () => {
    const result = muscleStrength([decided('bench', 'improved', 0.1, { chest_lower: 1 }), decided('fly', 'insufficient', null, { chest_lower: 1, delt_front: 0.5 }, 0)]);
    assert.deepEqual(
      result.map((entry) => [entry.muscle, entry.contributors.map((item) => item.key)]),
      [['chest_lower', ['bench']]],
    );
  });

  test('kardiyo, bilinmeyen kas ve sıfır pay girmez; kaslar katalog sırasıyla', () => {
    const result = muscleStrength([decided('bike', 'improved', 0.1, { cardio: 1, quadriceps: 1, spleen: 1, glutes: 0, chest_upper: 0.5 })]);
    assert.deepEqual(
      result.map((entry) => entry.muscle),
      ['chest_upper', 'quadriceps'],
    );
  });

  test('katkı verenler: pay büyükten küçüğe, rolüyle', () => {
    const result = muscleStrength([
      decided('face-pull', 'stable', 0, { delt_rear: 0.25 }),
      decided('row', 'improved', 0.1, { delt_rear: 0.5 }),
      decided('reverse-fly', 'improved', 0.12, { delt_rear: 1 }),
    ])[0]!;
    assert.deepEqual(
      result.contributors.map((item) => [item.key, item.role]),
      [
        ['reverse-fly', 'primary'],
        ['row', 'secondary'],
        ['face-pull', 'stabilizer'],
      ],
    );
  });
});

describe('rol payından rol', () => {
  for (const [weight, role] of [
    [1, 'primary'],
    [0.5, 'secondary'],
    [0.25, 'stabilizer'],
  ] as const) {
    test(`${weight} → ${role}`, () => assert.equal(roleOfWeight(weight), role));
  }
});

describe('kas grupları ve listeler', () => {
  const muscles = muscleStrength([
    // Üst göğüste yardımcı, alt göğüste hedef; değişim ikisinde de aynı: tek satır.
    decided('bench', 'improved', 0.12, { chest_upper: 0.5, chest_lower: 1, triceps_long: 0.5 }),
    decided('curl', 'improved', 0.2, { biceps: 1 }),
    decided('pushdown', 'declined', -0.08, { triceps_lateral: 1 }),
    decided('squat', 'stable', 0.01, { quadriceps: 1 }),
    decided('lunge', 'stable', -0.02, { glutes: 1 }),
    decided('plank', 'insufficient', null, { abs_upper: 1 }),
  ]);
  const groups = muscleGroups(muscles);

  test('aynı hareketlerle aynı karar ve değişim tek satır; hareketin rolü kas kas', () => {
    const chest = groups.find((group) => group.muscles.includes('chest_upper'))!;
    assert.deepEqual(chest.muscles, ['chest_upper', 'chest_lower', 'triceps_long']);
    assert.equal(chest.contributors.length, 1);
    assert.equal(chest.contributors[0]!.role, 'primary');
    assert.deepEqual(chest.contributors[0]!.roles, [
      { muscle: 'chest_upper', role: 'secondary' },
      { muscle: 'chest_lower', role: 'primary' },
      { muscle: 'triceps_long', role: 'secondary' },
    ]);
  });

  test('"En çok gelişen": değişimi büyükten küçüğe', () => {
    assert.deepEqual(
      improvedGroups(groups).map((group) => group.muscles[0]),
      ['biceps', 'chest_upper'],
    );
  });

  test('"Durağan / geriyen": önce gerileyen, sonra sabitler küçükten büyüğe; veri az dışarıda', () => {
    assert.deepEqual(
      flatGroups(groups).map((group) => [group.muscles[0], group.status]),
      [
        ['triceps_lateral', 'declined'],
        ['glutes', 'stable'],
        ['quadriceps', 'stable'],
      ],
    );
  });
});

describe('açılış penceresi', () => {
  const recent = source('recent', points('2026-08-30', 7, [100, 102, 104, 106, 108]));
  const older = source('older', points('2026-07-05', 7, [100, 102, 104, 106]));
  const tooOld = source('too-old', points('2026-01-04', 7, [100, 102, 104, 106]));
  for (const [name, sources, expected] of [
    ['son 8 haftada karar varsa 8 hafta', [recent, older], '8h'],
    ['8 haftada yok, 12 haftada varsa 12 hafta', [older], '12h'],
    ['yalnız eski kayıtlar: tümü', [tooOld], 'tumu'],
    ['hiç karar yoksa yine 8 hafta', [source('none', points('2026-09-20', 7, [100]))], '8h'],
  ] as const) {
    test(name, () => assert.equal(defaultStrengthWindow(sources, TODAY), expected));
  }
});

describe('çevre ölçümleri', () => {
  test('kasın çevreleri, katalog sırasıyla ve tekrarsız', () => {
    for (const [muscles, expected] of [
      [['biceps', 'triceps_long'], ['arm_flexed_girth', 'arm_relaxed_girth']],
      [['quadriceps', 'hamstrings_medial', 'soleus'], ['mid_thigh_girth', 'calf_girth']],
      [['glutes'], ['hip_girth']],
      [['chest_upper', 'chest_lower'], []],
    ] as const) {
      assert.deepEqual(measurementsFor(muscles), expected, muscles.join(','));
    }
  });

  const entries: MeasurementEntry[] = [
    { date: '2026-07-20', id: 'arm_flexed_girth', side: 'left', value: 34 },
    { date: '2026-08-20', id: 'arm_flexed_girth', side: 'left', value: 34.5 },
    { date: '2026-09-20', id: 'arm_flexed_girth', side: 'left', value: 35.1 },
    { date: '2026-08-20', id: 'arm_flexed_girth', side: 'right', value: 35 },
    { date: '2026-09-20', id: 'arm_flexed_girth', side: 'right', value: 35.4 },
    { date: '2026-08-20', id: 'hip_girth', value: 100 },
    { date: '2026-09-20', id: 'hip_girth', value: 101 },
    { date: '2026-09-20', id: 'calf_girth', side: 'left', value: 38 },
    { date: '2026-08-20', id: 'waist_girth', value: 90 },
    { date: '2026-09-20', id: 'waist_girth', value: 86 },
  ];

  test('pencerenin ilk ve son ölçümü arası; tek ölçüm ve kasa bağlı olmayan çevre yok; kalçada hata payı', () => {
    const changes = circumferenceChanges(entries, { from: '2026-08-02', to: TODAY });
    assert.deepEqual(
      changes.map((change) => [change.id, change.key, change.first.date, change.delta, change.kind]),
      [
        ['hip_girth', 'value', '2026-08-20', 1, 'no_real_change'],
        ['arm_flexed_girth', 'left', '2026-08-20', 0.6, null],
        ['arm_flexed_girth', 'right', '2026-08-20', 0.4, null],
      ],
    );
  });

  test('"tümü" en eski ölçümden; kalçada eşik aşılırsa artış (yönü tanımsız)', () => {
    const all = circumferenceChanges([...entries, { date: '2026-09-26', id: 'hip_girth', value: 103 }], { to: TODAY });
    assert.deepEqual(
      all.map((change) => [change.id, change.key, change.delta, change.kind]),
      [
        ['hip_girth', 'value', 3, 'increased'],
        ['arm_flexed_girth', 'left', 1.1, null],
        ['arm_flexed_girth', 'right', 0.4, null],
      ],
    );
  });

  test('her pencere için ayrı', () => {
    const byWindow = circumferenceByWindow(entries, TODAY);
    assert.deepEqual(Object.keys(byWindow), STRENGTH_WINDOW_KEYS);
    assert.equal(byWindow['4h'].length, 0);
    assert.equal(byWindow.tumu.find((change) => change.key === 'left')?.delta, 1.1);
  });
});

describe('deneme geçmişiyle uçtan uca', () => {
  // 12 hafta, gerçek kütüphane: tıkanan bileşik hareket, boş hafta, hafif gün (demo-history.ts).
  const history = generateDemoHistory({
    program: demoProgram(),
    exercises: DEMO_EXERCISES,
    devices: DEMO_DEVICES,
    client: demoClient(['readiness', 'check_in']),
    now: DEMO_NOW,
    timeZone: DEMO_TZ,
    seed: 1,
  });
  const setWeights = (exercise: PlanExercise) => {
    const weights: Record<string, number> = {};
    for (const muscle of exercise.stabilizerMuscles ?? []) weights[muscle] = 0.25;
    for (const muscle of exercise.secondaryMuscles) weights[muscle] = 0.5;
    for (const muscle of exercise.primaryMuscles) weights[muscle] = 1;
    return weights;
  };
  const view = buildProgressView({
    index: history.index,
    digests: history.sessions.map((doc) => digestSession(doc)),
    now: DEMO_NOW,
    today: DEMO_TODAY,
    exercises: DEMO_EXERCISES,
    deviceNames: new Map(),
    setWeightsOf: setWeights,
  });
  const run = (window: StrengthWindow) => view.exercises.map((exercise) => exerciseStrength(exercise, { today: DEMO_TODAY, window }));

  test('uzun pencerede daha çok karar; tüm kayıtlarda gelişen kas var', () => {
    const decidedIn = (window: StrengthWindow) => run(window).filter((item) => item.status !== 'insufficient').length;
    assert.ok(decidedIn('tumu') > decidedIn('4h'));
    assert.ok(muscleStrength(run('tumu')).some((item) => item.status === 'improved'));
  });

  test('tıkanan hareket son 8 haftada "gelişti" görünmez', () => {
    const stall = history.summary.stall;
    assert.ok(stall);
    const lift = run('8h').find((item) => item.exerciseId === stall.exerciseId);
    assert.ok(lift && lift.status !== 'improved', String(lift?.status));
  });

  test('kararı olan her kasta hedef ya da yardımcı rolünde kararlı bir hareket var', () => {
    for (const window of STRENGTH_WINDOW_KEYS) {
      for (const item of muscleStrength(run(window))) {
        if (item.status === 'insufficient') continue;
        assert.ok(
          item.contributors.some((contributor) => contributor.weight >= 0.5 && contributor.status !== 'insufficient'),
          `${window} ${item.muscle}`,
        );
      }
    }
  });
});
