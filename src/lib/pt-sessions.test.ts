import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { painSkippedRows, ptChangeLines, ptSessionDetail } from './pt-sessions.ts';
import { at, SESSION_ID, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const TZ = 'Europe/Istanbul';

describe('PT: antrenman detayı', () => {
  const doc = sessionDoc({
    status: 'finished',
    finishedAt: at(52),
    program: { revision: 3, dayId: 'd_aaaaaa', dayName: 'Gün A', plannedDayId: 'd_bbbbbb', plannedDayName: 'Gün B' },
    adjust: 'lighter',
    effort: { sessionRpe: 7, updatedAt: at(60) },
    notices: [{ kind: 'unfinished', at: at(52), done: 4, planned: 6 }],
    entries: [
      sessionEntry('e_aaaaaa', {
        rowId: 'r_aaaaaa',
        status: 'done',
        plan: { topWeightKg: 62.5, reason: 'increase', stage: 'novice' },
        sets: [workingSet('st_aaaaaaa1', 3, { kg: 62.5, effort: 'good' }), workingSet('st_aaaaaaa2', 6, { kg: 85, overload: true, plannedKg: 62.5 })],
      }),
      sessionEntry('e_bbbbbb', {
        rowId: 'r_cccccc',
        swappedFrom: 'r_bbbbbb',
        exerciseId: 'hack-squat',
        title: 'Hack Squat',
        status: 'done',
        sets: [workingSet('st_bbbbbbb1', 10, { kg: 80, reps: 8 })],
      }),
      sessionEntry('e_cccccc', { exerciseId: 'plank', title: 'Plank', added: true, status: 'done', sets: [workingSet('st_ccccccc1', 12, { kg: undefined, reps: undefined, seconds: 45 })] }),
      sessionEntry('e_dddddd', { rowId: 'r_dddddd', exerciseId: 'lunge', title: 'Lunge', status: 'skipped', skip: { reason: 'other', moved: false } }),
    ],
  });

  test('antrenmanın işaretleri: başka gün, yarım, hafifletilmiş, zorluk', () => {
    const detail = ptSessionDetail(doc, { timeZone: TZ });
    assert.deepEqual(detail.flags, ['Gün B yerine seçildi', 'yarım bırakıldı (4/6 set)', 'hafifletilmiş gün', 'Zorluk 7/10']);
    assert.equal(detail.title, 'Gün A · 26 Eylül 2026');
  });

  test('hareketler: plan, muadil (programdaki hareketin adıyla), eklenen, ağrı yalnız verilince; aşırı yük seti', () => {
    const detail = ptSessionDetail(doc, {
      timeZone: TZ,
      rowTitle: (rowId) => (rowId === 'r_bbbbbb' ? 'Leg Press' : null),
      painRows: new Set(['r_dddddd']),
    });
    assert.deepEqual(
      detail.exercises.map((exercise) => [exercise.title, exercise.notes]),
      [
        ['Bench Press', ['plan: 62,5 kg · Başlangıç']],
        ['Hack Squat', ['Leg Press yerine']],
        ['Plank', ['plan dışı eklendi']],
        ['Lunge', ['ağrı nedeniyle geçildi']],
      ],
    );
    assert.deepEqual(
      detail.exercises[0]?.sets.map((set) => [set.text, set.overload]),
      [
        ['62,5 kg × 10', false],
        ['85 kg × 10', true],
      ],
    );
    // Onay yoksa ağrı yazılmaz; programda bulunamayan satır genel metinle.
    const plain = ptSessionDetail(doc, { timeZone: TZ });
    assert.deepEqual(plain.exercises[1]?.notes, ['muadille değiştirildi']);
    assert.deepEqual(plain.exercises[3]?.notes, []);
  });

  test('ağrı ayrıntısı yalnız bu antrenmanın kaydından', () => {
    const rows = painSkippedRows(
      [
        { sessionId: SESSION_ID, skippedRows: [{ rowId: 'r_dddddd', reason: 'pain' }] },
        { sessionId: 's_zzzzzzzz', skippedRows: [{ rowId: 'r_eeeeee', reason: 'pain' }] },
        {},
      ],
      SESSION_ID,
    );
    assert.deepEqual([...rows], ['r_dddddd']);
  });

  test('program değişiklikleri PT\'nin diliyle', () => {
    assert.deepEqual(
      ptChangeLines([
        { text: 'Bench Press: çalışma ağırlığı 60 → 62,5 kg', state: 'applied' },
        { text: 'Leg Press 3 → 4 set', state: 'declined', note: 'Şimdilik değil' },
      ]),
      [
        { text: 'Bench Press: çalışma ağırlığı 60 → 62,5 kg', label: 'programa yazıldı' },
        { text: 'Leg Press 3 → 4 set', label: 'reddedildi', note: 'Şimdilik değil' },
      ],
    );
  });
});
