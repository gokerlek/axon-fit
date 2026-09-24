import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeviceKind } from './device-loads.ts';
import { resizeSets, setShape, uniformSets } from './set-plan.ts';
import { moveKey } from './reorder.ts';
import {
  addToGroup,
  addToGroupOutcome,
  appendExercise,
  applySetPreset,
  canDuplicate,
  canDuplicateBlocks,
  changeKind,
  combineInto,
  combineOutcome,
  deviceChoices,
  dissolveGroup,
  duplicateBlock,
  duplicateBlocks,
  duplicateRow,
  groupBlocks,
  groupCheck,
  idSource,
  moveCheck,
  moveItem,
  newGroupKind,
  prepareForEditing,
  removeBlock,
  removeBlocks,
  removeRow,
  replaceExercise,
  setRounds,
  setRowSetCount,
  stepDestination,
  swapDevice,
  ungroupRow,
  type EditorExercise,
  type IdSource,
  type MoveDestination,
} from './template-edit.ts';
import {
  BLOCK_ID_PATTERN,
  ROW_ID_PATTERN,
  countRows,
  duplicateIds,
  roundsOf,
  type BlockKind,
  type TemplateBlock,
  type TemplateRow,
  type TemplateTarget,
} from './template-plan.ts';

function exercise(id: string, fields: Partial<EditorExercise> = {}): EditorExercise {
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

const bench = exercise('halter-bench', {
  title: 'Halter Bench Press',
  deviceId: 'olimpik-bar',
  pattern: 'horizontal_push',
  primaryMuscles: ['chest_lower'],
  secondaryMuscles: ['chest_upper', 'triceps_long'],
});
const dumbbellBench = exercise('dambil-bench', {
  title: 'Dambıl Bench Press',
  equipment: 'dumbbell',
  deviceId: 'dambil-seti',
  pattern: 'horizontal_push',
  primaryMuscles: ['chest_lower'],
  secondaryMuscles: ['chest_upper', 'triceps_long'],
});
const dumbbellFly = exercise('dambil-fly', {
  title: 'Dambıl Fly',
  category: 'isolation',
  equipment: 'dumbbell',
  deviceId: 'dambil-seti',
  pattern: 'chest_fly',
  primaryMuscles: ['chest_lower', 'chest_upper'],
});
const squat = exercise('squat', { deviceId: 'olimpik-bar', pattern: 'squat', primaryMuscles: ['quadriceps', 'glutes'] });
const pulldown = exercise('lat-pulldown', {
  equipment: 'machine',
  deviceId: 'lat-a',
  pattern: 'vertical_pull',
  primaryMuscles: ['lats_mid'],
});
const pushdown = exercise('pushdown', {
  category: 'isolation',
  equipment: 'cable',
  deviceId: 'kablo-a',
  pattern: 'elbow_extension',
  primaryMuscles: ['triceps_long', 'triceps_lateral'],
});
const curl = exercise('curl', { category: 'isolation', equipment: 'dumbbell', pattern: 'elbow_flexion', primaryMuscles: ['biceps'] });
const crunchMachine = exercise('crunch-makine', {
  category: 'isolation',
  equipment: 'machine',
  deviceId: 'crunch-m',
  pattern: 'core_flexion',
  primaryMuscles: ['abs_upper', 'abs_lower'],
});
const plank = exercise('plank', {
  category: 'isolation',
  trackingType: 'duration',
  equipment: 'bodyweight',
  deviceId: 'mat',
  pattern: 'core_stability',
  primaryMuscles: ['abs_upper', 'abs_lower'],
});

const ALL = [bench, dumbbellBench, dumbbellFly, squat, pulldown, pushdown, curl, crunchMachine, plank];
const LIBRARY = new Map(ALL.map((item) => [item.id, item]));

const DEVICE_LIST: { id: string; name: string; kind: DeviceKind }[] = [
  { id: 'olimpik-bar', name: 'Olimpik bar', kind: 'barbell' },
  { id: 'dambil-seti', name: 'Dambıl seti', kind: 'dumbbell' },
  { id: 'kablo-a', name: 'Kablo istasyonu', kind: 'cable' },
  { id: 'lat-a', name: 'Lat pulldown A', kind: 'selectorized' },
  { id: 'lat-b', name: 'Lat pulldown B', kind: 'selectorized' },
  { id: 'crunch-m', name: 'Karın makinesi', kind: 'selectorized' },
  { id: 'mat', name: 'Minder', kind: 'bodyweight' },
];
const SWAP = {
  exercises: ALL,
  devices: new Map(DEVICE_LIST.map((device) => [device.id, device])),
  familyOf: (muscle: string) => muscle,
};

/** Sıralı kimlik üretici: testte sonuçlar okunur kalsın. */
function sequentialIds(): IdSource {
  let n = 0;
  return (prefix) => `${prefix}_new${String(++n).padStart(3, '0')}`;
}

/** Satır: `target` (varsayılan 8–12) ile `count` (varsayılan 3) düz set. */
function row(id: string, exerciseId: string, fields: Partial<TemplateRow> & { target?: TemplateTarget; count?: number } = {}): TemplateRow {
  const { target = { min: 8, max: 12 }, count = 3, ...rest } = fields;
  return { id, exerciseId, sets: uniformSets(target, count), ...rest };
}
/** Blok: `sets` verilirse her satırın set sayısı ona çekilir. */
function block(id: string, kind: BlockKind, rows: TemplateRow[], fields: Partial<TemplateBlock> & { sets?: number } = {}): TemplateBlock {
  const { sets, ...rest } = fields;
  const sized = sets === undefined ? rows : rows.map((item) => ({ ...item, sets: resizeSets(item.sets, sets) }));
  return { id, kind, restSeconds: 90, rows: sized, ...rest };
}

const rowIds = (blocks: TemplateBlock[]) => blocks.map((item) => item.rows.map((r) => r.id));
/** Özet: blok türü, set/tur, dinlenme, satırlar. */
const outline = (blocks: TemplateBlock[]) =>
  blocks.map(({ id, kind, restSeconds, rows }) => ({ id, kind, sets: roundsOf({ rows }), restSeconds, rows: rows.map((r) => r.id) }));
/** Kısa özet: blok türü ve satırları ("single:r_1"). */
const shape = (blocks: TemplateBlock[]) => blocks.map((item) => `${item.kind}:${item.rows.map((r) => r.id).join(',')}`);
/** `n` tek hareket: `b_i` / `r_i`. */
const singles = (n: number) => Array.from({ length: n }, (_, i) => block(`b_${i}`, 'single', [row(`r_${i}`, 'squat')]));
/** `n` devre, her biri `size` hareketli: `b_ci` / `r_ci_j`. */
const circuits = (n: number, size: number) =>
  Array.from({ length: n }, (_, i) =>
    block(`b_c${i}`, 'circuit', Array.from({ length: size }, (_, j) => row(`r_c${i}_${j}`, 'squat')), { transitionSeconds: 15 }),
  );

describe('ekleme ve kimlikler', () => {
  test('bileşik: 3 set, 120 sn, 6–10; izolasyon 60 sn, 10–15; süreli saniye', () => {
    const ids = idSource([]);
    let blocks = appendExercise([], squat, ids);
    blocks = appendExercise(blocks, curl, ids);
    blocks = appendExercise(blocks, plank, ids);
    assert.equal(blocks.length, 3);
    assert.deepEqual(
      blocks.map(({ kind, restSeconds, rows }) => ({ kind, sets: rows[0]?.sets.length, restSeconds, target: rows[0]?.sets[0] })),
      [
        { kind: 'single', sets: 3, restSeconds: 120, target: { min: 6, max: 10 } },
        { kind: 'single', sets: 3, restSeconds: 60, target: { min: 10, max: 15 } },
        { kind: 'single', sets: 3, restSeconds: 60, target: { min: 30, max: 60 } },
      ],
    );
    for (const item of blocks) {
      assert.match(item.id, BLOCK_ID_PATTERN);
      assert.match(item.rows[0]?.id ?? '', ROW_ID_PATTERN);
    }
    assert.deepEqual(duplicateIds(blocks), []);
  });

  test('kimlik üretici var olanlarla ve kendi ürettikleriyle çakışmaz', () => {
    const existing = [block('b_aaaaaa', 'single', [row('r_aaaaaa', 'squat')])];
    let call = 0;
    // Önce var olan kimlikleri, sonra hep aynı kimliği üretmeye zorlar.
    const random = (n: number) => new Uint8Array(n).fill(call++ < 2 ? 0 : 1 + Math.floor(call / 2));
    const ids = idSource(existing, random);
    const produced = [ids('b'), ids('r'), ids('r'), ids('r')];
    assert.equal(new Set(produced).size, produced.length);
    for (const id of produced) assert.ok(!['b_aaaaaa', 'r_aaaaaa'].includes(id));
  });
});

describe('hareket değiştirme', () => {
  const start = [block('b_1', 'single', [row('r_1', 'halter-bench', { rule: { scheme: 'linear', targetRir: 1 }, deviceId: 'olimpik-bar', note: 'Yavaş' })])];

  test('aynı kayıt türünde hedef ve kural kalır; kimlik ve not korunur', () => {
    const [result] = replaceExercise(start, 'r_1', dumbbellBench, bench);
    assert.deepEqual(result?.rows[0], {
      id: 'r_1',
      exerciseId: 'dambil-bench',
      sets: uniformSets({ min: 8, max: 12 }, 3),
      rule: { scheme: 'linear', targetRir: 1 },
      note: 'Yavaş',
    });
  });

  test('aynı kayıt türünde piramit ve AMRAP kalır; kopya bağımsız', () => {
    const pyramid = applySetPreset(applySetPreset(start, 'r_1', 'pyramid'), 'r_1', 'lastAmrap');
    const [result] = replaceExercise(pyramid, 'r_1', dumbbellBench, bench);
    assert.deepEqual(result?.rows[0]?.sets, pyramid[0]?.rows[0]?.sets);
    assert.notEqual(result?.rows[0]?.sets[0], pyramid[0]?.rows[0]?.sets[0]);
  });

  test('tekrardan süreye geçince hedef sıfırlanır (set sayısı kalır), kural düşer', () => {
    const [result] = replaceExercise(start, 'r_1', plank, bench);
    assert.deepEqual(result?.rows[0], { id: 'r_1', exerciseId: 'plank', sets: uniformSets({ min: 30, max: 60 }, 3), note: 'Yavaş' });
    const four = replaceExercise(applySetPreset(setRowSetCount(start, 'r_1', 4), 'r_1', 'backoff'), 'r_1', plank, bench);
    assert.deepEqual(four[0]?.rows[0]?.sets, uniformSets({ min: 30, max: 60 }, 4));
  });

  test('cihaz değişikliği düşer', () => {
    const [result] = replaceExercise(start, 'r_1', squat, bench);
    assert.equal(result?.rows[0]?.deviceId, undefined);
  });
});

describe('kaldırma', () => {
  test('tek hareketin bloğu gider', () => {
    const blocks = [block('b_1', 'single', [row('r_1', 'squat')]), block('b_2', 'single', [row('r_2', 'curl')])];
    assert.deepEqual(rowIds(removeRow(blocks, 'r_1', LIBRARY)), [['r_2']]);
  });

  test('süperset tekleşir: grubun kimliği, satırın kendi setleri, türün dinlenmesi', () => {
    const blocks = [block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl', { count: 2 })], { restSeconds: 90 })];
    assert.deepEqual(removeRow(blocks, 'r_1', LIBRARY), [
      { id: 'b_1', kind: 'single', restSeconds: 60, rows: [row('r_2', 'curl', { count: 2 })] },
    ]);
  });

  test('kalan egzersiz silinmişse yedek dinlenme', () => {
    const blocks = [block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'silinmis')])];
    assert.equal(removeRow(blocks, 'r_1', LIBRARY)[0]?.restSeconds, 90);
  });

  test('devre 4 → devre 3 → süperset; kompleks 3 → kompleks 2', () => {
    const circuit = [
      block('b_1', 'circuit', [row('r_1', 'squat'), row('r_2', 'curl'), row('r_3', 'plank'), row('r_4', 'halter-bench')], {
        transitionSeconds: 20,
      }),
    ];
    const three = removeRow(circuit, 'r_4', LIBRARY);
    assert.equal(three[0]?.kind, 'circuit');
    assert.equal(three[0]?.transitionSeconds, 20);
    const two = removeRow(three, 'r_2', LIBRARY);
    assert.equal(two[0]?.kind, 'superset');
    assert.equal('transitionSeconds' in (two[0] ?? {}), false);
    assert.deepEqual(rowIds(two), [['r_1', 'r_3']]);

    const complex = [block('b_2', 'complex', [row('r_5', 'squat'), row('r_6', 'halter-bench'), row('r_7', 'squat')])];
    assert.equal(removeRow(complex, 'r_6', LIBRARY)[0]?.kind, 'complex');
  });

  test('bilinmeyen satırda aynı dizi', () => {
    const blocks = [block('b_1', 'single', [row('r_1', 'squat')])];
    assert.equal(removeRow(blocks, 'r_x', LIBRARY), blocks);
  });

  test('grup yüzünde Sil: bloğun tamamı gider', () => {
    const blocks = [
      block('b_1', 'single', [row('r_1', 'squat')]),
      block('b_2', 'circuit', [row('r_2', 'curl'), row('r_3', 'plank'), row('r_4', 'halter-bench')], { transitionSeconds: 15 }),
      block('b_3', 'single', [row('r_5', 'curl')]),
    ];
    assert.deepEqual(rowIds(removeBlock(blocks, 'b_2')), [['r_1'], ['r_5']]);
    assert.deepEqual(rowIds(removeBlock(blocks, 'b_1')), [['r_2', 'r_3', 'r_4'], ['r_5']]);
    assert.equal(removeBlock(blocks, 'b_x'), blocks);
    // Satır kimliği blok değildir.
    assert.equal(removeBlock(blocks, 'r_1'), blocks);
  });
});

describe('kopyalama', () => {
  test('tek hareket: hemen arkasına aynı ayarlarla yeni blok', () => {
    const blocks = [block('b_1', 'single', [row('r_1', 'squat')], { sets: 4, restSeconds: 150 }), block('b_2', 'single', [row('r_2', 'curl')])];
    const result = duplicateRow(blocks, 'r_1', sequentialIds());
    assert.deepEqual(outline(result), [
      { id: 'b_1', kind: 'single', sets: 4, restSeconds: 150, rows: ['r_1'] },
      { id: 'b_new002', kind: 'single', sets: 4, restSeconds: 150, rows: ['r_new001'] },
      { id: 'b_2', kind: 'single', sets: 3, restSeconds: 90, rows: ['r_2'] },
    ]);
    assert.equal(result[1]?.rows[0]?.exerciseId, 'squat');
  });

  test('kopyanın setleri kaynaktan bağımsız', () => {
    const blocks = [block('b_1', 'single', [row('r_1', 'squat')])];
    const result = duplicateRow(blocks, 'r_1', sequentialIds());
    const copy = result[1]?.rows[0];
    assert.ok(copy);
    copy.sets[0]!.min = 1;
    copy.sets.push({ min: 2, max: 2 });
    assert.deepEqual(blocks[0]?.rows[0]?.sets, uniformSets({ min: 8, max: 12 }, 3));
  });

  test('süperset üyesi grubun arkasına tek olur; süperset devreye dönmez', () => {
    const blocks = [
      block('b_1', 'superset', [row('r_1', 'squat', { count: 4 }), row('r_2', 'curl')], { restSeconds: 75 }),
      block('b_2', 'single', [row('r_3', 'plank')]),
    ];
    const result = duplicateRow(blocks, 'r_1', sequentialIds(), LIBRARY);
    assert.deepEqual(outline(result), [
      { id: 'b_1', kind: 'superset', sets: 4, restSeconds: 75, rows: ['r_1', 'r_2'] },
      // Kendi setleriyle, dinlenme türün varsayılanı (bileşik 120 sn).
      { id: 'b_new002', kind: 'single', sets: 4, restSeconds: 120, rows: ['r_new001'] },
      { id: 'b_2', kind: 'single', sets: 3, restSeconds: 90, rows: ['r_3'] },
    ]);
    assert.equal(result[0], blocks[0]);
    // Egzersiz bilgisi verilmezse grubun dinlenmesi.
    assert.equal(duplicateRow(blocks, 'r_2', sequentialIds())[1]?.restSeconds, 75);
  });

  test('devre ve kompleks üyesi yer varsa grubun içinde kaynağın arkasına; tür değişmez', () => {
    const circuit = [block('b_1', 'circuit', [row('r_1', 'squat'), row('r_2', 'curl'), row('r_3', 'plank')], { transitionSeconds: 20 })];
    const result = duplicateRow(circuit, 'r_2', sequentialIds(), LIBRARY);
    assert.deepEqual(rowIds(result), [['r_1', 'r_2', 'r_new001', 'r_3']]);
    assert.deepEqual({ kind: result[0]?.kind, transition: result[0]?.transitionSeconds }, { kind: 'circuit', transition: 20 });

    const five = [block('b_2', 'complex', Array.from({ length: 5 }, (_, i) => row(`r_c${i}`, 'squat')))];
    const six = duplicateRow(five, 'r_c4', sequentialIds(), LIBRARY);
    assert.deepEqual(outline(six).map(({ kind, rows }) => [kind, rows.length]), [['complex', 6]]);
    // 6'lı kompleks kopyayla devreye dönmez: kopya grubun arkasına tek olur.
    const seven = duplicateRow(six, 'r_c0', sequentialIds(), LIBRARY);
    assert.deepEqual(outline(seven).map(({ kind, rows }) => [kind, rows.length]), [['complex', 6], ['single', 1]]);
  });

  test('dolu devrede (8) grubun arkasına tek hareket', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`r_${i}`, 'squat'));
    const blocks = [block('b_1', 'circuit', rows, { transitionSeconds: 15, sets: 2 })];
    const result = duplicateRow(blocks, 'r_3', sequentialIds());
    assert.equal(result.length, 2);
    assert.equal(result[0]?.rows.length, 8);
    assert.deepEqual({ kind: result[1]?.kind, sets: result[1]?.rows[0]?.sets.length, rows: result[1]?.rows.map((r) => r.id) }, {
      kind: 'single',
      sets: 2,
      rows: ['r_new001'],
    });
    assert.equal('transitionSeconds' in (result[1] ?? {}), false);
  });

  test('grubun tamamı hemen arkasına: blok ve satırlar yeni kimlikle, ayarlar aynı', () => {
    const blocks = [
      block('b_1', 'circuit', [row('r_1', 'squat', { rule: { scheme: 'linear', targetRir: 1 }, note: 'Yavaş' }), row('r_2', 'curl'), row('r_3', 'plank')], {
        restSeconds: 150,
        transitionSeconds: 20,
      }),
      block('b_2', 'single', [row('r_4', 'halter-bench')]),
    ];
    const result = duplicateBlock(blocks, 'b_1', sequentialIds());
    assert.deepEqual(outline(result), [
      { id: 'b_1', kind: 'circuit', sets: 3, restSeconds: 150, rows: ['r_1', 'r_2', 'r_3'] },
      { id: 'b_new001', kind: 'circuit', sets: 3, restSeconds: 150, rows: ['r_new002', 'r_new003', 'r_new004'] },
      { id: 'b_2', kind: 'single', sets: 3, restSeconds: 90, rows: ['r_4'] },
    ]);
    const copy = result[1] as TemplateBlock;
    assert.equal(copy.transitionSeconds, 20);
    assert.deepEqual(copy.rows[0], { ...row('r_new002', 'squat', { rule: { scheme: 'linear', targetRir: 1 }, note: 'Yavaş' }) });
    assert.deepEqual(duplicateIds(result), []);
    // Kopya bağımsız: setleri ve kuralı kaynağa dokunmaz.
    copy.rows[0]!.sets[0]!.min = 1;
    copy.rows[0]!.rule!.targetRir = 3;
    assert.deepEqual(blocks[0]?.rows[0]?.sets[0], { min: 8, max: 12 });
    assert.equal(blocks[0]?.rows[0]?.rule?.targetRir, 1);
    assert.equal(duplicateBlock(blocks, 'b_x', sequentialIds()), blocks);
  });

  test('sınırda kopya olmaz (aynı dizi): 40 hareket, 30 blok', () => {
    const thirty = singles(30);
    assert.equal(canDuplicate(thirty, 'b_0'), false);
    assert.equal(canDuplicate(thirty, 'r_0'), false);
    assert.equal(duplicateRow(thirty, 'r_0', sequentialIds()), thirty);
    assert.equal(duplicateBlock(thirty, 'b_0', sequentialIds()), thirty);

    // 30 blokta devre üyesinin kopyası grubun içinde kalabilir.
    const withCircuit = [...singles(29), block('b_c', 'circuit', [row('r_a', 'squat'), row('r_b', 'curl'), row('r_c', 'plank')])];
    assert.equal(canDuplicate(withCircuit, 'r_b'), true);
    assert.equal(duplicateRow(withCircuit, 'r_b', sequentialIds()).at(-1)?.rows.length, 4);
    // Süperset üyesininki blok ister.
    const withSuperset = [...singles(29), block('b_s', 'superset', [row('r_a', 'squat'), row('r_b', 'curl')])];
    assert.equal(canDuplicate(withSuperset, 'r_a'), false);
    assert.equal(duplicateRow(withSuperset, 'r_a', sequentialIds()), withSuperset);

    // 38 hareket (7 blok): 3'lük grup sığmaz, süperset ve tek satır sığar.
    const rows38 = [
      ...circuits(4, 8),
      block('b_3', 'circuit', [row('r_x', 'squat'), row('r_y', 'curl'), row('r_z', 'plank')]),
      block('b_s', 'superset', [row('r_p', 'squat'), row('r_q', 'curl')]),
      block('b_t', 'single', [row('r_t', 'curl')]),
    ];
    assert.equal(countRows(rows38), 38);
    assert.equal(canDuplicate(rows38, 'b_3'), false);
    assert.equal(duplicateBlock(rows38, 'b_3', sequentialIds()), rows38);
    assert.equal(canDuplicate(rows38, 'b_s'), true);
    assert.equal(canDuplicate(rows38, 'r_t'), true);
    const forty = duplicateBlock(rows38, 'b_s', sequentialIds());
    assert.equal(countRows(forty), 40);
    assert.equal(canDuplicate(forty, 'r_t'), false);
    assert.equal(duplicateRow(forty, 'r_t', sequentialIds()), forty);
    assert.equal(canDuplicate(forty, 'r_nope'), false);
  });
});

describe('gruptan çıkarma ve dağıtma', () => {
  const superset = () => [block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')], { sets: 4 })];

  test('ilk satır grubun önüne yeni blok; kalan tekleşir ve grubun kimliğini korur', () => {
    const result = ungroupRow(superset(), 'r_1', LIBRARY, sequentialIds());
    assert.deepEqual(outline(result), [
      { id: 'b_new001', kind: 'single', sets: 4, restSeconds: 120, rows: ['r_1'] },
      { id: 'b_1', kind: 'single', sets: 4, restSeconds: 60, rows: ['r_2'] },
    ]);
  });

  test('diğer satır grubun arkasına gider', () => {
    const result = ungroupRow(superset(), 'r_2', LIBRARY, sequentialIds());
    assert.deepEqual(result.map((item) => [item.id, item.rows[0]?.id]), [
      ['b_1', 'r_1'],
      ['b_new001', 'r_2'],
    ]);
  });

  test('3 hareketli devreden çıkan: süperset + tek', () => {
    const blocks = [block('b_1', 'circuit', [row('r_1', 'squat'), row('r_2', 'curl'), row('r_3', 'plank')], { transitionSeconds: 15 })];
    const result = ungroupRow(blocks, 'r_2', LIBRARY, sequentialIds());
    assert.deepEqual(result.map((item) => item.kind), ['superset', 'single']);
    assert.deepEqual(rowIds(result), [['r_1', 'r_3'], ['r_2']]);
    assert.equal('transitionSeconds' in (result[0] ?? {}), false);
  });

  test('farklı set sayıları dağıtılınca her hareket kendi setiyle', () => {
    const blocks = [block('b_1', 'superset', [row('r_1', 'squat', { count: 4 }), row('r_2', 'curl', { count: 2 })])];
    assert.deepEqual(
      dissolveGroup(blocks, 'b_1', LIBRARY, sequentialIds()).map((item) => item.rows[0]?.sets.length),
      [4, 2],
    );
  });

  test('grubu dağıtma: her satır yerinde tek hareket, ilki grubun kimliğiyle', () => {
    const blocks = [
      block('b_0', 'single', [row('r_0', 'plank')]),
      block('b_1', 'circuit', [row('r_1', 'squat'), row('r_2', 'curl'), row('r_3', 'silinmis')], { sets: 2, transitionSeconds: 15 }),
    ];
    const result = dissolveGroup(blocks, 'b_1', LIBRARY, sequentialIds());
    assert.deepEqual(
      result.map(({ id, kind, restSeconds, rows }) => ({ id, kind, sets: roundsOf({ rows }), restSeconds })),
      [
        { id: 'b_0', kind: 'single', sets: 3, restSeconds: 90 },
        { id: 'b_1', kind: 'single', sets: 2, restSeconds: 120 },
        { id: 'b_new001', kind: 'single', sets: 2, restSeconds: 60 },
        { id: 'b_new002', kind: 'single', sets: 2, restSeconds: 90 },
      ],
    );
  });
});

describe('taşıma (sürükle-bırak ve klavye)', () => {
  const list = () => [
    block('b_1', 'single', [row('r_1', 'squat')], { restSeconds: 150 }),
    block('b_2', 'superset', [row('r_2', 'curl'), row('r_3', 'halter-bench', { count: 4 })], { restSeconds: 75 }),
    block('b_3', 'single', [row('r_4', 'plank')]),
    block('b_4', 'circuit', [row('r_5', 'squat'), row('r_6', 'curl'), row('r_7', 'plank')], { restSeconds: 100, transitionSeconds: 20 }),
  ];
  const move = (blocks: TemplateBlock[], id: string, destination: MoveDestination) => moveItem(blocks, id, destination, LIBRARY, sequentialIds());
  const order = (blocks: TemplateBlock[]) => blocks.map((item) => item.id);

  test('üst düzeyde sıralama: boşluk şu anki listede; tekin blok ve satır kimliği aynı öğe', () => {
    const blocks = list();
    assert.deepEqual(order(move(blocks, 'b_1', { at: 'top', index: 3 })), ['b_2', 'b_3', 'b_1', 'b_4']);
    assert.deepEqual(order(move(blocks, 'r_1', { at: 'top', index: 3 })), ['b_2', 'b_3', 'b_1', 'b_4']);
    assert.deepEqual(order(move(blocks, 'b_3', { at: 'top', index: 0 })), ['b_3', 'b_1', 'b_2', 'b_4']);
    assert.deepEqual(order(move(blocks, 'b_1', { at: 'top', index: 4 })), ['b_2', 'b_3', 'b_4', 'b_1']);
    const groupFirst = move(blocks, 'b_4', { at: 'top', index: 0 });
    assert.deepEqual(order(groupFirst), ['b_4', 'b_1', 'b_2', 'b_3']);
    assert.equal(groupFirst[0], blocks[3]);
  });

  test('kendi yanındaki boşluk: yerinde kalır, aynı dizi', () => {
    const blocks = list();
    assert.equal(moveCheck(blocks, 'b_2', { at: 'top', index: 1 }), 'same');
    assert.equal(moveCheck(blocks, 'b_2', { at: 'top', index: 2 }), 'same');
    assert.equal(moveCheck(blocks, 'b_2', { at: 'top', index: 3 }), 'ok');
    assert.equal(move(blocks, 'b_2', { at: 'top', index: 2 }), blocks);
    assert.equal(moveCheck(blocks, 'r_6', { at: 'group', blockId: 'b_4', index: 1 }), 'same');
    assert.equal(moveCheck(blocks, 'r_6', { at: 'group', blockId: 'b_4', index: 2 }), 'same');
    assert.equal(move(blocks, 'r_6', { at: 'group', blockId: 'b_4', index: 1 }), blocks);
  });

  test('grup gruba girmez; hedef grup değilse, öğe ya da boşluk yoksa olmaz', () => {
    const blocks = list();
    const rejected: [string, MoveDestination][] = [
      ['b_2', { at: 'group', blockId: 'b_4', index: 0 }],
      ['b_4', { at: 'group', blockId: 'b_2', index: 2 }],
      ['r_1', { at: 'group', blockId: 'b_3', index: 0 }],
      ['r_1', { at: 'group', blockId: 'b_x', index: 0 }],
      ['r_1', { at: 'group', blockId: 'b_4', index: 4 }],
      ['r_1', { at: 'top', index: -1 }],
      ['r_1', { at: 'top', index: 5 }],
      ['r_1', { at: 'top', index: 1.5 }],
      ['r_x', { at: 'top', index: 0 }],
    ];
    for (const [id, destination] of rejected) {
      assert.equal(moveCheck(blocks, id, destination), 'not_allowed', `${id} → ${JSON.stringify(destination)}`);
      assert.equal(move(blocks, id, destination), blocks);
    }
  });

  test('üye kendi grubunda sıralanır; grubun ayarları ve öteki bloklar aynı', () => {
    const blocks = list();
    const last = move(blocks, 'r_5', { at: 'group', blockId: 'b_4', index: 3 });
    assert.deepEqual(rowIds(last)[3], ['r_6', 'r_7', 'r_5']);
    assert.deepEqual({ kind: last[3]?.kind, rest: last[3]?.restSeconds, transition: last[3]?.transitionSeconds }, { kind: 'circuit', rest: 100, transition: 20 });
    assert.deepEqual(rowIds(move(blocks, 'r_7', { at: 'group', blockId: 'b_4', index: 0 }))[3], ['r_7', 'r_5', 'r_6']);
    assert.deepEqual(rowIds(move(blocks, 'r_3', { at: 'group', blockId: 'b_2', index: 0 }))[1], ['r_3', 'r_2']);
    for (const index of [0, 1, 2]) assert.equal(last[index], blocks[index]);
  });

  test('üst düzeye giden üye gruptan çıkar: yeni kimlikli tek; kalan süperset tekleşir', () => {
    const blocks = list();
    assert.deepEqual(outline(move(blocks, 'r_3', { at: 'top', index: 0 })), [
      { id: 'b_new001', kind: 'single', sets: 4, restSeconds: 120, rows: ['r_3'] },
      { id: 'b_1', kind: 'single', sets: 3, restSeconds: 150, rows: ['r_1'] },
      { id: 'b_2', kind: 'single', sets: 3, restSeconds: 60, rows: ['r_2'] },
      { id: 'b_3', kind: 'single', sets: 3, restSeconds: 90, rows: ['r_4'] },
      { id: 'b_4', kind: 'circuit', sets: 3, restSeconds: 100, rows: ['r_5', 'r_6', 'r_7'] },
    ]);
    // Grubun hemen önü ve arkası da üst düzey boşluktur.
    assert.deepEqual(shape(move(blocks, 'r_2', { at: 'top', index: 1 })).slice(0, 3), ['single:r_1', 'single:r_2', 'single:r_3']);
    assert.deepEqual(order(move(blocks, 'r_2', { at: 'top', index: 2 })), ['b_1', 'b_2', 'b_new001', 'b_3', 'b_4']);
    assert.deepEqual(order(move(blocks, 'r_2', { at: 'top', index: 4 })), ['b_1', 'b_2', 'b_3', 'b_4', 'b_new001']);
    assert.equal(moveCheck(blocks, 'r_2', { at: 'top', index: 1 }), 'ok');
  });

  test('devreden çıkan: devre 3 süperset olur, geçiş kalkar, dinlenme kalır', () => {
    const result = move(list(), 'r_6', { at: 'top', index: 4 });
    const circuit = result[3];
    assert.deepEqual({ id: circuit?.id, kind: circuit?.kind, rest: circuit?.restSeconds, rows: circuit?.rows.map((r) => r.id) }, {
      id: 'b_4',
      kind: 'superset',
      rest: 100,
      rows: ['r_5', 'r_7'],
    });
    assert.equal('transitionSeconds' in (circuit ?? {}), false);
    assert.deepEqual(outline(result).at(-1), { id: 'b_new001', kind: 'single', sets: 3, restSeconds: 60, rows: ['r_6'] });
  });

  test('tek hareket grubun içine: katılır, grubun ayarları kalır, tür uyar; tekin bloğu gider', () => {
    const blocks = list();
    const result = move(blocks, 'r_1', { at: 'group', blockId: 'b_2', index: 1 });
    assert.deepEqual(outline(result), [
      { id: 'b_2', kind: 'circuit', sets: 4, restSeconds: 75, rows: ['r_2', 'r_1', 'r_3'] },
      { id: 'b_3', kind: 'single', sets: 3, restSeconds: 90, rows: ['r_4'] },
      { id: 'b_4', kind: 'circuit', sets: 3, restSeconds: 100, rows: ['r_5', 'r_6', 'r_7'] },
    ]);
    assert.equal(result[0]?.transitionSeconds, 15);
    assert.equal(result[0]?.rows[1], blocks[0]?.rows[0]);
    const intoCircuit = move(blocks, 'b_3', { at: 'group', blockId: 'b_4', index: 0 });
    assert.deepEqual(shape(intoCircuit), ['single:r_1', 'superset:r_2,r_3', 'circuit:r_4,r_5,r_6,r_7']);
    assert.equal(intoCircuit[2]?.transitionSeconds, 20);

    const complex = [block('b_k', 'complex', Array.from({ length: 6 }, (_, i) => row(`r_k${i}`, 'squat'))), block('b_s', 'single', [row('r_s', 'curl')])];
    const seven = move(complex, 'r_s', { at: 'group', blockId: 'b_k', index: 6 });
    assert.deepEqual({ kind: seven[0]?.kind, rows: seven[0]?.rows.length, transition: seven[0]?.transitionSeconds, blocks: seven.length }, {
      kind: 'circuit',
      rows: 7,
      transition: 15,
      blocks: 1,
    });
  });

  test('üye başka gruba: ayrıldığı küçülür, katıldığı büyür; 8 hareketli gruba giremez', () => {
    const blocks = list();
    const result = move(blocks, 'r_2', { at: 'group', blockId: 'b_4', index: 3 });
    assert.deepEqual(outline(result), [
      { id: 'b_1', kind: 'single', sets: 3, restSeconds: 150, rows: ['r_1'] },
      { id: 'b_2', kind: 'single', sets: 4, restSeconds: 120, rows: ['r_3'] },
      { id: 'b_3', kind: 'single', sets: 3, restSeconds: 90, rows: ['r_4'] },
      { id: 'b_4', kind: 'circuit', sets: 3, restSeconds: 100, rows: ['r_5', 'r_6', 'r_7', 'r_2'] },
    ]);

    const full = [...circuits(1, 8), ...list()];
    assert.equal(moveCheck(full, 'r_1', { at: 'group', blockId: 'b_c0', index: 0 }), 'full');
    assert.equal(moveCheck(full, 'r_5', { at: 'group', blockId: 'b_c0', index: 8 }), 'full');
    assert.equal(move(full, 'r_5', { at: 'group', blockId: 'b_c0', index: 8 }), full);
    // Dolu grubun içinde sıralama olur.
    assert.equal(moveCheck(full, 'r_c0_0', { at: 'group', blockId: 'b_c0', index: 8 }), 'ok');
  });

  test('30 blokta gruptan çıkılamaz; gruba katılmak olur', () => {
    const blocks = [...singles(29), block('b_s', 'superset', [row('r_a', 'squat'), row('r_b', 'curl')])];
    assert.equal(moveCheck(blocks, 'r_a', { at: 'top', index: 0 }), 'limit');
    assert.equal(move(blocks, 'r_a', { at: 'top', index: 0 }), blocks);
    assert.equal(moveCheck(blocks, 'b_s', { at: 'top', index: 0 }), 'ok');
    assert.equal(move(blocks, 'r_0', { at: 'group', blockId: 'b_s', index: 2 }).length, 29);
  });

  test('klavye: grup ve tek üst düzeyde, üye kendi grubunda kayar (moveKey ile aynı)', () => {
    const blocks = list();
    assert.deepEqual(stepDestination(blocks, 'b_2', 'up'), { at: 'top', index: 0 });
    assert.deepEqual(stepDestination(blocks, 'b_2', 'down'), { at: 'top', index: 3 });
    assert.deepEqual(stepDestination(blocks, 'r_1', 'end'), { at: 'top', index: 4 });
    assert.deepEqual(stepDestination(blocks, 'r_6', 'up'), { at: 'group', blockId: 'b_4', index: 0 });
    assert.deepEqual(stepDestination(blocks, 'r_5', 'end'), { at: 'group', blockId: 'b_4', index: 3 });
    assert.equal(stepDestination(blocks, 'r_1', 'up'), null);
    assert.equal(stepDestination(blocks, 'b_4', 'end'), null);
    assert.equal(stepDestination(blocks, 'r_2', 'up'), null);
    assert.equal(stepDestination(blocks, 'r_x', 'up'), null);

    for (const target of ['up', 'down', 'top', 'end'] as const) {
      for (const item of blocks) {
        const destination = stepDestination(blocks, item.id, target);
        const result = destination ? move(blocks, item.id, destination) : blocks;
        assert.deepEqual(order(result), [...moveKey(order(blocks), item.id, target)], `${item.id} ${target}`);
      }
      const members = blocks[3]?.rows.map((r) => r.id) ?? [];
      for (const id of members) {
        const destination = stepDestination(blocks, id, target);
        const result = destination ? move(blocks, id, destination) : blocks;
        assert.deepEqual(rowIds(result)[3], [...moveKey(members, id, target)], `${id} ${target}`);
      }
    }
  });
});

describe('üstüne bırakıp gruplama', () => {
  const combine = (blocks: TemplateBlock[], sourceId: string, targetId: string) => combineInto(blocks, sourceId, targetId, LIBRARY);

  test('tekin üstüne tek: süperset; hedef önde ve yerinde, kimliği hedefin, dinlenme 90', () => {
    const blocks = [
      block('b_1', 'single', [row('r_1', 'squat')], { sets: 4, restSeconds: 150 }),
      block('b_2', 'single', [row('r_2', 'curl')]),
      block('b_3', 'single', [row('r_3', 'plank')], { sets: 2 }),
    ];
    assert.equal(combineOutcome(blocks, 'b_3', 'b_1'), 'superset');
    assert.deepEqual(combine(blocks, 'b_3', 'b_1'), [
      { id: 'b_1', kind: 'superset', restSeconds: 90, rows: [row('r_1', 'squat', { count: 4 }), row('r_3', 'plank', { count: 2 })] },
      blocks[1],
    ]);
    // Satır kimlikleriyle de; bırakılan öndeyse hedefin yerine geçer.
    assert.deepEqual(shape(combine(blocks, 'r_1', 'r_2')), ['superset:r_2,r_1', 'single:r_3']);
    assert.equal(combine(blocks, 'r_1', 'r_2')[0]?.id, 'b_2');
  });

  test('sonuç hapı: süperset, devre olur, gruba ekle, dolu, olmaz', () => {
    const blocks = [
      block('b_1', 'single', [row('r_1', 'squat')]),
      block('b_2', 'superset', [row('r_2', 'curl'), row('r_3', 'plank')]),
      block('b_3', 'circuit', [row('r_4', 'squat'), row('r_5', 'curl'), row('r_6', 'plank')], { transitionSeconds: 15 }),
      block('b_4', 'complex', Array.from({ length: 6 }, (_, i) => row(`r_k${i}`, 'squat'))),
      block('b_5', 'complex', Array.from({ length: 3 }, (_, i) => row(`r_m${i}`, 'squat'))),
      ...circuits(1, 8),
      block('b_6', 'single', [row('r_9', 'curl')]),
    ];
    const cases: [string, string, string][] = [
      ['r_1', 'b_6', 'superset'],
      ['r_1', 'r_9', 'superset'],
      ['r_2', 'b_6', 'superset'],
      ['r_1', 'b_2', 'becomes_circuit'],
      ['r_1', 'r_3', 'becomes_circuit'],
      ['r_1', 'b_3', 'join'],
      ['r_2', 'r_5', 'join'],
      ['r_1', 'b_4', 'becomes_circuit'],
      ['r_1', 'b_5', 'join'],
      ['r_1', 'b_c0', 'full'],
      ['r_4', 'r_c0_3', 'full'],
      ['b_2', 'b_6', 'not_allowed'],
      ['b_2', 'b_3', 'not_allowed'],
      ['b_3', 'r_1', 'not_allowed'],
      ['r_1', 'r_1', 'not_allowed'],
      ['r_1', 'b_1', 'not_allowed'],
      ['r_2', 'b_2', 'not_allowed'],
      ['r_2', 'r_3', 'not_allowed'],
      ['r_x', 'b_1', 'not_allowed'],
      ['r_1', 'b_x', 'not_allowed'],
    ];
    for (const [source, target, expected] of cases) {
      assert.equal(combineOutcome(blocks, source, target), expected, `${source} → ${target}`);
      const result = combine(blocks, source, target);
      if (expected === 'full' || expected === 'not_allowed') assert.equal(result, blocks, `${source} → ${target}`);
      else assert.deepEqual(duplicateIds(result), []);
    }
  });

  test('süpersetin üstüne: devre olur, bırakılan sona, grubun ayarları; her hareket kendi setiyle', () => {
    const blocks = [
      block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')], { sets: 4, restSeconds: 75 }),
      block('b_2', 'single', [row('r_3', 'plank')], { sets: 2, restSeconds: 30 }),
    ];
    const [result, ...others] = combine(blocks, 'b_2', 'b_1');
    assert.deepEqual(others, []);
    assert.deepEqual(
      { id: result?.id, kind: result?.kind, rest: result?.restSeconds, transition: result?.transitionSeconds, sets: result?.rows.map((r) => r.sets.length) },
      { id: 'b_1', kind: 'circuit', rest: 75, transition: 15, sets: [4, 4, 2] },
    );
    assert.deepEqual(rowIds([result as TemplateBlock]), [['r_1', 'r_2', 'r_3']]);
  });

  test('üyenin üstüne: o üyenin arkasına; grup yüzüne: sona; ayrılan grup küçülür', () => {
    const blocks = [
      block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')]),
      block('b_2', 'circuit', [row('r_3', 'squat'), row('r_4', 'curl'), row('r_5', 'plank')], { transitionSeconds: 20 }),
    ];
    const onMember = combine(blocks, 'r_1', 'r_3');
    assert.deepEqual(outline(onMember), [
      { id: 'b_1', kind: 'single', sets: 3, restSeconds: 60, rows: ['r_2'] },
      { id: 'b_2', kind: 'circuit', sets: 3, restSeconds: 90, rows: ['r_3', 'r_1', 'r_4', 'r_5'] },
    ]);
    assert.equal(onMember[1]?.transitionSeconds, 20);
    assert.deepEqual(shape(combine(blocks, 'r_2', 'b_2')), ['single:r_1', 'circuit:r_3,r_4,r_5,r_2']);
    assert.deepEqual(shape(combine(blocks, 'r_4', 'r_2')), ['circuit:r_1,r_2,r_4', 'superset:r_3,r_5']);
  });

  test('üye tekin üstüne: süperset; ayrıldığı devre süperset olur', () => {
    const blocks = [
      block('b_1', 'circuit', [row('r_1', 'squat'), row('r_2', 'curl'), row('r_3', 'plank')], { transitionSeconds: 15 }),
      block('b_2', 'single', [row('r_4', 'halter-bench')]),
    ];
    const result = combine(blocks, 'r_2', 'b_2');
    assert.deepEqual(shape(result), ['superset:r_1,r_3', 'superset:r_4,r_2']);
    assert.equal('transitionSeconds' in (result[0] ?? {}), false);
    assert.equal(result[1]?.restSeconds, 90);
  });

  test('6 hareketli komplekse 7. hareket: devre olur', () => {
    const blocks = [block('b_1', 'single', [row('r_1', 'squat')]), block('b_4', 'complex', Array.from({ length: 6 }, (_, i) => row(`r_k${i}`, 'squat')))];
    const [result] = combine(blocks, 'r_1', 'b_4');
    assert.deepEqual({ kind: result?.kind, rows: result?.rows.length, transition: result?.transitionSeconds }, { kind: 'circuit', rows: 7, transition: 15 });
  });
});

describe('seçim modu: gruplama, kopyalama, silme', () => {
  test('seçilen sayıya göre tür: 2 süperset, 3–8 devre', () => {
    assert.deepEqual([0, 1, 2, 3, 8, 9].map(newGroupKind), [null, null, 'superset', 'circuit', 'circuit', null]);
  });

  test('gruplanır mı: 2 süperset, 3–8 devre; az, çok, grup var', () => {
    const blocks = [...singles(9), block('b_g', 'superset', [row('r_g1', 'squat'), row('r_g2', 'curl')])];
    assert.equal(groupCheck(blocks, []), 'too_few');
    assert.equal(groupCheck(blocks, ['b_0']), 'too_few');
    assert.equal(groupCheck(blocks, ['b_0', 'b_1']), 'superset');
    assert.equal(groupCheck(blocks, ['b_0', 'b_1', 'b_2']), 'circuit');
    assert.equal(groupCheck(blocks, ['b_0', 'b_1', 'b_2', 'b_3', 'b_4', 'b_5', 'b_6', 'b_7']), 'circuit');
    assert.equal(groupCheck(blocks, ['b_0', 'b_1', 'b_2', 'b_3', 'b_4', 'b_5', 'b_6', 'b_7', 'b_8']), 'too_many');
    assert.equal(groupCheck(blocks, ['b_0', 'b_g']), 'not_singles');
  });

  test('bilinmeyen kimlik yok sayılır, aynı kimlik bir kez sayılır', () => {
    const blocks = singles(3);
    assert.equal(groupCheck(blocks, ['b_0', 'b_0', 'b_x']), 'too_few');
    assert.equal(groupCheck(blocks, ['b_0', 'b_x', 'b_2', 'b_2']), 'superset');
  });

  test('2 tek → süperset: ilk seçilenin yerinde ve kimliğiyle, liste sırasıyla, dinlenme 90', () => {
    const blocks = [
      block('b_0', 'single', [row('r_0', 'squat', { note: 'Diz dışa', rule: { scheme: 'linear', targetRir: 2 } })], { restSeconds: 180 }),
      block('b_1', 'single', [row('r_1', 'curl', { count: 4 })]),
      block('b_2', 'single', [row('r_2', 'plank')]),
    ];
    // Dokunma sırası tersine: liste sırası geçer.
    const result = groupBlocks(blocks, ['b_2', 'b_0']);
    assert.deepEqual(shape(result), ['superset:r_0,r_2', 'single:r_1']);
    const group = result[0] as TemplateBlock;
    assert.deepEqual(
      { id: group.id, rest: group.restSeconds, transition: group.transitionSeconds, rounds: roundsOf(group) },
      { id: 'b_0', rest: 90, transition: undefined, rounds: 3 },
    );
    // Satırlar olduğu gibi: kimlik, setler, kural, not.
    assert.equal(group.rows[0], blocks[0]?.rows[0]);
    assert.equal(group.rows[1], blocks[2]?.rows[0]);
    assert.equal(result[1], blocks[1]);
  });

  test('bitişik olmayan 3 tek → devre (120 sn, geçiş 15); tur en çok set', () => {
    const blocks = [
      block('b_0', 'single', [row('r_0', 'squat')]),
      block('b_1', 'single', [row('r_1', 'curl', { count: 5 })]),
      block('b_g', 'superset', [row('r_g1', 'squat'), row('r_g2', 'curl')]),
      block('b_3', 'single', [row('r_3', 'plank')]),
      block('b_4', 'single', [row('r_4', 'squat')]),
    ];
    const result = groupBlocks(blocks, ['b_4', 'b_1', 'b_3']);
    assert.deepEqual(shape(result), ['single:r_0', 'circuit:r_1,r_3,r_4', 'superset:r_g1,r_g2']);
    const group = result[1] as TemplateBlock;
    assert.deepEqual(
      { id: group.id, rest: group.restSeconds, transition: group.transitionSeconds, rounds: roundsOf(group) },
      { id: 'b_1', rest: 120, transition: 15, rounds: 5 },
    );
    assert.deepEqual(duplicateIds(result), []);
  });

  test('8 tek devre olur; 9 tek, 1 tek ya da seçimde grup: aynı dizi', () => {
    const blocks = [...singles(9), block('b_g', 'superset', [row('r_g1', 'squat'), row('r_g2', 'curl')])];
    const eight = groupBlocks(blocks, blocks.slice(0, 8).map((item) => item.id));
    assert.deepEqual(shape(eight).slice(0, 2), ['circuit:r_0,r_1,r_2,r_3,r_4,r_5,r_6,r_7', 'single:r_8']);
    assert.equal(groupBlocks(blocks, blocks.slice(0, 9).map((item) => item.id)), blocks);
    assert.equal(groupBlocks(blocks, ['b_0']), blocks);
    assert.equal(groupBlocks(blocks, ['b_0', 'b_g']), blocks);
    assert.equal(groupBlocks(blocks, []), blocks);
  });

  test('kopyalama: liste sırasıyla son seçilenin arkasına, yeni kimliklerle, aynı ayarlarla', () => {
    const blocks = [
      block('b_0', 'single', [row('r_0', 'squat')], { restSeconds: 150 }),
      block('b_g', 'circuit', [row('r_g1', 'squat'), row('r_g2', 'curl'), row('r_g3', 'plank')], { transitionSeconds: 20 }),
      block('b_2', 'single', [row('r_2', 'curl')]),
      block('b_3', 'single', [row('r_3', 'plank')]),
    ];
    const result = duplicateBlocks(blocks, ['b_2', 'b_0', 'b_g', 'b_x'], sequentialIds());
    assert.deepEqual(shape(result), [
      'single:r_0',
      'circuit:r_g1,r_g2,r_g3',
      'single:r_2',
      'single:r_new002',
      'circuit:r_new004,r_new005,r_new006',
      'single:r_new008',
      'single:r_3',
    ]);
    assert.deepEqual(
      result.slice(3, 6).map((item) => ({ id: item.id, rest: item.restSeconds, transition: item.transitionSeconds })),
      [
        { id: 'b_new001', rest: 150, transition: undefined },
        { id: 'b_new003', rest: 90, transition: 20 },
        { id: 'b_new007', rest: 90, transition: undefined },
      ],
    );
    assert.deepEqual(result[4]?.rows.map((item) => item.exerciseId), ['squat', 'curl', 'plank']);
    // Kopya bağımsız: setler ayrı nesne.
    assert.notEqual(result[3]?.rows[0]?.sets, blocks[0]?.rows[0]?.sets);
    assert.deepEqual(result[3]?.rows[0]?.sets, blocks[0]?.rows[0]?.sets);
    assert.deepEqual(duplicateIds(duplicateBlocks(blocks, ['b_0', 'b_g'], idSource(blocks))), []);
  });

  test('kopya sığmazsa (30 blok, 40 hareket) ya da seçim boşsa aynı dizi', () => {
    const blocks = singles(3);
    assert.equal(canDuplicateBlocks(blocks, []), false);
    assert.equal(duplicateBlocks(blocks, ['b_x'], sequentialIds()), blocks);

    const twentyNine = singles(29);
    assert.equal(canDuplicateBlocks(twentyNine, ['b_0']), true);
    assert.equal(duplicateBlocks(twentyNine, ['b_0'], sequentialIds()).length, 30);
    assert.equal(canDuplicateBlocks(twentyNine, ['b_0', 'b_1']), false);
    assert.equal(duplicateBlocks(twentyNine, ['b_0', 'b_1'], sequentialIds()), twentyNine);

    const rows37 = [...circuits(4, 8), block('b_5', 'circuit', Array.from({ length: 5 }, (_, i) => row(`r_5${i}`, 'squat')))];
    assert.equal(countRows(rows37), 37);
    assert.equal(canDuplicateBlocks(rows37, ['b_c0']), false);
    assert.equal(canDuplicateBlocks(rows37, ['b_5']), false);
    const rows35 = [...circuits(4, 8), block('b_3', 'circuit', Array.from({ length: 3 }, (_, i) => row(`r_3${i}`, 'squat')))];
    assert.equal(canDuplicateBlocks(rows35, ['b_3']), true);
    assert.equal(countRows(duplicateBlocks(rows35, ['b_3'], sequentialIds())), 38);
  });

  test('silme: seçili bloklar bütün satırlarıyla gider; hiçbiri yoksa aynı dizi', () => {
    const blocks = [
      block('b_0', 'single', [row('r_0', 'squat')]),
      block('b_g', 'superset', [row('r_g1', 'squat'), row('r_g2', 'curl')]),
      block('b_2', 'single', [row('r_2', 'curl')]),
    ];
    assert.deepEqual(shape(removeBlocks(blocks, ['b_g', 'b_0'])), ['single:r_2']);
    assert.deepEqual(removeBlocks(blocks, ['b_0', 'b_g', 'b_2']), []);
    assert.equal(removeBlocks(blocks, ['b_x']), blocks);
    assert.equal(removeBlocks(blocks, []), blocks);
  });
});

describe('gruba ekleme', () => {
  test('gruba ekleme: sona, setleri türüne göre; süperset devre olur', () => {
    const blocks = [block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')], { restSeconds: 75 })];
    assert.equal(addToGroupOutcome(blocks, 'b_1'), 'becomes_circuit');
    const [result] = addToGroup(blocks, 'b_1', plank, sequentialIds());
    assert.deepEqual(
      { kind: result?.kind, rest: result?.restSeconds, transition: result?.transitionSeconds, rows: result?.rows.map((r) => r.id) },
      { kind: 'circuit', rest: 75, transition: 15, rows: ['r_1', 'r_2', 'r_new001'] },
    );
    assert.deepEqual(result?.rows[2], { id: 'r_new001', exerciseId: 'plank', sets: uniformSets({ min: 30, max: 60 }, 3) });
  });

  test('gruba ekleme sonuçları: katılır, devre olur, dolu, sınır, olmaz', () => {
    const blocks = [
      block('b_1', 'single', [row('r_1', 'squat')]),
      block('b_3', 'circuit', [row('r_4', 'squat'), row('r_5', 'curl'), row('r_6', 'plank')], { transitionSeconds: 15 }),
      block('b_4', 'complex', Array.from({ length: 6 }, (_, i) => row(`r_k${i}`, 'squat'))),
      block('b_5', 'complex', Array.from({ length: 3 }, (_, i) => row(`r_m${i}`, 'squat'))),
      ...circuits(1, 8),
    ];
    assert.deepEqual(
      ['b_3', 'b_4', 'b_5', 'b_c0', 'b_1', 'b_x'].map((id) => addToGroupOutcome(blocks, id)),
      ['join', 'becomes_circuit', 'join', 'full', 'not_allowed', 'not_allowed'],
    );
    assert.equal(addToGroup(blocks, 'b_4', curl, sequentialIds())[2]?.kind, 'circuit');
    assert.equal(addToGroup(blocks, 'b_5', curl, sequentialIds())[3]?.kind, 'complex');
    for (const id of ['b_c0', 'b_1', 'b_x']) assert.equal(addToGroup(blocks, id, curl, sequentialIds()), blocks);

    const forty = [...circuits(4, 8), block('b_7', 'circuit', Array.from({ length: 7 }, (_, i) => row(`r_7${i}`, 'squat'))), block('b_8', 'single', [row('r_8', 'curl')])];
    assert.equal(countRows(forty), 40);
    assert.equal(addToGroupOutcome(forty, 'b_7'), 'limit');
    assert.equal(addToGroup(forty, 'b_7', curl, sequentialIds()), forty);
  });
});

describe('tür değiştirme', () => {
  test('süperset → kompleks olur; süperset → devre olmaz', () => {
    const blocks = [block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')])];
    assert.equal(changeKind(blocks, 'b_1', 'complex')[0]?.kind, 'complex');
    assert.equal(changeKind(blocks, 'b_1', 'circuit')[0]?.kind, 'superset');
  });

  test('devre (3) → kompleks olur, geçiş kalkar; devre (7) → kompleks olmaz', () => {
    const three = [block('b_1', 'circuit', [row('r_1', 'squat'), row('r_2', 'curl'), row('r_3', 'plank')], { transitionSeconds: 15 })];
    const result = changeKind(three, 'b_1', 'complex')[0];
    assert.equal(result?.kind, 'complex');
    assert.equal('transitionSeconds' in (result ?? {}), false);
    assert.equal(changeKind(changeKind(three, 'b_1', 'complex'), 'b_1', 'circuit')[0]?.transitionSeconds, 15);
    const seven = [block('b_2', 'circuit', Array.from({ length: 7 }, (_, i) => row(`r_${i}`, 'squat')), { transitionSeconds: 15 })];
    assert.equal(changeKind(seven, 'b_2', 'complex')[0]?.kind, 'circuit');
  });
});

describe('cihaz değiştirme', () => {
  test('halter bench → dambıl seti: aynı kalıptaki dambıl bench', () => {
    const result = swapDevice(row('r_1', 'halter-bench', { target: { min: 5, max: 8 }, note: 'Yavaş' }), 'dambil-seti', SWAP);
    assert.deepEqual(result, {
      kind: 'swapped',
      from: 'halter-bench',
      to: 'dambil-bench',
      row: { id: 'r_1', exerciseId: 'dambil-bench', sets: uniformSets({ min: 5, max: 8 }, 3), note: 'Yavaş' },
    });
  });

  test('lat pulldown A → B (B\'de egzersiz yok): aynı hareket, satıra cihaz yazılır', () => {
    assert.deepEqual(swapDevice(row('r_1', 'lat-pulldown'), 'lat-b', SWAP), {
      kind: 'device',
      row: row('r_1', 'lat-pulldown', { deviceId: 'lat-b' }),
    });
  });

  test('kablo → bar, muadil yok: seçilemez', () => {
    assert.deepEqual(swapDevice(row('r_1', 'pushdown'), 'olimpik-bar', SWAP), { kind: 'unavailable' });
  });

  test('kendi cihazı ya da boş seçim: değişiklik kalkar', () => {
    const changed = row('r_1', 'lat-pulldown', { deviceId: 'lat-b' });
    assert.deepEqual(swapDevice(changed, 'lat-a', SWAP), { kind: 'reset', row: row('r_1', 'lat-pulldown') });
    assert.deepEqual(swapDevice(changed, null, SWAP), { kind: 'reset', row: row('r_1', 'lat-pulldown') });
  });

  test('kütüphanede olmayan egzersiz: seçilemez', () => {
    assert.deepEqual(swapDevice(row('r_1', 'silinmis'), 'lat-b', SWAP), { kind: 'unavailable' });
  });

  test('kayıt türü değişirse hedef sıfırlanır, kural düşer', () => {
    const result = swapDevice(row('r_1', 'crunch-makine', { rule: { scheme: 'linear', targetRir: 1 }, deviceId: 'crunch-m' }), 'mat', SWAP);
    assert.deepEqual(result, {
      kind: 'swapped',
      from: 'crunch-makine',
      to: 'plank',
      row: { id: 'r_1', exerciseId: 'plank', sets: uniformSets({ min: 30, max: 60 }, 3) },
    });
  });

  test('cihaz listesi: seçilemeyenler çıkar, etiket sonucu söyler', () => {
    const choices = deviceChoices(row('r_1', 'halter-bench'), { ...SWAP, deviceList: DEVICE_LIST });
    assert.deepEqual(
      choices.map(({ deviceId, label, result }) => [deviceId, label, result.kind]),
      [
        ['olimpik-bar', 'Egzersizin cihazı: Olimpik bar', 'reset'],
        ['dambil-seti', 'Dambıl seti → Dambıl Bench Press', 'swapped'],
      ],
    );
    const pulldownChoices = deviceChoices(row('r_2', 'lat-pulldown'), { ...SWAP, deviceList: DEVICE_LIST });
    assert.ok(pulldownChoices.some((choice) => choice.deviceId === 'lat-b' && choice.label === 'Lat pulldown B'));
  });

  test('düzenlemeye açarken olmayan cihaz satırdan düşer', () => {
    const template = {
      blocks: [
        block('b_1', 'superset', [row('r_1', 'lat-pulldown', { deviceId: 'lat-b' }), row('r_2', 'lat-pulldown', { deviceId: 'eski-lat' })]),
      ],
    };
    const { blocks, droppedDeviceRowIds } = prepareForEditing(template, new Set(['lat-a', 'lat-b']));
    assert.deepEqual(droppedDeviceRowIds, ['r_2']);
    assert.equal(blocks[0]?.rows[0]?.deviceId, 'lat-b');
    assert.equal('deviceId' in (blocks[0]?.rows[1] ?? {}), false);
  });
});

describe('setler ve turlar', () => {
  const counts = (blocks: TemplateBlock[]) => blocks[0]?.rows.map((item) => item.sets.length);
  const pair = (a: number, b: number) => [block('b_1', 'superset', [row('r_1', 'squat', { count: a }), row('r_2', 'curl', { count: b })])];

  test('tur: turu dolduranlar yeni tura geçer, azı kendi sayısında kalır', () => {
    assert.deepEqual(counts(setRounds(pair(3, 3), 'b_1', 4)), [4, 4]);
    assert.deepEqual(counts(setRounds(pair(3, 2), 'b_1', 4)), [4, 2]);
    assert.deepEqual(counts(setRounds(pair(4, 2), 'b_1', 2)), [2, 2]);
    assert.deepEqual(counts(setRounds(pair(4, 2), 'b_1', 3)), [3, 2]);
    const same = pair(3, 3);
    assert.equal(setRounds(same, 'b_1', 3), same);
    assert.deepEqual(counts(setRounds(pair(3, 3), 'b_1', 50)), [10, 10]);
  });

  test('set sayısı: son set AMRAP son sette kalır; aynıysa aynı dizi', () => {
    const blocks = applySetPreset([block('b_1', 'single', [row('r_1', 'squat')])], 'r_1', 'lastAmrap');
    const more = setRowSetCount(blocks, 'r_1', 5);
    assert.equal(more[0]?.rows[0]?.sets.length, 5);
    assert.equal(setShape(more[0]?.rows[0]?.sets ?? []).amrap, 'last');
    assert.equal(setRowSetCount(blocks, 'r_1', 3), blocks);
  });

  test('hazır düzenler satırın setlerine uygulanır', () => {
    const blocks = [block('b_1', 'single', [row('r_1', 'squat')])];
    assert.equal(setShape(applySetPreset(blocks, 'r_1', 'pyramid')[0]?.rows[0]?.sets ?? []).kind, 'pyramid');
    assert.equal(setShape(applySetPreset(blocks, 'r_1', 'backoff')[0]?.rows[0]?.sets ?? []).kind, 'backoff');
    assert.equal(applySetPreset(blocks, 'r_1', 'straight'), blocks);
  });
});
