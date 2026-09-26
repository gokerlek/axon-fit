import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { sessionDocSchema, type SessionDoc } from './schemas/session.ts';
import { volumeOf, waterOf } from './session-index.ts';
import { toSetResults } from './session-results.ts';
import { at, DAY_A, programFile, sessionDoc, sessionEntry, W1, workingSet } from './testing/session-fixtures.ts';
import { dayWithBlocks, workoutDay } from './testing/workout-fixtures.ts';
import {
  addWaterTap,
  afterLog,
  clockText,
  cursorOf,
  deleteSet,
  easyShortcut,
  editSet,
  effortQuestions,
  ensureEntries,
  elapsedText,
  findSet,
  logSet,
  logWarmup,
  newEntryId,
  newSessionDoc,
  nextSet,
  nextText,
  overloadState,
  previousText,
  setEntryEffort,
  setSetEffort,
  setSetupNote,
  setupNoteOf,
  setValueText,
  setViews,
  targetCell,
  targetText,
  unlogWarmup,
  warmupViews,
  workoutSummary,
} from './workout-session.ts';

/** Belirlenimli "rastgelelik": her çağrıda farklı baytlar, kimlikler çakışmaz. */
function sequence() {
  let n = 0;
  return (size: number) => Uint8Array.from({ length: size }, () => (n++ * 7) % 252);
}

const stamp = (minute: number) => ({ at: at(minute), by: W1 });

function start(day = workoutDay()): SessionDoc {
  return newSessionDoc(day, { today: '2026-09-26', now: new Date(at(0)), writer: W1, random: sequence() });
}

/** Sıradaki seti önerilen değerlerle (ya da verilenle) kaydeder. */
function logNext(day: ReturnType<typeof workoutDay>, doc: SessionDoc, minute: number, values: { kg?: number; value?: number } = {}, random = sequence()) {
  const next = nextSet(day, doc);
  if (!next) throw new Error('Set kalmadı.');
  return logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: values.kg ?? next.kg, value: values.value ?? next.value, stamp: stamp(minute), random }).doc;
}

describe('antrenman belgesi: başlangıç ve sıradaki set', () => {
  test('yeni belge şemaya uyar; gün ve sıradaki gün programdan', () => {
    const doc = start();
    assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
    assert.match(doc.id, /^s_[a-z0-9]{8}$/);
    assert.deepEqual(doc.program, { revision: 7, phaseId: 'p_aaaaaa', dayId: DAY_A, dayName: 'Gün A', plannedDayId: DAY_A });
    assert.equal(doc.date, '2026-09-26');
  });

  test('ilk set: planın ağırlığı, aralığın altı; dinlenme bloktan', () => {
    const next = nextSet(workoutDay(), start());
    assert.deepEqual(
      next && { unit: next.unitKey, row: next.rowId, position: next.position, total: next.total, kg: next.kg, value: next.value, rest: next.restAfterSeconds },
      { unit: 'b_aaaaaa', row: 'r_aaaaaa', position: 0, total: 3, kg: 20, value: 8, rest: 90 },
    );
  });

  test('tekrar: geçen seferki aynı sıradaki set, aynı ağırlıkta; tepe önceden dolmaz; ağırlık arttıysa alt sınır', () => {
    const history = (reps: number) => [
      sessionDoc({
        id: 's_aaaaaaaa',
        status: 'finished',
        startedAt: at(-1000),
        finishedAt: at(-960),
        entries: [
          sessionEntry('e_aaaaaa', {
            rowId: 'r_aaaaaa',
            sets: [0, 1, 2].map((index) => workingSet(`st_0000000${index}`, -999 + index, { setIndex: index, kg: 60, reps, target: { min: 8, max: 10 } })),
          }),
        ],
      }),
    ];
    const hold = workoutDay({ history: history(9) });
    assert.deepEqual(nextSet(hold, start(hold)) && { kg: nextSet(hold, start(hold))?.kg, value: nextSet(hold, start(hold))?.value }, { kg: 60, value: 9 });
    const up = workoutDay({ history: history(10) });
    assert.deepEqual({ kg: nextSet(up, start(up))?.kg, value: nextSet(up, start(up))?.value }, { kg: 62.5, value: 8 });
  });

  test('taslak yalnız kendi setinde geçerli', () => {
    const day = workoutDay();
    const doc = start(day);
    assert.equal(nextSet(day, doc, { rowId: 'r_aaaaaa', setIndex: 0, kg: 25, value: 9 })?.kg, 25);
    assert.equal(nextSet(day, doc, { rowId: 'r_aaaaaa', setIndex: 0, value: 9 })?.kg, 20);
    assert.equal(nextSet(day, doc, { rowId: 'r_aaaaaa', setIndex: 1, kg: 25 })?.kg, 20);
  });
});

describe('antrenman belgesi: Set bitti, düzelt, sil', () => {
  test('ilk set hareketin kaydını açar; set o günkü hedefi ve planı taşır; şemaya uyar', () => {
    const day = workoutDay();
    const doc = logNext(day, start(day), 5, { kg: 22.5, value: 9 });
    assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
    const entry = doc.entries[0];
    assert.equal(entry?.rowId, 'r_aaaaaa');
    assert.equal(entry?.blockId, 'b_aaaaaa');
    assert.equal(entry?.status, 'partial');
    assert.deepEqual(entry?.plan, { topWeightKg: 20, reason: 'first_time' });
    const set = entry?.sets[0];
    assert.deepEqual(
      set && { setIndex: set.setIndex, kg: set.kg, reps: set.reps, target: set.target, top: set.topWeightKg, count: set.plannedSetCount, planned: set.plannedKg, at: set.at },
      { setIndex: 0, kg: 22.5, reps: 9, target: { min: 8, max: 10 }, top: 20, count: 3, planned: 20, at: at(5) },
    );
    // Sonraki set danışanın ağırlığıyla; tekrar yine alt sınır (önceki setin tekrarı kopyalanmaz).
    assert.deepEqual({ kg: nextSet(day, doc)?.kg, value: nextSet(day, doc)?.value, position: nextSet(day, doc)?.position }, { kg: 22.5, value: 8, position: 1 });
  });

  test('hareket bitince aynı kayıt "done"; sıradaki hareket', () => {
    const day = workoutDay();
    let doc = start(day);
    for (const minute of [1, 3, 5]) doc = logNext(day, doc, minute);
    assert.equal(doc.entries.length, 1);
    assert.equal(doc.entries[0]?.status, 'done');
    assert.equal(nextSet(day, doc)?.rowId, 'r_bbbbbb');
  });

  test('ortadaki set silinince sıradaki set odur (aynı yer iki kez yazılmaz); iz kalıcı', () => {
    const day = workoutDay();
    let doc = start(day);
    for (const minute of [1, 3, 5]) doc = logNext(day, doc, minute);
    const middle = doc.entries[0]?.sets.find((set) => set.setIndex === 1);
    doc = deleteSet(day, doc, middle?.id ?? '', stamp(6));
    assert.deepEqual(doc.deletedSetIds, [middle?.id]);
    assert.equal(doc.entries[0]?.status, 'partial');
    const next = nextSet(day, doc);
    assert.deepEqual({ row: next?.rowId, setIndex: next?.setIndex, position: next?.position }, { row: 'r_aaaaaa', setIndex: 1, position: 1 });
    doc = logNext(day, doc, 7);
    assert.deepEqual(doc.entries[0]?.sets.map((set) => set.setIndex), [0, 2, 1]);
    assert.notEqual(doc.entries[0]?.sets.at(-1)?.id, middle?.id);
  });

  test('düzeltme: değer değişir, yapıldığı an kalır, birleştirme editedAt ile', () => {
    const day = workoutDay();
    const doc = logNext(day, start(day), 5);
    const id = doc.entries[0]?.sets[0]?.id ?? '';
    const edited = editSet(doc, id, { kg: 25, value: 7 }, stamp(9));
    assert.deepEqual(findSet(edited, id)?.set && { kg: findSet(edited, id)?.set.kg, reps: findSet(edited, id)?.set.reps, at: findSet(edited, id)?.set.at, editedAt: findSet(edited, id)?.set.editedAt }, {
      kg: 25,
      reps: 7,
      at: at(5),
      editedAt: at(9),
    });
    assert.equal(editSet(doc, 'st_yokyokyo', { value: 3 }, stamp(9)), doc);
  });

  test('set satırları planın sırasıyla: önceki, planlanan ağırlık, kayıt', () => {
    const day = workoutDay();
    const doc = logNext(day, start(day), 5, { kg: 22.5 });
    const views = setViews(day, doc, 'r_aaaaaa');
    assert.deepEqual(views.map((view) => [view.position, view.setIndex, view.plannedKg, view.logged?.kg ?? null]), [
      [0, 0, 20, 22.5],
      [1, 1, 20, null],
      [2, 2, 20, null],
    ]);
  });
});

describe('antrenman belgesi: sonrası, su, özet', () => {
  test('Set bitti sonrası: aynı hareket (dinlenme), sıradaki hareket, bitiş', () => {
    const day = workoutDay();
    let doc = start(day);
    const after = (minute: number) => {
      const before = doc;
      doc = logNext(day, doc, minute);
      return afterLog(day, before, doc);
    };
    assert.deepEqual(after(1), { kind: 'same', restSeconds: 90 });
    after(2);
    assert.deepEqual(after(3), { kind: 'next', restSeconds: 90 });
    assert.deepEqual(after(4), { kind: 'same', restSeconds: 90 });
    assert.deepEqual(after(5), { kind: 'done' });
    assert.equal(cursorOf(day, doc).allDone, true);
  });

  test('hafifletmede imleç planın set sayısıyla yürür', () => {
    const failed = (id: string, minute: number) =>
      sessionDoc({
        id,
        status: 'finished',
        startedAt: at(minute),
        finishedAt: at(minute + 30),
        entries: [
          sessionEntry(`e_${id.slice(2, 8)}`, {
            rowId: 'r_aaaaaa',
            sets: [0, 1, 2].map((index) => workingSet(`st_${id.slice(2, 7)}${index}xx`, minute + index + 1, { setIndex: index, kg: 60, reps: 5, target: { min: 8, max: 10 } })),
          }),
        ],
      });
    const day = workoutDay({ history: [failed('s_aaaaaaaa', -3000), failed('s_bbbbbbbb', -2000), failed('s_cccccccc', -1000)] });
    let doc = start(day);
    doc = logNext(day, doc, 1);
    doc = logNext(day, doc, 2);
    assert.equal(nextSet(day, doc)?.rowId, 'r_bbbbbb');
  });

  test('su: +1 ve geri al (−1 dokunuşu); toplam en az 0', () => {
    let doc = start();
    const random = sequence();
    doc = addWaterTap(doc, 1, stamp(1), random).doc;
    doc = addWaterTap(doc, 1, stamp(2), random).doc;
    doc = addWaterTap(doc, -1, stamp(3), random).doc;
    assert.equal(waterOf(doc), 1);
    assert.equal(new Set(doc.waterTaps.map((tap) => tap.id)).size, 3);
    assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
  });

  test('özet: set, tonaj, süre, yapılmayanlar', () => {
    const day = workoutDay();
    let doc = start(day);
    doc = logNext(day, doc, 1, { kg: 20, value: 10 });
    doc = logNext(day, doc, 2, { kg: 20, value: 8 });
    const summary = workoutSummary(day, doc, new Date(at(30)));
    assert.deepEqual(summary, {
      exercises: 1,
      sets: 2,
      volumeKg: 360,
      minutes: 30,
      water: 0,
      doneSets: 2,
      plannedSets: 5,
      allDone: false,
      remaining: [
        { rowId: 'r_aaaaaa', title: 'Bench Press', done: 2, planned: 3, skipped: false },
        { rowId: 'r_bbbbbb', title: 'Bench Press', done: 0, planned: 2, skipped: false },
      ],
    });
  });
});

describe('antrenman belgesi: satırların kayıtları', () => {
  test('kaydı olmayan her satıra boş kayıt açılır (sıra kimliklerle yazılabilsin); hepsi varsa aynı belge', () => {
    const day = workoutDay();
    const doc = logNext(day, start(day), 1);
    const ready = ensureEntries(day, doc, stamp(2), sequence());
    assert.deepEqual(ready.entries.map((entry) => [entry.rowId, entry.status, entry.sets.length]), [
      ['r_aaaaaa', 'partial', 1],
      ['r_bbbbbb', 'pending', 0],
    ]);
    assert.equal(ensureEntries(day, ready, stamp(3)), ready);
    assert.equal(v.safeParse(sessionDocSchema, ready).success, true);
    const id = newEntryId(ready, sequence());
    assert.match(id, /^e_[a-z0-9]{6}$/);
    assert.equal(ready.entries.some((entry) => entry.id === id), false);
  });
});

describe('antrenman belgesi: set türleri', () => {
  /** Gün A: Goblet Squat piramidi (12 %80, 10 %90, 8+ AMRAP) ve Plank (2 × 30–45 sn). */
  function pyramidDay() {
    const raw = programFile();
    const days = (raw.phases as { days: { blocks: unknown[] }[] }[])[0]?.days;
    if (days?.[0]) {
      days[0].blocks = [
        {
          id: 'b_aaaaaa',
          kind: 'single',
          restSeconds: 90,
          rows: [{ id: 'r_aaaaaa', exerciseId: 'goblet-squat', sets: [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10, loadPct: 90 }, { min: 8, max: 8, amrap: true }] }],
        },
        { id: 'b_bbbbbb', kind: 'single', restSeconds: 45, rows: [{ id: 'r_bbbbbb', exerciseId: 'plank', sets: [{ min: 30, max: 45 }, { min: 30, max: 45 }] }] },
      ];
    }
    return workoutDay({ raw });
  }

  test('piramit: basamak planın üst ağırlığından; danışan önceki basamağı değiştirdiyse onun ağırlığı', () => {
    const day = pyramidDay();
    const doc = start(day);
    const first = nextSet(day, doc);
    assert.deepEqual({ kg: first?.kg, value: first?.value, target: first?.target }, { kg: 4, value: 12, target: { min: 12, max: 12, loadPct: 80 } });
    const heavier = logNext(day, doc, 1, { kg: 10 });
    assert.equal(nextSet(day, heavier)?.kg, 10);
    const same = logNext(day, doc, 1);
    assert.equal(nextSet(day, same)?.kg, 4);
  });

  test('AMRAP: "en az 8"; süreli set saniye yazar, ağırlık yok', () => {
    const day = pyramidDay();
    let doc = start(day);
    doc = logNext(day, doc, 1);
    doc = logNext(day, doc, 2);
    const amrap = nextSet(day, doc);
    assert.equal(amrap?.value, 8);
    assert.equal(amrap && targetText(amrap.target, 'weight_reps'), 'En az 8, yapabildiğin kadar');
    doc = logNext(day, doc, 3, { value: 13 });
    const plank = nextSet(day, doc);
    assert.deepEqual({ row: plank?.rowId, kg: plank?.kg, value: plank?.value, rest: plank?.restAfterSeconds }, { row: 'r_bbbbbb', kg: undefined, value: 30, rest: 45 });
    // Süreli harekette aşırı yük sorulmaz.
    assert.equal(plank && overloadState(day, doc, plank, 50), 'none');
    doc = logNext(day, doc, 4, { value: 40 });
    const set = doc.entries.find((entry) => entry.rowId === 'r_bbbbbb')?.sets[0];
    assert.deepEqual(set && { seconds: set.seconds, kg: set.kg, reps: set.reps }, { seconds: 40, kg: undefined, reps: undefined });
    assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
  });
});

describe('antrenman belgesi: aşırı yük, ısınma, ayar notu', () => {
  /** Bench 60 kg × 10 (geçen sefer): bugün 62,5 kg, ısınma 20 × 10 · 40 × 5. */
  function heavyDay() {
    const history = [
      sessionDoc({
        id: 's_aaaaaaaa',
        status: 'finished',
        startedAt: at(-1000),
        finishedAt: at(-960),
        entries: [
          sessionEntry('e_aaaaaa', {
            rowId: 'r_aaaaaa',
            setupNote: 'Sehpa 3. delik',
            sets: [0, 1, 2].map((index) => workingSet(`st_0000000${index}`, -999 + index, { setIndex: index, kg: 60, reps: 10, target: { min: 8, max: 10 } })),
          }),
        ],
      }),
    ];
    return workoutDay({ history });
  }

  test('aşırı yük hareket başına bir kez sorulur; onaylanan set işaretlenir, PT\'ye bir bildirim', () => {
    const day = heavyDay();
    let doc = start(day);
    const next = nextSet(day, doc);
    if (!next) throw new Error('Set yok.');
    assert.equal(next.plannedKg, 62.5);
    // Sınır: plan + max(%20, 5 kg) = 75 kg.
    assert.equal(overloadState(day, doc, next, 75), 'none');
    assert.equal(overloadState(day, doc, next, 77.5), 'ask');
    doc = logNext(day, doc, 1, { kg: 80 });
    assert.equal(doc.entries[0]?.sets[0]?.overload, undefined);
    doc = logSet(day, doc, { rowId: 'r_aaaaaa', setIndex: 1, kg: 80, value: 8, overload: true, stamp: stamp(2), random: sequence() }).doc;
    const second = nextSet(day, doc);
    assert.equal(second && overloadState(day, doc, second, 80), 'confirmed');
    doc = logSet(day, doc, { rowId: 'r_aaaaaa', setIndex: 2, kg: 80, value: 8, overload: true, stamp: stamp(3), random: sequence() }).doc;
    assert.deepEqual(doc.entries[0]?.sets.map((set) => set.overload ?? false), [false, true, true]);
    assert.deepEqual(doc.notices, [{ kind: 'overload', at: at(2) }]);
    // Başka hareket kendi onayını ister.
    assert.equal(overloadState(day, doc, { rowId: 'r_bbbbbb', plannedKg: 62.5 }, 80), 'ask');
    assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
  });

  test('ısınma: satırdaki ✓ yazar ve geri alır; imleç, hacim ve motor etkilenmez', () => {
    const day = heavyDay();
    assert.deepEqual(day.rows.r_aaaaaa?.warmups, [
      { kg: 20, reps: 10 },
      { kg: 40, reps: 5 },
    ]);
    let doc = start(day);
    doc = logWarmup(day, doc, { rowId: 'r_aaaaaa', index: 1, stamp: stamp(1), random: sequence() });
    assert.equal(logWarmup(day, doc, { rowId: 'r_aaaaaa', index: 1, stamp: stamp(2), random: sequence() }), doc);
    assert.deepEqual(warmupViews(day, doc, 'r_aaaaaa').map((view) => [view.index, view.kg, view.reps, view.logged?.type ?? null]), [
      [0, 20, 10, null],
      [1, 40, 5, 'warmup'],
    ]);
    // Kayıt ısınmayla açıldı; geçen seferki ayar notu taşındı; set sayılmaz.
    assert.equal(doc.entries[0]?.status, 'pending');
    assert.equal(doc.entries[0]?.setupNote, 'Sehpa 3. delik');
    assert.equal(nextSet(day, doc)?.position, 0);
    doc = logNext(day, doc, 3, { kg: 62.5, value: 10 });
    assert.equal(volumeOf(doc), 625);
    assert.equal(toSetResults(doc.entries[0]!).length, 1);
    const warm = warmupViews(day, doc, 'r_aaaaaa')[1]?.logged?.id;
    doc = unlogWarmup(day, doc, { rowId: 'r_aaaaaa', index: 1, stamp: stamp(4) });
    assert.equal(warmupViews(day, doc, 'r_aaaaaa')[1]?.logged, undefined);
    assert.ok(warm && doc.deletedSetIds.includes(warm));
    assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
    // İkinci satır (aynı kas) ve ilk kez (20 kg) ısınmasız.
    assert.equal(day.rows.r_bbbbbb?.warmups, undefined);
    assert.equal(workoutDay().rows.r_aaaaaa?.warmups, undefined);
  });

  test('ayar notu: geçen seferki; değiştirilir, silinir, kayıt yoksa açılır', () => {
    const day = heavyDay();
    let doc = start(day);
    assert.equal(setupNoteOf(day, doc, 'r_aaaaaa'), 'Sehpa 3. delik');
    assert.equal(setSetupNote(day, doc, { rowId: 'r_aaaaaa', note: '  Sehpa 3. delik ', stamp: stamp(1) }), doc);
    doc = setSetupNote(day, doc, { rowId: 'r_aaaaaa', note: 'Sehpa   4. delik', stamp: stamp(1), random: sequence() });
    assert.equal(setupNoteOf(day, doc, 'r_aaaaaa'), 'Sehpa 4. delik');
    assert.deepEqual(doc.entries[0] && { status: doc.entries[0].status, sets: doc.entries[0].sets.length, updatedAt: doc.entries[0].updatedAt }, {
      status: 'pending',
      sets: 0,
      updatedAt: at(1),
    });
    doc = setSetupNote(day, doc, { rowId: 'r_aaaaaa', note: '', stamp: stamp(2) });
    assert.equal(setupNoteOf(day, doc, 'r_aaaaaa'), undefined);
    assert.equal(doc.entries[0]?.setupNote, undefined);
    // Aynı egzersiz ve cihaz başka satırda: not ayara ait olduğu için onda da.
    assert.equal(setupNoteOf(day, start(day), 'r_bbbbbb'), 'Sehpa 3. delik');
    assert.equal(setupNoteOf(workoutDay(), start(), 'r_aaaaaa'), undefined);
    assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
  });
});

describe('antrenman belgesi: zorluk ve "Kolaydı"', () => {
  test('hareket bitince sorulur; cevap AMRAP olmayan bütün setlere', () => {
    const day = workoutDay();
    let doc = start(day);
    doc = logNext(day, doc, 1);
    const first = doc.entries[0]?.sets[0]?.id ?? '';
    assert.deepEqual(effortQuestions(day, doc, first), []);
    doc = logNext(day, doc, 2);
    doc = logNext(day, doc, 3);
    const last = doc.entries[0]?.sets.at(-1)?.id ?? '';
    const questions = effortQuestions(day, doc, last);
    assert.deepEqual(questions.map((item) => [item.rowId, item.title, item.answer]), [['r_aaaaaa', 'Bench Press', undefined]]);
    doc = setEntryEffort(doc, questions[0]?.entryId ?? '', 'hard', stamp(4));
    assert.deepEqual(doc.entries[0]?.sets.map((set) => [set.effort, set.editedAt]), [
      ['hard', at(4)],
      ['hard', at(4)],
      ['hard', at(4)],
    ]);
    assert.equal(effortQuestions(day, doc, last)[0]?.answer, 'hard');
  });

  test('AMRAP\'ta zorluk sorulmaz: piramidin tek tam yük seti AMRAP', () => {
    const day = dayWithBlocks([
      {
        id: 'b_aaaaaa',
        kind: 'single',
        restSeconds: 90,
        rows: [{ id: 'r_aaaaaa', exerciseId: 'goblet-squat', sets: [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10, loadPct: 90 }, { min: 8, max: 8, amrap: true }] }],
      },
      { id: 'b_bbbbbb', kind: 'single', restSeconds: 90, rows: [{ id: 'r_bbbbbb', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }, { min: 8, max: 10, amrap: true }] }] },
    ]);
    let doc = start(day);
    for (const minute of [1, 2, 3]) doc = logNext(day, doc, minute);
    assert.deepEqual(effortQuestions(day, doc, doc.entries[0]?.sets.at(-1)?.id ?? ''), []);
    // Düz setlerde son set AMRAP: ilk set sorulur, cevap AMRAP setine yazılmaz.
    doc = logNext(day, doc, 4);
    doc = logNext(day, doc, 5, { value: 13 });
    const bench = doc.entries.find((entry) => entry.rowId === 'r_bbbbbb');
    const questions = effortQuestions(day, doc, bench?.sets.at(-1)?.id ?? '');
    assert.equal(questions.length, 1);
    doc = setEntryEffort(doc, questions[0]?.entryId ?? '', 'easy', stamp(6));
    assert.deepEqual(doc.entries.find((entry) => entry.rowId === 'r_bbbbbb')?.sets.map((set) => set.effort), ['easy', undefined]);
  });

  test('"Kolaydı · sonraki set": tepede ve sıradaki set aynı yükte; dokununca sonraki set bir adım', () => {
    const day = workoutDay();
    let doc = start(day);
    doc = logNext(day, doc, 1, { kg: 60, value: 9 });
    const below = doc.entries[0]?.sets[0]?.id ?? '';
    assert.equal(easyShortcut(day, doc, below), null);
    doc = logNext(day, doc, 2, { kg: 60, value: 10 });
    const top = doc.entries[0]?.sets[1]?.id ?? '';
    assert.deepEqual(easyShortcut(day, doc, top), { kg: 62.5, taken: false });
    assert.equal(nextSet(day, doc)?.kg, 60);
    doc = setSetEffort(doc, top, 'easy', stamp(3));
    assert.equal(nextSet(day, doc)?.kg, 62.5);
    assert.deepEqual(easyShortcut(day, doc, top), { kg: 62.5, taken: true });
    // Geri alınınca sonraki set yine aynı ağırlık.
    doc = setSetEffort(doc, top, undefined, stamp(4));
    assert.equal(findSet(doc, top)?.set.effort, undefined);
    assert.equal(nextSet(day, doc)?.kg, 60);
    // Son set: sıradaki başka hareket.
    doc = logNext(day, doc, 5, { kg: 60, value: 10 });
    assert.equal(easyShortcut(day, doc, doc.entries[0]?.sets.at(-1)?.id ?? ''), null);
  });
});

describe('ekran metinleri', () => {
  test('hedef, kayıt, önceki, sıradaki, sayaç', () => {
    assert.equal(targetCell({ min: 8, max: 8, amrap: true }, 'weight_reps'), '8+');
    assert.equal(targetCell({ min: 10, max: 12 }, 'weight_reps'), '10–12');
    assert.equal(targetCell({ min: 30, max: 30 }, 'duration'), '30 sn');
    assert.equal(targetText({ min: 8, max: 10 }, 'weight_reps'), 'Hedef 8–10');
    assert.equal(targetText({ min: 30, max: 45 }, 'duration'), 'Hedef 30–45 sn');
    assert.equal(setValueText({ kg: 62.5, reps: 9 }), '62,5 kg × 9');
    assert.equal(setValueText({ reps: 12 }), '12 tekrar');
    assert.equal(setValueText({ seconds: 45 }), '45 sn');
    assert.equal(previousText({ setIndex: 0, kg: 60, value: 10 }, 'weight_reps'), '60 × 10');
    assert.equal(previousText({ setIndex: 0, value: 12 }, 'bodyweight_reps'), '12');
    assert.equal(previousText(undefined, 'weight_reps'), '—');
    const next = { unitKey: 'b', rowId: 'r', position: 2, total: 3, setIndex: 2, target: { min: 8, max: 10 }, plannedKg: 62.5, restAfterSeconds: 90, kg: 62.5, value: 8 };
    assert.equal(nextText(next, { title: 'Bench Press', trackingType: 'weight_reps' }, false), 'Set 3 · 62,5 kg × 8–10');
    assert.equal(nextText({ ...next, kg: undefined, position: 0 }, { title: 'Plank', trackingType: 'duration' }, true), 'Plank · Set 1 · 8–10 sn');
    assert.equal(clockText(72), '1:12');
    assert.equal(clockText(5.9), '0:05');
    assert.equal(elapsedText(24 * 60 + 18), '24:18');
    assert.equal(elapsedText(3600 + 4 * 60 + 18), '1:04:18');
  });
});
