import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planSession, type LoadSpec } from './progression.ts';
import { exerciseHistory, toSetResults } from './session-results.ts';
import { at, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const barbell: LoadSpec = { trackingType: 'weight_reps', loadStepKg: 2.5, minLoadKg: 20 };
const target = { min: 8, max: 10 };

describe('toSetResults', () => {
  test('çalışma setleri motorun biçimine; satır ve cihaz her sete; zorluk yoksa bilinmeyen', () => {
    const entry = sessionEntry('e_aaaaaa', {
      rowId: 'r_aaaaaa',
      deviceId: 'olympic-bar',
      sets: [
        { id: 'st_warmup01', type: 'warmup', kg: 20, reps: 10, at: at(1) },
        workingSet('st_aaaaaaaa', 2, { setIndex: 0, target, topWeightKg: 60, plannedSetCount: 3, effort: 'hard' }),
        workingSet('st_bbbbbbbb', 4, { setIndex: 1, target, reps: 9 }),
        workingSet('st_extra001', 6, { setIndex: 3, extra: true }),
      ],
    });
    assert.deepEqual(toSetResults(entry), [
      { weightKg: 60, value: 10, effort: 'hard', setIndex: 0, target, topWeightKg: 60, rowId: 'r_aaaaaa', plannedSetCount: 3, deviceId: 'olympic-bar' },
      { weightKg: 60, value: 9, effort: 'unknown', setIndex: 1, target, rowId: 'r_aaaaaa', deviceId: 'olympic-bar' },
    ]);
  });

  test('süreli set saniyesiyle; vücut ağırlığında yük 0', () => {
    const entry = sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 2, { kg: undefined, reps: undefined, seconds: 45 })] });
    assert.deepEqual(toSetResults(entry), [{ weightKg: 0, value: 45, effort: 'unknown' }]);
  });

  test('"bir defalık" hareket karara hiç girmez', () => {
    assert.deepEqual(toSetResults(sessionEntry('e_aaaaaa', { oneOff: true, sets: [workingSet('st_aaaaaaaa', 2)] })), []);
  });

  test('yoklamayla yalnız o gün hafifletilen hareket (`lighten`, §2.2) karara girmez; ağrının azaltması (`decrease`) girer', () => {
    const entry = (reason: string) => sessionEntry('e_aaaaaa', { plan: { topWeightKg: 50, reason }, sets: [workingSet('st_aaaaaaaa', 2, { kg: 50 })] });
    assert.deepEqual(toSetResults(entry('lighten')), []);
    assert.equal(toSetResults(entry('decrease')).length, 1);
    assert.equal(toSetResults(entry('hold')).length, 1);
  });

  test('hafif hareket motorda kalır ve işaretlenir (§5.5)', () => {
    const [set] = toSetResults(sessionEntry('e_aaaaaa', { lighter: true, sets: [workingSet('st_aaaaaaaa', 2, { topWeightKg: 65 })] }));
    assert.deepEqual(set, { weightKg: 60, value: 10, effort: 'unknown', topWeightKg: 65, lighter: true });
  });

  test('Tanışma\'da ya da ayar seansında planlanan: kaçırması tıkanma sayılmaz (`noStall`)', () => {
    const results = (plan: { reason?: string; stage?: string }) => toSetResults(sessionEntry('e_aaaaaa', { plan, sets: [workingSet('st_aaaaaaaa', 2)] }))[0]?.noStall;
    assert.equal(results({ reason: 'first_time', stage: 'intro' }), true);
    assert.equal(results({ reason: 'calibrate', stage: 'novice' }), true);
    assert.equal(results({ reason: 'increase', stage: 'novice' }), undefined);
    assert.equal(results({ reason: 'hold' }), undefined);
  });
});

describe('hareket geçmişi → planSession', () => {
  const finished = (id: string, minute: number, reps: number[], extra: Partial<Parameters<typeof sessionEntry>[1]> = {}) =>
    sessionDoc({
      id,
      status: 'finished',
      startedAt: at(minute),
      finishedAt: at(minute + 50),
      entries: [
        sessionEntry('e_aaaaaa', {
          rowId: 'r_aaaaaa',
          deviceId: 'olympic-bar',
          ...extra,
          sets: reps.map((value, index) =>
            workingSet(`st_${id.slice(2, 9)}${index}`, minute + index, { setIndex: index, reps: value, target, plannedSetCount: 3, effort: 'good' }),
          ),
        }),
      ],
    });

  test('bitmişler eskiden yeniye; etkin antrenman ve başka cihaz girmez', () => {
    const history = exerciseHistory(
      [finished('s_bbbbbbbb', 3000, [10, 10, 10]), finished('s_aaaaaaaa', 0, [9, 9, 8]), sessionDoc({ id: 's_cccccccc', startedAt: at(6000) })],
      { exerciseId: 'bench-press', deviceId: 'olympic-bar' },
    );
    assert.deepEqual(history.map((session) => session.map((set) => set.value)), [[9, 9, 8], [10, 10, 10]]);
    assert.deepEqual(exerciseHistory([finished('s_aaaaaaaa', 0, [9, 9, 8])], { exerciseId: 'bench-press', deviceId: 'smith' }), []);
  });

  test('bütün setler tepede → planSession artış verir; bir set altında → aynı ağırlık', () => {
    const sets = [target, target, target];
    const up = planSession({
      spec: barbell,
      rule: { scheme: 'double', targetRir: 2 },
      sets,
      rowId: 'r_aaaaaa',
      history: exerciseHistory([finished('s_aaaaaaaa', 0, [10, 10, 10])], { exerciseId: 'bench-press' }),
    });
    assert.deepEqual([up.reason, up.topWeightKg], ['increase', 62.5]);
    const hold = planSession({
      spec: barbell,
      rule: { scheme: 'double', targetRir: 2 },
      sets,
      rowId: 'r_aaaaaa',
      history: exerciseHistory([finished('s_aaaaaaaa', 0, [10, 10, 7])], { exerciseId: 'bench-press' }),
    });
    assert.deepEqual([hold.reason, hold.topWeightKg], ['hold', 60]);
  });

  test('hafifletilmiş gün yokmuş gibi: sonraki plan bir önceki normal antrenmandan, tıkanma serisi değişmez', () => {
    const sets = [target, target, target];
    const plan = (docs: ReturnType<typeof finished>[]) =>
      planSession({ spec: barbell, rule: { scheme: 'double', targetRir: 2 }, sets, rowId: 'r_aaaaaa', history: exerciseHistory(docs, { exerciseId: 'bench-press' }) });
    const normal = finished('s_aaaaaaaa', 0, [10, 10, 10]);
    // Hafif günde 50 kg ile 2 set, hepsi tepede: artış 50'den değil, 60'tan.
    const light = finished('s_bbbbbbbb', 3000, [10, 10], { plan: { topWeightKg: 50, reason: 'lighten' } });
    const lightSets = light.entries[0]?.sets.map((set) => ({ ...set, kg: 50, plannedSetCount: 2 })) ?? [];
    const lightDoc = { ...light, entries: [{ ...(light.entries[0] as (typeof light.entries)[number]), sets: lightSets }] };
    assert.deepEqual(plan([normal, lightDoc]), plan([normal]));
    assert.deepEqual([plan([normal, lightDoc]).reason, plan([normal, lightDoc]).topWeightKg], ['increase', 62.5]);
  });

  test('yarım bırakılan (2/3 set) antrenman artış getirmez', () => {
    const plan = planSession({
      spec: barbell,
      rule: { scheme: 'double', targetRir: 2 },
      sets: [target, target, target],
      rowId: 'r_aaaaaa',
      history: exerciseHistory([finished('s_aaaaaaaa', 0, [10, 10])], { exerciseId: 'bench-press' }),
    });
    assert.equal(plan.reason, 'incomplete');
  });
});

test('unanswered effort stays unknown and cannot trigger a load increase',()=>{
 const history=[toSetResults(sessionEntry('e_aaaaaa',{sets:[workingSet('st_aaaaaaaa',1,{reps:10}),workingSet('st_bbbbbbbb',2,{reps:10}),workingSet('st_cccccccc',3,{reps:10})]}))];
 const plan=planSession({spec:barbell,rule:{scheme:'linear',targetRir:2},sets:[target,target,target],history});
 assert.equal(plan.reason,'hold');assert.equal(plan.topWeightKg,60);
});
