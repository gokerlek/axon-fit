import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_ID_PATTERN,
  BLOCK_KINDS,
  ROW_ID_PATTERN,
  TEMPLATE_ID_PATTERN,
  blockShapeProblem,
  countRows,
  defaultTarget,
  describeBlock,
  duplicateIds,
  effectiveDeviceId,
  estimateMinutes,
  firstForMuscleRowIds,
  formatRest,
  formatTarget,
  groupSkipNote,
  kindOptions,
  loadIntensity,
  muscleLoadOf,
  normalizeTemplate,
  randomId,
  roundsOf,
  rowLabels,
  rowRule,
  ruleFor,
  scaleLoad,
  setSeconds,
  setSlots,
  settleKind,
  templateMuscleLoad,
  templateSummary,
  WEEKLY_SET_BANDS,
  weeklySetBand,
  type BlockKind,
  type PlanExercise,
  type TemplateBlock,
  type TemplateRow,
  type TemplateTarget,
} from './template-plan.ts';
import { resizeSets, uniformSets } from './set-plan.ts';

/**
 * `muscles.ts` `@/` takma adıyla içe aktarma yaptığı için `node --test` altında
 * çalışmaz; kesirli set payları (`ROLE_SET_WEIGHT`) burada aynısıyla kurulur.
 */
const ROLE_WEIGHT = { primary: 1, secondary: 0.5, stabilizer: 0.25 } as const;
function setWeights(exercise: PlanExercise): Partial<Record<string, number>> {
  const weights: Record<string, number> = {};
  for (const muscle of exercise.stabilizerMuscles ?? []) weights[muscle] = ROLE_WEIGHT.stabilizer;
  for (const muscle of exercise.secondaryMuscles) weights[muscle] = ROLE_WEIGHT.secondary;
  for (const muscle of exercise.primaryMuscles) weights[muscle] = ROLE_WEIGHT.primary;
  return weights;
}

function exercise(id: string, fields: Partial<PlanExercise> = {}): PlanExercise {
  return {
    id,
    title: id,
    category: 'compound',
    trackingType: 'weight_reps',
    equipment: 'barbell',
    primaryMuscles: [],
    secondaryMuscles: [],
    stabilizerMuscles: [],
    ...fields,
  };
}

const squat = exercise('squat', {
  primaryMuscles: ['quadriceps', 'glutes'],
  secondaryMuscles: ['adductors'],
  stabilizerMuscles: ['erectors'],
  deviceId: 'olimpik-bar',
});
const rdl = exercise('rdl', {
  primaryMuscles: ['hamstrings_medial', 'hamstrings_lateral', 'glutes'],
  secondaryMuscles: ['erectors'],
  deviceId: 'olimpik-bar',
});
const legPress = exercise('leg-press', { equipment: 'machine', primaryMuscles: ['quadriceps'], deviceId: 'leg-press-a' });
const bench = exercise('bench', { primaryMuscles: ['chest_lower'], secondaryMuscles: ['triceps_long'] });
const curl = exercise('curl', { category: 'isolation', equipment: 'dumbbell', primaryMuscles: ['biceps'] });
const plank = exercise('plank', {
  category: 'isolation',
  trackingType: 'duration',
  equipment: 'bodyweight',
  primaryMuscles: ['abs_upper', 'abs_lower'],
});
const bike = exercise('bisiklet', { category: 'warmup', trackingType: 'duration', primaryMuscles: ['cardio'], secondaryMuscles: ['quadriceps'] });
const stretch = exercise('esneme', { category: 'cooldown', trackingType: 'duration', primaryMuscles: ['hamstrings_medial'] });

const LIBRARY = new Map([squat, rdl, legPress, bench, curl, plank, bike, stretch].map((item) => [item.id, item]));

let serial = 0;
/** Satır: `target` (varsayılan 8–12) ile `count` (varsayılan 3) düz set. */
function row(exerciseId: string, fields: Partial<TemplateRow> & { target?: TemplateTarget; count?: number } = {}): TemplateRow {
  serial += 1;
  const { target = { min: 8, max: 12 }, count = 3, ...rest } = fields;
  return { id: `r_${String(serial).padStart(6, '0')}`, exerciseId, sets: uniformSets(target, count), ...rest };
}

/** Blok: `sets` verilirse her satırın set sayısı ona çekilir. */
function block(kind: BlockKind, rows: TemplateRow[], fields: Partial<TemplateBlock> & { sets?: number } = {}): TemplateBlock {
  serial += 1;
  const { sets, ...rest } = fields;
  const sized = sets === undefined ? rows : rows.map((item) => ({ ...item, sets: resizeSets(item.sets, sets) }));
  return { id: `b_${String(serial).padStart(6, '0')}`, kind, restSeconds: 90, rows: sized, ...rest };
}

describe('blok şekli', () => {
  test('her türün sınırları', () => {
    assert.equal(blockShapeProblem('single', 1), null);
    assert.equal(blockShapeProblem('single', 2), 'Tek hareketlik blokta bir hareket olur.');
    assert.equal(blockShapeProblem('superset', 2), null);
    assert.equal(blockShapeProblem('superset', 3), 'Süperset iki hareketten oluşur.');
    assert.equal(blockShapeProblem('circuit', 2), 'Devre 3 ile 8 hareket arasında olur.');
    assert.equal(blockShapeProblem('circuit', 3), null);
    assert.equal(blockShapeProblem('circuit', 8), null);
    assert.equal(blockShapeProblem('circuit', 9), 'Devre 3 ile 8 hareket arasında olur.');
    assert.equal(blockShapeProblem('complex', 1), 'Kompleks 2 ile 6 hareket arasında olur.');
    assert.equal(blockShapeProblem('complex', 2), null);
    assert.equal(blockShapeProblem('complex', 6), null);
    assert.equal(blockShapeProblem('complex', 7), 'Kompleks 2 ile 6 hareket arasında olur.');
  });

  test('hareket sayısı değişince tür uyar', () => {
    const table: [BlockKind, number, BlockKind][] = [
      ['single', 1, 'single'],
      ['superset', 1, 'single'],
      ['circuit', 1, 'single'],
      ['complex', 1, 'single'],
      ['single', 2, 'superset'],
      ['superset', 2, 'superset'],
      ['circuit', 2, 'superset'],
      ['complex', 2, 'complex'],
      ['single', 3, 'circuit'],
      ['superset', 3, 'circuit'],
      ['circuit', 3, 'circuit'],
      ['complex', 3, 'complex'],
      ['complex', 6, 'complex'],
      ['superset', 6, 'circuit'],
      ['complex', 7, 'circuit'],
      ['circuit', 8, 'circuit'],
    ];
    for (const [kind, rows, expected] of table) assert.equal(settleKind(kind, rows), expected, `${kind} ${rows}`);
  });

  test('seçilebilir türler', () => {
    assert.deepEqual(kindOptions(1), ['single']);
    assert.deepEqual(kindOptions(2), ['superset', 'complex']);
    assert.deepEqual(kindOptions(3), ['circuit', 'complex']);
    assert.deepEqual(kindOptions(6), ['circuit', 'complex']);
    assert.deepEqual(kindOptions(7), ['circuit']);
    assert.deepEqual(kindOptions(8), ['circuit']);
    assert.deepEqual([...BLOCK_KINDS], ['single', 'superset', 'circuit', 'complex']);
  });
});

describe('sayım ve kimlikler', () => {
  test('satırları sayar', () => {
    assert.equal(countRows([block('single', [row('squat')]), block('superset', [row('curl'), row('bench')])]), 3);
    assert.equal(countRows([]), 0);
  });

  test('tekrarlanan satır kimliğini bildirir', () => {
    const a = row('squat');
    assert.deepEqual(duplicateIds([block('single', [a]), block('single', [{ ...a }])]), [a.id]);
  });

  test('tekrarlanan blok kimliğini bildirir', () => {
    const first = block('single', [row('squat')]);
    assert.deepEqual(duplicateIds([first, { ...first, rows: [row('rdl')] }]), [first.id]);
  });

  test('temiz şablonda boş', () => {
    assert.deepEqual(duplicateIds([block('single', [row('squat')]), block('superset', [row('curl'), row('bench')])]), []);
  });

  test('rastgele kimlik kalıba uyar', () => {
    assert.match(randomId('t', 8, new Set()), TEMPLATE_ID_PATTERN);
    assert.match(randomId('b', 6, new Set()), BLOCK_ID_PATTERN);
    assert.match(randomId('r', 6, new Set()), ROW_ID_PATTERN);
  });

  test('alınmış kimlik çıkarsa yeniden dener', () => {
    let calls = 0;
    // İlk çağrı hep "a" (0), sonraki hep "b" (1); 252 ve üstü baytlar atlanır.
    const random = (n: number) => {
      calls += 1;
      return new Uint8Array(n).fill(calls === 1 ? 0 : 1).map((byte, index) => (index === 0 ? 255 : byte));
    };
    const id = randomId('r', 6, new Set(['r_aaaaaa']), random);
    assert.equal(id, 'r_bbbbbb');
    assert.equal(calls, 2);
  });

  test('hep alınmış kimlik çıkarsa hata fırlatır', () => {
    assert.throws(() => randomId('r', 6, new Set(['r_aaaaaa']), (n) => new Uint8Array(n)), /Benzersiz kimlik/);
  });
});

describe('kural ve cihaz', () => {
  test('bileşik 6–10, izolasyon 10–15, süreli 30–60, ısınma 300–600', () => {
    assert.deepEqual(defaultTarget(squat), { min: 6, max: 10 });
    assert.deepEqual(defaultTarget(curl), { min: 10, max: 15 });
    assert.deepEqual(defaultTarget(plank), { min: 30, max: 60 });
    assert.deepEqual(defaultTarget(bike), { min: 300, max: 600 });
  });

  test('değişiklik yoksa egzersizin türü ve yedeği, hedef satırdan', () => {
    assert.deepEqual(ruleFor({ target: { min: 5, max: 8 } }, squat), { scheme: 'double', targetRir: 2, targetMin: 5, targetMax: 8 });
  });

  test('satırdaki değişiklik türü ve yedeği belirler', () => {
    assert.deepEqual(ruleFor({ target: { min: 5, max: 5 }, rule: { scheme: 'linear', targetRir: 1 } }, squat), {
      scheme: 'linear',
      targetRir: 1,
      targetMin: 5,
      targetMax: 5,
    });
  });

  test('satırın kuralı referans setin aralığıyla', () => {
    const pyramidRow = row('squat', { sets: [{ min: 12, max: 12, loadPct: 80 }, { min: 8, max: 8 }] });
    assert.deepEqual(rowRule(pyramidRow, squat), { scheme: 'double', targetRir: 2, targetMin: 8, targetMax: 8 });
  });

  test('egzersizin kendi kuralı taban olur', () => {
    const own = exercise('own', { progression: { scheme: 'none', targetMin: 20, targetMax: 20, targetRir: 3 } });
    assert.deepEqual(ruleFor({ target: { min: 10, max: 12 } }, own), { scheme: 'none', targetRir: 3, targetMin: 10, targetMax: 12 });
  });

  test('satırın cihazı egzersizinkine üstün', () => {
    assert.equal(effectiveDeviceId({}, legPress), 'leg-press-a');
    assert.equal(effectiveDeviceId({ deviceId: 'leg-press-b' }, legPress), 'leg-press-b');
    assert.equal(effectiveDeviceId({}, curl), undefined);
    assert.equal(effectiveDeviceId({ deviceId: 'x' }), 'x');
  });

  test('satırdaki cihaz silindiyse egzersizin kendi cihazına düşer', () => {
    const known = new Set(['leg-press-a']);
    assert.equal(effectiveDeviceId({ deviceId: 'leg-press-b' }, legPress, known), 'leg-press-a');
    assert.equal(effectiveDeviceId({ deviceId: 'leg-press-a' }, legPress, known), 'leg-press-a');
    assert.equal(effectiveDeviceId({ deviceId: 'leg-press-b' }, curl, known), undefined);
  });
});

describe('set sırası', () => {
  const shape = (template: { blocks: TemplateBlock[] }) =>
    setSlots(template).map((slot) => `${slot.rowId}:${slot.round}:${slot.restAfterSeconds}`);

  test('tek hareketler arka arkaya; son sette dinlenme yok', () => {
    const a = row('squat');
    const b = row('curl');
    const template = { blocks: [block('single', [a], { sets: 2, restSeconds: 60 }), block('single', [b], { sets: 1, restSeconds: 90 })] };
    assert.deepEqual(shape(template), [`${a.id}:0:60`, `${a.id}:1:60`, `${b.id}:0:0`]);
  });

  test('süperset: turda aradan dinlenme yok, tur sonunda dinlenme', () => {
    const a = row('curl');
    const b = row('bench');
    const template = { blocks: [block('superset', [a, b], { sets: 2, restSeconds: 90 })] };
    assert.deepEqual(shape(template), [`${a.id}:0:0`, `${b.id}:0:90`, `${a.id}:1:0`, `${b.id}:1:0`]);
  });

  test('devre: istasyon geçişi, tur sonu dinlenme', () => {
    const [a, b, c] = [row('squat'), row('bench'), row('curl')];
    const template = { blocks: [block('circuit', [a, b, c], { sets: 2, restSeconds: 120, transitionSeconds: 15 })] };
    assert.deepEqual(shape(template), [
      `${a.id}:0:15`,
      `${b.id}:0:15`,
      `${c.id}:0:120`,
      `${a.id}:1:15`,
      `${b.id}:1:15`,
      `${c.id}:1:0`,
    ]);
  });

  test('süperset A 3 / B 2 set: B biten turda atlanır, son hareket dinlenmeyi alır', () => {
    const a = row('curl', { count: 3 });
    const b = row('bench', { count: 2 });
    const template = { blocks: [block('superset', [a, b], { restSeconds: 90 })] };
    assert.deepEqual(shape(template), [`${a.id}:0:0`, `${b.id}:0:90`, `${a.id}:1:0`, `${b.id}:1:90`, `${a.id}:2:0`]);
  });

  test('devre A 3 / B 1 / C 2: atlanan istasyonda geçiş yok', () => {
    const [a, b, c] = [row('squat', { count: 3 }), row('bench', { count: 1 }), row('curl', { count: 2 })];
    const template = { blocks: [block('circuit', [a, b, c], { restSeconds: 120, transitionSeconds: 15 })] };
    assert.deepEqual(shape(template), [
      `${a.id}:0:15`,
      `${b.id}:0:15`,
      `${c.id}:0:120`,
      `${a.id}:1:15`,
      `${c.id}:1:120`,
      `${a.id}:2:0`,
    ]);
  });

  test('tur sayısı en çok seti olan hareketinki; farklıysa atlanma notu', () => {
    const grouped = block('superset', [row('curl', { count: 3 }), row('bench', { count: 5 })]);
    assert.equal(roundsOf(grouped), 5);
    assert.equal(groupSkipNote(grouped, (item) => item.exerciseId), 'curl 3 sette biter; sonraki turlarda atlanır.');
    const circuit = block('circuit', [row('curl', { count: 3 }), row('plank', { count: 2 }), row('bench', { count: 5 })]);
    assert.equal(groupSkipNote(circuit, (item) => item.exerciseId), 'curl 3, plank 2 sette biter; sonraki turlarda atlanır.');
    assert.equal(groupSkipNote(block('superset', [row('curl'), row('bench')]), (item) => item.exerciseId), null);
    assert.equal(groupSkipNote(block('single', [row('curl')]), (item) => item.exerciseId), null);
  });

  test('kompleks süperset gibi: aradan dinlenme yok', () => {
    const [a, b, c] = [row('squat'), row('rdl'), row('bench')];
    const template = { blocks: [block('complex', [a, b, c], { sets: 1, restSeconds: 120 }), block('single', [row('curl')], { sets: 1 })] };
    assert.deepEqual(shape(template).slice(0, 3), [`${a.id}:0:0`, `${b.id}:0:0`, `${c.id}:0:120`]);
  });
});

describe('şablon kas yükü', () => {
  test('squat 4 set: hedef 4, yardımcı 2, dengeleyici 1', () => {
    const { load, missingRowIds } = templateMuscleLoad({ blocks: [block('single', [row('squat')], { sets: 4 })] }, LIBRARY, setWeights);
    assert.deepEqual(load, { quadriceps: 4, glutes: 4, adductors: 2, erectors: 1 });
    assert.deepEqual(missingRowIds, []);
  });

  test('aynı kas birden çok harekette toplanır', () => {
    const { load } = templateMuscleLoad(
      { blocks: [block('single', [row('squat')], { sets: 4 }), block('single', [row('rdl')], { sets: 3 })] },
      LIBRARY,
      setWeights,
    );
    assert.equal(load.glutes, 7);
    assert.equal(load.erectors, 2.5);
    assert.equal(load.hamstrings_medial, 3);
  });

  test('süperset 3 tur: her satır 3 set sayılır', () => {
    const { load } = templateMuscleLoad({ blocks: [block('superset', [row('curl'), row('bench')], { sets: 3 })] }, LIBRARY, setWeights);
    assert.equal(load.biceps, 3);
    assert.equal(load.chest_lower, 3);
    assert.equal(load.triceps_long, 1.5);
  });

  test('süperset curl 4 / bench 2: her hareket kendi seti kadar', () => {
    const { load } = templateMuscleLoad(
      { blocks: [block('superset', [row('curl', { count: 4 }), row('bench', { count: 2 })])] },
      LIBRARY,
      setWeights,
    );
    assert.equal(load.biceps, 4);
    assert.equal(load.chest_lower, 2);
    assert.equal(load.triceps_long, 1);
  });

  test('yükün ölçeklenmesi (haftalık yük)', () => {
    assert.deepEqual(scaleLoad({ quadriceps: 20 }, 3), { quadriceps: 60 });
    assert.deepEqual(scaleLoad({ quadriceps: 10, glutes: 1 }, 0.6), { quadriceps: 6, glutes: 0.6 });
  });

  test('dengeleyici 0,25 × 3 tam 0,75', () => {
    const { load } = templateMuscleLoad({ blocks: [block('single', [row('squat')], { sets: 3 })] }, LIBRARY, setWeights);
    assert.equal(load.erectors, 0.75);
  });

  test('ısınma ve soğuma hareketleri sayılmaz', () => {
    const { load } = templateMuscleLoad(
      { blocks: [block('single', [row('bisiklet')], { sets: 1 }), block('single', [row('esneme')], { sets: 2 })] },
      LIBRARY,
      setWeights,
    );
    assert.deepEqual(load, {});
  });

  test('kütüphanede olmayan egzersiz ayrı listelenir', () => {
    const lost = row('silinmis');
    const { load, missingRowIds } = templateMuscleLoad({ blocks: [block('single', [lost]), block('single', [row('curl')], { sets: 2 })] }, LIBRARY, setWeights);
    assert.deepEqual(missingRowIds, [lost.id]);
    assert.deepEqual(load, { biceps: 2 });
  });

  test('boş şablon', () => {
    assert.deepEqual(templateMuscleLoad({ blocks: [] }, LIBRARY, setWeights), { load: {}, missingRowIds: [] });
  });

  test('ortak hesap yapılan setlerle de: kalem başına set × pay; ısınma ve bilinmeyen dışarıda', () => {
    const { load, missing } = muscleLoadOf(
      [
        { key: 's_1:0', exerciseId: 'squat', sets: 3 },
        { key: 's_1:1', exerciseId: 'bisiklet', sets: 1 },
        { key: 's_2:0', exerciseId: 'squat', sets: 2 },
        { key: 's_2:1', exerciseId: 'silinmis', sets: 4 },
      ],
      LIBRARY,
      setWeights,
    );
    assert.deepEqual(load, { quadriceps: 5, glutes: 5, adductors: 2.5, erectors: 1.25 });
    assert.deepEqual(missing, ['s_2:1']);
  });

  test('haftalık yük kademesi (SPEC §7.4): 0 boş · 1–9 az · 10–20 yeterli · 20 üstü fazla', () => {
    const cases: [number, ReturnType<typeof weeklySetBand>][] = [
      [0, 'none'],
      [-1, 'none'],
      [0.25, 'low'],
      [9.5, 'low'],
      [10, 'enough'],
      [20, 'enough'],
      [20.25, 'high'],
      [35, 'high'],
    ];
    for (const [sets, band] of cases) assert.equal(weeklySetBand(sets), band, `${sets} set`);
    assert.deepEqual(WEEKLY_SET_BANDS, { enough: 10, high: 20 });
  });

  test('harita tonu en çok çalışan kasa göre; kardiyo ve sıfır dışarıda', () => {
    assert.deepEqual(loadIntensity({ quadriceps: 6, glutes: 3, cardio: 9, biceps: 0 }), { quadriceps: 1, glutes: 0.5 });
    assert.deepEqual(loadIntensity({ biceps: 0, cardio: 2 }), {});
    assert.deepEqual(loadIntensity({}), {});
  });
});

describe('süre tahmini', () => {
  test('3 × 8–12 tekrar, 90 sn dinlenme → 270 sn → 5 dk', () => {
    assert.equal(estimateMinutes({ blocks: [block('single', [row('bench')], { sets: 3, restSeconds: 90 })] }, LIBRARY), 5);
  });

  test('plank 3 × 30–60 sn, 60 sn dinlenme → 255 sn → 5 dk', () => {
    const plankRow = row('plank', { target: { min: 30, max: 60 } });
    assert.equal(estimateMinutes({ blocks: [block('single', [plankRow], { sets: 3, restSeconds: 60 })] }, LIBRARY), 5);
  });

  test('boş şablon 0', () => {
    assert.equal(estimateMinutes({ blocks: [] }, LIBRARY), 0);
  });

  test('set süresi: hedefin ortası, AMRAP üst sınır', () => {
    assert.equal(setSeconds({ min: 8, max: 12 }, 'weight_reps'), 30);
    assert.equal(setSeconds({ min: 8, max: 12, amrap: true }, 'weight_reps'), 36);
    assert.equal(setSeconds({ min: 30, max: 60 }, 'duration'), 45);
    assert.equal(setSeconds({ min: 30, max: 60, amrap: true }, 'duration'), 60);
  });

  test('piramit setleri kendi hedefiyle sayılır', () => {
    const pyramidRow = row('bench', { sets: [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10, loadPct: 90 }, { min: 8, max: 8 }] });
    // (36 + 90) + (30 + 90) + 24 = 270 sn → 5 dk
    assert.equal(estimateMinutes({ blocks: [block('single', [pyramidRow], { restSeconds: 90 })] }, LIBRARY), 5);
  });

  test('gerçekçi bir alt vücut şablonu 40–70 dk arası', () => {
    const template = {
      blocks: [
        block('single', [row('squat', { target: { min: 5, max: 8 } })], { sets: 4, restSeconds: 150 }),
        block('single', [row('rdl')], { sets: 3, restSeconds: 120 }),
        block('single', [row('leg-press', { target: { min: 10, max: 12 } })], { sets: 3, restSeconds: 90 }),
        block('superset', [row('curl'), row('bench')], { sets: 3, restSeconds: 90 }),
        block('circuit', [row('plank', { target: { min: 30, max: 45 } }), row('curl'), row('bench')], {
          sets: 3,
          restSeconds: 120,
          transitionSeconds: 15,
        }),
      ],
    };
    const minutes = estimateMinutes(template, LIBRARY);
    assert.ok(minutes >= 40 && minutes <= 70, `${minutes} dk`);
    assert.equal(minutes % 5, 0);
  });
});

describe('ısınma için ilk hareket', () => {
  test('squat sonra leg press (ikisi de ön bacak) → yalnız squat', () => {
    const a = row('squat');
    const b = row('leg-press');
    assert.deepEqual([...firstForMuscleRowIds({ blocks: [block('single', [a]), block('single', [b])] }, LIBRARY)], [a.id]);
  });

  test('bench sonra squat → ikisi de', () => {
    const a = row('bench');
    const b = row('squat');
    assert.deepEqual([...firstForMuscleRowIds({ blocks: [block('single', [a]), block('single', [b])] }, LIBRARY)], [a.id, b.id]);
  });

  test('gruptaki satırlar sırayla; silinmiş egzersiz yok sayılır', () => {
    const lost = row('silinmis');
    const a = row('leg-press');
    const b = row('squat');
    const result = firstForMuscleRowIds({ blocks: [block('single', [lost]), block('superset', [a, b])] }, LIBRARY);
    assert.deepEqual([...result], [a.id, b.id]);
  });
});

describe('etiketler ve özet', () => {
  test('bloklar numaralı, gruptaki satırlar harfli', () => {
    const [a, b, c, d] = [row('squat'), row('curl'), row('bench'), row('rdl')];
    const labels = rowLabels({ blocks: [block('single', [a]), block('superset', [b, c]), block('single', [d])] });
    assert.deepEqual([...labels.values()], ['1', '2a', '2b', '3']);
    assert.equal(labels.get(c.id), '2b');
  });

  test('sayılar, gruplar ve cihazlar', () => {
    const template = {
      blocks: [
        block('single', [row('squat')], { sets: 4 }),
        block('superset', [row('leg-press'), row('curl')], { sets: 3 }),
        block('circuit', [row('bisiklet'), row('rdl'), row('plank')], { sets: 2 }),
        block('complex', [row('squat'), row('rdl')], { sets: 2 }),
      ],
    };
    const summary = templateSummary(template, LIBRARY);
    assert.equal(summary.rows, 8);
    assert.equal(summary.workingSets, 4 + 3 * 2 + 2 * 3 + 2 * 2);
    const uneven = templateSummary({ blocks: [block('superset', [row('curl', { count: 4 }), row('bench', { count: 2 })])] }, LIBRARY);
    assert.equal(uneven.workingSets, 6);
    assert.deepEqual(summary.groups, { superset: 1, circuit: 1, complex: 1 });
    assert.deepEqual(summary.deviceIds, ['olimpik-bar', 'leg-press-a']);
    assert.deepEqual(summary.missingRowIds, []);
    assert.ok(summary.minutes > 0);
  });

  test('satırdaki cihaz egzersizinkine üstün; silinmiş egzersiz sayılmaz', () => {
    const lost = row('silinmis', { deviceId: 'kayip' });
    const template = {
      blocks: [
        block('single', [row('leg-press', { deviceId: 'leg-press-b' })], { sets: 3 }),
        block('single', [row('leg-press')], { sets: 3 }),
        block('single', [lost], { sets: 5 }),
      ],
    };
    const summary = templateSummary(template, LIBRARY);
    assert.deepEqual(summary.deviceIds, ['leg-press-b', 'leg-press-a']);
    assert.equal(summary.rows, 2);
    assert.equal(summary.workingSets, 6);
    assert.deepEqual(summary.missingRowIds, [lost.id]);
  });
});

describe('biçim', () => {
  test('hedef', () => {
    assert.equal(formatTarget({ min: 8, max: 12 }, 'weight_reps'), '8–12 tekrar');
    assert.equal(formatTarget({ min: 5, max: 5 }, 'bodyweight_reps'), '5 tekrar');
    assert.equal(formatTarget({ min: 30, max: 60 }, 'duration'), '30–60 sn');
  });

  test('dinlenme', () => {
    assert.equal(formatRest(0), 'Ara yok');
    assert.equal(formatRest(45), '45 sn');
    assert.equal(formatRest(60), '1 dk');
    assert.equal(formatRest(90), '1 dk 30 sn');
    assert.equal(formatRest(120), '2 dk');
  });

  test('blok anlatımı', () => {
    assert.equal(describeBlock({ kind: 'single', sets: 3, restSeconds: 120 }), '3 set · 2 dk dinlenme');
    assert.equal(describeBlock({ kind: 'superset', sets: 3, restSeconds: 90 }), '3 tur · tur sonunda 1 dk 30 sn dinlenme');
    assert.equal(
      describeBlock({ kind: 'circuit', sets: 3, restSeconds: 120, transitionSeconds: 15 }),
      '3 tur · istasyon arası 15 sn · tur sonunda 2 dk dinlenme',
    );
    assert.equal(
      describeBlock({ kind: 'complex', sets: 3, restSeconds: 120 }),
      '3 tur · ara vermeden, aynı ağırlıkla · tur sonunda 2 dk dinlenme',
    );
    assert.equal(describeBlock({ kind: 'single', sets: 1, restSeconds: 0 }), '1 set · dinlenme yok');
  });
});

describe('sunucuda denetim ve sadeleştirme', () => {
  const ctx = { exercises: LIBRARY, deviceIds: new Set(['olimpik-bar', 'leg-press-a', 'leg-press-b']) };
  const clean: TemplateBlock[] = [
    {
      id: 'b_aaaaaa',
      kind: 'single',
      restSeconds: 150,
      rows: [
        {
          id: 'r_aaaaaa',
          exerciseId: 'squat',
          sets: [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 12, loadPct: 85, amrap: true }],
        },
      ],
    },
    {
      id: 'b_bbbbbb',
      kind: 'circuit',
      restSeconds: 120,
      transitionSeconds: 20,
      rows: [
        { id: 'r_bbbbbb', exerciseId: 'leg-press', sets: uniformSets({ min: 10, max: 15 }, 3), deviceId: 'leg-press-b', note: 'Tepede 1 sn tut' },
        { id: 'r_cccccc', exerciseId: 'curl', sets: uniformSets({ min: 10, max: 15 }, 2), rule: { scheme: 'linear', targetRir: 1 } },
        { id: 'r_dddddd', exerciseId: 'plank', sets: uniformSets({ min: 30, max: 45 }, 3) },
      ],
    },
  ];

  test('temiz girdi aynen kalır', () => {
    const result = normalizeTemplate({ blocks: clean }, ctx);
    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.blocks, clean);
  });

  test('kütüphanede olmayan egzersiz', () => {
    const { errors } = normalizeTemplate({ blocks: [block('single', [row('silinmis')])] }, ctx);
    assert.deepEqual(errors, { 'blocks.0.rows.0.exerciseId': 'Bu egzersiz kütüphanede yok; kartı sil, yerine yenisini ekle.' });
  });

  test('olmayan cihaz', () => {
    const { errors } = normalizeTemplate({ blocks: [block('single', [row('squat')]), block('single', [row('leg-press', { deviceId: 'yok' })])] }, ctx);
    assert.deepEqual(errors, { 'blocks.1.rows.0.deviceId': 'Bu cihaz artık yok.' });
  });

  test('tekrarda hedef en fazla 100; süreli harekette serbest', () => {
    const { errors } = normalizeTemplate(
      {
        blocks: [
          block('superset', [row('curl', { target: { min: 10, max: 120 }, count: 1 }), row('plank', { target: { min: 60, max: 300 } })]),
        ],
      },
      ctx,
    );
    assert.deepEqual(errors, { 'blocks.0.rows.0.sets.0.max': 'Tekrar hedefi en fazla 100.' });
  });

  test('her setin tekrarı ayrı denetlenir', () => {
    const { errors } = normalizeTemplate(
      { blocks: [block('single', [row('bench', { sets: [{ min: 8, max: 12 }, { min: 10, max: 150 }] })])] },
      ctx,
    );
    assert.deepEqual(errors, { 'blocks.0.rows.0.sets.1.max': 'Tekrar hedefi en fazla 100.' });
  });

  test('yüzde yalnız ağırlıklı harekette ve %100 altında; AMRAP yalnız açıksa; blokta set sayısı yok', () => {
    const { blocks } = normalizeTemplate(
      {
        blocks: [
          block('single', [row('plank', { sets: [{ min: 30, max: 60, loadPct: 80 }, { min: 30, max: 60, amrap: false }] })]),
          block('single', [row('bench', { sets: [{ min: 8, max: 8, loadPct: 100 }, { min: 8, max: 8, loadPct: 85, amrap: true }] })]),
          block('single', [row('silinmis', { sets: [{ min: 8, max: 8 }, { min: 8, max: 8, loadPct: 85 }] })]),
        ],
      },
      ctx,
    );
    assert.deepEqual(blocks[0]?.rows[0]?.sets, [
      { min: 30, max: 60 },
      { min: 30, max: 60 },
    ]);
    assert.deepEqual(blocks[1]?.rows[0]?.sets, [
      { min: 8, max: 8 },
      { min: 8, max: 8, loadPct: 85, amrap: true },
    ]);
    // Egzersiz yoksa yüzde kalır (hata egzersiz alanında).
    assert.equal(blocks[2]?.rows[0]?.sets[1]?.loadPct, 85);
    assert.ok(blocks.every((item) => !('sets' in item)));
  });

  test('egzersizin kuralıyla aynı değişiklik yazılmaz', () => {
    const { blocks } = normalizeTemplate({ blocks: [block('single', [row('squat', { rule: { scheme: 'double', targetRir: 2 } })])] }, ctx);
    assert.equal(blocks[0]?.rows[0]?.rule, undefined);
    assert.equal('rule' in (blocks[0]?.rows[0] ?? {}), false);
  });

  test('egzersizin kendi cihazı yazılmaz', () => {
    const { blocks } = normalizeTemplate({ blocks: [block('single', [row('leg-press', { deviceId: 'leg-press-a' })])] }, ctx);
    assert.equal('deviceId' in (blocks[0]?.rows[0] ?? {}), false);
  });

  test('programda (storedRows) egzersizinkine eşit kural ve cihaz yalnız kayıttaki aynı satırda aynen duruyorsa kalır', () => {
    const squatRow = row('squat', { rule: { scheme: 'double', targetRir: 2 } });
    const pressRow = row('leg-press', { deviceId: 'leg-press-a' });
    const body = { blocks: [block('single', [squatRow]), block('single', [pressRow])] };

    // Danışana özel seçim kayıtta aynen duruyor (egzersiz sonradan ona eşitlendi): kalır.
    const kept = normalizeTemplate(body, ctx, {
      storedRows: new Map([
        [squatRow.id, { rule: { scheme: 'double', targetRir: 2 } }],
        [pressRow.id, { deviceId: 'leg-press-a' }],
      ]),
    });
    assert.deepEqual(kept.errors, {});
    assert.deepEqual(kept.blocks[0]?.rows[0]?.rule, { scheme: 'double', targetRir: 2 });
    assert.equal(kept.blocks[1]?.rows[0]?.deviceId, 'leg-press-a');

    // Yeni gelen eşit değer (kayıtta yok ya da başka değer; seçicide varsayılanı yeniden seçmek): şablondaki gibi düşer.
    for (const storedRows of [
      new Map(),
      new Map([
        [squatRow.id, { rule: { scheme: 'linear' as const, targetRir: 1 } }],
        [pressRow.id, { deviceId: 'leg-press-b' }],
      ]),
    ]) {
      const fresh = normalizeTemplate(body, ctx, { storedRows });
      assert.equal('rule' in (fresh.blocks[0]?.rows[0] ?? {}), false);
      assert.equal('deviceId' in (fresh.blocks[1]?.rows[0] ?? {}), false);
    }
  });

  test('not kırpılır, boşsa atılır', () => {
    const { blocks } = normalizeTemplate(
      { blocks: [block('superset', [row('curl', { note: '  Yavaş indir  ' }), row('bench', { note: '   ' })])] },
      ctx,
    );
    assert.equal(blocks[0]?.rows[0]?.note, 'Yavaş indir');
    assert.equal('note' in (blocks[0]?.rows[1] ?? {}), false);
  });

  test('istasyon geçişi yalnız devrede; devrede yoksa 15 sn', () => {
    const { blocks } = normalizeTemplate(
      {
        blocks: [
          block('superset', [row('curl'), row('bench')], { transitionSeconds: 30 }),
          block('circuit', [row('curl'), row('bench'), row('squat')]),
        ],
      },
      ctx,
    );
    assert.equal('transitionSeconds' in (blocks[0] ?? {}), false);
    assert.equal(blocks[1]?.transitionSeconds, 15);
  });
});
