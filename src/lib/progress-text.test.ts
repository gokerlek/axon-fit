import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { RecordEvent, RecordMark } from './personal-records.ts';
import type { ExercisePoint } from './progress.ts';
import {
  ACHIEVEMENT_TITLES,
  achievementDetail,
  describeTrend,
  formatSeconds,
  METRICS,
  METRICS_OF,
  metricForecast,
  metricMinSpan,
  metricPoints,
  recordLabel,
  recordPrevious,
  recordValue,
  streakText,
  weekLabel,
} from './progress-text.ts';
import { forecast } from './trend.ts';

const point = (date: string, fields: Partial<ExercisePoint> = {}): ExercisePoint => ({ date, volumeKg: 0, totalReps: 0, totalSeconds: 0, sets: 3, ...fields });

const mark = (fields: Partial<RecordMark> & Pick<RecordMark, 'kind' | 'value'>): RecordMark => ({ sessionId: 's_1', date: '2026-09-01', ...fields });

describe('grafik seçimleri', () => {
  test('kayıt türüne göre grafikler; ilki varsayılan', () => {
    assert.deepEqual(METRICS_OF.weight_reps, ['top', 'e1rm', 'volume']);
    assert.deepEqual(METRICS_OF.bodyweight_reps, ['reps', 'total_reps']);
    assert.deepEqual(METRICS_OF.duration, ['seconds', 'total_seconds']);
  });

  test('toplamlarda tahmin yok', () => {
    const forecasting = (Object.keys(METRICS) as (keyof typeof METRICS)[]).filter((metric) => METRICS[metric].forecast);
    assert.deepEqual(forecasting, ['top', 'e1rm', 'reps', 'seconds']);
  });

  test('noktalar: değeri olmayan gün çizilmez; tahmini maksimum 0,1 kg', () => {
    const points = [
      point('2026-09-01', { topKg: 60, e1rm: 83.33, volumeKg: 1800, bestReps: 10, totalReps: 30 }),
      point('2026-09-04', { topKg: 20, volumeKg: 900, bestReps: 15, totalReps: 45 }),
      point('2026-09-08', { bestSeconds: 60, totalSeconds: 150 }),
    ];
    assert.deepEqual(metricPoints(points, 'top'), [
      { date: '2026-09-01', value: 60 },
      { date: '2026-09-04', value: 20 },
    ]);
    assert.deepEqual(metricPoints(points, 'e1rm'), [{ date: '2026-09-01', value: 83.3 }]);
    assert.deepEqual(metricPoints(points, 'volume').map((item) => item.value), [1800, 900]);
    assert.deepEqual(metricPoints(points, 'reps').map((item) => item.value), [10, 15]);
    assert.deepEqual(metricPoints(points, 'total_reps').map((item) => item.value), [30, 45]);
    assert.deepEqual(metricPoints(points, 'seconds'), [{ date: '2026-09-08', value: 60 }]);
    assert.deepEqual(metricPoints(points, 'total_seconds'), [{ date: '2026-09-08', value: 150 }]);
  });

  test('eksenin en az aralığı: ağırlıkta en büyüğün %10\'u (en az 5 kg), tekrarda 4, sürede 20 sn', () => {
    assert.equal(metricMinSpan('top', [60, 62.5]), 6.25);
    assert.equal(metricMinSpan('e1rm', [20, 22]), 5);
    assert.equal(metricMinSpan('reps', [8, 9]), 4);
    assert.equal(metricMinSpan('seconds', [45]), 20);
    assert.equal(metricMinSpan('volume', [1000]), undefined);
    assert.equal(metricMinSpan('top', []), undefined);
  });

  test('tahmin yalnız ilerleme değerlerinde', () => {
    const points = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'].map((date, i) => ({ date, value: 60 + i * 2.5 }));
    assert.equal(metricForecast('volume', points), null);
    assert.equal(metricForecast('top', points)?.ok, true);
  });
});

describe('eğilim ve tahmin metni', () => {
  const weekly = (values: number[], start = '2026-08-03') =>
    values.map((value, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 7 * 86_400_000).toISOString().slice(0, 10), value }));

  test('az veri: ne gerektiği', () => {
    assert.equal(describeTrend(forecast(weekly([60, 62.5, 65])), 'kg', '2026-08-20'), 'Tahmin için en az 4 antrenman gerekir.');
    const short = [
      { date: '2026-08-01', value: 60 },
      { date: '2026-08-03', value: 61 },
      { date: '2026-08-05', value: 62 },
      { date: '2026-08-07', value: 63 },
    ];
    assert.equal(describeTrend(forecast(short), 'kg', '2026-08-08'), 'Tahmin için kayıtların en az 3 haftaya yayılması gerekir.');
  });

  test('yükselen eğilim: haftalık artış, ufuk, olası aralık ve varsayım', () => {
    // 5 hafta, haftada +2,5 kg, gürültüsüz: bant çöker, aralık yazılmaz. Son kayıt 31 Ağu; ufuk 14 gün.
    const text = describeTrend(forecast(weekly([60, 62.5, 65, 67.5, 70])), 'kg', '2026-09-01');
    assert.equal(text, 'Eğilim haftada +2,5 kg. Böyle giderse 2 hafta sonra (14 Eylül 2026) ≈ 75 kg. Tahmin eğilimin süreceğini varsayar.');
  });

  test('gürültülü veride olası aralık yazılır', () => {
    const text = describeTrend(forecast(weekly([60, 63, 64, 66, 70, 71, 72, 76])), 'kg', '2026-09-22');
    assert.match(text, /^Eğilim haftada \+[\d,]+ kg\. Böyle giderse \d+ hafta sonra \(.+\) ≈ [\d,]+ kg; olası aralık [\d,]+–[\d,]+ kg\. Tahmin eğilimin süreceğini varsayar\.$/);
  });

  test('düz ya da düşen eğilimde ileriye sayı verilmez', () => {
    assert.equal(describeTrend(forecast(weekly([60, 60, 60, 60, 60])), 'kg', '2026-09-01'), 'Eğilim haftada ±0 kg.');
    assert.equal(describeTrend(forecast(weekly([70, 67.5, 65, 62.5, 60])), 'kg', '2026-09-01'), 'Eğilim haftada −2,5 kg.');
  });

  test('son kayıt tahminin ufkundan eskiyse tahmin yazılmaz', () => {
    assert.equal(
      describeTrend(forecast(weekly([60, 62.5, 65, 67.5, 70])), 'kg', '2026-10-31'),
      'Son kayıt 61 gün önce; tahmin bir sonraki antrenmanla güncellenir.',
    );
  });
});

describe('rekor metinleri', () => {
  test('adlar; vücut ağırlığında en ağır ek yüktür', () => {
    assert.equal(recordLabel('heaviest', 'weight_reps'), 'En ağır set');
    assert.equal(recordLabel('heaviest', 'bodyweight_reps'), 'En ağır ek yük');
    assert.equal(recordLabel('e1rm', 'weight_reps'), 'Tahmini maksimum');
    assert.equal(recordLabel('reps_at_weight', 'weight_reps'), 'Aynı ağırlıkta en çok tekrar');
    assert.equal(recordLabel('most_reps', 'bodyweight_reps'), 'En çok tekrar');
    assert.equal(recordLabel('longest', 'duration'), 'En uzun süre');
  });

  test('değerler Türkçe sayıyla', () => {
    assert.equal(recordValue(mark({ kind: 'heaviest', value: 62.5, kg: 62.5, reps: 8 })), '62,5 kg × 8');
    assert.equal(recordValue(mark({ kind: 'e1rm', value: 83.33, kg: 62.5, reps: 10 })), '≈ 83,3 kg (62,5 kg × 10)');
    assert.equal(recordValue(mark({ kind: 'reps_at_weight', value: 10, kg: 60, reps: 10 })), '60 kg × 10');
    assert.equal(recordValue(mark({ kind: 'most_reps', value: 15, reps: 15 })), '15 tekrar');
    assert.equal(recordValue(mark({ kind: 'longest', value: 90, seconds: 90 })), '1 dk 30 sn');
  });

  test('önceki en iyi', () => {
    const event = (kind: RecordEvent['kind'], previous: RecordMark): RecordEvent => ({ ...mark({ kind, value: 0 }), previous });
    assert.equal(recordPrevious(event('heaviest', mark({ kind: 'heaviest', value: 60, kg: 60, reps: 8 }))), 'önceki en iyi 60 kg × 8');
    assert.equal(recordPrevious(event('e1rm', mark({ kind: 'e1rm', value: 80, kg: 60, reps: 10 }))), 'önceki ≈ 80 kg');
    assert.equal(recordPrevious(event('longest', mark({ kind: 'longest', value: 45, seconds: 45 }))), 'önceki en iyi 45 sn');
  });

  test('süre', () => {
    assert.equal(formatSeconds(45), '45 sn');
    assert.equal(formatSeconds(60), '1 dk');
    assert.equal(formatSeconds(125), '2 dk 5 sn');
  });
});

describe('hafta, başarı ve seri metinleri', () => {
  test('hafta: aynı ay, ay değişimi, yıl değişimi', () => {
    assert.equal(weekLabel('2026-09-21', '2026-09-27'), '21–27 Eyl');
    assert.equal(weekLabel('2026-09-28', '2026-10-04'), '28 Eyl–4 Eki');
    assert.equal(weekLabel('2026-12-28', '2027-01-03'), '28 Ara 2026–3 Oca 2027');
  });

  test('başarı: kazanıldıysa gün, değilse ne gerektiği ve ilerleme', () => {
    assert.equal(achievementDetail({ id: 'workouts_10', achievedOn: '2026-09-12', current: 10, target: 10 }, 3), '12 Eylül 2026');
    assert.equal(achievementDetail({ id: 'workouts_25', achievedOn: null, current: 12, target: 25 }, 3), '12/25 antrenman');
    assert.equal(achievementDetail({ id: 'streak_4', achievedOn: null, current: 2, target: 4 }, 3), 'Her hafta en az 3 gün antrenman · 2/4 hafta');
    assert.equal(achievementDetail({ id: 'first_workout', achievedOn: null, current: 0, target: 1 }, 1), 'İlk antrenmanını bitir.');
    assert.equal(achievementDetail({ id: 'first_record', achievedOn: null, current: 0, target: 1 }, 1), 'Bir harekette en iyini geç.');
    assert.equal(ACHIEVEMENT_TITLES.streak_12, '12 hafta üst üste');
  });

  test('seri satırı', () => {
    assert.equal(streakText({ current: 0, best: 0, thisWeek: 1, target: 3 }), 'Bu hafta 1/3 gün');
    assert.equal(streakText({ current: 0, best: 5, thisWeek: 0, target: 3 }), 'Bu hafta 0/3 gün · en uzun seri 5 hafta');
    assert.equal(streakText({ current: 3, best: 3, thisWeek: 2, target: 3 }), '3 hafta üst üste · bu hafta 2/3 gün');
    assert.equal(streakText({ current: 2, best: 6, thisWeek: 3, target: 3 }), '2 hafta üst üste · en uzun 6 hafta · bu hafta 3/3 gün');
  });
});
