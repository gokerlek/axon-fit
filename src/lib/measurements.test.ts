import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDURANCE_NOISE,
  enduranceRatios,
  fmsSummary,
  MEASUREMENT_IDS,
  measurementDef,
  realChange,
  SIT_TO_STAND_MCID,
  sideBridgeAsymmetry,
  sitToStandFlag,
  waistHipRatio,
} from './measurements.ts';

describe('ölçüm kataloğu', () => {
  test('her ölçümün birimi, katmanı ve sıklığı var', () => {
    for (const id of MEASUREMENT_IDS) {
      const def = measurementDef(id);
      assert.ok(def.label && def.unit && def.tier && def.frequency, `${id} eksik`);
    }
  });
});

describe('yorumlayıcılar', () => {
  test('bel-kalça oranı cinsiyete göre eşik (erkek 0,90, kadın 0,85)', () => {
    assert.deepEqual(waistHipRatio(86, 100, 'male'), { ratio: 0.86, elevatedRisk: false });
    assert.deepEqual(waistHipRatio(86, 100, 'female'), { ratio: 0.86, elevatedRisk: true });
    assert.equal(waistHipRatio(90, 100, 'male').elevatedRisk, true);
  });

  test('otur-kalk: 12 sn üstü değerlendirme, 15 sn üstü tekrarlayan düşme riski', () => {
    assert.equal(sitToStandFlag(11.4), 'normal');
    assert.equal(sitToStandFlag(12.6), 'fall_risk_assessment');
    assert.equal(sitToStandFlag(15.2), 'recurrent_fall_risk');
  });

  test('ölçüm hatasının altındaki değişim gelişme sayılmaz', () => {
    // Otur-kalk: 2,3 sn altı gürültü; düşük süre iyidir.
    const oturKalk = { threshold: SIT_TO_STAND_MCID, relative: false, better: 'lower' as const };
    assert.equal(realChange(14, 12.5, oturKalk), 'no_real_change');
    assert.equal(realChange(14, 11.2, oturKalk), 'improved');
    assert.equal(realChange(11, 14, oturKalk), 'declined');

    // Dayanıklılık: %25 altı gürültü; yüksek süre iyidir.
    const dayaniklilik = { threshold: ENDURANCE_NOISE, relative: true, better: 'higher' as const };
    assert.equal(realChange(100, 120, dayaniklilik), 'no_real_change');
    assert.equal(realChange(100, 130, dayaniklilik), 'improved');
  });

  test('yan köprü asimetrisi yalnız %25 bandını aşınca işaretlenir', () => {
    assert.deepEqual(sideBridgeAsymmetry(80, 90), { differencePercent: 11, flagged: false });
    assert.deepEqual(sideBridgeAsymmetry(60, 90), { differencePercent: 33, flagged: true });
  });

  test('dayanıklılık oranları cinsiyete göre başvuru değeriyle döner', () => {
    const erkek = enduranceRatios({ flexorS: 90, extensorS: 150, sideS: 90 }, 'male');
    assert.deepEqual(erkek, { sideToExtensor: 0.6, sideToFlexor: 1, reference: { sideToExtensor: 0.65, sideToFlexor: 0.99 } });
  });
});

describe('hareket taraması', () => {
  test('asimetri, ağrı bayrağı ve en düşük patern; toplam skor yok', () => {
    const ozet = fmsSummary({
      deep_squat: { score: 2 },
      hurdle_step: { left: 2, right: 1 },
      shoulder_mobility: { left: 3, right: 3, clearingPain: true },
      rotary_stability: { left: 1, right: 1 },
    });
    assert.deepEqual(ozet.asymmetries, ['hurdle_step']);
    assert.deepEqual(ozet.painFlags, ['shoulder_mobility']);
    assert.deepEqual(ozet.lowest, { pattern: 'hurdle_step', score: 1 });
    assert.equal('total' in ozet, false);
  });

  test('0 puan ağrı demektir: bayrak kalkar', () => {
    assert.deepEqual(fmsSummary({ deep_squat: { score: 0 } }).painFlags, ['deep_squat']);
  });
});
