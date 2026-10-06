import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  achievementsOf,
  addDays,
  buildProgressView,
  digestSession,
  exercisePoints,
  inferTracking,
  seriesKey,
  seriesOf,
  stageLabel,
  weeklyStreak,
  weeklyViews,
  type SessionDigest,
} from './progress.ts';
import type { SessionIndexExercise, SessionIndexRow } from './schemas/session.ts';
import type { PlanExercise } from './template-plan.ts';
import { at, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

/** `muscles.ts` `@/` takma adıyla içe aktardığı için kesirli set payları burada aynısıyla (hedef 1 · yardımcı 0,5 · dengeleyici 0,25). */
function setWeights(exercise: PlanExercise): Partial<Record<string, number>> {
  const weights: Record<string, number> = {};
  for (const muscle of exercise.stabilizerMuscles ?? []) weights[muscle] = 0.25;
  for (const muscle of exercise.secondaryMuscles) weights[muscle] = 0.5;
  for (const muscle of exercise.primaryMuscles) weights[muscle] = 1;
  return weights;
}

function exercise(id: string, fields: Partial<PlanExercise> = {}): PlanExercise {
  return { id, title: id, category: 'compound', trackingType: 'weight_reps', equipment: 'barbell', primaryMuscles: [], secondaryMuscles: [], ...fields };
}

const CATALOG = new Map<string, PlanExercise>([
  ['bench-press', exercise('bench-press', { title: 'Bench Press', primaryMuscles: ['chest_lower'], secondaryMuscles: ['triceps_long'], stabilizerMuscles: ['abs_upper'] })],
  ['squat', exercise('squat', { title: 'Squat', primaryMuscles: ['quadriceps', 'glutes'] })],
  ['plank', exercise('plank', { title: 'Plank', category: 'isolation', trackingType: 'duration', equipment: 'bodyweight', primaryMuscles: ['abs_upper'] })],
  ['pull-up', exercise('pull-up', { title: 'Barfiks', trackingType: 'bodyweight_reps', equipment: 'bodyweight', primaryMuscles: ['lats_upper'] })],
  ['bisiklet', exercise('bisiklet', { title: 'Bisiklet', category: 'warmup', primaryMuscles: ['quadriceps'] })],
]);

const SHA = 'a'.repeat(40);

function row(id: string, date: string, exercises: Partial<SessionIndexExercise>[] = [], fields: Partial<SessionIndexRow> = {}): SessionIndexRow {
  return {
    id,
    sha: SHA,
    path: `sessions/${id}.json`,
    date,
    startedAt: `${date}T15:00:00.000Z`,
    finishedAt: `${date}T16:00:00.000Z`,
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: exercises.reduce((sum, item) => sum + (item.sets ?? 0), 0),
    water: 0,
    exercises: exercises.map((item) => ({ exerciseId: 'bench-press', sets: 3, full: true, ...item })),
    notices: [],
    ...fields,
  };
}

function digest(id: string, date: string, entries: SessionDigest['entries']): SessionDigest {
  return { id, date, startedAt: `${date}T15:00:00.000Z`, entries };
}

const kgReps = (kg: number, ...reps: number[]) => reps.map((value) => ({ kg, reps: value }));

describe('antrenman özeti', () => {
  test('çalışma setleri; ısınma dışarıda, fazladan set içeride; aynı hareket ve cihaz birleşir; setsiz düşer', () => {
    const doc = sessionDoc({
      entries: [
        sessionEntry('e_aaaaaa', {
          deviceId: 'olympic-bar',
          sets: [
            { id: 'st_warmup01', type: 'warmup', kg: 20, reps: 10, at: at(1) },
            workingSet('st_aaaaaaaa', 2),
            workingSet('st_bbbbbbbb', 4, { extra: true, reps: 8 }),
          ],
        }),
        sessionEntry('e_bbbbbb', { deviceId: 'olympic-bar', oneOff: true, sets: [workingSet('st_cccccccc', 6, { kg: 65, reps: 5 })] }),
        sessionEntry('e_cccccc', { exerciseId: 'plank', title: 'Plank', sets: [workingSet('st_dddddddd', 8, { kg: undefined, reps: undefined, seconds: 45 })] }),
        sessionEntry('e_dddddd', { exerciseId: 'squat', title: 'Squat', status: 'skipped', sets: [] }),
      ],
    });
    assert.deepEqual(digestSession(doc), {
      id: doc.id,
      date: '2026-09-26',
      startedAt: doc.startedAt,
      entries: [
        { exerciseId: 'bench-press', title: 'Bench Press', deviceId: 'olympic-bar', sets: [...kgReps(60, 10), ...kgReps(60, 8), ...kgReps(65, 5)] },
        { exerciseId: 'plank', title: 'Plank', sets: [{ seconds: 45 }] },
      ],
    });
  });

  test('seans zorluğu (CR-10) özete girer; cevaplanmadıysa alan yok', () => {
    const effort = { sessionRpe: 7, durationMin: 55, updatedAt: at(9) };
    assert.equal(digestSession(sessionDoc({ effort })).rpe, 7);
    assert.equal('rpe' in digestSession(sessionDoc({ effort: { durationMin: 55, updatedAt: at(9) } })), false);
    assert.equal('rpe' in digestSession(sessionDoc()), false);
  });

  test('farklı cihazlar ayrı seri anahtarı', () => {
    assert.equal(seriesKey('bench-press', 'smith'), 'bench-press@smith');
    assert.equal(seriesKey('plank'), 'plank');
  });
});

describe('hareketin günlük noktaları', () => {
  test('ağırlıklı: en ağır (o ağırlıkta en çok tekrar), tahmini maksimum, toplam ağırlık', () => {
    const [point] = exercisePoints([{ id: 's_1', date: '2026-09-01', sets: [...kgReps(60, 10, 9), ...kgReps(65, 5)] }]);
    assert.deepEqual(point, {
      date: '2026-09-01',
      topKg: 65,
      topReps: 5,
      e1rm: 80,
      e1rmKg: 60,
      e1rmReps: 10,
      volumeKg: 60 * 10 + 60 * 9 + 65 * 5,
      bestReps: 10,
      totalReps: 24,
      totalSeconds: 0,
      sets: 3,
    });
  });

  test('aynı gün iki antrenman tek nokta: en iyisi ve toplamı', () => {
    const points = exercisePoints([
      { id: 's_1', date: '2026-09-01', sets: kgReps(60, 10) },
      { id: 's_2', date: '2026-09-01', sets: kgReps(62.5, 6) },
      { id: 's_3', date: '2026-09-03', sets: kgReps(60, 8) },
    ]);
    assert.deepEqual(
      points.map((point) => [point.date, point.topKg, point.volumeKg, point.sets]),
      [
        ['2026-09-01', 62.5, 975, 2],
        ['2026-09-03', 60, 480, 1],
      ],
    );
  });

  test('12 tekrarın üstünde tahmini maksimum yok; vücut ağırlığında ağırlık alanları yok', () => {
    const [heavy] = exercisePoints([{ id: 's_1', date: '2026-09-01', sets: kgReps(20, 15) }]);
    assert.equal(heavy?.e1rm, undefined);
    assert.equal(heavy?.topKg, 20);
    const [bodyweight] = exercisePoints([{ id: 's_1', date: '2026-09-01', sets: [{ reps: 12 }, { reps: 10 }] }]);
    assert.deepEqual(bodyweight, { date: '2026-09-01', volumeKg: 0, bestReps: 12, totalReps: 22, totalSeconds: 0, sets: 2 });
  });

  test('süreli: en uzun ve toplam süre; toplam ağırlığa girmez', () => {
    const [point] = exercisePoints([{ id: 's_1', date: '2026-09-01', sets: [{ seconds: 45 }, { seconds: 60, kg: 10 }] }]);
    assert.deepEqual(point, { date: '2026-09-01', volumeKg: 0, totalReps: 0, bestSeconds: 60, totalSeconds: 105, sets: 2 });
  });

  test('kütüphanede olmayan harekette kayıt türü setlerden', () => {
    assert.equal(inferTracking([{ seconds: 30 }]), 'duration');
    assert.equal(inferTracking([{ reps: 10 }, { kg: 5, reps: 8 }]), 'weight_reps');
    assert.equal(inferTracking([{ reps: 10 }, { kg: 0, reps: 8 }]), 'bodyweight_reps');
  });
});

describe('seriler', () => {
  test('eskiden yeniye; ad en son antrenmandaki; cihaz ayrı seri', () => {
    const series = seriesOf([
      digest('s_2', '2026-09-04', [{ exerciseId: 'bench-press', title: 'Bench Press (yeni ad)', deviceId: 'olympic-bar', sets: kgReps(60, 10) }]),
      digest('s_1', '2026-09-01', [
        { exerciseId: 'bench-press', title: 'Bench Press', deviceId: 'olympic-bar', sets: kgReps(57.5, 10) },
        { exerciseId: 'bench-press', title: 'Bench Press', deviceId: 'smith', sets: kgReps(40, 10) },
      ]),
    ]);
    assert.deepEqual([...series.keys()], ['bench-press@olympic-bar', 'bench-press@smith']);
    const bar = series.get('bench-press@olympic-bar')!;
    assert.equal(bar.title, 'Bench Press (yeni ad)');
    assert.deepEqual(bar.sessions.map((session) => session.id), ['s_1', 's_2']);
  });

  test('aşama rozeti: aşama ve kaçıncı hafta; sayılan antrenman yoksa yok', () => {
    assert.equal(stageLabel({ sessions: 5, stage: 'novice', weeks: 4.2 }), 'Başlangıç · 5. hafta');
    assert.equal(stageLabel({ sessions: 1, stage: 'intro', weeks: 0 }), 'Tanışma · 1. hafta');
    assert.equal(stageLabel({ sessions: 0, stage: 'intro', weeks: 0 }), null);
  });
});

describe('haftalar', () => {
  const today = '2026-09-26'; // Cumartesi; hafta 21 Eylül Pazartesi.

  test('kas yükü şablon hesabıyla: hedef 1, yardımcı 0,5, dengeleyici 0,25; ısınma hareketi ve bilinmeyen sayılmaz', () => {
    const [week] = weeklyViews({
      rows: [
        row('s_1', '2026-09-22', [{ exerciseId: 'bench-press', sets: 4 }, { exerciseId: 'bisiklet', sets: 1 }, { exerciseId: 'silinmis', sets: 3 }], { volumeKg: 2400 }),
        row('s_2', '2026-09-24', [{ exerciseId: 'squat', sets: 3 }, { exerciseId: 'bench-press', sets: 2 }], { volumeKg: 1800 }),
      ],
      today,
      exercises: CATALOG,
      setWeightsOf: setWeights,
    });
    assert.deepEqual(week, {
      weekStart: '2026-09-21',
      weekEnd: '2026-09-27',
      sessions: 2,
      days: 2,
      volumeKg: 4200,
      sets: 13,
      muscles: { chest_lower: 6, triceps_long: 3, abs_upper: 1.5, quadriceps: 3, glutes: 3 },
    });
  });

  test('antrenmansız haftalar sıfırla; ilk antrenmanın haftasından geriye gitmez', () => {
    const weeks = weeklyViews({
      rows: [row('s_1', '2026-09-08', [{ sets: 3 }], { volumeKg: 1000 }), row('s_2', '2026-09-23', [{ sets: 3 }], { volumeKg: 1200 })],
      today,
      exercises: CATALOG,
      setWeightsOf: setWeights,
    });
    assert.deepEqual(
      weeks.map((week) => [week.weekStart, week.sessions, week.volumeKg]),
      [
        ['2026-09-07', 1, 1000],
        ['2026-09-14', 0, 0],
        ['2026-09-21', 1, 1200],
      ],
    );
  });

  test('en çok 12 hafta; bitmemiş ve gelecekteki antrenman sayılmaz; aynı gün iki antrenman bir gün', () => {
    const weeks = weeklyViews({
      rows: [
        row('s_old', '2026-01-05', [{ sets: 3 }]),
        row('s_1', '2026-09-22', [{ sets: 3 }]),
        row('s_2', '2026-09-22', [{ sets: 2 }]),
        row('s_3', '2026-09-25', [{ sets: 3 }], { finishedAt: undefined }),
        row('s_4', '2026-09-28', [{ sets: 3 }]),
      ],
      today,
      exercises: CATALOG,
      setWeightsOf: setWeights,
    });
    assert.equal(weeks.length, 12);
    assert.equal(weeks[0]!.weekStart, addDays('2026-09-21', -77));
    assert.deepEqual([weeks.at(-1)!.sessions, weeks.at(-1)!.days, weeks.at(-1)!.sets], [2, 1, 5]);
  });

  test('antrenman yoksa hafta yok', () => {
    assert.deepEqual(weeklyViews({ rows: [], today, exercises: CATALOG, setWeightsOf: setWeights }), []);
  });
});

describe('haftalık seri', () => {
  const today = '2026-09-26'; // hafta 21 Eylül.
  // [ad, günler, hedef, beklenen {current, best, thisWeek}]
  const cases: [string, string[], number, { current: number; best: number; thisWeek: number }][] = [
    ['antrenman yok', [], 1, { current: 0, best: 0, thisWeek: 0 }],
    ['yalnız bu hafta', ['2026-09-22'], 1, { current: 1, best: 1, thisWeek: 1 }],
    ['bu hafta henüz yok: seri geçen haftadan sayılır, bozulmaz', ['2026-09-08', '2026-09-15'], 1, { current: 2, best: 2, thisWeek: 0 }],
    ['arada boş hafta seriyi keser', ['2026-08-31', '2026-09-14', '2026-09-22'], 1, { current: 2, best: 2, thisWeek: 1 }],
    ['en uzun seri eskide kalabilir', ['2026-08-10', '2026-08-17', '2026-08-24', '2026-09-22'], 1, { current: 1, best: 3, thisWeek: 1 }],
    ['hedef 2: tek günlük hafta tutmaz', ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-22', '2026-09-24'], 2, { current: 1, best: 1, thisWeek: 2 }],
    ['aynı gün iki antrenman bir gün (bu hafta x/3 gibi)', ['2026-09-15', '2026-09-15', '2026-09-22'], 2, { current: 0, best: 0, thisWeek: 1 }],
    ['gelecekteki gün sayılmaz', ['2026-09-28', '2026-10-05'], 1, { current: 0, best: 0, thisWeek: 0 }],
  ];
  for (const [name, dates, target, expected] of cases) {
    test(name, () => {
      const streak = weeklyStreak(dates, today, target);
      assert.deepEqual({ current: streak.current, best: streak.best, thisWeek: streak.thisWeek }, expected);
      assert.equal(streak.target, target);
    });
  }

  test('geçersiz hedef 1 sayılır', () => {
    assert.equal(weeklyStreak([], today, 0).target, 1);
    assert.equal(weeklyStreak([], today, Number.NaN).target, 1);
    assert.equal(weeklyStreak([], today, 2.7).target, 2);
  });
});

describe('başarılar', () => {
  const today = '2026-12-31';
  const byId = (list: ReturnType<typeof achievementsOf>) => Object.fromEntries(list.map((item) => [item.id, item]));

  test('antrenman sayısı: eşiğin aşıldığı günün tarihi; aşılmadıysa ilerleme', () => {
    const dates = Array.from({ length: 12 }, (_, i) => addDays('2026-09-01', i * 3));
    const list = byId(achievementsOf({ dates, recordDates: [], today, weeklyTarget: 1 }));
    assert.deepEqual(list.first_workout, { id: 'first_workout', achievedOn: '2026-09-01', current: 1, target: 1 });
    assert.deepEqual(list.workouts_10, { id: 'workouts_10', achievedOn: dates[9], current: 10, target: 10 });
    assert.deepEqual(list.workouts_25, { id: 'workouts_25', achievedOn: null, current: 12, target: 25 });
    assert.deepEqual(list.workouts_50, { id: 'workouts_50', achievedOn: null, current: 12, target: 50 });
  });

  test('eşikler tablo: 1, 10, 25, 50 antrenman; bir eksikte kazanılmaz', () => {
    const cases: [ReturnType<typeof achievementsOf>[number]['id'], number][] = [
      ['first_workout', 1],
      ['workouts_10', 10],
      ['workouts_25', 25],
      ['workouts_50', 50],
    ];
    for (const [id, target] of cases) {
      const dates = Array.from({ length: target }, (_, i) => addDays('2026-01-01', i));
      const reached = byId(achievementsOf({ dates, recordDates: [], today, weeklyTarget: 1 }))[id];
      assert.deepEqual(reached, { id, achievedOn: dates[target - 1], current: target, target }, `${id}: ${target}`);
      const short = byId(achievementsOf({ dates: dates.slice(1), recordDates: [], today, weeklyTarget: 1 }))[id];
      assert.deepEqual(short, { id, achievedOn: null, current: target - 1, target }, `${id}: ${target - 1}`);
    }
  });

  test('seri eşikleri tablo: 4 ve 12 hafta; bir hafta eksikte kazanılmaz', () => {
    for (const target of [4, 12] as const) {
      const id = target === 4 ? 'streak_4' : 'streak_12';
      // Pazartesiler: 2026-06-01'den başlayarak `target` hafta; bugün son haftanın içinde.
      const dates = Array.from({ length: target }, (_, i) => addDays('2026-06-01', i * 7));
      const last = dates.at(-1)!;
      const reached = byId(achievementsOf({ dates, recordDates: [], today: addDays(last, 2), weeklyTarget: 1 }))[id];
      assert.deepEqual(reached, { id, achievedOn: last, current: target, target });
      const short = byId(achievementsOf({ dates: dates.slice(1), recordDates: [], today: addDays(last, 2), weeklyTarget: 1 }))[id];
      assert.deepEqual(short, { id, achievedOn: null, current: target - 1, target });
    }
  });

  test('sıradan bağımsız: günler sıralanır', () => {
    const list = byId(achievementsOf({ dates: ['2026-09-10', '2026-09-01'], recordDates: [], today, weeklyTarget: 1 }));
    assert.equal(list.first_workout?.achievedOn, '2026-09-01');
  });

  test('seri: 4. haftada hedefin tamamlandığı gün; kazanılan kalıcı, seri sonra bozulsa da', () => {
    // Hedef 2: 7, 14, 21, 28 Eylül haftaları ikişer gün → 4. hafta 1 Ekim'de tamam; sonra ara.
    const dates = ['2026-09-07', '2026-09-09', '2026-09-14', '2026-09-16', '2026-09-21', '2026-09-23', '2026-09-28', '2026-10-01'];
    const list = byId(achievementsOf({ dates, recordDates: [], today, weeklyTarget: 2 }));
    assert.deepEqual(list.streak_4, { id: 'streak_4', achievedOn: '2026-10-01', current: 4, target: 4 });
    assert.deepEqual(list.streak_12, { id: 'streak_12', achievedOn: null, current: 0, target: 12 });
  });

  test('seri kesilirse yeniden 1\'den; ilerleme şu anki seri', () => {
    const dates = ['2026-09-07', '2026-09-14', '2026-09-28', '2026-10-05', '2026-10-12'];
    const list = byId(achievementsOf({ dates, recordDates: [], today: '2026-10-14', weeklyTarget: 1 }));
    assert.deepEqual(list.streak_4, { id: 'streak_4', achievedOn: null, current: 3, target: 4 });
  });

  test('hedefi tutmayan hafta seriyi keser', () => {
    const dates = ['2026-09-07', '2026-09-08', '2026-09-14', '2026-09-21', '2026-09-22', '2026-09-28', '2026-09-29', '2026-10-05', '2026-10-06'];
    const list = byId(achievementsOf({ dates, recordDates: [], today: '2026-10-07', weeklyTarget: 2 }));
    // 14 Eylül haftası tek gün: seri 21 Eylül'den 3 hafta.
    assert.deepEqual(list.streak_4, { id: 'streak_4', achievedOn: null, current: 3, target: 4 });
  });

  test('ilk rekor', () => {
    assert.deepEqual(byId(achievementsOf({ dates: ['2026-09-01'], recordDates: ['2026-09-10', '2026-09-05'], today, weeklyTarget: 1 })).first_record, {
      id: 'first_record',
      achievedOn: '2026-09-05',
      current: 1,
      target: 1,
    });
    assert.deepEqual(byId(achievementsOf({ dates: [], recordDates: [], today, weeklyTarget: 1 })).first_record, {
      id: 'first_record',
      achievedOn: null,
      current: 0,
      target: 1,
    });
  });

  test('az ve sabit liste', () => {
    assert.deepEqual(
      achievementsOf({ dates: [], recordDates: [], today, weeklyTarget: 3 }).map((item) => item.id),
      ['first_workout', 'workouts_10', 'workouts_25', 'workouts_50', 'streak_4', 'streak_12', 'first_record'],
    );
  });
});

describe('sayfanın tamamı', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');
  const today = '2026-09-26';
  const index = {
    items: [
      row('s_1', '2026-09-01', [{ exerciseId: 'bench-press', deviceId: 'olympic-bar', sets: 2 }], { volumeKg: 1200 }),
      row('s_2', '2026-09-08', [{ exerciseId: 'bench-press', deviceId: 'olympic-bar', sets: 2 }, { exerciseId: 'bench-press', deviceId: 'smith', sets: 1 }], {
        volumeKg: 1665,
      }),
      row('s_3', '2026-09-15', [{ exerciseId: 'bench-press', deviceId: 'olympic-bar', sets: 2 }, { exerciseId: 'plank', sets: 2 }], { volumeKg: 1250 }),
      row('s_4', '2026-09-25', [], { finishedAt: undefined }),
    ],
  };
  const digests = [
    digest('s_1', '2026-09-01', [{ exerciseId: 'bench-press', title: 'Bench Press', deviceId: 'olympic-bar', sets: kgReps(60, 10, 10) }]),
    digest('s_2', '2026-09-08', [
      { exerciseId: 'bench-press', title: 'Bench Press', deviceId: 'olympic-bar', sets: kgReps(62.5, 8, 7) },
      { exerciseId: 'bench-press', title: 'Bench Press', deviceId: 'smith', sets: kgReps(45, 10) },
    ]),
    digest('s_3', '2026-09-15', [
      { exerciseId: 'bench-press', title: 'Bench Press', deviceId: 'olympic-bar', sets: kgReps(62.5, 10, 9) },
      { exerciseId: 'plank', title: 'Plank', sets: [{ seconds: 45 }, { seconds: 50 }] },
    ]),
  ];
  const view = buildProgressView({
    index,
    digests,
    now,
    today,
    exercises: CATALOG,
    deviceNames: new Map([
      ['olympic-bar', 'Olimpik bar'],
      ['smith', 'Smith makinesi'],
    ]),
    setWeightsOf: setWeights,
    skipped: 1,
  });

  test('sayılar: bitmiş antrenman, ilk gün; hedef verilmezse haftada 1', () => {
    assert.equal(view.workouts, 3);
    assert.equal(view.firstDate, '2026-09-01');
    // Bu hafta henüz antrenman yok: seri geçen haftadan geriye 3 hafta.
    assert.deepEqual(view.streak, { current: 3, best: 3, thisWeek: 0, target: 1 });
    assert.equal(view.skipped, 1);
    assert.equal(view.truncated, false);
  });

  test('hareketler en son yapılan önce; aynı hareket iki cihazda iki seri, cihaz adıyla', () => {
    assert.deepEqual(
      view.exercises.map((item) => [item.key, item.title, item.deviceName ?? null, item.trackingType, item.sessions]),
      [
        ['bench-press@olympic-bar', 'Bench Press', 'Olimpik bar', 'weight_reps', 3],
        ['plank', 'Plank', null, 'duration', 1],
        ['bench-press@smith', 'Bench Press', 'Smith makinesi', 'weight_reps', 1],
      ],
    );
  });

  test('aşama rozeti hareketin bütün antrenmanlarından (cihazdan bağımsız)', () => {
    // 3 sayılan antrenman → Tanışma; ilk antrenman 25 gün önce → 4. hafta.
    assert.equal(view.exercises[0]!.stage, 'Tanışma · 4. hafta');
  });

  test('rekorlar hareket ve antrenman başına tek satır, öne çıkan önce; ilk kayıtlar sayılmaz', () => {
    assert.equal(view.records, 2);
    assert.deepEqual(
      view.recentRecords.map((item) => [item.sessionId, item.key, item.events.map((event) => event.kind)]),
      [
        ['s_3', 'bench-press@olympic-bar', ['e1rm', 'reps_at_weight']],
        ['s_2', 'bench-press@olympic-bar', ['heaviest']],
      ],
    );
  });

  test('haftalar index\'ten (dosyası okunamayan antrenman da sayılır)', () => {
    assert.deepEqual(
      view.weeks.map((week) => [week.weekStart, week.sessions, week.volumeKg]),
      [
        ['2026-08-31', 1, 1200],
        ['2026-09-07', 1, 1665],
        ['2026-09-14', 1, 1250],
        ['2026-09-21', 0, 0],
      ],
    );
  });

  test('başarılar: ilk antrenman ve ilk rekor', () => {
    const list = Object.fromEntries(view.achievements.map((item) => [item.id, item.achievedOn]));
    assert.equal(list.first_workout, '2026-09-01');
    assert.equal(list.first_record, '2026-09-08');
  });

  test('hareketin kas payları (Gelişim): kütüphanedeki rolleriyle; ısınma ve kütüphanede olmayan boş', () => {
    assert.deepEqual(
      view.exercises.map((item) => [item.key, item.muscles]),
      [
        ['bench-press@olympic-bar', { abs_upper: 0.25, triceps_long: 0.5, chest_lower: 1 }],
        ['plank', { abs_upper: 1 }],
        ['bench-press@smith', { abs_upper: 0.25, triceps_long: 0.5, chest_lower: 1 }],
      ],
    );
    const warmup = buildProgressView({
      index: { items: [row('s_1', '2026-09-01', [{ exerciseId: 'bisiklet', sets: 1 }, { exerciseId: 'eski-hareket', sets: 1 }])] },
      digests: [
        digest('s_1', '2026-09-01', [
          { exerciseId: 'bisiklet', title: 'Bisiklet', sets: kgReps(10, 10) },
          { exerciseId: 'eski-hareket', title: 'Eski Hareket', sets: kgReps(20, 10) },
        ]),
      ],
      now,
      today,
      exercises: CATALOG,
      deviceNames: new Map(),
      setWeightsOf: setWeights,
    });
    assert.deepEqual(
      warmup.exercises.map((item) => item.muscles),
      [{}, {}],
    );
  });

  test('antrenman yoksa boş görünüm', () => {
    const empty = buildProgressView({ index: { items: [] }, digests: [], now, today, exercises: CATALOG, deviceNames: new Map(), setWeightsOf: setWeights });
    assert.deepEqual([empty.workouts, empty.exercises.length, empty.weeks.length, empty.records, empty.firstDate], [0, 0, 0, 0, null]);
  });

  test('kütüphaneden silinen hareket anlık görüntü adıyla ve setlerden kayıt türüyle', () => {
    const lost = buildProgressView({
      index: { items: [row('s_1', '2026-09-01', [{ exerciseId: 'eski-hareket', sets: 1 }])] },
      digests: [digest('s_1', '2026-09-01', [{ exerciseId: 'eski-hareket', title: 'Eski Hareket', sets: [{ seconds: 30 }] }])],
      now,
      today,
      exercises: CATALOG,
      deviceNames: new Map(),
      setWeightsOf: setWeights,
    });
    assert.deepEqual(
      lost.exercises.map((item) => [item.title, item.inLibrary, item.trackingType]),
      [['Eski Hareket', false, 'duration']],
    );
  });
});

 test('geçmiş haftaların hedefleri değişince kazanılmış seri rozeti değişmez', () => {
  const dates = ['2026-09-07','2026-09-14','2026-09-21','2026-09-28'];
  const weeklyTargets = Object.fromEntries(dates.map(date => [date, 1]));
  const original = achievementsOf({dates, recordDates: [], today:'2026-10-05',weeklyTarget:1,weeklyTargets});
  const changed = achievementsOf({dates, recordDates: [], today:'2026-10-05',weeklyTarget:5,weeklyTargets});
  assert.deepEqual(changed.find(item=>item.id==='streak_4'), original.find(item=>item.id==='streak_4'));
  assert.equal(weeklyStreak(dates,'2026-10-05',5,weeklyTargets).best,4);
 });
