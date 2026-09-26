import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { finishMessage, patchMessage, putMessage, setText } from './session-messages.ts';
import { withDeletions } from './session-merge.ts';
import { at, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const bench = (sets: ReturnType<typeof workingSet>[]) => sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets });

describe('commit mesajları', () => {
  test('set: SPEC §7 biçimi; ısınma, fazladan, vücut ağırlığı, süre', () => {
    const set = workingSet('st_cccccccc', 5, { setIndex: 2, plannedSetCount: 3, kg: 62.5, reps: 10 });
    assert.equal(setText(bench([set]), set), 'Set 3/3 · Bench Press · 62,5 kg × 10');
    const warm = { id: 'st_warmup01', type: 'warmup' as const, kg: 20, reps: 10, at: at(1) };
    assert.equal(setText(bench([]), warm), 'Isınma · Bench Press · 20 kg × 10');
    const extra = workingSet('st_dddddddd', 6, { setIndex: 3, extra: true });
    assert.equal(setText(bench([]), extra), 'Set 4 (fazladan) · Bench Press · 60 kg × 10');
    const pushup = workingSet('st_eeeeeeee', 7, { kg: undefined, reps: 12 });
    assert.equal(setText(sessionEntry('e_bbbbbb', { title: 'Şınav', sets: [pushup] }), pushup), 'Set 1 · Şınav · 12 tekrar');
    const plank = workingSet('st_ffffffff', 8, { kg: undefined, reps: undefined, seconds: 45, plannedSetCount: 2 });
    assert.equal(setText(sessionEntry('e_cccccc', { title: 'Plank', sets: [plank] }), plank), 'Set 1/2 · Plank · 45 sn');
  });

  test('PUT: en yeni set; birden çoksa (+n set); düzeltme; silme değersiz', () => {
    const s1 = workingSet('st_aaaaaaaa', 1, { setIndex: 0, plannedSetCount: 3 });
    const s2 = workingSet('st_bbbbbbbb', 3, { setIndex: 1, plannedSetCount: 3, reps: 9 });
    const s3 = workingSet('st_cccccccc', 5, { setIndex: 2, plannedSetCount: 3, reps: 8 });
    const one = sessionDoc({ entries: [bench([s1])] });
    const three = sessionDoc({ entries: [bench([s1, s2, s3])] });
    assert.equal(putMessage(null, sessionDoc({ entries: [bench([])] })), 'Antrenman başladı · Gün A');
    assert.equal(putMessage(null, one), 'Set 1/3 · Bench Press · 60 kg × 10');
    assert.equal(putMessage(one, three), 'Set 3/3 · Bench Press · 60 kg × 8 (+1 set)');
    const edited = sessionDoc({ entries: [bench([{ ...s1, reps: 11, editedAt: at(9) }, s2, s3])] });
    assert.equal(putMessage(three, edited), 'Set 1/3 · Bench Press · 60 kg × 11 düzeltildi');
    const deleted = withDeletions(three, { setIds: ['st_bbbbbbbb'] });
    assert.equal(putMessage(three, deleted), 'Kayıt silindi');
    const both = withDeletions(sessionDoc({ entries: [bench([s1, s3])] }), { setIds: ['st_bbbbbbbb'] });
    assert.equal(putMessage(one, both), 'Set 3/3 · Bench Press · 60 kg × 8 · kayıt silindi');
    assert.equal(putMessage(one, { ...one, order: { value: ['e_aaaaaa'], updatedAt: at(9) } }), 'Antrenman güncellendi');
  });

  test('bitiş ve düzeltme', () => {
    const doc = sessionDoc({ entries: [bench([workingSet('st_aaaaaaaa', 1), workingSet('st_bbbbbbbb', 2)])] });
    assert.equal(finishMessage(doc), 'Antrenman bitti · Gün A · 2 set');
    assert.equal(patchMessage(doc, withDeletions(doc, { setIds: ['st_aaaaaaaa'] })), 'Kayıt silindi');
    assert.equal(patchMessage(doc, { ...doc, effort: { sessionRpe: 6, updatedAt: at(80) } }), 'Antrenman zorluğu kaydedildi');
    assert.equal(patchMessage(doc, { ...doc, waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(3) }] }), 'Su güncellendi');
    const more = sessionDoc({ entries: [bench([workingSet('st_aaaaaaaa', 1), workingSet('st_bbbbbbbb', 2), workingSet('st_cccccccc', 3)])] });
    assert.equal(patchMessage(doc, more), 'Set eklendi (+1 set)');
  });
});
