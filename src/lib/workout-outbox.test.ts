import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionDoc } from './schemas/session.ts';
import { sameSessionData } from './session-merge.ts';
import { at, sessionDoc, sessionEntry, W1, W2, workingSet } from './testing/session-fixtures.ts';
import { DEVICES, PUSH_UP, workoutDay } from './testing/workout-fixtures.ts';
import { addedRowFor, rekeyExtra } from './workout-plan.ts';
import {
  acknowledge,
  backoffMs,
  BACKOFF,
  createLocalWorkout,
  hasUnsent,
  parseLocalWorkout,
  SEND_WINDOW_MS,
  sendDelay,
  sendPending,
  setsMissingOn,
  SLOW_WINDOW_MS,
  unsentSets,
  withChange,
} from './workout-outbox.ts';
import { startRest } from './workout-rest.ts';
import { startSetTimer } from './workout-timer.ts';

const set = (id: string, minute: number, extra = {}) => workingSet(id, minute, { setIndex: 0, ...extra });
const docWith = (sets: ReturnType<typeof set>[], extra: Partial<SessionDoc> = {}) =>
  sessionDoc({ entries: [sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets })], ...extra });

describe('kuyruk: değişiklik ve gönderim', () => {
  test('set değişikliği gönderim ister; su yalnız kirletir', () => {
    let local = createLocalWorkout(docWith([]), workoutDay());
    assert.equal(sendPending(local), false);
    local = withChange(local, docWith([set('st_aaaaaaaa', 1)]), { send: true });
    assert.deepEqual([local.rev, local.dueRev, sendPending(local), hasUnsent(local)], [1, 1, true, true]);
    local = acknowledge(local, local.doc, 1);
    assert.deepEqual([sendPending(local), hasUnsent(local)], [false, false]);
    local = withChange(local, { ...local.doc, waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(2) }] }, { send: false });
    assert.deepEqual([sendPending(local), hasUnsent(local)], [false, true]);
  });

  test('birleştirme penceresi: son yazma 15 sn\'den yeniyse 15. saniyeye; kota azsa 60 sn', () => {
    assert.equal(sendDelay({ lastSentAt: null, slow: false }, 1000), 0);
    assert.equal(sendDelay({ lastSentAt: 1000, slow: false }, 6000), SEND_WINDOW_MS - 5000);
    assert.equal(sendDelay({ lastSentAt: 1000, slow: false }, 1000 + SEND_WINDOW_MS + 1), 0);
    assert.equal(sendDelay({ lastSentAt: 1000, slow: true }, 6000), SLOW_WINDOW_MS - 5000);
  });

  test('üstel bekleme: 5 sn × 2ⁿ, en çok 5 dk, ±%20', () => {
    assert.equal(backoffMs(0, () => 0.5), 5000);
    assert.equal(backoffMs(2, () => 0.5), 20_000);
    assert.equal(backoffMs(20, () => 0.5), BACKOFF.maxMs);
    assert.equal(backoffMs(0, () => 0), 4000);
    assert.equal(backoffMs(0, () => 1), 6000);
  });
});

describe('kuyruk: sunucunun yanıtı', () => {
  test('sunucunun birleşik belgesi üstüne telefondaki son hâl; tarih sunucunun', () => {
    const sent = docWith([set('st_aaaaaaaa', 1)], { date: '2026-09-25' });
    let local = withChange(createLocalWorkout(docWith([], { date: '2026-09-25' }), workoutDay()), sent, { send: true });
    // Yolda iken yeni set.
    local = withChange(local, docWith([set('st_aaaaaaaa', 1), set('st_bbbbbbbb', 3, { setIndex: 1 })], { date: '2026-09-25' }), { send: true });
    // Sunucuda başka cihazın seti de var; tarih sunucunun.
    const server = docWith([set('st_aaaaaaaa', 1), set('st_cccccccc', 2, { setIndex: 2, by: W2 })], { date: '2026-09-26', writer: W2 });
    const acked = acknowledge(local, server, 1, { slow: true });
    assert.deepEqual(acked.doc.entries[0]?.sets.map((item) => item.id), ['st_aaaaaaaa', 'st_cccccccc', 'st_bbbbbbbb']);
    assert.equal(acked.doc.date, '2026-09-26');
    assert.equal(acked.doc.writer, W1);
    assert.equal(acked.slow, true);
    assert.deepEqual([acked.ackedRev, sendPending(acked)], [1, true]);
    assert.equal(unsentSets(acked), 1);
  });

  test('gönderilen her şey onaylanınca belge sunucununkiyle aynı veri: yeniden yazma döngüsü yok', () => {
    const local = withChange(createLocalWorkout(docWith([], { date: '2026-09-25' }), workoutDay()), docWith([set('st_aaaaaaaa', 1)], { date: '2026-09-25' }), {
      send: true,
    });
    const server = { ...local.doc, date: '2026-09-26' };
    const acked = acknowledge(local, server, local.rev);
    assert.equal(sameSessionData(acked.doc, server), true);
    assert.equal(hasUnsent(acked), false);
  });

  test('telefonda olup sunucuda olmayan: yeni ve düzeltilmiş setler', () => {
    const acked = docWith([set('st_aaaaaaaa', 1), set('st_bbbbbbbb', 2, { setIndex: 1 })]);
    const doc = docWith([set('st_aaaaaaaa', 1, { reps: 7, editedAt: at(5) }), set('st_bbbbbbbb', 2, { setIndex: 1 }), set('st_cccccccc', 3, { setIndex: 2 })]);
    assert.equal(unsentSets({ doc, acked }), 2);
    assert.equal(unsentSets({ doc, acked: null }), 3);
    // Başka cihazda bitirildi: sunucuda olmayan ve orada silinmemiş setler eklenebilir.
    assert.equal(setsMissingOn(doc, { ...acked, deletedSetIds: ['st_cccccccc'] }), 0);
    assert.equal(setsMissingOn(doc, acked), 1);
  });
});

describe('kuyruk: telefondaki kayıt', () => {
  test('yazılıp okunur; dinlenme, taslak ve süreli setin sayacı korunur', () => {
    const local = {
      ...withChange(createLocalWorkout(docWith([]), workoutDay()), docWith([set('st_aaaaaaaa', 1)]), { send: true }),
      rest: startRest('st_aaaaaaaa', 90, 1_000),
      restCount: 1,
      draft: { rowId: 'r_aaaaaa', setIndex: 1, kg: 25 },
      timer: startSetTimer({ rowId: 'r_bbbbbb', setIndex: 0, target: { min: 30, max: 45 } }, 2_000),
      lastSentAt: 500,
    };
    const parsed = parseLocalWorkout(JSON.stringify(local));
    assert.deepEqual(parsed, local);
  });

  test('okunamayan kayıt yok sayılır: bozuk JSON, başka sürüm, bitmiş ya da şemaya uymayan belge', () => {
    const local = createLocalWorkout(docWith([]), workoutDay());
    assert.equal(parseLocalWorkout(null), null);
    assert.equal(parseLocalWorkout('{'), null);
    assert.equal(parseLocalWorkout(JSON.stringify({ ...local, v: 2 })), null);
    assert.equal(parseLocalWorkout(JSON.stringify({ ...local, doc: { ...local.doc, status: 'finished', finishedAt: at(9) } })), null);
    assert.equal(parseLocalWorkout(JSON.stringify({ ...local, doc: { ...local.doc, id: 'x' } })), null);
    assert.equal(parseLocalWorkout(JSON.stringify({ ...local, plan: { dayId: 1 } })), null);
    // Onaylı belge okunamazsa yalnız o düşer.
    assert.equal(parseLocalWorkout(JSON.stringify({ ...local, acked: { bozuk: true } }))?.acked, null);
  });

  test('muadil ve eklenen hareketlerin planları ve sağlık onayı korunur; bozuk plan atlanır, eski kayıtta boş', () => {
    const extra = rekeyExtra(addedRowFor({ key: 'push-up', exercise: PUSH_UP, devices: DEVICES, history: [] }), 'e_added1');
    const local = createLocalWorkout(docWith([]), workoutDay(), null, { extras: { 'e_added1:push-up': extra }, pain: true });
    assert.deepEqual(parseLocalWorkout(JSON.stringify(local)), local);
    const broken = parseLocalWorkout(JSON.stringify({ ...local, extras: { 'e_added1:push-up': extra, 'x:y': { row: 1 } } }));
    assert.deepEqual(Object.keys(broken?.extras ?? {}), ['e_added1:push-up']);
    const { extras: _extras, pain: _pain, ...old } = local;
    const legacy = parseLocalWorkout(JSON.stringify(old));
    assert.deepEqual([legacy?.extras, legacy?.pain], [{}, false]);
  });

  test('"+ Set ekle"nin istenen turları korunur; bozuk sayı atlanır, eski kayıtta boş', () => {
    const local = { ...createLocalWorkout(docWith([]), workoutDay()), extraRounds: { b_aaaaaa: 2 } };
    assert.deepEqual(parseLocalWorkout(JSON.stringify(local))?.extraRounds, { b_aaaaaa: 2 });
    const broken = parseLocalWorkout(JSON.stringify({ ...local, extraRounds: { b_aaaaaa: 1, b_bbbbbb: -1, b_cccccc: 1.5, b_dddddd: 'x' } }));
    assert.deepEqual(broken?.extraRounds, { b_aaaaaa: 1 });
    const { extraRounds: _rounds, ...old } = local;
    assert.deepEqual(parseLocalWorkout(JSON.stringify(old))?.extraRounds, {});
  });
});


test('local celebration ledger survives reload and never enters the session document',()=>{
 const local={...createLocalWorkout(docWith([]),workoutDay()),achievementSeen:['bench-press@:record:heaviest']};
 const parsed=parseLocalWorkout(JSON.stringify(local));
 assert.deepEqual(parsed?.achievementSeen,['bench-press@:record:heaviest']);
 assert.equal('achievementSeen' in parsed!.doc,false);
});
