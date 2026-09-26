import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { sessionDocSchema, type SessionDoc } from './schemas/session.ts';
import { at, W1, workingSet } from './testing/session-fixtures.ts';
import { BENCH, CRUNCH, DB_PRESS, dayWithBlocks, DEVICES, PLANK, PUSH_UP, workoutDay } from './testing/workout-fixtures.ts';
import { mergeAll } from './session-merge.ts';
import { cursorOf, logSet, newSessionDoc, nextSet, setViews } from './workout-session.ts';
import {
  addExercise,
  canSwap,
  doNowAt,
  dropAt,
  effectiveDay,
  firstSkippedKey,
  flowView,
  optionText,
  restoreAt,
  skipAt,
  skipMessage,
  swapRow,
  undoSkip,
  withFinishReason,
} from './workout-flow.ts';
import { addedRowFor, extraKey, rekeyExtra, swapRowFor, type ExtraRows, type WorkoutDay } from './workout-plan.ts';

/** Belirlenimli "rastgelelik": her çağrıda farklı baytlar, kimlikler çakışmaz (`from`: başka bir cihaz). */
function sequence(from = 0) {
  let n = from;
  return (size: number) => Uint8Array.from({ length: size }, () => (n++ * 7) % 252);
}

const stamp = (minute: number) => ({ at: at(minute), by: W1 });

function start(day: WorkoutDay): SessionDoc {
  return newSessionDoc(day, { today: '2026-09-26', now: new Date(at(0)), writer: W1, random: sequence() });
}

function logNext(day: WorkoutDay, doc: SessionDoc, minute: number, random = sequence()): SessionDoc {
  const next = nextSet(day, doc);
  if (!next) throw new Error('Set kalmadı.');
  return logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(minute), random }).doc;
}

/** Gün A: Bench (3 set), Plank (2 × 30–45 sn), Goblet Squat (2 set). */
function threeDay(): WorkoutDay {
  return dayWithBlocks([
    { id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }, { min: 8, max: 10 }, { min: 8, max: 10 }] }] },
    { id: 'b_bbbbbb', kind: 'single', restSeconds: 45, rows: [{ id: 'r_bbbbbb', exerciseId: 'plank', sets: [{ min: 30, max: 45 }, { min: 30, max: 45 }] }] },
    { id: 'b_dddddd', kind: 'single', restSeconds: 60, rows: [{ id: 'r_dddddd', exerciseId: 'goblet-squat', sets: [{ min: 10, max: 12 }, { min: 10, max: 12 }] }] },
  ]);
}

const valid = (doc: SessionDoc) => assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
const nextRow = (day: WorkoutDay, doc: SessionDoc) => cursorOf(day, doc).next?.rowId;

describe('akış sheet\'i', () => {
  test('yapılış sırasında birimler: şu anki, sıradakiler; numara ve set sayıları', () => {
    const day = threeDay();
    const view = flowView(day, logNext(day, start(day), 1));
    assert.deepEqual(
      view.active.map((item) => [item.members[0]?.number, item.members[0]?.title, item.state, `${item.done}/${item.planned}`]),
      [
        ['1', 'Bench Press', 'current', '1/3'],
        ['2', 'Plank', 'pending', '0/2'],
        ['3', 'Goblet Squat', 'pending', '0/2'],
      ],
    );
    assert.deepEqual([view.doneSets, view.plannedSets, view.skipped.length], [1, 7, 0]);
  });

  test('grupta üyeler "3a", "3b" ve türün adı', () => {
    const day = dayWithBlocks([
      { id: 'b_aaaaaa', kind: 'superset', restSeconds: 90, rows: [
        { id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }, { min: 8, max: 10 }] },
        { id: 'r_bbbbbb', exerciseId: 'goblet-squat', sets: [{ min: 8, max: 10 }, { min: 8, max: 10 }] },
      ] },
    ]);
    const item = flowView(day, start(day)).active[0];
    assert.deepEqual(item?.members.map((member) => member.number), ['1a', '1b']);
    assert.equal(item?.kindLabel, 'Süperset');
    assert.equal(item?.planned, 4);
  });
});

describe('"Hareketi geç ›", "Bugün yapma", "Geri al"', () => {
  test('sona alınır, sıradaki hemen gelir; bütün satırların kaydı açılır (sıra kimliklerle)', () => {
    const day = threeDay();
    const result = skipAt(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    assert.ok(result);
    assert.equal(result.outcome, 'moved');
    assert.equal(result.doc.entries.length, 3);
    assert.equal(nextRow(day, result.doc), 'r_bbbbbb');
    const view = flowView(day, result.doc);
    assert.deepEqual(view.active.map((item) => [item.key, item.state]), [
      ['b_bbbbbb', 'current'],
      ['b_dddddd', 'pending'],
      ['b_aaaaaa', 'moved'],
    ]);
    valid(result.doc);
  });

  test('sona alınmış hareket yeniden geçilirse Geçilenler; son kalan hareket doğrudan Geçilenler', () => {
    const day = threeDay();
    const moved = skipAt(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    assert.ok(moved);
    const again = skipAt(day, moved.doc, 'b_aaaaaa', stamp(2));
    assert.equal(again?.outcome, 'dropped');
    assert.deepEqual(flowView(day, again?.doc as SessionDoc).skipped.map((item) => item.key), ['b_aaaaaa']);
    assert.equal(firstSkippedKey(day, again?.doc as SessionDoc), 'b_aaaaaa');

    let doc = logNext(day, logNext(day, start(day), 1), 2);
    doc = logNext(day, doc, 3);
    doc = logNext(day, logNext(day, doc, 4), 5);
    const last = skipAt(day, doc, 'b_dddddd', stamp(6));
    assert.equal(last?.outcome, 'dropped');
    assert.equal(cursorOf(day, last?.doc as SessionDoc).allDone, true);
  });

  test('toast metni: set yapıldıysa "2/3 set yapıldı; kalanı sona alındı"', () => {
    assert.deepEqual(skipMessage('moved', 'Bench Press', 0, 3), { title: 'Bench Press sona alındı' });
    assert.deepEqual(skipMessage('moved', 'Bench Press', 2, 3), { title: '2/3 set yapıldı; kalanı sona alındı' });
    assert.deepEqual(skipMessage('dropped', 'Plank', 0, 2), { title: 'Plank geçildi', description: 'Geçilenler listesinde' });
    assert.deepEqual(skipMessage('dropped', 'Plank', 1, 2), { title: 'Plank geçildi', description: '1/2 set yapıldı' });
  });

  test('"Geri al": sıra ve durum geçmeden önceki hâline; yeni saat eskiyi ezer', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1);
    const result = skipAt(day, doc, 'b_aaaaaa', stamp(2), sequence());
    assert.ok(result);
    const undone = undoSkip(day, result.doc, result.undo, stamp(3));
    assert.equal(nextRow(day, undone), 'r_aaaaaa');
    const bench = undone.entries.find((entry) => entry.rowId === 'r_aaaaaa');
    assert.deepEqual([bench?.status, bench?.skip, bench?.updatedAt], ['partial', undefined, at(3)]);
    assert.equal(undone.order?.updatedAt, at(3));
    assert.deepEqual(flowView(day, undone).active.map((item) => item.key), ['b_aaaaaa', 'b_bbbbbb', 'b_dddddd']);
    valid(undone);
  });

  test('"Geri al" Geçilenler\'e gideni de sona alınmış hâline döndürür', () => {
    const day = threeDay();
    const moved = skipAt(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    const dropped = moved && skipAt(day, moved.doc, 'b_aaaaaa', stamp(2));
    assert.ok(dropped);
    const undone = undoSkip(day, dropped.doc, dropped.undo, stamp(3));
    const bench = undone.entries.find((entry) => entry.rowId === 'r_aaaaaa');
    assert.deepEqual([bench?.status, bench?.skip?.moved], ['pending', true]);
    assert.equal(flowView(day, undone).active.at(-1)?.state, 'moved');
  });

  test('"Bugün yapma" Geçilenler\'e; Geçilenler\'de "Geri al" sonda "sona alındı" olarak döner', () => {
    const day = threeDay();
    const moved = skipAt(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    assert.ok(moved);
    const dropped = dropAt(day, moved.doc, 'b_aaaaaa', stamp(2));
    assert.deepEqual(flowView(day, dropped).skipped.map((item) => item.key), ['b_aaaaaa']);
    assert.equal(cursorOf(day, dropped).progress.plannedSets, 4);
    const restored = restoreAt(day, dropped, 'b_aaaaaa', stamp(3));
    const view = flowView(day, restored);
    assert.deepEqual(view.skipped, []);
    assert.deepEqual(view.active.map((item) => [item.key, item.state]).at(-1), ['b_aaaaaa', 'moved']);
    assert.equal(cursorOf(day, restored).progress.plannedSets, 7);
    // Yeniden geçilirse doğrudan Geçilenler.
    assert.equal(skipAt(day, restored, 'b_aaaaaa', stamp(4))?.outcome, 'dropped');
  });

  test('"Şimdi yap": birim kalanların başına, sıra oradan sürer; geçilen de geri gelir', () => {
    const day = threeDay();
    const doc = doNowAt(day, logNext(day, start(day), 1), 'b_dddddd', stamp(2), sequence());
    assert.equal(nextRow(day, doc), 'r_dddddd');
    assert.deepEqual(flowView(day, doc).active.map((item) => item.key), ['b_dddddd', 'b_aaaaaa', 'b_bbbbbb']);
    const moved = skipAt(day, doc, 'b_bbbbbb', stamp(3));
    const dropped = moved && dropAt(day, moved.doc, 'b_bbbbbb', stamp(4));
    assert.ok(dropped);
    const back = doNowAt(day, dropped, 'b_bbbbbb', stamp(5));
    assert.equal(nextRow(day, back), 'r_bbbbbb');
    assert.deepEqual(flowView(day, back).skipped, []);
    valid(back);
  });

  test('grupta geçme bütün grubu sona alır', () => {
    const day = dayWithBlocks([
      { id: 'b_aaaaaa', kind: 'superset', restSeconds: 90, rows: [
        { id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }] },
        { id: 'r_bbbbbb', exerciseId: 'goblet-squat', sets: [{ min: 8, max: 10 }] },
      ] },
      { id: 'b_dddddd', kind: 'single', restSeconds: 60, rows: [{ id: 'r_dddddd', exerciseId: 'plank', sets: [{ min: 30, max: 45 }] }] },
    ]);
    const result = skipAt(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    assert.equal(nextRow(day, result?.doc as SessionDoc), 'r_dddddd');
    assert.equal(result?.doc.entries.filter((entry) => entry.skip?.moved).length, 2);
  });

  test('iki cihaz: birinde geçmenin açtığı boş kayıt, ötekinde aynı satırın seti; birleşimde tek kayıt, set görünür', () => {
    const day = threeDay();
    const server = logNext(day, start(day), 1);
    const skipped = skipAt(day, server, 'b_bbbbbb', stamp(2), sequence(40));
    assert.ok(skipped);
    const logged = logSet(day, server, { rowId: 'r_dddddd', setIndex: 0, kg: 20, value: 10, stamp: stamp(3), random: sequence(90) }).doc;
    for (const merged of [mergeAll([skipped.doc, logged]), mergeAll([logged, skipped.doc])] as SessionDoc[]) {
      assert.equal(merged.entries.filter((entry) => entry.rowId === 'r_dddddd').length, 1);
      assert.equal(setViews(day, merged, 'r_dddddd')[0]?.logged?.reps, 10);
      valid(merged);
    }
  });
});

describe('"Değiştir" (muadil)', () => {
  const benchSwap = (day: WorkoutDay, exercise = DB_PRESS) => {
    const block = day.blocks[0];
    const row = block?.rows[0];
    if (!block || !row) throw new Error('Satır yok.');
    return swapRowFor({ row, blockId: block.id, original: BENCH, exercise, devices: DEVICES, history: [], firstForMuscle: true });
  };

  test('muadil satırın yerinde, kendi planıyla; kayıt `swappedFrom`, sıra ve imleç aynı', () => {
    const day = threeDay();
    const extra = benchSwap(day);
    const extras: ExtraRows = { [extraKey('r_aaaaaa', extra.exerciseId)]: extra };
    assert.equal(canSwap(day, start(day), 'r_aaaaaa'), true);
    const doc = swapRow(day, start(day), { rowId: 'r_aaaaaa', extra, stamp: stamp(1), random: sequence() });
    const entry = doc.entries[0];
    assert.deepEqual([entry?.swappedFrom, entry?.rowId, entry?.exerciseId, entry?.title, entry?.deviceId], ['r_aaaaaa', undefined, 'dumbbell-press', 'Dumbbell Press', 'dambil-seti']);
    const live = effectiveDay(day, doc, extras);
    assert.equal(live.rows.r_aaaaaa?.title, 'Dumbbell Press');
    assert.equal(live.blocks[0]?.rows[0]?.exerciseId, 'dumbbell-press');
    const next = nextSet(live, doc);
    assert.deepEqual([next?.rowId, next?.kg], ['r_aaaaaa', extra.row.plan.sets[0]?.weightKg]);
    const logged = logNext(live, doc, 2);
    assert.equal(logged.entries.length, 1);
    assert.equal(logged.entries[0]?.sets.length, 1);
    assert.equal(canSwap(live, logged, 'r_aaaaaa'), false);
    valid(logged);
  });

  test('asıl harekete dönmek aynı kaydı çevirir; eski hareketin ısınmaları silinir', () => {
    const day = threeDay();
    const extra = benchSwap(day);
    const warm = { ...start(day), entries: [] } as SessionDoc;
    const withWarmup: SessionDoc = {
      ...warm,
      entries: [
        { id: 'e_benchx', rowId: 'r_aaaaaa', blockId: 'b_aaaaaa', exerciseId: 'bench-press', title: 'Bench Press', status: 'pending', updatedAt: at(0), by: W1, sets: [workingSet('st_warm0001', 0, { type: 'warmup', setIndex: 0, kg: 20, reps: 10 })] },
      ],
    };
    const swapped = swapRow(day, withWarmup, { rowId: 'r_aaaaaa', extra, stamp: stamp(1) });
    assert.equal(swapped.entries[0]?.id, 'e_benchx');
    assert.deepEqual(swapped.entries[0]?.sets, []);
    assert.deepEqual(swapped.deletedSetIds, ['st_warm0001']);
    const back = swapRow(day, swapped, { rowId: 'r_aaaaaa', extra: null, stamp: stamp(2) });
    assert.deepEqual([back.entries[0]?.id, back.entries[0]?.rowId, back.entries[0]?.swappedFrom, back.entries[0]?.exerciseId], ['e_benchx', 'r_aaaaaa', undefined, 'bench-press']);
    assert.equal(effectiveDay(day, back, {}), day);
    // Aynı harekete "değiştirmek" bir şey yapmaz.
    assert.equal(swapRow(day, back, { rowId: 'r_aaaaaa', extra: null, stamp: stamp(3) }), back);
    valid(back);
  });

  test('set kaydedilmişse ve eklenen harekette açılmaz', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1);
    assert.equal(canSwap(day, doc, 'r_aaaaaa'), false);
    assert.equal(swapRow(day, doc, { rowId: 'r_aaaaaa', extra: benchSwap(day), stamp: stamp(2) }), doc);
    assert.equal(canSwap(day, doc, 'e_abcdef'), false);
  });

  test('kayıt türü farklıysa (süre → tekrar) muadilin varsayılan hedefiyle aynı sayıda set', () => {
    const day = threeDay();
    const block = day.blocks[1];
    const row = block?.rows[0];
    assert.ok(block && row);
    const extra = swapRowFor({ row, blockId: block.id, original: PLANK, exercise: CRUNCH, devices: DEVICES, history: [], firstForMuscle: false });
    assert.equal(extra.template.sets.length, 2);
    assert.notDeepEqual(extra.template.sets[0], { min: 30, max: 45 });
    assert.equal(extra.row.trackingType, 'bodyweight_reps');
    const same = benchSwap(day);
    assert.deepEqual(same.template.sets, day.blocks[0]?.rows[0]?.sets);
  });

  test('plan gelmediyse muadil asıl satırın düzeniyle, kendi adıyla sürer', () => {
    const day = threeDay();
    const doc = swapRow(day, start(day), { rowId: 'r_aaaaaa', extra: benchSwap(day, PUSH_UP), stamp: stamp(1), random: sequence() });
    const live = effectiveDay(day, doc, {});
    assert.deepEqual([live.rows.r_aaaaaa?.title, live.rows.r_aaaaaa?.lastTime], ['Şınav', []]);
    assert.equal(nextSet(live, doc)?.rowId, 'r_aaaaaa');
  });

  test('muadil satırının alt metni', () => {
    const day = threeDay();
    const first = benchSwap(day);
    assert.match(optionText(first), /^8–10 tekrar · \d+(,\d+)? kg ile başla$/);
    assert.equal(optionText(benchSwap(day, PUSH_UP)), '8–10 tekrar');
    const block = day.blocks[1];
    const row = block?.rows[0];
    assert.ok(block && row);
    const plankLike = swapRowFor({ row, blockId: block.id, original: PLANK, exercise: PLANK, devices: DEVICES, history: [], firstForMuscle: false });
    assert.equal(optionText(plankLike), '30–45 sn');
  });
});

describe('"Hareket ekle"', () => {
  function added(day: WorkoutDay, doc: SessionDoc, entryId: string) {
    const extra = rekeyExtra(addedRowFor({ key: 'push-up', exercise: PUSH_UP, devices: DEVICES, history: [] }), entryId);
    return { extra, doc: addExercise(day, doc, { entryId, extra, stamp: stamp(5), random: sequence() }) };
  }

  test('yalnız bu antrenmana: kayıt hemen açılır, yapılacakların sonuna; kendi kimliğiyle satır', () => {
    const day = threeDay();
    const { extra, doc } = added(day, logNext(day, start(day), 1), 'e_added1');
    const entry = doc.entries.find((item) => item.id === 'e_added1');
    assert.deepEqual([entry?.added, entry?.rowId, entry?.plannedSets, entry?.title], [true, undefined, 3, 'Şınav']);
    const live = effectiveDay(day, doc, { [extraKey('e_added1', 'push-up')]: extra });
    assert.equal(live.rows.e_added1?.title, 'Şınav');
    const view = flowView(live, doc);
    assert.deepEqual(view.active.map((item) => [item.members[0]?.number, item.key, item.added]).at(-1), ['4', 'e_added1', true]);
    assert.equal(view.plannedSets, 10);
    valid(doc);
  });

  test('Geçilenler\'in önüne girer; "Şimdi yap" ile hemen yapılır ve setleri kendi kaydına yazılır', () => {
    const day = threeDay();
    const moved = skipAt(day, start(day), 'b_bbbbbb', stamp(1), sequence());
    const dropped = moved && dropAt(day, moved.doc, 'b_bbbbbb', stamp(2));
    assert.ok(dropped);
    const { extra, doc } = added(day, dropped, 'e_added1');
    const extras = { [extraKey('e_added1', 'push-up')]: extra };
    const live = effectiveDay(day, doc, extras);
    assert.deepEqual(flowView(live, doc).active.map((item) => item.key), ['b_aaaaaa', 'b_dddddd', 'e_added1']);
    const now = doNowAt(live, doc, 'e_added1', stamp(6));
    const next = nextSet(effectiveDay(day, now, extras), now);
    assert.equal(next?.rowId, 'e_added1');
    const logged = logNext(effectiveDay(day, now, extras), now, 7);
    assert.equal(logged.entries.find((item) => item.id === 'e_added1')?.sets.length, 1);
    assert.equal(logged.entries.length, 4);
    valid(logged);
  });
});

describe('bitişte neden', () => {
  test('yapılmayan her harekete; ağrı seansa "diğer", ayrıntı yalnız programın satırları için', () => {
    const day = threeDay();
    const extra = rekeyExtra(addedRowFor({ key: 'push-up', exercise: PUSH_UP, devices: DEVICES, history: [] }), 'e_added1');
    let doc = addExercise(day, logNext(day, start(day), 1), { entryId: 'e_added1', extra, stamp: stamp(2), random: sequence() });
    const live = effectiveDay(day, doc, { [extraKey('e_added1', 'push-up')]: extra });
    const busy = withFinishReason(live, doc, 'busy', stamp(3));
    assert.deepEqual(busy.doc.entries.map((entry) => entry.skip?.reason), ['busy', 'busy', 'busy', 'busy']);
    assert.deepEqual(busy.skippedRows, []);
    doc = logNext(live, logNext(live, doc, 4), 5);
    const pain = withFinishReason(live, doc, 'pain', stamp(6));
    assert.deepEqual(pain.doc.entries.find((entry) => entry.rowId === 'r_aaaaaa')?.skip, undefined);
    assert.equal(pain.doc.entries.find((entry) => entry.rowId === 'r_bbbbbb')?.skip?.reason, 'other');
    assert.deepEqual(pain.skippedRows, [
      { rowId: 'r_bbbbbb', reason: 'pain' },
      { rowId: 'r_dddddd', reason: 'pain' },
    ]);
    valid(pain.doc);
  });
});

describe('günün etkin planı', () => {
  test('muadil ve ekleme yoksa aynı gün (aynı nesne)', () => {
    const day = workoutDay();
    assert.equal(effectiveDay(day, start(day), {}), day);
  });
});
