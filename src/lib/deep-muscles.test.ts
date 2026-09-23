import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctiveTargets,
  DEEP_MUSCLES,
  DEEP_MUSCLE_LABELS,
  DEEP_MUSCLE_REGIONS,
  isDeepMuscle,
  POSTURAL_PATTERNS,
  POSTURAL_PATTERN_IDS,
} from './deep-muscles.ts';

describe('derin kas sözlüğü', () => {
  test('her kasın etiketi ve bölgesi var', () => {
    for (const muscle of DEEP_MUSCLES) {
      assert.ok(DEEP_MUSCLE_LABELS[muscle], `${muscle} etiketsiz`);
      assert.ok(DEEP_MUSCLE_REGIONS[muscle], `${muscle} bölgesiz`);
    }
    assert.equal(new Set(DEEP_MUSCLES).size, DEEP_MUSCLES.length, 'kimlikler eşsiz');
  });

  test('yüzey kası derin kas sayılmaz', () => {
    assert.equal(isDeepMuscle('multifidus'), true);
    assert.equal(isDeepMuscle('glutes'), false, 'glutes yüzey haritasında');
    assert.equal(isDeepMuscle('uydurma_kas'), false);
  });
});

describe('postür paternleri', () => {
  test('her paternde iki taraf da dolu ve kas iki rolde birden değil', () => {
    for (const id of POSTURAL_PATTERN_IDS) {
      const pattern = POSTURAL_PATTERNS[id];
      assert.ok(pattern.overactive.length > 0 && pattern.underactive.length > 0, `${id} eksik`);
      const kesisim = pattern.overactive.filter((muscle) => (pattern.underactive as readonly string[]).includes(muscle));
      assert.deepEqual(kesisim, [], `${id}: aynı kas hem aşırı hem az aktif`);
      assert.ok(pattern.note.length > 20, `${id} gerekçesiz`);
    }
  });

  test('kanıt düzeyi işaretli: hiçbir patern "kesin" diye sunulmaz', () => {
    for (const id of POSTURAL_PATTERN_IDS) {
      assert.ok(['supported', 'mixed', 'expert_opinion'].includes(POSTURAL_PATTERNS[id].confidence));
    }
    // Janda paternleri uzman görüşü; diz valgusu kısmen EMG ile destekli.
    assert.equal(POSTURAL_PATTERNS.upper_crossed.confidence, 'expert_opinion');
    assert.equal(POSTURAL_PATTERNS.dynamic_knee_valgus.confidence, 'mixed');
  });

  test('üst çapraz: pec minor uzatılır, derin boyun fleksörü aktive edilir', () => {
    const { lengthen, activate } = correctiveTargets(['upper_crossed']);
    assert.ok(lengthen.includes('pec_minor'));
    assert.ok(activate.includes('deep_neck_flexors'));
    assert.ok(activate.includes('traps_lower'));
  });

  test('iki patern birleşince çakışan kas aktivasyona yazılır', () => {
    // Diz valgusunda adduktor uzatılır; başka bir paternde aktive edilseydi aktivasyon kazanırdı.
    const { lengthen, activate } = correctiveTargets(['dynamic_knee_valgus', 'foot_pronation']);
    assert.ok(lengthen.includes('adductors'));
    assert.ok(activate.includes('tibialis_posterior'));
    assert.equal(
      lengthen.filter((muscle) => activate.includes(muscle)).length,
      0,
      'bir kas aynı anda hem uzat hem aktive listesinde olamaz',
    );
  });

  test('boş liste boş sonuç verir', () => {
    assert.deepEqual(correctiveTargets([]), { lengthen: [], activate: [] });
  });
});
