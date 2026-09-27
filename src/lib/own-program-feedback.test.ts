import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planOwnFeedback } from './own-program-feedback.ts';
import type { FeedbackDecision, FinishFeedback, SessionDoc } from './schemas/session.ts';
import { at, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';
import { OWN_DAY_A, OWN_ID, OWN_ROW_GOBLET, OWN_ROW_PUSH, ownProgram } from './testing/own-fixtures.ts';

const NOW = new Date(at(90));
const three = (min: number, max: number) => [{ min, max }, { min, max }, { min, max }];

/** Evde · Gün A'nın bitmiş antrenmanı: Goblet (4 set yapıldı) ve Şınav; `extra` hareket kayıtları. */
function doc(revision = 1, extra: SessionDoc['entries'] = []): SessionDoc {
  return sessionDoc({
    status: 'finished',
    finishedAt: at(60),
    program: { revision, phaseId: 'p_ownaaa', dayId: OWN_DAY_A, dayName: 'Gün A', programId: OWN_ID, programName: 'Evde' },
    entries: [
      sessionEntry('e_goblet', {
        rowId: OWN_ROW_GOBLET,
        exerciseId: 'goblet-squat',
        title: 'Goblet Squat',
        status: 'done',
        sets: [1, 2, 3, 4].map((n) => workingSet(`st_gob0000${n}`, n, { setIndex: n - 1, kg: 12, reps: 10 })),
      }),
      sessionEntry('e_pushup', { rowId: OWN_ROW_PUSH, exerciseId: 'push-up', title: 'Şınav', status: 'skipped', skip: { moved: false } }),
      ...extra,
    ],
  });
}

const base = { entryId: 'e_goblet', rowId: OWN_ROW_GOBLET, dayId: OWN_DAY_A, exerciseId: 'goblet-squat', title: 'Goblet Squat', trackingType: 'weight_reps' as const, apply: true };
const gobletRow = { exerciseId: 'goblet-squat', sets: three(8, 12) };
const setsDecision: FeedbackDecision = { ...base, kind: 'sets', count: { from: 3, to: 4 }, row: gobletRow };
const feedback = (...items: FeedbackDecision[]): FinishFeedback => ({ answer: 'yes', items });

describe('bitiş: kendi program kipi', () => {
  test('set sayısı doğrudan satıra; revision +1, geçmişe client kaydı (seansla), bildirim', () => {
    const plan = planOwnFeedback({ doc: doc(), feedback: feedback(setsDecision), program: ownProgram(), now: NOW });
    const row = plan.program?.phases[0]?.days[0]?.blocks[0]?.rows[0];
    assert.equal(row?.sets.length, 4);
    assert.equal(plan.program?.revision, 2);
    assert.equal(plan.program?.updatedAt, at(60));
    assert.deepEqual(plan.program?.log[0], { at: at(60), revision: 2, kind: 'client', sessionId: 's_k2m9x4qa', changes: [{ scope: 'Gün A', text: 'Goblet Squat 3 → 4 set' }] });
    assert.deepEqual(plan.outcome, { direct: 1, proposals: 0, converted: 0, stale: 0 });
    assert.deepEqual(plan.notices, ['program_update']);
  });

  test('hedef (piramitte de), çıkarma, değiştirme, ekleme doğrudan', () => {
    const push = { entryId: 'e_pushup', rowId: OWN_ROW_PUSH, dayId: OWN_DAY_A, exerciseId: 'push-up', title: 'Şınav', trackingType: 'bodyweight_reps' as const, apply: true, row: { exerciseId: 'push-up', sets: three(10, 14) } };
    const swapEntry = sessionEntry('e_swapdb', { swappedFrom: OWN_ROW_GOBLET, exerciseId: 'dumbbell-press', title: 'Dumbbell Press', status: 'done', sets: [workingSet('st_swp00001', 20)] });
    const addEntry = sessionEntry('e_addplk', { added: true, exerciseId: 'plank', title: 'Plank', status: 'done', sets: [workingSet('st_add00001', 30, { reps: undefined, seconds: 40, kg: undefined })] });
    const items: FeedbackDecision[] = [
      { ...base, kind: 'target', target: { from: three(8, 12), to: three(10, 14) }, row: gobletRow },
      { ...push, kind: 'remove' },
      { ...base, entryId: 'e_swapdb', kind: 'swap', swap: { exerciseId: 'dumbbell-press', title: 'Dumbbell Press' }, row: gobletRow },
      { kind: 'add', apply: true, entryId: 'e_addplk', dayId: OWN_DAY_A, exerciseId: 'plank', title: 'Plank', trackingType: 'duration', add: { sets: [{ min: 30, max: 45 }], restSeconds: 60 } },
    ];
    const plan = planOwnFeedback({ doc: doc(1, [swapEntry, addEntry]), feedback: feedback(...items), program: ownProgram(), now: NOW });
    const blocks = plan.program?.phases[0]?.days[0]?.blocks ?? [];
    assert.deepEqual(
      blocks.map((block) => block.rows.map((row) => [row.exerciseId, row.sets.length, row.sets[0]?.min])),
      [[['dumbbell-press', 3, 10]], [['plank', 1, 30]]],
    );
    assert.deepEqual(plan.changes.map((change) => change.text), ['Goblet Squat 3×8–12 → 3×10–14', 'Şınav çıkarıldı', 'Goblet Squat yerine Dumbbell Press', 'Plank eklendi']);
    assert.equal(plan.outcome.direct, 4);
  });

  test('yalnız kilo: geçmişe kayıt, satırlar ve revision aynı', () => {
    const weight: FeedbackDecision = { ...base, kind: 'weight_up', kg: { from: 10, to: 12 } };
    const plan = planOwnFeedback({ doc: doc(), feedback: feedback(weight), program: ownProgram(), now: NOW });
    assert.equal(plan.rowsChanged, false);
    assert.equal(plan.program?.revision, 1);
    assert.equal(plan.program?.log[0]?.changes[0]?.text, 'Goblet Squat: çalışma ağırlığı 10 → 12 kg');
  });

  test('o arada PT\'nin kaydettiği satır bitişte ezilmez: stale; öteki maddeler yazılır', () => {
    // Antrenman revision 1'le başladı; PT o arada Goblet'i 5 set yaptı (revision 2).
    const program = ownProgram({ revision: 2 });
    program.phases[0]!.days[0]!.blocks[0]!.rows[0]!.sets = [...three(8, 12), { min: 8, max: 12 }, { min: 8, max: 12 }];
    const weight: FeedbackDecision = { ...base, kind: 'weight_up', kg: { from: 10, to: 12 } };
    const plan = planOwnFeedback({ doc: doc(1), feedback: feedback(setsDecision, weight), program, now: NOW });
    assert.equal(plan.program?.phases[0]?.days[0]?.blocks[0]?.rows[0]?.sets.length, 5, 'PT\'nin 5 seti kalır');
    assert.equal(plan.outcome.stale, 1);
    assert.equal(plan.outcome.direct, 1);
    assert.equal(plan.program?.revision, 2, 'yalnız kilo yazıldı');
  });

  test('o arada silinen satır geri gelmez; satırı aynı kalan madde revision farklı olsa da yazılır', () => {
    const program = ownProgram({ revision: 3 });
    program.phases[0]!.days[0]!.blocks.splice(0, 1);
    const removed = planOwnFeedback({ doc: doc(1), feedback: feedback(setsDecision), program, now: NOW });
    assert.equal(removed.program, null);
    assert.equal(removed.outcome.stale, 1);

    const untouched = ownProgram({ revision: 3 });
    const plan = planOwnFeedback({ doc: doc(1), feedback: feedback(setsDecision), program: untouched, now: NOW });
    assert.equal(plan.program?.phases[0]?.days[0]?.blocks[0]?.rows[0]?.sets.length, 4);
    assert.equal(plan.program?.revision, 4);
  });

  test('aynı seansın kaydı varsa (yeniden deneme) program yeniden yazılmaz; uygulanmayan madde yok sayılır', () => {
    const program = ownProgram({ log: [{ at: at(60), revision: 2, kind: 'client', sessionId: 's_k2m9x4qa', changes: [{ text: 'x' }] }] });
    assert.equal(planOwnFeedback({ doc: doc(), feedback: feedback(setsDecision), program, now: NOW }).program, null);
    assert.equal(planOwnFeedback({ doc: doc(), feedback: feedback({ ...setsDecision, apply: false }), program: ownProgram(), now: NOW }).program, null);
  });
});
