import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChange,
  latestSideBridgeAsymmetry,
  latestSitToStand,
  latestWaistHip,
  measurementTrends,
  NOISE_RULES,
} from './measurement-trends.ts';
import { ENDURANCE_NOISE, SIT_TO_STAND_MCID, WAIST_HIP_GIRTH_NOISE_CM } from './measurements.ts';
import type { MeasurementEntry } from './schemas/health.ts';

const entry = (date: string, id: MeasurementEntry['id'], value: number, side?: 'left' | 'right'): MeasurementEntry =>
  side ? { date, id, value, side } : { date, id, value };

describe('ölçüm hatası eşikleri', () => {
  test('yalnız kaynaklı eşikler var', () => {
    assert.equal(NOISE_RULES.waist_girth?.threshold, WAIST_HIP_GIRTH_NOISE_CM);
    assert.equal(NOISE_RULES.sit_to_stand_5x?.threshold, SIT_TO_STAND_MCID);
    assert.equal(NOISE_RULES.side_bridge_endurance?.threshold, ENDURANCE_NOISE);
    // Kaynağı olmayanlar sınıflanmaz.
    for (const id of ['body_mass', 'stature', 'calf_girth', 'weight_bearing_lunge', 'odi', 'spadi', 'visa_p'] as const) {
      assert.equal(NOISE_RULES[id], undefined, `${id} için eşik uydurulmamalı`);
    }
  });

  test('bel: 2 cm altı gürültü, düşüş gelişme', () => {
    const rule = NOISE_RULES.waist_girth!;
    assert.equal(classifyChange(rule, 84, 82.5), 'no_real_change');
    assert.equal(classifyChange(rule, 84, 82), 'improved');
    assert.equal(classifyChange(rule, 82.1, 80.1), 'improved'); // ondalık kaymasına rağmen tam 2 cm
    assert.equal(classifyChange(rule, 80, 83), 'declined');
  });

  test('kalça: yön tanımsız, gerçek değişim artış/azalma diye raporlanır', () => {
    const rule = NOISE_RULES.hip_girth!;
    assert.equal(classifyChange(rule, 100, 101), 'no_real_change');
    assert.equal(classifyChange(rule, 100, 103), 'increased');
    assert.equal(classifyChange(rule, 100, 97), 'decreased');
  });

  test('otur-kalk: 2,3 sn, kısa süre iyi', () => {
    const rule = NOISE_RULES.sit_to_stand_5x!;
    assert.equal(classifyChange(rule, 14, 12), 'no_real_change');
    assert.equal(classifyChange(rule, 14, 11.7), 'improved');
    assert.equal(classifyChange(rule, 11, 13.5), 'declined');
  });

  test('dayanıklılık: %25 göreli, uzun süre iyi', () => {
    const rule = NOISE_RULES.trunk_extensor_endurance!;
    assert.equal(classifyChange(rule, 100, 120), 'no_real_change');
    assert.equal(classifyChange(rule, 100, 125), 'improved');
    assert.equal(classifyChange(rule, 100, 70), 'declined');
  });
});

describe('seriler', () => {
  const entries: MeasurementEntry[] = [
    entry('2026-09-01', 'waist_girth', 82),
    entry('2026-07-01', 'waist_girth', 85),
    entry('2026-08-01', 'waist_girth', 83.5),
    entry('2026-08-01', 'body_mass', 80),
    entry('2026-09-01', 'body_mass', 78),
    entry('2026-08-01', 'side_bridge_endurance', 60, 'left'),
    entry('2026-08-01', 'side_bridge_endurance', 50, 'right'),
    entry('2026-09-01', 'side_bridge_endurance', 80, 'left'),
    entry('2026-09-01', 'side_bridge_endurance', 55, 'right'),
    entry('2026-09-01', 'odi', 30),
  ];
  const trends = measurementTrends(entries);

  test('yalnız ölçülenler, katalog sırasıyla', () => {
    assert.deepEqual(
      trends.map((trend) => trend.id),
      ['body_mass', 'waist_girth', 'side_bridge_endurance', 'odi'],
    );
  });

  test('tek değerli ölçüm: tarihe göre sıralı tek çizgi, son ikisinin farkı', () => {
    const waist = trends.find((trend) => trend.id === 'waist_girth')!;
    assert.equal(waist.lines.length, 1);
    const line = waist.lines[0]!;
    assert.equal(line.key, 'value');
    assert.deepEqual(line.points.map((point) => point.date), ['2026-07-01', '2026-08-01', '2026-09-01']);
    assert.deepEqual(line.change, {
      previous: { date: '2026-08-01', value: 83.5 },
      latest: { date: '2026-09-01', value: 82 },
      delta: -1.5,
      ratio: -0.018,
      kind: 'no_real_change',
    });
    assert.equal(waist.lastDate, '2026-09-01');
  });

  test('iki taraflı ölçüm: sol ve sağ ayrı çizgi, ayrı sınıflama', () => {
    const bridge = trends.find((trend) => trend.id === 'side_bridge_endurance')!;
    assert.deepEqual(bridge.lines.map((line) => line.key), ['left', 'right']);
    assert.equal(bridge.lines[0]!.change?.kind, 'improved'); // 60 → 80: %33
    assert.equal(bridge.lines[1]!.change?.kind, 'no_real_change'); // 50 → 55: %10
  });

  test('eşiği olmayan ölçüm: fark var, sınıf yok', () => {
    const mass = trends.find((trend) => trend.id === 'body_mass')!;
    assert.equal(mass.rule, null);
    assert.equal(mass.lines[0]!.change?.delta, -2);
    assert.equal(mass.lines[0]!.change?.kind, null);
  });

  test('tek ölçümde değişim yok', () => {
    const odi = trends.find((trend) => trend.id === 'odi')!;
    assert.equal(odi.lines[0]!.change, null);
  });

  test('aynı gün tekrar eden kayıtta sonuncusu geçer', () => {
    const [trend] = measurementTrends([entry('2026-09-01', 'body_mass', 70), entry('2026-09-01', 'body_mass', 71)]);
    assert.deepEqual(trend!.lines[0]!.points, [{ date: '2026-09-01', value: 71 }]);
  });

  test('önceki değer 0 ise göreli değişim yok', () => {
    const [trend] = measurementTrends([
      entry('2026-08-01', 'trunk_flexor_endurance', 0),
      entry('2026-09-01', 'trunk_flexor_endurance', 30),
    ]);
    assert.equal(trend!.lines[0]!.change?.ratio, null);
    assert.equal(trend!.lines[0]!.change?.kind, 'improved');
  });
});

describe('türetilmiş göstergeler', () => {
  test('bel-kalça oranı: ikisinin birlikte ölçüldüğü en son gün, cinsiyete göre eşik', () => {
    const entries = [
      entry('2026-08-01', 'waist_girth', 90),
      entry('2026-08-01', 'hip_girth', 100),
      entry('2026-09-01', 'waist_girth', 84), // kalça yok: sayılmaz
    ];
    assert.deepEqual(latestWaistHip(entries, 'male'), {
      date: '2026-08-01',
      waist: 90,
      hip: 100,
      sex: 'male',
      ratio: 0.9,
      elevatedRisk: true,
    });
    assert.deepEqual(latestWaistHip(entries, undefined), { date: '2026-08-01', waist: 90, hip: 100, sex: null });
    assert.equal(latestWaistHip([entry('2026-09-01', 'waist_girth', 84)], 'female'), null);
  });

  test('otur-kalk bayrağı son ölçümden', () => {
    const entries = [entry('2026-08-01', 'sit_to_stand_5x', 16), entry('2026-09-01', 'sit_to_stand_5x', 12.4)];
    assert.deepEqual(latestSitToStand(entries), { date: '2026-09-01', seconds: 12.4, flag: 'fall_risk_assessment' });
    assert.equal(latestSitToStand([]), null);
  });

  test('yan köprü asimetrisi: iki tarafın birlikte ölçüldüğü en son gün, %25 bandı', () => {
    const entries = [
      entry('2026-08-01', 'side_bridge_endurance', 80, 'left'),
      entry('2026-08-01', 'side_bridge_endurance', 50, 'right'),
      entry('2026-09-01', 'side_bridge_endurance', 90, 'left'), // sağ yok: sayılmaz
    ];
    assert.deepEqual(latestSideBridgeAsymmetry(entries), {
      date: '2026-08-01',
      left: 80,
      right: 50,
      differencePercent: 38,
      flagged: true,
    });
    assert.equal(latestSideBridgeAsymmetry([entry('2026-08-01', 'side_bridge_endurance', 80, 'left')]), null);
  });
});
