import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionDoc, SessionEntry } from './schemas/session.ts';
import { at, groupBlock, plan, sessionDoc, sessionEntry, singleBlock, W1, workingSet } from './testing/session-fixtures.ts';
import { doNow, dropUnit, entryStatusOf, prefillSet, restoreUnit, skipUnit, workoutCursor } from './workout-cursor.ts';

let setCounter = 0;
/** Harekete `count` çalışma seti ekler. */
function withSets(entry: SessionEntry, count: number, extra = 0): SessionEntry {
  const sets = Array.from({ length: count + extra }, (_, index) =>
    workingSet(`st_${(++setCounter).toString(36).padStart(8, '0')}`, setCounter, { setIndex: index, ...(index >= count ? { extra: true } : {}) }),
  );
  return { ...entry, sets: [...entry.sets, ...sets] };
}

const day = plan(singleBlock('b_aaaaaa', 'r_aaaaaa', 3), singleBlock('b_bbbbbb', 'r_bbbbbb', 2), singleBlock('b_cccccc', 'r_cccccc', 2));
const entries = () => [
  sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa' }),
  sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press' }),
  sessionEntry('e_cccccc', { rowId: 'r_cccccc', exerciseId: 'plank', title: 'Plank' }),
];
const stamp = { at: at(30), by: W1 };

function docWith(counts: Record<string, number>, extra: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({ entries: entries().map((entry) => withSets(entry, counts[entry.id] ?? 0)), ...extra });
}

describe('imleç: tek hareketli bloklar', () => {
  test('ilk yapılmamış set; dinlenme bloktan; ilerleme "Hareket 1/3 · 0/7 set"', () => {
    const cursor = workoutCursor(day, docWith({}));
    assert.deepEqual(
      { row: cursor.next?.rowId, round: cursor.next?.round, rest: cursor.next?.restAfterSeconds, entry: cursor.next?.entryId },
      { row: 'r_aaaaaa', round: 0, rest: 90, entry: 'e_aaaaaa' },
    );
    assert.deepEqual(cursor.progress, { doneSets: 0, plannedSets: 7, currentUnit: 1, totalUnits: 3 });
  });

  test('hareket bitince sıradaki hareket; fazladan set planı saymaz', () => {
    const cursor = workoutCursor(day, sessionDoc({ entries: entries().map((entry) => (entry.id === 'e_aaaaaa' ? withSets(entry, 3, 1) : entry)) }));
    assert.equal(cursor.next?.rowId, 'r_bbbbbb');
    assert.equal(cursor.next?.round, 0);
    assert.deepEqual(cursor.progress, { doneSets: 3, plannedSets: 7, currentUnit: 2, totalUnits: 3 });
  });

  test('son set: dinlenme yok; hepsi yapılınca bitti', () => {
    const last = workoutCursor(day, docWith({ e_aaaaaa: 3, e_bbbbbb: 2, e_cccccc: 1 }));
    assert.equal(last.next?.rowId, 'r_cccccc');
    assert.equal(last.next?.restAfterSeconds, 0);
    const done = workoutCursor(day, docWith({ e_aaaaaa: 3, e_bbbbbb: 2, e_cccccc: 2 }));
    assert.equal(done.next, null);
    assert.equal(done.allDone, true);
  });

  test('silinen set yeniden yapılır: ortadaki set gidince imleç geri döner', () => {
    const doc = docWith({ e_aaaaaa: 3, e_bbbbbb: 1 });
    const removed = { ...doc, entries: doc.entries.map((entry) => (entry.id === 'e_aaaaaa' ? { ...entry, sets: entry.sets.slice(0, 2) } : entry)) };
    assert.equal(workoutCursor(day, removed).next?.rowId, 'r_aaaaaa');
    assert.equal(workoutCursor(day, removed).next?.round, 2);
  });

  test('bugünkü plan daha az set verdiyse (hafifletme) o sayı; setlere yazılan plan da okunur', () => {
    const lighter = workoutCursor(day, docWith({ e_aaaaaa: 2 }), { plannedSets: new Map([['r_aaaaaa', 2]]) });
    assert.equal(lighter.next?.rowId, 'r_bbbbbb');
    const doc = docWith({});
    const recorded = {
      ...doc,
      entries: doc.entries.map((entry) => (entry.id === 'e_aaaaaa' ? { ...entry, sets: [workingSet('st_rec00001', 1, { setIndex: 0, plannedSetCount: 1 })] } : entry)),
    };
    assert.equal(workoutCursor(day, recorded).next?.rowId, 'r_bbbbbb');
  });
});

describe('imleç: gruplar', () => {
  const superset = plan(groupBlock('b_gggggg', 'superset', [{ id: 'r_aaaaaa', sets: 3 }, { id: 'r_bbbbbb', sets: 2 }], 120));
  const pair = () => [sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa' }), sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb' })];

  test('tur tur: A1 → B1 (arada dinlenme yok) → tur sonu dinlenme → A2', () => {
    const start = workoutCursor(superset, sessionDoc({ entries: pair() }));
    assert.deepEqual([start.next?.rowId, start.next?.restAfterSeconds], ['r_aaaaaa', 0]);
    const afterA = workoutCursor(superset, sessionDoc({ entries: [withSets(pair()[0] as SessionEntry, 1), pair()[1] as SessionEntry] }));
    assert.deepEqual([afterA.next?.rowId, afterA.next?.round, afterA.next?.restAfterSeconds], ['r_bbbbbb', 0, 120]);
  });

  test('setleri biten üye sonraki turda atlanır; tur sonu dinlenmesi kalan üyede', () => {
    const doc = sessionDoc({ entries: [withSets(pair()[0] as SessionEntry, 2), withSets(pair()[1] as SessionEntry, 2)] });
    const cursor = workoutCursor(superset, doc);
    assert.deepEqual([cursor.next?.rowId, cursor.next?.round, cursor.next?.restAfterSeconds], ['r_aaaaaa', 2, 0]);
  });

  test('devrede istasyon geçişi (varsayılan 15 sn); geçilen üye grubu bozmaz', () => {
    const circuit = plan(groupBlock('b_cccccc', 'circuit', [{ id: 'r_aaaaaa', sets: 2 }, { id: 'r_bbbbbb', sets: 2 }, { id: 'r_cccccc', sets: 2 }], 90));
    const members = entries();
    const first = workoutCursor(circuit, sessionDoc({ entries: members }));
    assert.equal(first.next?.restAfterSeconds, 15);
    const skippedMiddle = members.map((entry) => (entry.id === 'e_bbbbbb' ? { ...entry, status: 'skipped' as const } : entry));
    const doc = sessionDoc({ entries: skippedMiddle.map((entry) => (entry.id === 'e_aaaaaa' ? withSets(entry, 1) : entry)) });
    const cursor = workoutCursor(circuit, doc);
    assert.deepEqual([cursor.next?.rowId, cursor.next?.restAfterSeconds], ['r_cccccc', 90]);
    assert.equal(cursor.progress.totalUnits, 1);
  });
});

describe('geç, sona al, bugün yapma, geri al, şimdi yap', () => {
  test('"Hareketi geç ›": sona alınır, sıradaki hemen gelir; ikinci geçişte Geçilenler', () => {
    const moved = skipUnit(day, docWith({}), 'e_aaaaaa', stamp);
    assert.deepEqual(moved.order?.value, ['e_bbbbbb', 'e_cccccc', 'e_aaaaaa']);
    assert.equal(moved.entries.find((entry) => entry.id === 'e_aaaaaa')?.skip?.moved, true);
    assert.equal(moved.entries.find((entry) => entry.id === 'e_aaaaaa')?.updatedAt, stamp.at);
    assert.equal(workoutCursor(day, moved).next?.rowId, 'r_bbbbbb');

    const again = skipUnit(day, moved, 'e_aaaaaa', { at: at(31), by: W1 });
    assert.equal(again.entries.find((entry) => entry.id === 'e_aaaaaa')?.status, 'skipped');
    const cursor = workoutCursor(day, again);
    assert.equal(cursor.progress.totalUnits, 2);
    assert.equal(cursor.progress.plannedSets, 4);
  });

  test('son kalan hareket geçilirse doğrudan Geçilenler (sona alacak yer yok)', () => {
    const doc = docWith({ e_aaaaaa: 3, e_bbbbbb: 2 });
    const skipped = skipUnit(day, doc, 'e_cccccc', stamp);
    assert.equal(skipped.entries.find((entry) => entry.id === 'e_cccccc')?.status, 'skipped');
    assert.equal(workoutCursor(day, skipped).allDone, true);
  });

  test('"Bugün yapma" ve "Geri al": durum sayılardan yeniden', () => {
    const dropped = dropUnit(day, docWith({ e_bbbbbb: 1 }), 'e_bbbbbb', stamp);
    assert.equal(dropped.entries.find((entry) => entry.id === 'e_bbbbbb')?.status, 'skipped');
    const restored = restoreUnit(day, dropped, 'e_bbbbbb', { at: at(32), by: W1 });
    const entry = restored.entries.find((item) => item.id === 'e_bbbbbb');
    assert.equal(entry?.status, 'partial');
    assert.equal(entry?.skip, undefined);
  });

  test('"Şimdi yap": birim kalanların başına; yapılmış birimler yerinde', () => {
    const doc = docWith({ e_aaaaaa: 3 });
    const now = doNow(day, doc, 'e_cccccc', stamp);
    assert.deepEqual(now.order?.value, ['e_aaaaaa', 'e_cccccc', 'e_bbbbbb']);
    assert.equal(workoutCursor(day, now).next?.rowId, 'r_cccccc');
  });

  test('grupta geçme bütün grubu taşır', () => {
    const day2 = plan(groupBlock('b_gggggg', 'superset', [{ id: 'r_aaaaaa', sets: 2 }, { id: 'r_bbbbbb', sets: 2 }]), singleBlock('b_cccccc', 'r_cccccc', 2));
    const moved = skipUnit(day2, docWith({}), 'e_bbbbbb', stamp);
    assert.deepEqual(moved.order?.value, ['e_cccccc', 'e_aaaaaa', 'e_bbbbbb']);
    assert.equal(workoutCursor(day2, moved).next?.rowId, 'r_cccccc');
  });

  test('plan dışı eklenen hareket kendi set sayısıyla sona gelir', () => {
    const doc = docWith({ e_aaaaaa: 3, e_bbbbbb: 2, e_cccccc: 2 });
    const added = { ...doc, entries: [...doc.entries, sessionEntry('e_dddddd', { added: true, plannedSets: 2, exerciseId: 'curl', title: 'Curl' })] };
    const cursor = workoutCursor(day, added);
    assert.deepEqual([cursor.next?.entryId, cursor.next?.rowId, cursor.progress.plannedSets], ['e_dddddd', null, 9]);
  });

  test('muadille değiştirilen satır yeni hareketle sürer', () => {
    const doc = docWith({});
    const swapped = {
      ...doc,
      entries: [...doc.entries, sessionEntry('e_swapxx', { swappedFrom: 'r_aaaaaa', exerciseId: 'dumbbell-press', title: 'Dumbbell Press' })],
    };
    assert.equal(workoutCursor(day, swapped).next?.entryId, 'e_swapxx');
  });

  test('durum sayılardan', () => {
    assert.equal(entryStatusOf({ planned: 3, done: 0, skipped: false }), 'pending');
    assert.equal(entryStatusOf({ planned: 3, done: 2, skipped: false }), 'partial');
    assert.equal(entryStatusOf({ planned: 3, done: 3, skipped: false }), 'done');
    assert.equal(entryStatusOf({ planned: 3, done: 3, skipped: true }), 'skipped');
  });
});

describe('önceden dolu değerler', () => {
  const lastTime = [
    { setIndex: 0, kg: 60, value: 10 },
    { setIndex: 1, kg: 60, value: 9 },
    { setIndex: 2, kg: 60, value: 7 },
  ];

  test('geçen seferki aynı sıradaki set, aynı ağırlıkta; tepe hiç önceden dolmaz', () => {
    assert.deepEqual(prefillSet({ target: { min: 8, max: 10 }, setIndex: 1, plannedKg: 60, lastTime }), { kg: 60, value: 9 });
    // 10 tepedir: 9'a iner (dokunup geçmek artış getirmesin).
    assert.deepEqual(prefillSet({ target: { min: 8, max: 10 }, setIndex: 0, plannedKg: 60, lastTime }), { kg: 60, value: 9 });
    // Hedefin altı dürüstçe kalır.
    assert.deepEqual(prefillSet({ target: { min: 8, max: 10 }, setIndex: 2, plannedKg: 60, lastTime }), { kg: 60, value: 7 });
  });

  test('ağırlık arttıysa ya da ilk kezse aralığın altı; ağırlık taslak → bu seans → plan', () => {
    assert.deepEqual(prefillSet({ target: { min: 8, max: 10 }, setIndex: 0, plannedKg: 62.5, lastTime }), { kg: 62.5, value: 8 });
    assert.deepEqual(prefillSet({ target: { min: 8, max: 10 }, setIndex: 1, plannedKg: 62.5, previousKgInSession: 60, lastTime }), { kg: 60, value: 9 });
    assert.equal(prefillSet({ target: { min: 8, max: 10 }, setIndex: 1, plannedKg: 62.5, previousKgInSession: 60, draftKg: 65, lastTime }).kg, 65);
    assert.deepEqual(prefillSet({ target: { min: 30, max: 60 }, setIndex: 0, lastTime: [] }), { kg: undefined, value: 30 });
  });
});
