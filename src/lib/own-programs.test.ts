import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {
  applyOwnEdit,
  applyOwnSchedule,
  copyPtDays,
  createOwnProgram,
  defaultOwnName,
  isOwnProgramId,
  newOwnProgramId,
  ownNameProblem,
  ownProgramIdOfPath,
  ownProgramPath,
  ownStartBody,
  ownSummaryOf,
  programIds,
  reIdCollisions,
  sameOwnBody,
  setOwnShared,
  type OwnProgramPhase,
} from './own-programs.ts';
import type { DiffContext } from './program-diff.ts';
import { programIdSource } from './program-plan.ts';
import { ownProgramSchema } from './schemas/own-program.ts';
import { DAY_A, DAY_B, programFile } from './testing/session-fixtures.ts';
import { OWN_DAY_A, OWN_ID, OWN_ROW_GOBLET, ownProgram } from './testing/own-fixtures.ts';
import { parsedProgram } from './testing/workout-fixtures.ts';

const NOW = new Date('2026-09-27T10:00:00.000Z');
const ctx: DiffContext = {
  exercises: new Map([
    ['goblet-squat', { title: 'Goblet Squat', trackingType: 'weight_reps' as const }],
    ['push-up', { title: 'Şınav', trackingType: 'bodyweight_reps' as const }],
    ['plank', { title: 'Plank', trackingType: 'duration' as const }],
    ['bench-press', { title: 'Bench Press', trackingType: 'weight_reps' as const }],
  ]),
  devices: new Map(),
};

/** Sıralı sahte rastgelelik: kimlikler tekrarlanabilir. */
function counter() {
  let n = 0;
  return (size: number) => Uint8Array.from({ length: size }, () => (n++ * 7) % 252);
}

describe('kimlik, yol, ad', () => {
  test('kimlik op_ + 8; yol yalnız kalıba uyan kimlikten', () => {
    assert.equal(isOwnProgramId('op_k2m9x4qa'), true);
    assert.equal(isOwnProgramId('op_K2M9X4QA'), false);
    assert.equal(isOwnProgramId('../program'), false);
    assert.equal(ownProgramPath('op_k2m9x4qa'), 'own-programs/op_k2m9x4qa.json');
    assert.throws(() => ownProgramPath('op_../../x'));
    assert.equal(ownProgramIdOfPath('own-programs/op_k2m9x4qa.json'), 'op_k2m9x4qa');
    assert.equal(ownProgramIdOfPath('own-programs/../program.json'), null);
    assert.match(newOwnProgramId(new Set()), /^op_[a-z0-9]{8}$/);
  });

  test('ad: boş, uzun, ayrılmış ve (Türkçe büyük-küçük harf farkı gözetmeden) tekrar eden reddedilir', () => {
    assert.equal(ownNameProblem('  ', []), 'Ad gir.');
    assert.equal(ownNameProblem('x'.repeat(41), []), 'En fazla 40 karakter.');
    assert.match(ownNameProblem('antrenörünün PROGRAMI', []) ?? '', /ad olarak kullanılamaz/);
    assert.equal(ownNameProblem('İSTANBUL', ['istanbul']), 'Bu adda bir programın var.');
    assert.equal(ownNameProblem('Evde', ['Tatil']), null);
    assert.equal(defaultOwnName([]), 'Programım');
    assert.equal(defaultOwnName(['Programım']), 'Programım 2');
  });
});

describe('oluşturma', () => {
  test('PT günlerinden kopya: danışanın hedefleriyle, yeni kimliklerle, copiedFrom; program sırasıyla', () => {
    const target = { sets: [{ min: 10, max: 14 }, { min: 10, max: 14 }, { min: 10, max: 14 }], baseSets: [{ min: 8, max: 10 }, { min: 8, max: 10 }, { min: 8, max: 10 }], at: NOW.toISOString() };
    const program = parsedProgram(programFile({}, { clientTargets: { r_aaaaaa: target } }));
    const days = copyPtDays(program, [DAY_B, DAY_A], [], programIdSource(program.phases), NOW);
    assert.deepEqual(days.map((day) => [day.name, day.copiedFrom?.dayId]), [['Gün A', DAY_A], ['Gün B', DAY_B]]);
    const bench = days[0]?.blocks[0]?.rows[0];
    assert.deepEqual(bench?.sets, target.sets, 'danışanın geçerli hedefi');
    assert.notEqual(bench?.id, 'r_aaaaaa');
    const ids = programIds([{ id: 'p_x', days }] as OwnProgramPhase[]);
    assert.equal(ids.has('r_aaaaaa') || ids.has(DAY_A) || ids.has('b_aaaaaa'), false, 'kimlikler yeni');
  });

  test('kopya hedef programda var olan adı "… 2" yapar; 7 günü aşmaz', () => {
    const program = parsedProgram();
    const existing = Array.from({ length: 6 }, (_, i) => ({ name: i === 0 ? 'Gün A' : `Gün ${i + 1}` }));
    const days = copyPtDays(program, [DAY_A, DAY_B], existing, programIdSource(program.phases), NOW);
    assert.deepEqual(days.map((day) => day.name), ['Gün A 2']);
  });

  test('başlangıç: boş, PT günleri (hiçbiri seçilmediyse boş gün), şablon', () => {
    const ids = programIdSource([], counter());
    const blank = ownStartBody({ kind: 'blank' }, ids, NOW);
    assert.equal(blank.phases[0]?.days[0]?.name, 'Gün A');
    assert.equal(blank.phases[0]?.id, blank.currentPhaseId);
    const none = ownStartBody({ kind: 'pt', program: parsedProgram(), dayIds: [] }, ids, NOW);
    assert.equal(none.phases[0]?.days[0]?.blocks.length, 0);
    const template = ownStartBody(
      { kind: 'template', template: { id: 't_abcdefgh', name: 'Tüm vücut', blocks: ownProgram().phases[0]?.days[0]?.blocks ?? [] } },
      ids,
      NOW,
    );
    assert.equal(template.phases[0]?.days[0]?.source?.templateName, 'Tüm vücut');
  });

  test('kimlik çakışması: başka programdakiler yeniden üretilir, kayıttakilere dokunulmaz', () => {
    const phases = ownProgram().phases;
    const body = { currentPhaseId: phases[0]?.id ?? '', phases };
    const taken = new Set([OWN_DAY_A, OWN_ROW_GOBLET]);
    const fresh = reIdCollisions(body, taken, new Set(), counter());
    const day = fresh.phases[0]?.days[0];
    assert.notEqual(day?.id, OWN_DAY_A);
    assert.notEqual(day?.blocks[0]?.rows[0]?.id, OWN_ROW_GOBLET);
    assert.equal(fresh.currentPhaseId, body.currentPhaseId);
    const kept = reIdCollisions(body, taken, new Set([OWN_DAY_A, OWN_ROW_GOBLET]));
    assert.equal(kept, body, 'kayıttaki kimlikler kalır');
    assert.equal(reIdCollisions(body, new Set()), body);
  });

  test('yeni kayıt: gün seçilince sıklık düşer, günler an ile; şemadan geçer', () => {
    const phases = ownProgram().phases.map((phase) => ({ ...phase, daysPerWeek: 2 }));
    const created = createOwnProgram({ id: OWN_ID, name: ' Evde ', currentPhaseId: phases[0]?.id ?? '', phases, weekdays: [4, 2, 2], now: NOW });
    assert.equal(created.name, 'Evde');
    assert.equal(created.phases[0]?.daysPerWeek, undefined);
    assert.deepEqual(created.schedule, { weekdays: [2, 4], at: NOW.toISOString() });
    assert.equal(created.revision, 1);
    assert.equal(created.log[0]?.kind, 'create');
    assert.equal(v.safeParse(ownProgramSchema, created).success, true);
    const noDays = createOwnProgram({ id: OWN_ID, name: 'Evde', currentPhaseId: phases[0]?.id ?? '', phases, now: NOW });
    assert.equal(noDays.phases[0]?.daysPerWeek, 2);
    assert.equal(noDays.schedule, undefined);
  });

  test('aynı gövde: oluşturmanın yeniden denenmesi', () => {
    const program = ownProgram();
    assert.equal(sameOwnBody(program, { name: 'Evde', phases: program.phases }), true);
    assert.equal(sameOwnBody(program, { name: 'Ev', phases: program.phases }), false);
    assert.equal(sameOwnBody(program, { name: 'Evde', phases: program.phases, weekdays: [1] }), false);
  });

  test('şema: evreli ya da çok evreli program, 8 gün, kalıba uymayan kimlik reddedilir', () => {
    const program = ownProgram();
    assert.equal(v.safeParse(ownProgramSchema, program).success, true);
    assert.equal(v.safeParse(ownProgramSchema, { ...program, phased: true }).success, false);
    assert.equal(v.safeParse(ownProgramSchema, { ...program, phases: [...program.phases, { ...program.phases[0], id: 'p_second' }] }).success, false);
    assert.equal(v.safeParse(ownProgramSchema, { ...program, id: 'op_x' }).success, false);
    const eight = Array.from({ length: 8 }, (_, i) => ({ ...program.phases[0]!.days[0]!, id: `d_day00${i}`, name: `Gün ${i}` }));
    assert.equal(v.safeParse(ownProgramSchema, { ...program, phases: [{ ...program.phases[0], days: eight }] }).success, false);
    const extra = v.parse(ownProgramSchema, { ...program, clientTargets: { r_owngob: {} }, clientSchedule: { weekdays: [1], at: NOW.toISOString() } });
    assert.equal('clientTargets' in extra || 'clientSchedule' in extra, false, 'danışan katmanları atılır');
  });
});

describe('kayıt', () => {
  const body = (program = ownProgram()) => ({ name: program.name, currentPhaseId: program.current.phaseId, phases: program.phases });

  test('değişiklik yoksa null; hareket değişince revision +1, fark geçmişe, rotasyon sürer', () => {
    const stored = ownProgram({ rotation: { lastDayId: OWN_DAY_A, lastCompletedAt: NOW.toISOString() } });
    assert.equal(applyOwnEdit(stored, body(stored), ctx, NOW, 'client'), null);
    const phases = structuredClone(stored.phases);
    phases[0]!.days[0]!.blocks[0]!.rows[0]!.sets.push({ min: 8, max: 12 });
    const result = applyOwnEdit(stored, { ...body(stored), phases }, ctx, NOW, 'client');
    assert.equal(result?.program.revision, 2);
    assert.equal(result?.program.log[0]?.kind, 'edit');
    assert.equal(result?.program.log[0]?.by, undefined);
    assert.match(result?.changes.map((change) => change.text).join(' · ') ?? '', /Goblet Squat/);
    assert.equal(result?.program.rotation.lastDayId, OWN_DAY_A);
    assert.equal(result?.program.id, OWN_ID);
  });

  test('PT kaydı: by pt; ad gövdeden değişmez', () => {
    const stored = ownProgram({ shared: { at: NOW.toISOString() } });
    const phases = structuredClone(stored.phases);
    phases[0]!.days[0]!.name = 'Bacak';
    const result = applyOwnEdit(stored, { ...body(stored), name: 'Başka ad', phases }, ctx, NOW, 'pt');
    assert.equal(result?.program.log[0]?.by, 'pt');
    assert.equal(result?.program.name, 'Evde');
    assert.deepEqual(result?.program.shared, stored.shared);
  });

  test('danışan adı değiştirir: yalnız ad değişse de revision +1 ve kayıt', () => {
    const stored = ownProgram();
    const result = applyOwnEdit(stored, { ...body(stored), name: 'Ev' }, ctx, NOW, 'client');
    assert.equal(result?.program.name, 'Ev');
    assert.equal(result?.program.revision, 2);
    assert.deepEqual(result?.changes, [{ text: "Ad: 'Evde' → 'Ev'" }]);
  });

  test('günler: açılıştakiyle aynıysa kayıttakine dokunulmaz (arada Bugün\'den değişen kalır); değiştiyse yazılır', () => {
    const stored = ownProgram({ schedule: { weekdays: [2, 4], at: NOW.toISOString() } });
    const phases = structuredClone(stored.phases);
    phases[0]!.days[1]!.name = 'Karın';
    const kept = applyOwnEdit(stored, { ...body(stored), phases, weekdays: [1, 3], baseWeekdays: [1, 3] }, ctx, NOW, 'client');
    assert.deepEqual(kept?.program.schedule?.weekdays, [2, 4]);
    const changed = applyOwnEdit(stored, { ...body(stored), weekdays: [6], baseWeekdays: [2, 4] }, ctx, NOW, 'client');
    assert.deepEqual(changed?.program.schedule?.weekdays, [6]);
  });

  test('copiedFrom kayıttaki günden; gövde silse de kalır', () => {
    const copied = { dayId: DAY_A, dayName: 'Gün A', at: NOW.toISOString() };
    const stored = ownProgram();
    stored.phases[0]!.days[0]!.copiedFrom = copied;
    const phases = structuredClone(stored.phases);
    delete phases[0]!.days[0]!.copiedFrom;
    phases[0]!.days[1]!.name = 'Karın';
    const result = applyOwnEdit(stored, { ...body(stored), phases }, ctx, NOW, 'client');
    assert.deepEqual(result?.program.phases[0]?.days[0]?.copiedFrom, copied);
  });
});

describe('paylaşım ve günler', () => {
  test('paylaşma ve kapatma revision artırmaz, geçmişe share; zaten öyleyse null', () => {
    const shared = setOwnShared(ownProgram(), true, NOW);
    assert.deepEqual(shared?.shared, { at: NOW.toISOString() });
    assert.equal(shared?.revision, 1);
    assert.equal(shared?.log[0]?.kind, 'share');
    assert.equal(setOwnShared(shared!, true, NOW), null);
    const closed = setOwnShared(shared!, false, NOW);
    assert.equal(closed?.shared, undefined);
    assert.equal(closed?.log[0]?.changes[0]?.text, 'Paylaşım kapatıldı');
  });

  test('Günlerini değiştir: doğrudan, revision artmaz, client kaydı sessionId\'siz; aynıysa null', () => {
    const program = ownProgram({ schedule: { weekdays: [2, 4], at: '2026-09-21T00:00:00.000Z' } });
    const result = applyOwnSchedule(program, [5, 1], NOW);
    assert.deepEqual(result?.program.schedule, { weekdays: [1, 5], at: NOW.toISOString() });
    assert.equal(result?.program.revision, 1);
    assert.equal(result?.program.log[0]?.kind, 'client');
    assert.equal(result?.program.log[0]?.sessionId, undefined);
    assert.equal(result?.text, 'Antrenman günleri: Sal, Per → Pzt, Cum');
    assert.equal(applyOwnSchedule(program, [4, 2], NOW), null);
    assert.equal(applyOwnSchedule(program, [], NOW), null);
  });

  test('özet: gün sayısı, günler; sıklık yalnız gün seçilmemişse', () => {
    const program = ownProgram();
    program.phases[0]!.daysPerWeek = 3;
    assert.deepEqual(ownSummaryOf(program), { days: 2, weekdays: [], daysPerWeek: 3 });
    assert.deepEqual(ownSummaryOf({ ...program, schedule: { weekdays: [2] } }), { days: 2, weekdays: [2] });
  });
});
