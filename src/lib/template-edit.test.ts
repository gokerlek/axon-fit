import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeviceKind } from './device-loads.ts';
import { resizeSets, setShape, uniformSets } from './set-plan.ts';
import {
  appendExercise,
  applySetPreset,
  canJoin,
  changeKind,
  deviceChoices,
  dissolveGroup,
  duplicateRow,
  idSource,
  joinBlocks,
  moveBlock,
  moveRowInGroup,
  prepareForEditing,
  removeRow,
  reorderBlocks,
  reorderRows,
  replaceExercise,
  setRounds,
  setRowSetCount,
  swapDevice,
  ungroupRow,
  type EditorExercise,
  type IdSource,
} from './template-edit.ts';
import {
  BLOCK_ID_PATTERN,
  ROW_ID_PATTERN,
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

  test('grupta kaynağın arkasına; süperset devre olur', () => {
    const blocks = [block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')])];
    const result = duplicateRow(blocks, 'r_1', sequentialIds());
    assert.deepEqual(rowIds(result), [['r_1', 'r_new001', 'r_2']]);
    assert.equal(result[0]?.kind, 'circuit');
    assert.equal(result[0]?.transitionSeconds, 15);
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
});

describe('sıralama', () => {
  const blocks = [
    block('b_1', 'single', [row('r_1', 'squat')]),
    block('b_2', 'superset', [row('r_2', 'curl'), row('r_3', 'halter-bench')]),
    block('b_3', 'single', [row('r_4', 'plank')]),
  ];

  test('kimlik sırasına dizer; bilinmeyen yok sayılır, eksik sona eklenir', () => {
    assert.deepEqual(reorderBlocks(blocks, ['b_3', 'b_1', 'b_2']).map((item) => item.id), ['b_3', 'b_1', 'b_2']);
    assert.deepEqual(reorderBlocks(blocks, ['b_x', 'b_2']).map((item) => item.id), ['b_2', 'b_1', 'b_3']);
    assert.equal(reorderBlocks(blocks, ['b_1', 'b_2', 'b_3']), blocks);
  });

  test('grubun içinde sıralama', () => {
    assert.deepEqual(rowIds(reorderRows(blocks, 'b_2', ['r_3', 'r_2']))[1], ['r_3', 'r_2']);
    assert.equal(reorderRows(blocks, 'b_2', ['r_2', 'r_3']), blocks);
  });

  test('yukarı/aşağı taşıma uçlarda değişmez', () => {
    assert.deepEqual(moveBlock(blocks, 'b_2', -1).map((item) => item.id), ['b_2', 'b_1', 'b_3']);
    assert.deepEqual(moveBlock(blocks, 'b_2', 1).map((item) => item.id), ['b_1', 'b_3', 'b_2']);
    assert.equal(moveBlock(blocks, 'b_1', -1), blocks);
    assert.equal(moveBlock(blocks, 'b_3', 1), blocks);
    assert.deepEqual(rowIds(moveRowInGroup(blocks, 'r_3', -1))[1], ['r_3', 'r_2']);
    assert.equal(moveRowInGroup(blocks, 'r_2', -1), blocks);
    assert.equal(moveRowInGroup(blocks, 'r_3', 1), blocks);
  });
});

describe('gruplama', () => {
  test('iki tek hareket süperset: her hareket kendi seti (tur = büyüğü), dinlenme 90, öncekinin kimliği', () => {
    const blocks = [
      block('b_1', 'single', [row('r_1', 'squat')], { sets: 4, restSeconds: 150 }),
      block('b_2', 'single', [row('r_2', 'curl')], { sets: 3, restSeconds: 60 }),
    ];
    const expected = [{ id: 'b_1', kind: 'superset', restSeconds: 90, rows: [row('r_1', 'squat', { count: 4 }), row('r_2', 'curl')] }];
    assert.deepEqual(joinBlocks(blocks, 'b_1', 'next'), expected);
    assert.deepEqual(joinBlocks(blocks, 'b_2', 'previous'), expected);
    assert.equal(roundsOf(joinBlocks(blocks, 'b_1', 'next')[0] as TemplateBlock), 4);
  });

  test('süperset + tek = devre (3), grubun ayarları, geçiş 15', () => {
    const blocks = [
      block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')], { sets: 4, restSeconds: 75 }),
      block('b_2', 'single', [row('r_3', 'plank')], { sets: 2, restSeconds: 30 }),
    ];
    const [result] = joinBlocks(blocks, 'b_2', 'previous');
    assert.deepEqual(
      { id: result?.id, kind: result?.kind, sets: roundsOf(result as TemplateBlock), rest: result?.restSeconds, transition: result?.transitionSeconds },
      { id: 'b_1', kind: 'circuit', sets: 4, rest: 75, transition: 15 },
    );
    assert.deepEqual(
      result?.rows.map((item) => item.sets.length),
      [4, 4, 2],
    );
    assert.deepEqual(rowIds(joinBlocks(blocks, 'b_2', 'previous')), [['r_1', 'r_2', 'r_3']]);
  });

  test('tek hareket öndeyse sıra korunur, kimlik öndekinin', () => {
    const blocks = [
      block('b_1', 'single', [row('r_1', 'squat')]),
      block('b_2', 'complex', [row('r_2', 'halter-bench'), row('r_3', 'squat')], { sets: 5, restSeconds: 180 }),
    ];
    const [result] = joinBlocks(blocks, 'b_1', 'next');
    assert.deepEqual(
      { id: result?.id, kind: result?.kind, sets: roundsOf(result as TemplateBlock), rest: result?.restSeconds, rows: result?.rows.map((r) => r.id) },
      { id: 'b_1', kind: 'complex', sets: 5, rest: 180, rows: ['r_1', 'r_2', 'r_3'] },
    );
  });

  test('iki grup: öncekinin ayarları, tür uyar; setler hareketlerde kalır', () => {
    const blocks = [
      block('b_1', 'superset', [row('r_1', 'squat'), row('r_2', 'curl')], { sets: 3, restSeconds: 60 }),
      block('b_2', 'superset', [row('r_3', 'plank'), row('r_4', 'halter-bench')], { sets: 5, restSeconds: 120 }),
    ];
    const [result] = joinBlocks(blocks, 'b_2', 'previous');
    assert.deepEqual(
      { id: result?.id, kind: result?.kind, rest: result?.restSeconds, rows: result?.rows.length },
      { id: 'b_1', kind: 'circuit', rest: 60, rows: 4 },
    );
    assert.deepEqual(
      result?.rows.map((item) => item.sets.length),
      [3, 3, 5, 5],
    );
  });

  test('komşu yoksa ya da 8 hareketi aşarsa gruplanmaz', () => {
    const big = block('b_2', 'circuit', Array.from({ length: 8 }, (_, i) => row(`r_${i}`, 'squat')), { transitionSeconds: 15 });
    const blocks = [block('b_1', 'single', [row('r_x', 'curl')]), big];
    assert.equal(canJoin(blocks, 'b_1', 'previous'), false);
    assert.equal(canJoin(blocks, 'b_1', 'next'), false);
    assert.equal(canJoin(blocks, 'b_2', 'next'), false);
    assert.equal(joinBlocks(blocks, 'b_1', 'next'), blocks);
    const complexSix = block('b_3', 'complex', Array.from({ length: 6 }, (_, i) => row(`r_c${i}`, 'squat')));
    const result = joinBlocks([complexSix, block('b_4', 'single', [row('r_y', 'curl')])], 'b_3', 'next');
    assert.equal(result[0]?.kind, 'circuit');
    assert.equal(canJoin([block('b_1', 'single', [row('r_1', 'squat')]), block('b_2', 'single', [row('r_2', 'curl')])], 'b_1', 'next'), true);
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
