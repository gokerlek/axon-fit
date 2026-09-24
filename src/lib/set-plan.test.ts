import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backoffPreset,
  formatSets,
  isStraight,
  pyramidPreset,
  referenceSet,
  removeSetAt,
  resizeSets,
  setShape,
  setsText,
  straightPreset,
  toggleLastAmrap,
  uniformSets,
  type SetSpec,
} from './set-plan.ts';

const three = uniformSets({ min: 8, max: 12 }, 3);
const lastAmrap: SetSpec[] = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12, amrap: true }];
const pyramid: SetSpec[] = [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10, loadPct: 90 }, { min: 8, max: 8 }];
const backoff: SetSpec[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 8, loadPct: 85 }];

describe('setlerin düzeni', () => {
  test('düz, piramit, back-off, serbest', () => {
    assert.deepEqual(setShape(three), { kind: 'straight', amrap: 'none' });
    assert.deepEqual(setShape(lastAmrap), { kind: 'straight', amrap: 'last' });
    assert.deepEqual(setShape(pyramid), { kind: 'pyramid', amrap: 'none' });
    assert.deepEqual(setShape(backoff), { kind: 'backoff', amrap: 'none' });
    // Yük artıyor ama tekrar azalmıyor: piramit değil.
    assert.equal(setShape([{ min: 8, max: 12, loadPct: 70 }, { min: 8, max: 12 }]).kind, 'custom');
    // Tekrar azalıyor ama yük aynı: piramit değil.
    assert.equal(setShape([{ min: 10, max: 10 }, { min: 8, max: 8 }, { min: 6, max: 6 }]).kind, 'custom');
  });

  test('tek set ve AMRAP durumları', () => {
    assert.deepEqual(setShape([{ min: 5, max: 5 }]), { kind: 'straight', amrap: 'none' });
    assert.deepEqual(setShape([{ min: 5, max: 5, amrap: true }]), { kind: 'straight', amrap: 'last' });
    assert.deepEqual(setShape(three.map((set) => ({ ...set, amrap: true }))), { kind: 'straight', amrap: 'all' });
    assert.equal(setShape([{ min: 8, max: 12, amrap: true }, { min: 8, max: 12 }]).amrap, 'some');
    assert.equal(isStraight(lastAmrap), true);
    assert.equal(isStraight(pyramid), false);
  });

  test('referans set: ilk tam yük seti', () => {
    assert.deepEqual(referenceSet(pyramid), { min: 8, max: 8 });
    assert.deepEqual(referenceSet(backoff), { min: 5, max: 5 });
    assert.deepEqual(referenceSet(three), { min: 8, max: 12 });
  });
});

describe('set sayısı', () => {
  test('artarken son set kopyalanır, azalırken baştan kalır', () => {
    assert.deepEqual(resizeSets(three, 4), uniformSets({ min: 8, max: 12 }, 4));
    const a = { min: 10, max: 10 };
    const b = { min: 9, max: 9 };
    const c = { min: 8, max: 8, amrap: true };
    assert.deepEqual(resizeSets([a, b, c], 2), [a, { ...b, amrap: true }]);
    assert.deepEqual(resizeSets([a, b, c], 5), [a, b, { min: 8, max: 8 }, { min: 8, max: 8 }, c]);
  });

  test('tam yükte set kalmazsa en ağırı tam yük olur', () => {
    const rising: SetSpec[] = [{ min: 10, max: 10, loadPct: 80 }, { min: 8, max: 8, loadPct: 90 }, { min: 6, max: 6 }];
    assert.deepEqual(resizeSets(rising, 2), [{ min: 10, max: 10, loadPct: 80 }, { min: 8, max: 8 }]);
  });

  test('tek AMRAP set çoğalınca AMRAP sonda kalır; 1–10 arası', () => {
    assert.deepEqual(resizeSets([{ min: 5, max: 5, amrap: true }], 3), [
      { min: 5, max: 5 },
      { min: 5, max: 5 },
      { min: 5, max: 5, amrap: true },
    ]);
    assert.equal(resizeSets(three, 0).length, 1);
    assert.equal(resizeSets(three, 25).length, 10);
  });

  test('set silme: tepe seti silinirse en ağır set tam yük; tek set silinmez', () => {
    assert.deepEqual(removeSetAt(pyramid, 2), [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10 }]);
    const only = [{ min: 5, max: 5 }];
    assert.equal(removeSetAt(only, 0), only);
  });
});

describe('hazır düzenler', () => {
  test('piramit', () => {
    assert.deepEqual(pyramidPreset(three), pyramid);
    assert.deepEqual(pyramidPreset([{ min: 5, max: 5 }]), [
      { min: 9, max: 9, loadPct: 80 },
      { min: 7, max: 7, loadPct: 90 },
      { min: 5, max: 5 },
    ]);
    const four = pyramidPreset(uniformSets({ min: 6, max: 10 }, 4));
    assert.deepEqual(
      four.map((set) => [set.min, set.max, set.loadPct]),
      [
        [12, 12, 70],
        [10, 10, 80],
        [8, 8, 90],
        [6, 6, undefined],
      ],
    );
    const six = pyramidPreset(uniformSets({ min: 8, max: 12 }, 6));
    assert.deepEqual(
      six.map((set) => set.max),
      [18, 16, 14, 12, 10, 8],
    );
    assert.deepEqual(
      six.map((set) => set.loadPct),
      [75, 80, 85, 90, 95, undefined],
    );
    assert.equal(setShape(six).kind, 'pyramid');
  });

  test('back-off', () => {
    assert.deepEqual(backoffPreset(uniformSets({ min: 5, max: 5 }, 3)), [
      { min: 5, max: 5 },
      { min: 5, max: 5, loadPct: 85 },
      { min: 5, max: 5, loadPct: 85 },
    ]);
    assert.equal(backoffPreset([{ min: 5, max: 5 }]).length, 3);
  });

  test('düz: referans setin aralığı, yüzde yok; son set AMRAP kalır', () => {
    assert.deepEqual(straightPreset(pyramid), uniformSets({ min: 8, max: 8 }, 3));
    assert.deepEqual(straightPreset(lastAmrap), lastAmrap);
    assert.equal(setShape(pyramidPreset(lastAmrap)).amrap, 'last');
  });

  test('son set AMRAP aç/kapa', () => {
    const on = toggleLastAmrap(three);
    assert.deepEqual(on, lastAmrap);
    assert.deepEqual(toggleLastAmrap(on), three);
    assert.deepEqual(toggleLastAmrap(three.map((set) => ({ ...set, amrap: true }))), three);
  });
});

describe('anlatım', () => {
  test('ekranda', () => {
    assert.equal(formatSets(three, 'weight_reps'), '3 × 8–12 tekrar');
    assert.equal(formatSets(lastAmrap, 'weight_reps'), '3 × 8–12 tekrar · son set AMRAP');
    assert.equal(formatSets([{ min: 8, max: 12, amrap: true }], 'weight_reps'), '1 × 8–12 tekrar · AMRAP');
    assert.equal(formatSets(three.map((set) => ({ ...set, amrap: true })), 'weight_reps'), '3 × 8–12 tekrar · hepsi AMRAP');
    assert.equal(formatSets([{ min: 8, max: 12 }, { min: 8, max: 12, amrap: true }, { min: 8, max: 12 }], 'weight_reps'), '3 × 8–12 tekrar · AMRAP: 2. set');
    assert.equal(formatSets(pyramid, 'weight_reps'), '12 / 10 / 8 tekrar · piramit %80 → %100');
    assert.equal(formatSets(backoff, 'weight_reps'), '5 / 8 / 8 tekrar · back-off %85');
    assert.equal(formatSets([{ min: 8, max: 12, loadPct: 70 }, { min: 8, max: 12 }], 'weight_reps'), '8–12 / 8–12 tekrar · yük %70 / %100');
    assert.equal(formatSets([{ min: 30, max: 60 }, { min: 45, max: 45, amrap: true }], 'duration'), '30–60 / 45+ sn');
    assert.equal(formatSets(uniformSets({ min: 30, max: 60 }, 3), 'duration'), '3 × 30–60 sn');
  });

  test('ağırlıksız harekette yüzde yok sayılır', () => {
    assert.equal(formatSets([{ min: 10, max: 10, loadPct: 80 }, { min: 10, max: 10 }], 'bodyweight_reps'), '2 × 10 tekrar');
    assert.equal(setsText([{ min: 10, max: 10, loadPct: 80 }, { min: 10, max: 10 }], 'bodyweight_reps'), '2×10');
  });

  test('danışana', () => {
    assert.equal(formatSets(lastAmrap, 'weight_reps', 'client'), '3 × 8–12 tekrar · son sette yapabildiğin kadar');
    assert.equal(formatSets([{ min: 8, max: 12, amrap: true }], 'weight_reps', 'client'), '1 × 8–12 tekrar · yapabildiğin kadar');
    assert.equal(formatSets(three.map((set) => ({ ...set, amrap: true })), 'weight_reps', 'client'), '3 × 8–12 tekrar · her sette yapabildiğin kadar');
    assert.equal(
      formatSets([...backoff.slice(0, 2), { min: 8, max: 8, loadPct: 85, amrap: true }], 'weight_reps', 'client'),
      '5 / 8 / 8+ tekrar · back-off %85 · +: yapabildiğin kadar',
    );
  });

  test('program geçmişinde', () => {
    assert.equal(setsText(three, 'weight_reps'), '3×8–12');
    assert.equal(setsText(uniformSets({ min: 30, max: 60 }, 3), 'duration'), '3×30–60 sn');
    assert.equal(setsText(lastAmrap, 'weight_reps'), '3×8–12, son set AMRAP');
    assert.equal(setsText([{ min: 5, max: 5, amrap: true }], 'weight_reps'), '1×5, AMRAP');
    assert.equal(setsText(three.map((set) => ({ ...set, amrap: true })), 'weight_reps'), '3×8–12, hepsi AMRAP');
    assert.equal(setsText([{ min: 8, max: 12, amrap: true }, { min: 8, max: 12 }], 'weight_reps'), '2×8–12, AMRAP: 1. set');
    assert.equal(setsText(pyramid, 'weight_reps'), '12/10/8 (piramit)');
    assert.equal(setsText(backoff, 'weight_reps'), '5/8/8 (back-off %85)');
    assert.equal(setsText([{ min: 8, max: 12, loadPct: 70 }, { min: 8, max: 12 }], 'weight_reps'), '8–12/8–12 (yük %70/%100)');
    assert.equal(setsText([{ min: 10, max: 10 }, { min: 8, max: 8 }], 'weight_reps'), '10/8');
    assert.equal(setsText([{ min: 30, max: 60 }, { min: 45, max: 45, amrap: true }], 'duration'), '30–60/45+ sn');
  });
});
