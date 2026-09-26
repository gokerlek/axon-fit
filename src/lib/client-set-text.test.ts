import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clientSetText } from './client-set-text.ts';
import type { SetSpec } from './set-plan.ts';

const uc = (min: number, max: number): SetSpec[] => [
  { min, max },
  { min, max },
  { min, max },
];
const piramit: SetSpec[] = [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10, loadPct: 90 }, { min: 8, max: 8, amrap: true }];

describe('setler danışanın dilinde (/me)', () => {
  test('piramit + son set AMRAP + dinlenme: kısaltma ve işaret yok, cümle', () => {
    assert.equal(
      clientSetText(piramit, 'weight_reps', 90),
      '3 set: 12, 10 tekrar ve son sette yapabildiğin kadar (en az 8) · ağırlık her sette artar · 1 dk 30 sn dinlenme',
    );
  });

  test('düz setler', () => {
    assert.equal(clientSetText(uc(8, 12), 'weight_reps'), '3 set, her sette 8–12 tekrar');
    assert.equal(clientSetText(uc(10, 10), 'bodyweight_reps', 60), '3 set, her sette 10 tekrar · 1 dk dinlenme');
    assert.equal(clientSetText(uc(30, 60), 'duration', 0), '3 set, her sette 30–60 sn · setler arası dinlenme yok');
    assert.equal(clientSetText([{ min: 5, max: 5 }], 'weight_reps'), '1 set: 5 tekrar');
  });

  test('"yapabildiğin kadar": son set, hepsi, tek set, aradaki set', () => {
    const son = uc(8, 12).map((set, index) => (index === 2 ? { ...set, amrap: true } : set));
    assert.equal(clientSetText(son, 'weight_reps'), '3 set, her sette 8–12 tekrar; son sette yapabildiğin kadar');
    assert.equal(
      clientSetText(uc(8, 12).map((set) => ({ ...set, amrap: true })), 'weight_reps'),
      '3 set, her sette yapabildiğin kadar (en az 8 tekrar)',
    );
    assert.equal(clientSetText([{ min: 20, max: 30, amrap: true }], 'duration'), '1 set: yapabildiğin kadar (en az 20 sn)');
    const ara = uc(8, 12).map((set, index) => (index === 0 ? { ...set, amrap: true } : set));
    assert.equal(clientSetText(ara, 'weight_reps'), '3 set, her sette 8–12 tekrar; 1. sette yapabildiğin kadar');
  });

  test('yük seyri yüzdesiz ya da en ağır sete göre', () => {
    assert.equal(
      clientSetText(piramit.map(({ amrap: _amrap, ...set }) => set), 'weight_reps'),
      '3 set: 12, 10 ve 8 tekrar · ağırlık her sette artar',
    );
    const backoff: SetSpec[] = [{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 8, loadPct: 85 }];
    assert.equal(clientSetText(backoff, 'weight_reps'), '3 set: 5, 8 ve 8 tekrar · ilk set en ağır, sonrakiler %15 daha hafif');
    const serbest: SetSpec[] = [{ min: 8, max: 12, loadPct: 70 }, { min: 8, max: 12 }];
    assert.equal(clientSetText(serbest, 'weight_reps'), '2 set: 8–12 ve 8–12 tekrar · ağırlık en ağır sete göre: %70, %100');
    // Ağırlıksız harekette yüzde yok sayılır.
    assert.equal(clientSetText(piramit, 'bodyweight_reps'), '3 set: 12, 10 tekrar ve son sette yapabildiğin kadar (en az 8)');
  });

  test('hiçbir biçimde PT kısaltması çıkmaz', () => {
    const cases: SetSpec[][] = [piramit, uc(8, 12), uc(8, 12).map((set) => ({ ...set, amrap: true })), [{ min: 5, max: 5, amrap: true }]];
    for (const sets of cases) {
      const text = clientSetText(sets, 'weight_reps', 90);
      assert.doesNotMatch(text, /AMRAP|piramit|back-off|\+|\//, text);
    }
  });
});
