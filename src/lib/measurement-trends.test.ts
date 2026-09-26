import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChange,
  latestSideBridgeAsymmetry,
  latestSitToStand,
  latestWaistHip,
  lineOutlook,
  lineVerdicts,
  measurementsInRange,
  measurementTrends,
  NOISE_RULES,
} from './measurement-trends.ts';
import { valueMax } from './measurement-log.ts';
import { ENDURANCE_NOISE, SIT_TO_STAND_MCID, WAIST_HIP_GIRTH_NOISE_CM } from './measurements.ts';
import type { MeasurementEntry } from './schemas/health.ts';
import { rangeStart } from './trend.ts';

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

describe('eğilim ve tahmin', () => {
  test('tahmin ölçümün kayıt sınırlarına kırpılır: anket skoru sıfırın altına inmez', () => {
    // ODI haftalık 30 → 20 → 12 → 5: kırpılmasa "≈ %−3,8; olası aralık −5,8–−1,7".
    const odi = [30, 20, 12, 5].map((value, i) => ({ date: `2026-09-${String(1 + i * 7).padStart(2, '0')}`, value }));
    const { forecast } = lineOutlook(odi, null, { min: 0, max: valueMax('odi') });
    assert.ok(forecast.ok);
    assert.ok(forecast.points.every((point) => point.low >= 0 && point.value >= 0 && point.high <= 100));
  });
});

describe('tarih süzgeçli genel bakış', () => {
  test('aralıkta tek ölçüm kalınca değişim aralıktan önceki ölçümle hesaplanır ("İlk ölçüm" değil)', () => {
    // Otur-kalk üç ayda bir: 20 Haziran 15,5 sn, 24 Eylül 11 sn; "Son 3 ay" 25 Haziran'dan başlar.
    const kayit = [entry('2026-06-20', 'sit_to_stand_5x', 15.5), entry('2026-09-24', 'sit_to_stand_5x', 11)];
    const line = measurementsInRange(kayit, undefined, '2026-06-25').trends[0]!.lines[0]!;
    assert.deepEqual(line.points, [{ date: '2026-09-24', value: 11 }]);
    assert.equal(line.change?.previous.date, '2026-06-20');
    assert.equal(line.change?.kind, 'improved');
  });

  test('geçmiş aralıkta son değer, değişim ve göstergeler aynı aralıktan', () => {
    const kayit = [
      entry('2026-02-01', 'sit_to_stand_5x', 16),
      entry('2026-03-01', 'sit_to_stand_5x', 14),
      entry('2026-09-01', 'sit_to_stand_5x', 9),
    ];
    const view = measurementsInRange(kayit, undefined, '2026-01-01', '2026-03-31');
    const trend = view.trends[0]!;
    assert.equal(trend.lastDate, '2026-03-01');
    assert.deepEqual(trend.lines[0]!.points.at(-1), { date: '2026-03-01', value: 14 });
    assert.equal(trend.lines[0]!.change?.previous.date, '2026-02-01');
    // Not Eylül'ün 9 sn'sinden değil, aralığın son ölçümünden.
    assert.deepEqual(view.indicators.sitToStand, { date: '2026-03-01', seconds: 14, flag: 'fall_risk_assessment' });
    assert.deepEqual(
      view.entries.map((item) => item.date),
      ['2026-02-01', '2026-03-01'],
    );
  });

  test('"Son 4 hafta" görünümünde eğilim aralık başından önceki çapayı görür; grafik yalnız aralık', () => {
    // Bel 26 Ağu 88; 5/15/25 Eyl 87/86/85. "Son 4 hafta" 28 Ağu'dan başlar: pencerenin çapası aralık dışında.
    const kayit = [
      entry('2026-08-26', 'waist_girth', 88),
      entry('2026-09-05', 'waist_girth', 87),
      entry('2026-09-15', 'waist_girth', 86),
      entry('2026-09-25', 'waist_girth', 85),
    ];
    const line = measurementsInRange(kayit, undefined, rangeStart('4h', '2026-09-25')).trends[0]!.lines[0]!;
    assert.deepEqual(
      line.points.map((point) => point.date),
      ['2026-09-05', '2026-09-15', '2026-09-25'],
    );
    assert.equal(line.history.length, 4);
    const status = lineOutlook(line.points, NOISE_RULES.waist_girth!, undefined, line.history).status!;
    assert.equal(status.kind, 'improving');
    assert.ok(Math.abs(status.change! + 2.8) < 1e-9, String(status.change));
    // "Son 3 ay" ve danışan kartıyla aynı karar.
    const ucAy = measurementsInRange(kayit, undefined, rangeStart('3a', '2026-09-25')).trends[0]!.lines[0]!;
    assert.deepEqual(lineOutlook(ucAy.points, NOISE_RULES.waist_girth!, undefined, ucAy.history).status, status);
  });

  test('iki taraflı ölçümde aralıkta ölçülmeyen taraf çizilmez; ölçülen tarafın değişimi aralık öncesiyle', () => {
    const baldir = [
      entry('2026-05-01', 'calf_girth', 38, 'left'),
      entry('2026-05-01', 'calf_girth', 40, 'right'),
      entry('2026-09-20', 'calf_girth', 38.5, 'left'),
    ];
    const trend = measurementsInRange(baldir, undefined, '2026-08-01').trends[0]!;
    assert.deepEqual(
      trend.lines.map((line) => line.key),
      ['left'],
    );
    assert.deepEqual(trend.lines[0]!.points, [{ date: '2026-09-20', value: 38.5 }]);
    assert.equal(trend.lines[0]!.change?.previous.date, '2026-05-01');
    // Yan köprü göstergesi iki tarafın aynı gün ölçüldüğü günden: aralıkta sol ve sağ farklı günlerde → yok.
    const kopru = [
      entry('2026-05-01', 'side_bridge_endurance', 60, 'left'),
      entry('2026-05-01', 'side_bridge_endurance', 90, 'right'),
      entry('2026-09-10', 'side_bridge_endurance', 70, 'left'),
      entry('2026-09-11', 'side_bridge_endurance', 72, 'right'),
    ];
    assert.equal(measurementsInRange(kopru, undefined, '2026-08-01').indicators.sideBridge, null);
    assert.equal(measurementsInRange(kopru, undefined).indicators.sideBridge?.date, '2026-05-01');
  });

  test('aralıkta ölçüm yoksa seri ve gösterge yok; süzgeçsiz görünüm aynı kalır', () => {
    const kayit = [entry('2026-02-01', 'waist_girth', 90), entry('2026-02-01', 'hip_girth', 100)];
    const bos = measurementsInRange(kayit, 'male', '2026-06-01');
    assert.deepEqual(bos, { entries: [], trends: [], indicators: { waistHip: null, sitToStand: null, sideBridge: null } });
    const tumu = measurementsInRange(kayit, 'male');
    assert.deepEqual(tumu.trends, measurementTrends(kayit));
    assert.deepEqual(tumu.indicators.waistHip, latestWaistHip(kayit, 'male'));
  });
});

describe('kartın iki hükmü: son iki ölçüm ve 4 haftalık eğilim', () => {
  /** `start`tan başlayıp haftada bir gün. */
  const week = (start: string, i: number) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 7 * 86_400_000).toISOString().slice(0, 10);
  // Tarama bulgusu (sorun-09): bel haftada ~0,8 cm iniyor; bugün 26 Eylül, son ölçüm 8 Eylül.
  const bel = [
    entry('2026-08-11', 'waist_girth', 91.2),
    entry('2026-08-18', 'waist_girth', 90.4),
    entry('2026-08-25', 'waist_girth', 89.5),
    entry('2026-09-01', 'waist_girth', 88.6),
    entry('2026-09-08', 'waist_girth', 87.9),
  ];

  test('"Son 4 hafta" süzgecinde: son iki ölçüm gürültüde, eğilim gerçek; eğilim aralık öncesi ölçümleri sayar', () => {
    const from = rangeStart('4h', '2026-09-26');
    const line = measurementsInRange(bel, undefined, from).trends[0]!.lines[0]!;
    // Grafik yalnız aralığı çizer.
    assert.deepEqual(
      line.points.map((point) => point.date),
      ['2026-09-01', '2026-09-08'],
    );
    const { latest, trend } = lineVerdicts(line, NOISE_RULES.waist_girth!, from);
    assert.equal(latest?.kind, 'no_real_change');
    assert.equal(latest?.delta, -0.7);
    assert.equal(latest?.previousBeforeRange, false);
    assert.equal(trend?.kind, 'improving');
    assert.equal(trend?.from, '2026-08-11');
    assert.equal(trend?.to, '2026-09-08');
    assert.equal(trend?.points, 5);
    // 11, 18 ve 25 Ağustos seçili aralığın (29 Ağustos'tan) önce: kart bunu yazar.
    assert.equal(trend?.beforeRange, 3);
  });

  test('süzgeçsiz görünümde aynı hükümler; aralık öncesi nokta yok', () => {
    const line = measurementsInRange(bel, undefined).trends[0]!.lines[0]!;
    const { latest, trend } = lineVerdicts(line, NOISE_RULES.waist_girth!);
    assert.equal(latest?.kind, 'no_real_change');
    assert.equal(trend?.kind, 'improving');
    assert.equal(trend?.beforeRange, 0);
  });

  test('eşiğin altındaki eğilim durağandır; gelişme değil', () => {
    const yavas = [88, 87.7, 87.4, 87.1, 87].map((value, i) => entry(week('2026-08-11', i), 'waist_girth', value));
    const line = measurementsInRange(yavas, undefined).trends[0]!.lines[0]!;
    const { latest, trend } = lineVerdicts(line, NOISE_RULES.waist_girth!);
    assert.equal(trend?.kind, 'plateau');
    assert.equal(latest?.kind, 'no_real_change');
  });

  test('yönü tanımsız ölçümde (kalça) eğilim artış/azalma; eşiği olmayanda eğilim hükmü yok', () => {
    const kalca = [100, 101, 102, 103, 104].map((value, i) => entry(week('2026-08-04', i), 'hip_girth', value));
    const hip = measurementsInRange(kalca, undefined).trends[0]!.lines[0]!;
    assert.equal(lineVerdicts(hip, NOISE_RULES.hip_girth!).trend?.kind, 'increased');
    const kilo = [84, 83, 82, 81].map((value, i) => entry(week('2026-08-04', i), 'body_mass', value));
    const mass = measurementsInRange(kilo, undefined).trends[0]!.lines[0]!;
    const verdicts = lineVerdicts(mass, null);
    assert.equal(verdicts.trend, null);
    assert.equal(verdicts.latest?.kind, null);
    assert.equal(verdicts.latest?.delta, -1);
  });

  test('önceki ölçüm aralığın başından eskiyse işaretlenir; veri yetmezse eğilim yok', () => {
    const kayit = [entry('2026-06-20', 'sit_to_stand_5x', 15.5), entry('2026-09-24', 'sit_to_stand_5x', 11)];
    const line = measurementsInRange(kayit, undefined, '2026-06-25').trends[0]!.lines[0]!;
    const { latest, trend } = lineVerdicts(line, NOISE_RULES.sit_to_stand_5x!, '2026-06-25');
    assert.equal(latest?.previousBeforeRange, true);
    assert.equal(latest?.kind, 'improved');
    assert.equal(trend, null);
  });
});
