import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { RecordEvent, RecordMark } from './personal-records.ts';
import type { ExercisePoint } from './progress.ts';
import {
  ACHIEVEMENT_TITLES,
  achievementDetail,
  adherenceText,
  circumferenceText,
  describeTrend,
  e1rmNote,
  formatChangePct,
  formatSeconds,
  groupRoleText,
  highRepDaysSince,
  highRepDaysText,
  METRICS,
  METRICS_OF,
  metricForecast,
  metricMinSpan,
  metricPoints,
  progressCopy,
  recordLabel,
  recordPrevious,
  recordValue,
  recentAverage,
  STRENGTH_METHOD_NOTE,
  strengthDetail,
  strengthMethodNote,
  strengthMissingText,
  streakText,
  waterSummary,
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

  test('tahmini maksimumun son noktasından sonraki çok tekrarlı günler', () => {
    const points = [
      point('2026-08-10', { topKg: 12.5, e1rm: 17.5 }),
      point('2026-08-17', { topKg: 12.5 }),
      point('2026-08-24', { topKg: 12.5, e1rm: 17.9 }),
      point('2026-08-31', { topKg: 12.5 }),
      point('2026-09-07', { bestReps: 12 }),
      point('2026-09-14', { topKg: 12.5 }),
    ];
    // Aradaki çok tekrarlı gün sayılmaz (grafik ondan sonra devam ediyor); yüksüz gün de sayılmaz.
    assert.equal(highRepDaysSince(points), 2);
    assert.equal(highRepDaysSince(points, '2026-09-10'), 1);
    assert.equal(highRepDaysSince(points.slice(0, 3)), 0);
    assert.equal(highRepDaysText(1), 'Son antrenman gününde bütün setler 12\'den çok tekrarlı; tahmini maksimum o günler için hesaplanmaz. Ağırlığın “En ağır”da, güç gelişimin Gelişim\'de görünür.');
    assert.ok(highRepDaysText(3).startsWith('Son 3 antrenman gününde'));
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

describe('Gelişim metinleri', () => {
  for (const [ratio, text] of [
    [0.084, '+%8,4'],
    [0.12345, '+%12,3'],
    [-0.03, '−%3'],
    [0, '±%0'],
  ] as const) {
    test(`değişim ${ratio} → ${text}`, () => assert.equal(formatChangePct(ratio), text));
  }

  test('çizginin başı, sonu, değişimi ve olası aralığı', () => {
    assert.equal(
      strengthDetail({
        metric: 'e1rm',
        points: [],
        fit: { from: '2026-08-30', to: '2026-09-27', start: 60, end: 68, change: 8, low: 5.34, high: 10.46, changePct: 8 / 60 },
      }),
      '≈ 60 → 68 kg (+%13,3) · olası değişim +5,3 – +10,5 kg',
    );
    assert.equal(
      strengthDetail({
        metric: 'reps',
        points: [],
        fit: { from: '2026-08-30', to: '2026-09-27', start: 10, end: 10.5, change: 0.5, low: -1, high: 2, changePct: 0.05 },
      }),
      '≈ 10 → 10,5 tekrar (+%5) · olası değişim −1 – +2 tekrar',
    );
  });

  const day = (date: string) => ({ date, value: 1 });
  for (const [name, exercise, text] of [
    [
      'az antrenman günü',
      { missing: 'too_few_points' as const, points: [day('2026-09-13'), day('2026-09-20'), day('2026-09-27')] },
      'Karar için bu dönemde en az 4 antrenman günü gerekir; şimdilik 3.',
    ],
    [
      'kısa süre',
      { missing: 'too_short_span' as const, points: [day('2026-09-15'), day('2026-09-19'), day('2026-09-23'), day('2026-09-27')] },
      'Kayıtların en az 3 haftaya yayılması gerekir; bu dönemde 12 güne sığıyor.',
    ],
  ] as const) {
    test(`karar yoksa: ${name}`, () => {
      assert.equal(strengthMissingText(exercise), text);
      assert.equal(strengthDetail({ metric: 'e1rm', ...exercise }), text);
    });
  }

  const labels: Record<string, string> = { chest_upper: 'Üst göğüs', chest_lower: 'Alt göğüs', triceps_long: 'Triceps (uzun baş)' };
  for (const [name, roles, text] of [
    ['hepsi aynı rol', [{ muscle: 'chest_upper', role: 'primary' }, { muscle: 'chest_lower', role: 'primary' }], 'Hedef'],
    [
      'kas kas',
      [
        { muscle: 'chest_upper', role: 'secondary' },
        { muscle: 'chest_lower', role: 'primary' },
        { muscle: 'triceps_long', role: 'secondary' },
      ],
      'Hedef: alt göğüs · Yardımcı: üst göğüs, triceps (uzun baş)',
    ],
  ] as const) {
    test(`hareketin rolü: ${name}`, () => assert.equal(groupRoleText(roles, (muscle) => labels[muscle] ?? muscle), text));
  }

  for (const [change, text] of [
    [{ id: 'arm_flexed_girth', key: 'right', delta: 0.6, kind: null }, 'Kol çevresi (kasılı), sağ: +0,6 cm'],
    [{ id: 'mid_thigh_girth', key: 'left', delta: -0.4, kind: null }, 'Uyluk çevresi (orta), sol: −0,4 cm'],
    [{ id: 'hip_girth', key: 'value', delta: 1, kind: 'no_real_change' }, 'Kalça çevresi: +1 cm · ölçüm hatası payı içinde'],
    [{ id: 'hip_girth', key: 'value', delta: 3, kind: 'increased' }, 'Kalça çevresi: +3 cm'],
  ] as const) {
    test(`çevre: ${text}`, () => assert.equal(circumferenceText(change), text));
  }

  test('yöntem notu: Theil–Sen, aralık kuralı, eşikler, çok tekrarlı gün, rol payları ve "büyüme değil"', () => {
    const note = STRENGTH_METHOD_NOTE.join(' ');
    for (const part of ['Theil–Sen', '≈%80', 'en az 4 antrenman günü ve 3 hafta', '12\'den çok tekrarla yaptığın gün de sayılır', 'yardımcı kas yarım', 'kasın büyüdüğünü tek başına göstermez']) {
      assert.ok(note.includes(part), part);
    }
  });
});

describe('grafik bölümü metinleri', () => {
  test('son 4 haftanın ortalaması: bugün dahil 28 gün', () => {
    const points = [
      { date: '2026-08-30', value: 100 },
      { date: '2026-08-31', value: 6 },
      { date: '2026-09-27', value: 7 },
      { date: '2026-09-28', value: 100 },
    ];
    assert.deepEqual(recentAverage(points, '2026-09-27'), { average: 6.5, count: 2 });
    assert.equal(recentAverage([], '2026-09-27'), null);
  });

  for (const [recent, text] of [
    [{ done: 11, planned: 12, weeks: 4 }, 'Son 4 tamamlanan haftada 11/12 gün (%92).'],
    [{ done: 3, planned: 3, weeks: 1 }, 'Geçen hafta 3/3 gün (%100).'],
  ] as const) {
    test(`düzen: ${text}`, () => assert.equal(adherenceText(recent), text));
  }

  test('su: kayıtlı gün ve o günlerin ortalaması', () => {
    assert.deepEqual(waterSummary([{ glasses: 0 }, { glasses: 5 }, { glasses: 8 }, { glasses: 0 }]), { recorded: 2, average: 6.5 });
    assert.deepEqual(waterSummary([{ glasses: 0 }]), { recorded: 0, average: null });
  });
});

describe('kime yazıldığı: danışan ve PT', () => {
  /** Metinlerin hepsi, işlevler örnek değerlerle çağrılmış. */
  function texts(copy: ReturnType<typeof progressCopy>): string[] {
    return Object.values(copy).flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value;
      const call = value as (arg: never) => string;
      return [call(3 as never), call('Son 8 haftada' as never)];
    });
  }

  // Danışana yazılan ikinci tekil biçimler; PT metninde hiçbiri olmamalı.
  const SECOND_PERSON = /kaldırdığın|yaptığın|yaptığında|içtiğin|girdiğin|eklediğin|çalıştırdığın|ağrın\b|antrenörüne|cevapların|kaydın\b|planın|planındır|haftan\b|deneyimin|iyilerin|iyini|kırdın|Ölçümlerin|puanın|seçtiğin|setlerini|kazandın|İlerlemen|dokun/;

  test('PT: ikinci tekil yok; ad yalnız özne ("Ayşe kaldırınca"), eksiz', () => {
    const copy = progressCopy('pt', 'Ayşe');
    for (const text of texts(copy)) assert.doesNotMatch(text, SECOND_PERSON, text);
    assert.equal(copy.strengthIntro, 'Ayşe hangi kasında güç kazandı: hareketlerindeki en iyi setlerin gidişatı.');
    assert.equal(copy.recordSessions(2), '2 antrenmanda rekor kırdı');
    assert.ok(copy.recordsEmpty.includes('Ayşe bir harekette daha ağır kaldırınca'));
    assert.ok(copy.painFootnote.includes('Ayşe ile konuş'));
    assert.equal(copy.firstWorkout('3 Ağustos 2026'), 'İlk antrenman 3 Ağustos 2026');
    assert.equal(copy.unavailable('Su kaydı'), 'Su kaydı şu an okunamadı. Biraz sonra sayfayı yenile.');
    // Ad verilmezse "Danışan".
    assert.ok(progressCopy('pt').effortEmpty.startsWith('Danışan antrenman sonrası'));
  });

  test('danışan: önceki metinler aynen', () => {
    const copy = progressCopy('client');
    assert.equal(copy.strengthIntro, 'Hangi kasında güç kazandın: hareketlerindeki en iyi setlerin gidişatı.');
    assert.equal(copy.recordSessions(3), '3 antrenmanda rekor kırdın');
    assert.equal(copy.unavailable('Su kaydın'), 'Su kaydın şu an okunamadı. Biraz sonra yeniden dene; sürerse antrenörüne haber ver.');
    assert.equal(copy.firstWorkout('3 Ağustos 2026'), 'İlk antrenmanın 3 Ağustos 2026');
    assert.equal(copy.e1rmNote, e1rmNote());
    assert.deepEqual(copy.methodNote, STRENGTH_METHOD_NOTE);
    assert.equal(copy.highRepDays(1), highRepDaysText(1));
  });

  test('PT: yöntem notu, tahmini maksimum, çok tekrarlı günler, başarı', () => {
    assert.ok(strengthMethodNote('pt')[0]!.includes("Bütün setleri 12'den çok tekrarlı gün de sayılır"));
    assert.deepEqual(strengthMethodNote('pt').slice(1), STRENGTH_METHOD_NOTE.slice(1));
    assert.ok(e1rmNote('pt').startsWith('Tek tekrarda kaldırabileceği en ağır yükün tahmini; kaldırması gereken'));
    assert.ok(highRepDaysText(2, 'pt').endsWith("Ağırlık “En ağır”da, güç gelişimi Gelişim'de görünür."));
    assert.equal(achievementDetail({ id: 'first_workout', achievedOn: null, current: 0, target: 1 }, 1, 'pt'), 'İlk antrenmanını bitirince.');
    assert.equal(achievementDetail({ id: 'first_record', achievedOn: null, current: 0, target: 1 }, 1, 'pt'), 'Bir harekette en iyisini geçince.');
    assert.equal(achievementDetail({ id: 'workouts_25', achievedOn: null, current: 12, target: 25 }, 3, 'pt'), '12/25 antrenman');
  });
});
