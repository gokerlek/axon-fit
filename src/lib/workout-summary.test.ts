import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySessionIndex, type SessionDoc, type SessionEntry } from './schemas/session.ts';
import { indexRowOf, upsertIndexRow } from './session-index.ts';
import { at, DAY_A, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';
import { BENCH, PLANK, workoutDay } from './testing/workout-fixtures.ts';
import {
  clockOf,
  entriesInOrder,
  exerciseLine,
  minutesText,
  nextTimeLines,
  recordLine,
  sessionChanges,
  sessionMuscleLoad,
  sessionSummary,
  shortDayText,
  summaryWeek,
  versusLastText,
  weekText,
  workedList,
  workedMuscles,
  type MuscleSource,
} from './workout-summary.ts';

const TZ = 'Europe/Istanbul';

const WARMUP: MuscleSource = { category: 'warmup', primaryMuscles: ['shoulders_front'], secondaryMuscles: [] };
const ROW: MuscleSource = { category: 'compound', primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], stabilizerMuscles: ['abs_upper', 'cardio'] };
const LIBRARY = new Map<string, MuscleSource>([
  ['bench-press', BENCH],
  ['plank', PLANK],
  ['band-warmup', WARMUP],
  ['barbell-row', ROW],
]);

/** Rol payı (hedef 1, yardımcı 0,5, dengeleyici 0,25): `muscles.ts`'teki `exerciseSetWeights`'in sade hâli. */
function setWeightsOf(exercise: MuscleSource): Partial<Record<string, number>> {
  const weights: Record<string, number> = {};
  for (const muscle of exercise.stabilizerMuscles ?? []) weights[muscle] = 0.25;
  for (const muscle of exercise.secondaryMuscles) weights[muscle] = 0.5;
  for (const muscle of exercise.primaryMuscles) weights[muscle] = 1;
  return weights;
}

/** `groupMuscles`'ın sade hâli: göğsün iki parçası birlikteyse "GÖĞÜS", öteki kaslar büyük harfle. */
const CHEST = ['chest_upper', 'chest_lower'];
function groups(muscles: readonly string[]) {
  const result: { label: string; muscles: string[] }[] = [];
  const chest = CHEST.every((part) => muscles.includes(part));
  for (const muscle of muscles) {
    if (chest && CHEST.includes(muscle)) {
      if (!result.some((item) => item.label === 'GÖĞÜS')) result.push({ label: 'GÖĞÜS', muscles: [...CHEST] });
    } else result.push({ label: muscle.toUpperCase(), muscles: [muscle] });
  }
  return result;
}

function sets(prefix: string, values: [number | undefined, number][], overrides: Partial<SessionEntry['sets'][number]> = {}) {
  return values.map(([kg, reps], i) => workingSet(`st_${prefix}${String(i).padStart(2, '0')}`, i + 1, { kg, reps, plannedSetCount: 3, ...overrides }));
}

function finished(id: string, minute: number, entries: SessionEntry[], overrides: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({ id, status: 'finished', startedAt: at(minute), finishedAt: at(minute + 52), entries, ...overrides });
}

describe('kas yükü', () => {
  const entries = [
    sessionEntry('e_aaaaaa', { sets: sets('aaaaaa', [[60, 10], [60, 10], [60, 9]]) }),
    sessionEntry('e_bbbbbb', { exerciseId: 'barbell-row', title: 'Barbell Row', sets: sets('bbbbbb', [[50, 10], [50, 10]]) }),
    sessionEntry('e_cccccc', { exerciseId: 'band-warmup', title: 'Isınma', sets: sets('cccccc', [[undefined, 15]]) }),
    sessionEntry('e_dddddd', { exerciseId: 'yok', title: 'Silinmiş', sets: sets('dddddd', [[10, 10]]) }),
    sessionEntry('e_eeeeee', { exerciseId: 'plank', title: 'Plank', status: 'skipped' }),
  ];

  test('yapılan çalışma seti × rol payı; ısınma türü ve kütüphanede olmayan sayılmaz', () => {
    assert.deepEqual(sessionMuscleLoad(entries, LIBRARY, setWeightsOf), {
      chest_lower: 3,
      triceps_long: 1.5,
      lats: 2,
      biceps: 1,
      abs_upper: 0.5,
      cardio: 0.5,
    });
  });

  test('çalışan kaslar: hedef ve yardımcı, yükü çok olan önce; dengeleyici ve kardiyo yok', () => {
    const load = sessionMuscleLoad(entries, LIBRARY, setWeightsOf);
    assert.deepEqual(workedMuscles(entries, LIBRARY, load), ['chest_lower', 'lats', 'triceps_long', 'biceps']);
  });

  test('çalışan kasların listesi tek tanım: sayı = liste; aile tek ad, seti en çok çalışan parçanınki', () => {
    const load = { chest_lower: 3, chest_upper: 1.5, lats: 2, abs_upper: 0.75 };
    const list = workedList(['chest_lower', 'lats', 'chest_upper'], load, groups);
    assert.deepEqual(list, [
      { label: 'GÖĞÜS', muscles: ['chest_upper', 'chest_lower'], sets: 3 },
      { label: 'LATS', muscles: ['lats'], sets: 2 },
    ]);
    assert.deepEqual(workedList([], load, groups), []);
  });

  test('dengeleyicisi çok hareket: kas sayısı, liste ve harita aynı kaslar (yalnız dengeleyici olan yok)', () => {
    const SQUAT: MuscleSource = {
      category: 'compound',
      primaryMuscles: ['quadriceps', 'glutes'],
      secondaryMuscles: ['adductors'],
      stabilizerMuscles: ['abs_upper', 'abs_lower', 'obliques', 'erectors', 'hamstrings_medial', 'hamstrings_lateral', 'soleus'],
    };
    const library = new Map<string, MuscleSource>([['squat', SQUAT]]);
    const doc = finished('s_ffffffff', 9000, [sessionEntry('e_ffffff', { exerciseId: 'squat', title: 'Squat', sets: sets('ffffff', [[80, 8], [80, 8], [80, 7]]) })]);
    const index = upsertIndexRow(emptySessionIndex(), indexRowOf(doc, '9'.repeat(40)));
    const summary = sessionSummary({ doc, index, timeZone: TZ, exercises: library, setWeightsOf, muscleGroups: groups, week: null, changes: [], next: null });
    assert.equal(summary.muscles, 3);
    assert.deepEqual(summary.worked.map((item) => item.label), ['QUADRICEPS', 'GLUTES', 'ADDUCTORS']);
    assert.deepEqual(Object.keys(summary.load).sort(), ['adductors', 'glutes', 'quadriceps']);
    assert.equal(summary.topMuscle, 'QUADRICEPS');
  });
});

describe('metinler', () => {
  test('saat, gün, süre, hafta', () => {
    assert.equal(clockOf('2026-09-26T15:05:00.000Z', TZ), '18:05');
    assert.equal(shortDayText('2026-09-26'), '26 Eyl Cmt');
    assert.equal(minutesText(52), '52 dk');
    assert.equal(minutesText(125), '2 sa 5 dk');
    assert.equal(minutesText(120), '2 sa');
    assert.equal(weekText({ done: 2, target: 3, current: true }), 'Bu hafta 2/3');
    assert.equal(weekText({ done: 2, target: null, current: true }), 'Bu hafta 2');
    assert.equal(weekText({ done: 3, target: 3, current: false }), 'O hafta 3 antrenman');
  });

  test("özetin haftası: bu hafta Bugün'ün sayısıyla, geçmiş hafta o haftanın günleri", () => {
    const index = [
      sessionDoc({ id: 's_aaaaaaaa', status: 'finished', date: '2026-09-14', finishedAt: at(1) }),
      sessionDoc({ id: 's_bbbbbbbb', status: 'finished', date: '2026-09-16', finishedAt: at(2) }),
      sessionDoc({ id: 's_cccccccc', status: 'finished', date: '2026-09-16', finishedAt: at(3) }),
      sessionDoc({ id: 's_dddddddd', status: 'finished', date: '2026-09-21', finishedAt: at(4) }),
      sessionDoc({ id: 's_eeeeeeee', date: '2026-09-15' }),
    ].reduce((acc, doc, i) => upsertIndexRow(acc, indexRowOf(doc, String(i).repeat(40))), emptySessionIndex());
    const current = { done: 1, target: 3, start: '2026-09-21' };
    assert.deepEqual(summaryWeek(index, '2026-09-26', current), { done: 1, target: 3, current: true });
    assert.deepEqual(summaryWeek(index, '2026-09-16', current), { done: 2, target: null, current: false });
  });

  test('rekor satırları', () => {
    assert.deepEqual(recordLine('Bench Press', { kind: 'heaviest', now: { kg: 65, reps: 5 }, before: { kg: 62.5, reps: 6 } }), {
      title: 'Bench Press',
      value: '65 kg × 5',
      detail: 'Önceki en ağır: 62,5 kg × 6',
    });
    assert.equal(
      recordLine('Bench Press', { kind: 'e1rm', now: { kg: 62.5, reps: 10 }, before: { kg: 60, reps: 10 }, gainPct: 4 }).detail,
      'Önceki en iyi: 60 kg × 10 · tahmini 1RM +%4',
    );
    assert.equal(recordLine('Row', { kind: 'reps', now: { kg: 50, reps: 12 }, before: { kg: 50, reps: 10 } }).detail, 'Bu ağırlıkta önceki en çok: 10 tekrar');
    assert.deepEqual(recordLine('Şınav', { kind: 'reps', now: { kg: 0, reps: 15 }, before: { kg: 0, reps: 12 } }), {
      title: 'Şınav',
      value: '15 tekrar',
      detail: 'Önceki en çok: 12 tekrar',
    });
    assert.equal(recordLine('Plank', { kind: 'seconds', now: 60, before: 45 }).value, '60 sn');
  });

  test('hareket satırı: tam, yarım, geçilen, yapılmayan, süreli', () => {
    assert.deepEqual(exerciseLine(sessionEntry('e_aaaaaa', { sets: sets('aaaaaa', [[60, 10], [62.5, 9], [60, 8]]) })), {
      title: 'Bench Press',
      text: '3 set · 27 tekrar · 62,5 kg üst',
      state: 'done',
    });
    assert.equal(exerciseLine(sessionEntry('e_aaaaaa', { oneOff: true, sets: sets('aaaaaa', [[60, 10]]) })).text, '1/3 set · 10 tekrar · 60 kg üst · bir defalık');
    assert.equal(exerciseLine(sessionEntry('e_aaaaaa', { sets: sets('aaaaaa', [[60, 10]]) })).state, 'partial');
    assert.deepEqual(exerciseLine(sessionEntry('e_aaaaaa', { status: 'skipped' })), { title: 'Bench Press', text: 'geçildi', state: 'skipped' });
    assert.equal(exerciseLine(sessionEntry('e_aaaaaa')).state, 'missed');
    const plank = sessionEntry('e_bbbbbb', {
      exerciseId: 'plank',
      title: 'Plank',
      sets: [workingSet('st_bbbbbb01', 1, { kg: undefined, reps: undefined, seconds: 45, plannedSetCount: 2 }), workingSet('st_bbbbbb02', 2, { kg: undefined, reps: undefined, seconds: 40, plannedSetCount: 2 })],
    });
    assert.equal(exerciseLine(plank).text, '2 set · 85 sn');
  });

  test('yapılış sırası: `order`, sırada olmayanlar arkada', () => {
    const doc = sessionDoc({
      entries: [sessionEntry('e_aaaaaa'), sessionEntry('e_bbbbbb'), sessionEntry('e_cccccc')],
      order: { value: ['e_cccccc', 'e_aaaaaa'], updatedAt: at(1) },
    });
    assert.deepEqual(entriesInOrder(doc).map((entry) => entry.id), ['e_cccccc', 'e_aaaaaa', 'e_bbbbbb']);
  });

  test('program değişiklikleri: danışan kaydı yazıldı, öneriler durumuyla; başka antrenmanınki yok', () => {
    const changes = sessionChanges({
      sessionId: 's_bbbbbbbb',
      log: [
        { kind: 'client', sessionId: 's_bbbbbbbb', changes: [{ scope: 'Gün A', text: 'Bench Press: çalışma ağırlığı 60 → 62,5 kg' }] },
        { kind: 'client', sessionId: 's_aaaaaaaa', changes: [{ text: 'Eski' }] },
        { kind: 'edit', changes: [{ text: 'PT' }] },
      ],
      proposals: [
        { sessionId: 's_bbbbbbbb', text: 'Leg Press 3 → 4 set', status: 'pending' },
        { sessionId: 's_bbbbbbbb', text: 'Curl yerine Hammer Curl', status: 'declined', ptNote: 'Dirsek' },
        { sessionId: 's_aaaaaaaa', text: 'Başka', status: 'pending' },
      ],
    });
    assert.deepEqual(changes, [
      { text: 'Bench Press: çalışma ağırlığı 60 → 62,5 kg', state: 'applied' },
      { text: 'Leg Press 3 → 4 set', state: 'pending' },
      { text: 'Curl yerine Hammer Curl', state: 'declined', note: 'Dirsek' },
    ]);
  });
});

describe('özet', () => {
  const first = finished('s_aaaaaaaa', 0, [sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: sets('aaaaaa', [[60, 10], [60, 10], [60, 10]]) })]);
  const second = finished(
    's_bbbbbbbb',
    3000,
    [
      sessionEntry('e_bbbbbb', { rowId: 'r_aaaaaa', status: 'done', sets: sets('bbbbbb', [[62.5, 10], [62.5, 9], [62.5, 8]]) }),
      sessionEntry('e_cccccc', { exerciseId: 'barbell-row', title: 'Barbell Row', status: 'partial', sets: sets('cccccc', [[50, 10]]) }),
      sessionEntry('e_dddddd', { exerciseId: 'plank', title: 'Plank', status: 'skipped', skip: { reason: 'busy', moved: false } }),
    ],
    {
      date: '2026-09-28',
      waterTaps: [
        { id: 'wt_aaaaaaaa', d: 1, at: at(3010) },
        { id: 'wt_bbbbbbbb', d: 1, at: at(3020) },
      ],
      notices: [{ kind: 'unfinished', at: at(3052), done: 4, planned: 9 }],
    },
  );
  const index = [first, second].reduce((acc, doc, i) => upsertIndexRow(acc, indexRowOf(doc, String(i).repeat(40))), emptySessionIndex());

  test('dört kartın sayıları ve metinleri', () => {
    const summary = sessionSummary({
      doc: second,
      index,
      timeZone: TZ,
      exercises: LIBRARY,
      setWeightsOf,
      muscleGroups: groups,
      week: { done: 2, target: 3, current: true },
      changes: [{ text: 'Bench Press: çalışma ağırlığı 60 → 62,5 kg', state: 'applied' }],
      next: [{ title: 'Bench Press', text: '62,5 kg × 9' }],
    });
    assert.equal(summary.unfinished, true);
    assert.equal(summary.dayName, 'Gün A');
    // Kendi programdan antrenmanda programın adıyla ("Evde · Gün A"), Geçmiş'teki gibi.
    const own = { ...second, program: { ...second.program!, programId: 'op_evde0001', programName: 'Evde' } };
    assert.equal(sessionSummary({ doc: own, index, timeZone: TZ, exercises: LIBRARY, setWeightsOf, muscleGroups: groups, week: null, changes: [], next: null }).dayName, 'Evde · Gün A');
    assert.equal(summary.when, '28 Eyl Pzt · 20:00–20:52');
    assert.equal(summary.minutes, 52);
    // 62,5 × (10 + 9 + 8) + 50 × 10
    assert.equal(summary.volumeKg, 2187.5);
    assert.equal(summary.sets, 4);
    assert.equal(summary.muscles, 4);
    assert.equal(summary.topMuscle, 'CHEST_LOWER');
    assert.equal(summary.prs, 1);
    assert.equal(summary.versusLast, 'Önceki Gün A antrenmanına göre +%22');
    assert.equal(summary.footer, 'Bu hafta 2/3 · 2 bardak su · yarım bırakıldı');
    assert.deepEqual(summary.records, [{ title: 'Bench Press', value: '62,5 kg × 10', detail: 'Önceki en ağır: 60 kg × 10' }]);
    assert.deepEqual(summary.compare, [
      { title: 'Bench Press', trend: 'up', text: '60 × 10 → 62,5 × 10' },
      { title: 'Barbell Row', trend: 'first', text: 'ilk kez' },
    ]);
    assert.deepEqual(summary.next, [{ title: 'Bench Press', text: '62,5 kg × 9' }]);
    assert.equal(summary.totals, '4 set · 37 tekrar');
    assert.deepEqual(
      summary.exercises.map((line) => [line.title, line.text, line.state]),
      [
        ['Bench Press', '3 set · 27 tekrar · 62,5 kg üst', 'done'],
        ['Barbell Row', '1/3 set · 10 tekrar · 50 kg üst', 'partial'],
        ['Plank', 'geçildi', 'skipped'],
      ],
    );
    // Harita listeyle aynı kaslar: yalnız dengeleyici olan karın ve kardiyo yok.
    assert.deepEqual(summary.load, { chest_lower: 3, triceps_long: 1.5, lats: 1, biceps: 0.5 });
    assert.deepEqual(
      summary.worked.map((item) => [item.label, item.sets]),
      [
        ['CHEST_LOWER', 3],
        ['TRICEPS_LONG', 1.5],
        ['LATS', 1],
        ['BICEPS', 0.5],
      ],
    );
    assert.equal(summary.muscles, summary.worked.length);
  });

  test('index satırı yoksa belgeden eklenir; ilk antrenmanda rekor ve karşılaştırma yok, "Gelecek sefer" boşsa null', () => {
    const summary = sessionSummary({
      doc: first,
      index: emptySessionIndex(),
      timeZone: TZ,
      exercises: LIBRARY,
      setWeightsOf,
      muscleGroups: groups,
      week: null,
      changes: [],
      next: [],
    });
    assert.equal(summary.prs, 0);
    assert.deepEqual(summary.records, []);
    assert.equal(summary.versusLast, null);
    assert.equal(summary.next, null);
    assert.equal(summary.footer, '0 bardak su');
  });

  test('önceki aynı gün yarım bırakıldıysa karşılaştırılmaz', () => {
    const third = finished('s_cccccccc', 6000, [sessionEntry('e_eeeeee', { rowId: 'r_aaaaaa', sets: sets('eeeeee', [[62.5, 10]]) })]);
    const withThird = upsertIndexRow(index, indexRowOf(third, '2'.repeat(40)));
    // İkinci antrenman yarım: karşılaştırma ilkine (1.800 kg) göre.
    assert.equal(versusLastText(withThird, third, 625), 'Önceki Gün A antrenmanına göre −%65');
    assert.equal(versusLastText(withThird, { ...third, program: undefined }, 625), null);
    // Yalnız süreli ya da ağırlıksız hareketler: karşılaştırma yok.
    assert.equal(versusLastText(withThird, third, 0), null);
  });
});

describe('gelecek sefer', () => {
  test('öneri motorunun planı, bu antrenman dahil: tepeye ulaşıldıysa ağırlık artar', () => {
    const done = finished('s_aaaaaaaa', 0, [
      sessionEntry('e_aaaaaa', {
        rowId: 'r_aaaaaa',
        status: 'done',
        sets: [0, 1, 2].map((i) => workingSet(`st_aaaaaa0${i}`, i + 1, { setIndex: i, kg: 60, reps: 10, target: { min: 8, max: 10 }, topWeightKg: 60, plannedSetCount: 3 })),
      }),
      sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', status: 'skipped' }),
      sessionEntry('e_cccccc', { exerciseId: 'push-up', title: 'Şınav', added: true, sets: sets('cccccc', [[undefined, 12]]) }),
    ]);
    const day = workoutDay({ history: [done], dayId: DAY_A });
    const lines = nextTimeLines(day, done);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.title, 'Bench Press');
    assert.match(lines[0]?.text ?? '', /^62,5 kg × \d+$/);
  });
});
