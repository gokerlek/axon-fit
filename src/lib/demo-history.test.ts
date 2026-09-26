import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {
  chooseValue,
  clampWeeks,
  DECLINE_WEEKS,
  DEMO_DEFAULT_WEEKS,
  DEMO_WRITER,
  demoCalendar,
  demoSessionId,
  demoTapId,
  demoWeekdays,
  effortOf,
  generateDemoHistory,
  isDemoSessionId,
  isDemoTapId,
  repsAt,
  seededRandom,
  zonedTime,
} from './demo-history.ts';
import { todayIn } from './format.ts';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { exerciseStrength } from './muscle-progress.ts';
import { mondayOf, nextDayId } from './program-plan.ts';
import { buildProgressView, digestSession } from './progress.ts';
import type { HealthField } from './schemas/client.ts';
import { healthCheckInSchema } from './schemas/health.ts';
import { parseStoredSession, SESSION_ID_PATTERN, sessionIndexRowSchema, waterTapSchema, type SessionDoc } from './schemas/session.ts';
import { indexRowOf } from './session-index.ts';
import { addDays, isoWeekdayOf } from './training-days.ts';
import { DEMO_DEVICES, DEMO_EXERCISES, DEMO_NOW, DEMO_TODAY, DEMO_TZ, demoClient, demoProgram } from './testing/demo-fixtures.ts';

function generate(
  options: { fields?: HealthField[]; seed?: string | number; weeks?: number; program?: ReturnType<typeof demoProgram>; declining?: boolean } = {},
) {
  return generateDemoHistory({
    program: options.program ?? demoProgram(),
    exercises: DEMO_EXERCISES,
    devices: DEMO_DEVICES,
    client: demoClient(options.fields ?? ['readiness', 'check_in']),
    now: DEMO_NOW,
    timeZone: DEMO_TZ,
    seed: options.seed ?? 1,
    weeks: options.weeks,
    ...(options.declining !== undefined ? { declining: options.declining } : {}),
  });
}

// Pahalı kısım bir kez: 12 haftalık geçmiş, hazır oluşluk ve ağrı takibi onaylı.
const full = generate();
const working = (doc: SessionDoc) => doc.entries.flatMap((entry) => entry.sets.filter((set) => set.type === 'working'));

describe('deneme geçmişi: kimlikler ve tohum', () => {
  test('kimlikler şemaya uyar ve önekle tanınır', () => {
    for (const [id, demo] of [
      [demoSessionId(0), true],
      [demoSessionId(35), true],
      [demoSessionId(36 ** 4 - 1), true],
      ['s_k2m9x4qa', false],
    ] as const) {
      assert.equal(SESSION_ID_PATTERN.test(id), true, id);
      assert.equal(isDemoSessionId(id), demo, id);
    }
    assert.equal(demoSessionId(10), 's_demo000a');
    for (const [id, demo] of [
      [demoTapId(0), true],
      [demoTapId(1295), true],
      ['wt_aaaaaaaa', false],
    ] as const) {
      assert.equal(v.is(waterTapSchema, { id, d: 1, at: '2026-09-26T08:00:00.000Z' }), true, id);
      assert.equal(isDemoTapId(id), demo, id);
    }
  });

  test('tohum belirlenimli: aynı tohum aynı dizi, başka tohum başka dizi; sınırlar', () => {
    const a = seededRandom('Test Ali');
    const b = seededRandom('Test Ali');
    const c = seededRandom(2);
    const first = Array.from({ length: 20 }, () => a.next());
    assert.deepEqual(Array.from({ length: 20 }, () => b.next()), first);
    assert.notDeepEqual(Array.from({ length: 20 }, () => c.next()), first);
    for (let i = 0; i < 500; i++) {
      const value = a.int(3, 7);
      assert.ok(value >= 3 && value <= 7 && Number.isInteger(value));
      assert.ok(a.next() < 1);
    }
    assert.equal(a.bytes(16).length, 16);
  });

  test('hafta sayısı: yoksa 12, 1–52 arasına kırpılır', () => {
    for (const [input, expected] of [
      [undefined, DEMO_DEFAULT_WEEKS],
      [Number.NaN, DEMO_DEFAULT_WEEKS],
      [0, 1],
      [4.4, 4],
      [80, 52],
    ] as const) {
      assert.equal(clampWeeks(input), expected, String(input));
    }
  });
});

describe('deneme geçmişi: takvim', () => {
  test('antrenman günleri: danışanınki ?? PT\'ninki, yoksa sıklığa göre, o da yoksa 3 gün', () => {
    const cases: [ReturnType<typeof demoProgram>, number[]][] = [
      [demoProgram({ weekdays: [2, 4, 6] }), [2, 4, 6]],
      [demoProgram({ weekdays: null, daysPerWeek: 2 }), [2, 5]],
      [demoProgram({ weekdays: null, daysPerWeek: 4 }), [1, 2, 4, 5]],
      [demoProgram({ weekdays: null }), [1, 3, 5]],
    ];
    for (const [program, expected] of cases) assert.deepEqual(demoWeekdays(program), expected);
    const own = { ...demoProgram({ weekdays: [1, 3, 5] }), clientSchedule: { weekdays: [2, 7], at: '2026-06-03T10:00:00.000Z' } };
    assert.deepEqual(demoWeekdays(own), [2, 7]);
  });

  test('tarihler: bugünden önceki haftalarda seçili günler; 4+ haftada yolun ~%40\'ında bir hafta boş', () => {
    const cases = [
      { weeks: 12, weekdays: [1, 3, 5], count: 33, from: '2026-07-05', missed: '2026-08-03' },
      { weeks: 2, weekdays: [1, 3, 5], count: 6, from: '2026-09-13', missed: null },
      { weeks: 4, weekdays: [7], count: 3, from: '2026-08-30', missed: '2026-09-07' },
    ];
    for (const item of cases) {
      const { from, dates, missedWeek } = demoCalendar({ today: DEMO_TODAY, weeks: item.weeks, weekdays: item.weekdays });
      assert.equal(from, item.from);
      assert.equal(missedWeek, item.missed);
      assert.equal(dates.length, item.count, JSON.stringify(item));
      for (const date of dates) {
        assert.ok(date >= from && date < DEMO_TODAY);
        assert.ok(item.weekdays.includes(isoWeekdayOf(date)));
        assert.notEqual(mondayOf(date), missedWeek);
      }
      assert.deepEqual([...dates].sort(), dates);
    }
  });

  test('yerel saat → an: saat dilimi ve yaz saati', () => {
    for (const [day, minutes, zone, expected] of [
      ['2026-09-01', 18 * 60 + 30, 'Europe/Istanbul', '2026-09-01T15:30:00.000Z'],
      ['2026-07-01', 18 * 60, 'America/New_York', '2026-07-01T22:00:00.000Z'],
      ['2026-01-15', 18 * 60, 'America/New_York', '2026-01-15T23:00:00.000Z'],
      ['2026-03-29', 10 * 60, 'Europe/Berlin', '2026-03-29T08:00:00.000Z'],
      ['2026-09-01', 0, 'UTC', '2026-09-01T00:00:00.000Z'],
    ] as const) {
      assert.equal(zonedTime(day, minutes, zone).toISOString(), expected, `${day} ${zone}`);
    }
  });
});

describe('deneme geçmişi: danışanın bedeni', () => {
  test('Epley\'in tersi: tahmini maksimumla o ağırlıkta en çok tekrar (0–50)', () => {
    for (const [e1rm, kg, reps] of [
      [100, 75, 10],
      [100, 100, 0],
      [100, 120, 0],
      [60, 20, 50],
      [100, 0, 50],
      [42, 35, 6],
    ] as const) {
      assert.equal(repsAt(e1rm, kg), reps, `${e1rm}/${kg}`);
    }
  });

  test('setin değeri: bol payda tepeye kadar (yedek bırakarak), hedef tutuyorsa hedef, yetmiyorsa yapabildiği', () => {
    const base = { push: 4, reserve: 3 };
    const cases = [
      { input: { available: 15, aim: 6, top: 10 }, value: 10, margin: 5 },
      { input: { available: 12, aim: 8, top: 10 }, value: 9, margin: 3 },
      { input: { available: 10, aim: 8, top: 10 }, value: 8, margin: 2 },
      { input: { available: 5, aim: 6, top: 10 }, value: 5, margin: 0 },
      { input: { available: 0, aim: 6, top: 10 }, value: 1, margin: 0 },
      { input: { available: 14, aim: 13, top: 12 }, value: 13, margin: 1 },
      { input: { available: 17, aim: 8, top: 12, amrap: true }, value: 17, margin: 0 },
    ];
    for (const item of cases) {
      assert.deepEqual(chooseValue({ ...base, ...item.input }), { value: item.value, margin: item.margin }, JSON.stringify(item.input));
    }
  });

  test('zorluk cevabı yedekteki tekrardan', () => {
    for (const [margin, effort] of [
      [0, 'hard'],
      [1, 'hard'],
      [2, 'good'],
      [3, 'good'],
      [4, 'easy'],
      [9, 'easy'],
    ] as const) {
      assert.equal(effortOf(margin), effort);
    }
  });
});

describe('deneme geçmişi: üretim', () => {
  test('her antrenman şemaya uyar, bitmiş, deneme kimlikli, geçmişte ve danışanın günlerinde', () => {
    const { sessions, summary } = full;
    assert.equal(sessions.length, 33);
    assert.equal(summary.sessions, 33);
    const ids = new Set<string>();
    let previous = 0;
    for (const doc of sessions) {
      assert.ok(parseStoredSession(doc), doc.id);
      assert.equal(doc.status, 'finished');
      assert.ok(isDemoSessionId(doc.id));
      assert.ok(!ids.has(doc.id));
      ids.add(doc.id);
      assert.equal(doc.writer, DEMO_WRITER);
      assert.equal(doc.date, todayIn(DEMO_TZ, new Date(doc.startedAt)));
      assert.ok(doc.date < DEMO_TODAY && [1, 3, 5].includes(isoWeekdayOf(doc.date)));
      assert.notEqual(mondayOf(doc.date), summary.missedWeek);
      const started = Date.parse(doc.startedAt);
      const finished = Date.parse(doc.finishedAt as string);
      assert.ok(started > previous && finished > started && finished < DEMO_NOW.getTime());
      previous = finished;
      if (doc.effort) assert.ok(Date.parse(doc.effort.updatedAt) < DEMO_NOW.getTime());
      assert.ok(working(doc).length > 0);
    }
  });

  test('index satırları dosyalarla aynı (sha dahil) ve şemaya uyar; rekorlar sayılmış', () => {
    const rows = new Map(full.index.items.map((row) => [row.id, row]));
    assert.equal(rows.size, full.sessions.length);
    for (const doc of full.sessions) {
      const row = rows.get(doc.id);
      assert.ok(row && v.is(sessionIndexRowSchema, row), doc.id);
      const { prs: _prs, ...rest } = row;
      const { prs: _own, ...expected } = indexRowOf(doc, gitBlobSha(jsonText(doc)));
      assert.deepEqual(rest, expected);
    }
    assert.ok(full.index.items.reduce((sum, row) => sum + (row.prs ?? 0), 0) > 10);
  });

  test('belirlenimli: aynı girdi aynı geçmiş; başka tohum başka geçmiş', () => {
    assert.deepEqual(generate(), full);
    const other = generate({ seed: 2 });
    assert.notDeepEqual(other.sessions, full.sessions);
    assert.deepEqual(
      other.sessions.map((doc) => doc.date),
      full.sessions.map((doc) => doc.date),
    );
  });

  test('rotasyon programla tutarlı: başka gün bildirimi yok, son antrenman sıradaki günden önceki gün', () => {
    for (const rotation of [{}, { lastDayId: 'd_aaaaaa' }, { lastDayId: 'd_bbbbbb' }]) {
      const program = demoProgram({ rotation });
      const { sessions } = generate({ program, weeks: 3 });
      const days = ['d_aaaaaa', 'd_bbbbbb', 'd_cccccc'];
      const next = days.indexOf(nextDayId(program) ?? '');
      assert.equal(sessions.at(-1)?.program?.dayId, days[(next + 2) % 3], JSON.stringify(rotation));
      for (const [position, doc] of sessions.entries()) {
        assert.equal(doc.notices.some((notice) => notice.kind === 'other_day'), false);
        if (position > 0) assert.equal(days.indexOf(doc.program?.dayId ?? ''), (days.indexOf(sessions[position - 1]?.program?.dayId ?? '') + 1) % 3);
      }
    }
  });

  test('tıkanma: üç antrenman üst üste alt sınırın altında set, sonra motorun hafifletmesi ve toparlanma', () => {
    const { stall } = full.summary;
    assert.ok(stall?.deload);
    const series = full.sessions.flatMap((doc) =>
      doc.entries.filter((entry) => entry.exerciseId === stall.exerciseId && entry.status !== 'skipped').map((entry) => ({ date: doc.date, entry })),
    );
    const deload = series.findIndex((item) => item.date === stall.deload);
    assert.equal(series[deload]?.entry.plan?.reason, 'deload');
    for (const item of series.slice(deload - 3, deload)) {
      const sets = item.entry.sets.filter((set) => set.type === 'working');
      assert.ok(sets.some((set) => (set.reps ?? 0) < (set.target?.min ?? 0)), item.date);
      assert.ok(sets.some((set) => (set.reps ?? 0) >= (set.target?.min ?? 0)), item.date);
    }
    const after = series.slice(deload + 1).flatMap((item) => item.entry.sets.filter((set) => set.type === 'working'));
    assert.ok(after.length > 0 && after.every((set) => (set.reps ?? 0) >= (set.target?.min ?? 0)));
    // İlk kayıttan sona ağırlık artmış (yeni başlayan kazanımı).
    const first = Math.max(...series[0]!.entry.sets.map((set) => set.kg ?? 0));
    const last = Math.max(...series.at(-1)!.entry.sets.map((set) => set.kg ?? 0));
    assert.ok(last > first);
  });

  test('senaryo: hafif gün, geçilen hareket (bitişte neden), yarım antrenman bildirimi, su, seans zorluğu, zorluk cevapları', () => {
    const { sessions, summary } = full;
    const light = sessions.find((doc) => doc.id === summary.lighter?.sessionId);
    assert.equal(summary.lighter?.via, 'readiness');
    assert.equal(light?.adjust, 'lighter');
    assert.ok(light?.notices.some((notice) => notice.kind === 'lighter'));
    assert.ok(light?.entries.some((entry) => entry.plan?.reason === 'lighten'));
    assert.notEqual(summary.lighter?.date, summary.stall?.deload);

    const skipped = sessions.flatMap((doc) => doc.entries.filter((entry) => entry.status === 'skipped').map((entry) => ({ doc, entry })));
    assert.equal(new Set(skipped.map((item) => item.doc.id)).size, summary.skipped);
    assert.ok(summary.skipped >= 2);
    for (const { doc, entry } of skipped) {
      assert.ok(entry.skip?.reason && entry.skip.reason !== 'other');
      assert.ok(doc.notices.some((notice) => notice.kind === 'unfinished'));
    }
    assert.ok(sessions.every((doc) => doc.waterTaps.length >= 1));

    const rated = sessions.filter((doc) => doc.effort?.sessionRpe !== undefined);
    assert.equal(rated.length, sessions.length - summary.unanswered);
    assert.ok(rated.length >= sessions.length * 0.7);
    for (const doc of rated) assert.ok(doc.effort!.sessionRpe! >= 1 && doc.effort!.sessionRpe! <= 10 && (doc.effort!.durationMin ?? 0) >= 20);

    const efforts = new Set<string>(sessions.flatMap((doc) => working(doc).map((set) => set.effort ?? 'none')));
    for (const effort of ['easy', 'good', 'hard', 'none']) assert.ok(efforts.has(effort), effort);
    // İlk kez: danışan kendi ağırlığını girip aşırı yükü onaylar (PT'ye bildirim).
    assert.ok(sessions[0]?.notices.some((notice) => notice.kind === 'overload'));
  });

  test('su (water.json): deneme kimlikli, benzersiz, şemaya uyar, hepsi geçmişte', () => {
    const ids = new Set(full.waterTaps.map((tap) => tap.id));
    assert.equal(ids.size, full.waterTaps.length);
    assert.ok(full.waterTaps.length > 200);
    for (const tap of full.waterTaps) {
      assert.ok(v.is(waterTapSchema, tap) && isDemoTapId(tap.id));
      assert.ok(Date.parse(tap.at) < DEMO_NOW.getTime());
    }
  });
});

describe('deneme geçmişi: gerileme senaryosu (isteğe bağlı)', () => {
  const declining = generate({ declining: true });
  const decline = declining.summary.decline;

  /** Hareketin İlerleme'deki serisi ve Gelişim kararı (danışan ekranıyla aynı hesap). */
  function strengthOf(history: typeof declining, exerciseId: string, window: '4h' | '8h') {
    const view = buildProgressView({
      index: history.index,
      digests: history.sessions.map((doc) => digestSession(doc)),
      now: DEMO_NOW,
      today: DEMO_TODAY,
      exercises: DEMO_EXERCISES,
      deviceNames: new Map(),
      setWeightsOf: (exercise) => Object.fromEntries(exercise.primaryMuscles.map((muscle) => [muscle, 1])),
    });
    const source = view.exercises.find((item) => item.exerciseId === exerciseId);
    assert.ok(source, exerciseId);
    return exerciseStrength(source, { today: DEMO_TODAY, window });
  }

  test('kapalıyken (varsayılan) üretim birebir aynı; gerileme yok', () => {
    assert.equal(full.summary.decline, null);
    assert.deepEqual(generate({ declining: false }), full);
  });

  test('açıkken: tıkanandan başka ağırlıklı hareket son haftalarda geriler; Gelişim "Geriledi" der', () => {
    assert.ok(decline);
    assert.notEqual(decline.exerciseId, declining.summary.stall?.exerciseId);
    assert.ok(decline.from >= addDays(DEMO_TODAY, -7 * DECLINE_WEEKS) && decline.from < DEMO_TODAY, decline.from);
    for (const window of ['4h', '8h'] as const) {
      const strength = strengthOf(declining, decline.exerciseId, window);
      assert.equal(strength.status, 'declined', window);
      // Gerçekçi: birkaç haftada tahmini maksimumun ~%5–15'i, çöküş değil.
      assert.ok(strength.fit && strength.fit.changePct !== null && strength.fit.changePct > -0.2 && strength.fit.changePct < -0.03, String(strength.fit?.changePct));
    }
    // Kapalıyken aynı hareket gerilemez.
    assert.notEqual(strengthOf(full, decline.exerciseId, '8h').status, 'declined');
  });

  test('açıkken de geçmiş şemaya uyar ve öteki senaryolar sürer', () => {
    for (const doc of declining.sessions) assert.ok(parseStoredSession(doc), doc.id);
    assert.ok(declining.summary.stall?.deload);
    assert.ok(declining.summary.lighter);
    assert.equal(declining.sessions.length, full.sessions.length);
  });
});

describe('deneme geçmişi: onay', () => {
  const cases: { fields: HealthField[]; readiness: boolean; pain: boolean; lighter: 'readiness' | 'weight' }[] = [
    { fields: [], readiness: false, pain: false, lighter: 'weight' },
    { fields: ['readiness'], readiness: true, pain: false, lighter: 'readiness' },
    { fields: ['check_in'], readiness: false, pain: true, lighter: 'weight' },
    { fields: ['measurements'], readiness: false, pain: false, lighter: 'weight' },
    { fields: ['readiness', 'check_in'], readiness: true, pain: true, lighter: 'readiness' },
  ];
  for (const item of cases) {
    test(`parçalar [${item.fields.join(', ')}]: yalnız onaylı yoklama; seans zorluğu onaysız da`, () => {
      const history = item.fields.join() === 'readiness,check_in' ? full : generate({ fields: item.fields });
      const { checkIns, sessions, summary } = history;
      assert.equal(checkIns.length > 0, item.readiness || item.pain);
      assert.equal(summary.checkIns, checkIns.length);
      const ids = new Set(sessions.map((doc) => doc.id));
      for (const checkIn of checkIns) {
        assert.ok(v.is(healthCheckInSchema, checkIn));
        assert.ok(checkIn.sessionId && ids.has(checkIn.sessionId));
      }
      assert.equal(checkIns.some((checkIn) => checkIn.readiness), item.readiness);
      assert.equal(checkIns.some((checkIn) => checkIn.painBaseline !== undefined || checkIn.painPeak !== undefined || checkIn.redFlag), item.pain);
      // İyi huylu: kural hiçbir antrenmanı durdurmaz, ağrıyla geri çekmez.
      assert.equal(checkIns.some((checkIn) => (checkIn.redFlag && checkIn.redFlag !== 'none') || (checkIn.painPeak ?? 0) > 3), false);
      assert.equal(checkIns.some((checkIn) => checkIn.adjustReason === 'pain'), false);

      assert.equal(summary.lighter?.via, item.lighter);
      const light = sessions.find((doc) => doc.id === summary.lighter?.sessionId);
      if (item.lighter === 'weight') {
        assert.equal(light?.adjust, undefined);
        const lighter = light?.entries.filter((entry) => entry.lighter) ?? [];
        assert.ok(lighter.length > 0);
        for (const set of lighter.flatMap((entry) => entry.sets.filter((one) => one.type === 'working'))) assert.ok((set.kg ?? 0) < (set.plannedKg ?? 0));
      } else {
        assert.equal(checkIns.find((checkIn) => checkIn.sessionId === light?.id)?.adjustReason, 'readiness');
      }
      assert.ok(sessions.filter((doc) => doc.effort?.sessionRpe !== undefined).length > sessions.length / 2);
    });
  }
});
