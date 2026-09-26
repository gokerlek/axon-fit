import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adherenceOf,
  buildInsights,
  chartStart,
  painPoints,
  readinessPoints,
  rpePoints,
  waterDays,
  WATER_DAYS,
  type HealthParts,
} from './progress-insights.ts';
import type { WeekView } from './progress.ts';
import type { HealthCheckIn } from './schemas/health.ts';
import type { SessionIndex, SessionIndexRow } from './schemas/session.ts';

const TODAY = '2026-09-27';
const TZ = 'Europe/Istanbul';

function week(weekStart: string, days: number): WeekView {
  const end = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  return { weekStart, weekEnd: end, sessions: days, days, volumeKg: 0, sets: 0, muscles: {} };
}

function row(id: string, date: string, water: number, fields: Partial<SessionIndexRow> = {}): SessionIndexRow {
  return {
    id,
    sha: 'a'.repeat(40),
    path: `sessions/${id}.json`,
    date,
    startedAt: `${date}T15:00:00.000Z`,
    finishedAt: `${date}T16:00:00.000Z`,
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: 0,
    water,
    exercises: [],
    notices: [],
    ...fields,
  };
}

const index = (items: SessionIndexRow[]): SessionIndex => ({ version: 1, items, deleted: [] });

test('grafiklerin ilk günü: bu haftanın pazartesisinden 11 hafta önce', () => {
  assert.equal(chartStart(TODAY), '2026-07-06');
  assert.equal(chartStart('2026-09-21'), '2026-07-06');
});

describe('antrenman düzeni', () => {
  // 31 Ağu haftası ilk hafta (başlangıç), 21 Eyl haftası sürüyor.
  const weeks = [week('2026-08-31', 1), week('2026-09-07', 3), week('2026-09-14', 2), week('2026-09-21', 1)];
  const cases: {
    name: string;
    weeks: WeekView[];
    planned: number | undefined;
    firstDate: string | null;
    expected: { planned: number | null; recent: { done: number; planned: number; weeks: number } | null };
  }[] = [
    {
      name: 'ilk hafta ve bu hafta özete girmez',
      weeks,
      planned: 3,
      firstDate: '2026-09-04',
      expected: { planned: 3, recent: { done: 5, planned: 6, weeks: 2 } },
    },
    {
      name: 'plandan fazlası sayılmaz; en çok son 4 tamamlanmış hafta',
      weeks: [week('2026-08-03', 3), week('2026-08-10', 4), week('2026-08-17', 3), week('2026-08-24', 0), week('2026-08-31', 5), week('2026-09-07', 2), week('2026-09-21', 3)],
      planned: 3,
      firstDate: '2026-08-03',
      // Son dört tamamlanmış hafta 17 Ağu–13 Eyl: 3 + 0 + 3 (5 günün 3'ü) + 2.
      expected: { planned: 3, recent: { done: 8, planned: 12, weeks: 4 } },
    },
    { name: 'ilk gün bilinmiyorsa ilk hafta da sayılır', weeks, planned: 2, firstDate: null, expected: { planned: 2, recent: { done: 1 + 2 + 2, planned: 6, weeks: 3 } } },
    { name: 'plan yoksa özet yok', weeks, planned: undefined, firstDate: '2026-09-04', expected: { planned: null, recent: null } },
    { name: 'plan 0 ise yok sayılır', weeks, planned: 0, firstDate: '2026-09-04', expected: { planned: null, recent: null } },
    { name: 'haftada 7 günden fazla plan olmaz', weeks: [week('2026-09-14', 7), week('2026-09-21', 1)], planned: 9, firstDate: null, expected: { planned: 7, recent: { done: 7, planned: 7, weeks: 1 } } },
    { name: 'yalnız bu hafta varsa özet yok', weeks: [week('2026-09-21', 2)], planned: 3, firstDate: '2026-09-22', expected: { planned: 3, recent: null } },
  ];
  for (const item of cases) {
    test(item.name, () => {
      const result = adherenceOf({ weeks: item.weeks, planned: item.planned, firstDate: item.firstDate, today: TODAY });
      assert.deepEqual({ planned: result.planned, recent: result.recent }, item.expected);
      assert.deepEqual(
        result.weeks.map((entry) => entry.current),
        item.weeks.map((entry) => entry.weekEnd >= TODAY),
      );
    });
  }
});

const good = { sleep: 4, energy: 4, soreness: 4, stress: 4 } as const;
const poor = { sleep: 2, energy: 2, soreness: 3, stress: 2 } as const;

describe('sağlık ve zorluk serileri', () => {
  const checkIns: HealthCheckIn[] = [
    { date: '2026-06-30', readiness: good, painBaseline: 5 },
    { date: '2026-09-07', readiness: good, painBaseline: 1, painPeak: 2 },
    { date: '2026-09-09', readiness: good, painBaseline: 2 },
    // Aynı gün ikinci yoklama: hazır oluşlukta sonraki, ağrıda en yüksek.
    { date: '2026-09-09', readiness: poor, painBaseline: 1, painPeak: 4 },
    { date: '2026-09-11', painPeak: 0 },
  ];

  test('hazır oluşluk: 20–100 puan, gün başına bir, aynı gün sonraki; aralık başından öncesi yok', () => {
    assert.deepEqual(readinessPoints(checkIns, '2026-07-06'), [
      { date: '2026-09-07', value: 80 },
      { date: '2026-09-09', value: 45 },
    ]);
    assert.equal(readinessPoints(checkIns).length, 3);
  });

  test('ağrı: öncesi ve antrenmandaki ayrı seriler, gün başına en yüksek', () => {
    assert.deepEqual(painPoints(checkIns, '2026-07-06'), {
      before: [
        { date: '2026-09-07', value: 1 },
        { date: '2026-09-09', value: 2 },
      ],
      peak: [
        { date: '2026-09-07', value: 2 },
        { date: '2026-09-09', value: 4 },
        { date: '2026-09-11', value: 0 },
      ],
    });
  });

  test('seans zorluğu: gün başına ortalama, 0,1\'e yuvarlı; cevapsız antrenman yok', () => {
    assert.deepEqual(
      rpePoints(
        [
          { date: '2026-06-01', rpe: 9 },
          { date: '2026-09-07', rpe: 7 },
          { date: '2026-09-07', rpe: 8 },
          { date: '2026-09-09' },
          { date: '2026-09-11', rpe: 6 },
          { date: '2026-09-11', rpe: 6 },
          { date: '2026-09-11', rpe: 7 },
        ],
        '2026-07-06',
      ),
      [
        { date: '2026-09-07', value: 7.5 },
        { date: '2026-09-11', value: 6.3 },
      ],
    );
  });
});

describe('su', () => {
  const taps = [
    // İstanbul (UTC+3): 26 Eylül 22:30 UTC → 27 Eylül 01:30.
    { d: 1 as const, at: '2026-09-26T22:30:00.000Z' },
    // 26 Eylül 23:00 yerel.
    { d: 1 as const, at: '2026-09-26T20:00:00.000Z' },
    { d: 1 as const, at: '2026-09-26T08:00:00.000Z' },
    // Boş güne "Geri al": 0'ın altına inmez.
    { d: -1 as const, at: '2026-09-20T08:00:00.000Z' },
    // 30 günden eski.
    { d: 1 as const, at: '2026-08-20T08:00:00.000Z' },
  ];
  const rows = index([row('s_aaaaaaa1', '2026-09-26', 3), row('s_aaaaaaa2', '2026-09-25', 2, { finishedAt: undefined }), row('s_aaaaaaa3', '2026-08-01', 4)]);
  const days = waterDays({ taps, index: rows, today: TODAY, timeZone: TZ });
  const on = (date: string) => days.find((day) => day.date === date)?.glasses;

  test('30 gün, eskiden yeniye, bugün dahil', () => {
    assert.equal(days.length, WATER_DAYS);
    assert.equal(days[0]!.date, '2026-08-29');
    assert.equal(days.at(-1)!.date, TODAY);
  });

  for (const [date, glasses, why] of [
    ['2026-09-27', 1, 'gece yarısından sonraki dokunuş yerel güne'],
    ['2026-09-26', 2 + 3, 'o günün dokunuşları ve bitmiş antrenmanın suyu'],
    ['2026-09-25', 0, 'bitmemiş antrenmanın suyu sayılmaz'],
    ['2026-09-20', 0, '"Geri al" 0\'ın altına inmez'],
  ] as const) {
    test(`${date}: ${glasses} bardak (${why})`, () => assert.equal(on(date), glasses));
  }

  test('pencerenin dışındaki dokunuş ve antrenman yok', () => {
    assert.equal(days.reduce((sum, day) => sum + day.glasses, 0), 6);
  });
});

describe('bölümler ve onay', () => {
  const none: HealthParts = { readiness: false, pain: false, measurements: false };
  const all: HealthParts = { readiness: true, pain: true, measurements: true };
  const base = {
    weeks: [week('2026-09-14', 2), week('2026-09-21', 1)],
    plannedDays: 3,
    firstDate: '2026-09-15',
    digests: [{ date: '2026-09-15', rpe: 7 }, { date: '2026-06-01', rpe: 5 }],
    index: index([]),
    water: [] as { d: 1 | -1; at: string }[],
    today: TODAY,
    timeZone: TZ,
  };
  const record = {
    checkIns: [{ date: '2026-09-15', readiness: good, painBaseline: 1 }] satisfies HealthCheckIn[],
    measurements: [
      { date: '2026-09-01', id: 'mid_thigh_girth' as const, side: 'left' as const, value: 55 },
      { date: '2026-09-20', id: 'mid_thigh_girth' as const, side: 'left' as const, value: 55.5 },
    ],
  };

  test('onay yoksa sağlık bölümleri kapalı: kayıt verilse de hesaplanmaz', () => {
    const result = buildInsights({ ...base, health: record, consent: none });
    assert.deepEqual([result.readiness, result.pain, result.circumference], [{ state: 'off' }, { state: 'off' }, { state: 'off' }]);
  });

  test('onay var, kayıt okunamadı: "okunamadı"', () => {
    const result = buildInsights({ ...base, health: 'unavailable', consent: all });
    assert.deepEqual([result.readiness, result.pain, result.circumference], [{ state: 'unavailable' }, { state: 'unavailable' }, { state: 'unavailable' }]);
  });

  test('yalnız onaylı parça; dosya yoksa boş seriler', () => {
    const result = buildInsights({ ...base, health: null, consent: { ...none, readiness: true } });
    assert.deepEqual(result.readiness, { state: 'ok', points: [] });
    assert.deepEqual(result.pain, { state: 'off' });
  });

  test('onaylı kayıttan seriler; çevre her pencere için', () => {
    const result = buildInsights({ ...base, health: record, consent: all });
    assert.deepEqual(result.readiness, { state: 'ok', points: [{ date: '2026-09-15', value: 80 }] });
    assert.deepEqual(result.pain, { state: 'ok', before: [{ date: '2026-09-15', value: 1 }], peak: [] });
    assert.ok(result.circumference.state === 'ok');
    if (result.circumference.state !== 'ok') return;
    assert.equal(result.circumference.byWindow['4h'][0]?.delta, 0.5);
  });

  test('zorluk son 12 haftadan, düzen haftalardan, su okunamadıysa "okunamadı"', () => {
    const result = buildInsights({ ...base, water: 'unavailable', health: null, consent: none });
    assert.deepEqual(result.rpe, [{ date: '2026-09-15', value: 7 }]);
    assert.equal(result.adherence.planned, 3);
    assert.deepEqual(result.water, { state: 'unavailable' });
  });
});
