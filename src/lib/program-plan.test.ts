import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {
  addDay,
  addPhase,
  appendLog,
  blankDay,
  blankPhase,
  blankProgramBody,
  canAddDay,
  canAddPhase,
  canMoveDay,
  completeDay,
  copyPhase,
  createProgramFromTemplate,
  createProgramRecord,
  cycleFactor,
  dayFromTemplate,
  dayToTemplate,
  derivePhased,
  duplicateNames,
  duplicateProgramIds,
  frequencyLabel,
  mergePhases,
  mergePhasesCheck,
  missingExerciseDays,
  moveDay,
  moveDayToPhase,
  movePhase,
  nextDayId,
  nextDayName,
  nextPhaseName,
  normalizeProgram,
  phaseMuscleLoad,
  phaseStatus,
  phaseStatusLabel,
  prepareProgramForEditing,
  programIdSource,
  reconcileRotation,
  reIdBlocks,
  removeDay,
  removePhase,
  startPhase,
  upgradeProgram,
  weekProgress,
  WEEK_MS,
  type ProgramDay,
  type ProgramIdSource,
  type ProgramLogEntry,
  type ProgramPhase,
  type ProgramState,
  type TemplateOption,
} from './program-plan.ts';
import { programSchema } from './schemas/program.ts';
import { templateSaveSchema } from './schemas/template.ts';
import { uniformSets } from './set-plan.ts';
import type { PlanExercise, TemplateBlock, TemplateRow } from './template-plan.ts';

const ids = (): ProgramIdSource => {
  let n = 0;
  return (p) => `${p}_${String(++n).padStart(6, '0')}`;
};

const simdi = new Date('2026-09-24T09:00:00.000Z');

function single(id: string, rowId: string, exerciseId: string, row: Partial<TemplateRow> = {}, block: Partial<TemplateBlock> = {}): TemplateBlock {
  return {
    id,
    kind: 'single',
    restSeconds: 120,
    rows: [{ id: rowId, exerciseId, sets: uniformSets({ min: 8, max: 12 }, 3), ...row }],
    ...block,
  };
}

function gun(id: string, name: string, fields: Partial<ProgramDay> = {}): ProgramDay {
  const tail = id.slice(2);
  return { id, name, blocks: [single(`b_${tail}`, `r_${tail}`, 'goblet-squat')], ...fields };
}

const sablon: TemplateOption = {
  id: 't_k2m9x4qa',
  name: 'Alt vücut A',
  blocks: [
    single('b_aaaaa1', 'r_aaaaa1', 'goblet-squat', { note: 'Dizleri içe kaçırma' }),
    {
      id: 'b_aaaaa2',
      kind: 'superset',
      restSeconds: 90,
      rows: [
        { id: 'r_aaaaa2', exerciseId: 'leg-press', sets: uniformSets({ min: 10, max: 15 }, 3), rule: { scheme: 'linear', targetRir: 1 } },
        { id: 'r_aaaaa3', exerciseId: 'leg-curl', sets: [{ min: 10, max: 15 }, { min: 10, max: 15, amrap: true }] },
      ],
    },
  ],
};

const A = gun('d_aaaaaa', 'Gün A');
const B = gun('d_bbbbbb', 'Gün B');
const C = gun('d_cccccc', 'Gün C');
const uyum: ProgramPhase = { id: 'p_uyum01', name: 'Uyum', weeks: 2, days: [A, B, C] };
const guc: ProgramPhase = { id: 'p_guc001', name: 'Güç', weeks: 6, days: [gun('d_dddddd', 'Gün A')] };
const kayit: ProgramLogEntry = { at: '2026-09-01T00:00:00.000Z', revision: 3, kind: 'edit', changes: [{ text: 'Önceki değişiklik' }] };

function program(fields: Partial<ProgramState> = {}): ProgramState {
  return {
    version: 2,
    phased: true,
    revision: 3,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    phases: [uyum, guc],
    current: { phaseId: 'p_uyum01', startedAt: '2026-09-01T00:00:00.000Z' },
    rotation: {},
    log: [kayit],
    ...fields,
  };
}

function allIds(phases: readonly ProgramPhase[]): string[] {
  return phases.flatMap((phase) => [
    phase.id,
    ...phase.days.flatMap((day) => [day.id, ...day.blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)])]),
  ]);
}

describe('kimlikler ve adlar', () => {
  test('kimlik üretici programdaki evre, gün, blok ve satır kimliklerini bilir; hiçbirini tekrar etmez', () => {
    const phases: ProgramPhase[] = [
      { id: 'p_aaaaaa', name: 'Evre 1', days: [{ id: 'd_aaaaaa', name: 'Gün A', blocks: [single('b_aaaaaa', 'r_aaaaaa', 'squat')] }] },
    ];
    // Önce alınmış kimliği (aaaaaa) verir; üretilenleri de hatırlamalı.
    const sira = [0, 1, 1, 2, 0, 3, 0, 4];
    let i = 0;
    const random = (n: number) => new Uint8Array(n).fill(sira[i++] ?? 5);
    const next = programIdSource(phases, random);
    assert.equal(next('p'), 'p_bbbbbb');
    assert.equal(next('p'), 'p_cccccc');
    assert.equal(next('r'), 'r_dddddd');
    assert.equal(next('d'), 'd_eeeeee');
  });

  test('sıradaki gün adı: kullanılmayan ilk harf; özel adlar sayılmaz', () => {
    assert.equal(nextDayName([]), 'Gün A');
    assert.equal(nextDayName([{ name: 'Gün A' }, { name: 'Gün B' }]), 'Gün C');
    assert.equal(nextDayName([{ name: 'Gün A' }, { name: 'Gün C' }]), 'Gün B');
    assert.equal(nextDayName([{ name: 'Bacak' }]), 'Gün A');
  });

  test('sıradaki evre adı', () => {
    assert.equal(nextPhaseName([{ name: 'Evre 1' }]), 'Evre 2');
    assert.equal(nextPhaseName([{ name: 'Uyum' }, { name: 'Güç' }]), 'Evre 3');
    assert.equal(nextPhaseName([{ name: 'Uyum' }, { name: 'Evre 3' }]), 'Evre 4');
  });

  test('kopyada setler kaynaktan bağımsız', () => {
    const copy = reIdBlocks(sablon.blocks, ids());
    copy[1]?.rows[1]?.sets.push({ min: 1, max: 1 });
    assert.equal(sablon.blocks[1]?.rows[1]?.sets.length, 2);
  });

  test('bloklar yeni kimlikle kopyalanır; yapı aynı, kaynak değişmez', () => {
    const before = JSON.stringify(sablon.blocks);
    const copy = reIdBlocks(sablon.blocks, ids());
    assert.equal(JSON.stringify(sablon.blocks), before);
    const oldIds = new Set(sablon.blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)]));
    const newIds = copy.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)]);
    assert.equal(new Set(newIds).size, newIds.length);
    assert.ok(newIds.every((id) => !oldIds.has(id)));
    const strip = (blocks: readonly TemplateBlock[]) =>
      blocks.map(({ id: _id, rows, ...block }) => ({ ...block, rows: rows.map(({ id: _row, ...row }) => row) }));
    assert.deepEqual(strip(copy), strip(sablon.blocks));
    assert.notEqual(copy[1]?.rows[0]?.rule, sablon.blocks[1]?.rows[0]?.rule);
  });

  test("ad karşılaştırması Türkçe: 'Gün I' ile 'gün ı' aynı", () => {
    assert.deepEqual(duplicateNames([{ name: 'Gün I' }, { name: 'gün ı' }]), ['gün ı']);
    assert.deepEqual(duplicateNames([{ name: 'Gün A' }, { name: 'Gün B' }]), []);
  });
});

describe('şablondan program', () => {
  test('evresiz, şablonla dolu Gün A, tek "oluşturuldu" kaydı', () => {
    const created = createProgramFromTemplate(sablon, ids(), simdi);
    const at = simdi.toISOString();
    assert.equal(created.version, 2);
    assert.equal(created.phased, false);
    assert.equal(created.revision, 1);
    assert.equal(created.createdAt, at);
    assert.equal(created.updatedAt, at);
    assert.equal(created.phases.length, 1);
    const [phase] = created.phases;
    assert.equal(phase?.name, 'Evre 1');
    assert.equal(phase?.weeks, undefined);
    assert.equal('weeks' in (phase ?? {}), false);
    assert.equal(phase?.days.length, 1);
    assert.equal(phase?.days[0]?.name, 'Gün A');
    assert.deepEqual(phase?.days[0]?.source, { templateId: 't_k2m9x4qa', templateName: 'Alt vücut A', at });
    assert.deepEqual(created.current, { phaseId: phase?.id, startedAt: at });
    assert.deepEqual(created.rotation, {});
    assert.deepEqual(created.log, [
      { at, revision: 1, kind: 'create', changes: [{ text: "Program oluşturuldu: 'Alt vücut A' şablonundan" }] },
    ]);
  });

  test('sonuç program şemasından geçer', () => {
    const created = createProgramFromTemplate(sablon, programIdSource([]), simdi);
    const parsed = v.safeParse(programSchema, created);
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
  });

  test('blok ve satır kimlikleri şablonunkinden farklı; notlar kalır', () => {
    const created = createProgramFromTemplate(sablon, ids(), simdi);
    const blocks = created.phases[0]?.days[0]?.blocks ?? [];
    const templateIds = new Set(sablon.blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)]));
    assert.ok(blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)]).every((id) => !templateIds.has(id)));
    assert.equal(blocks[0]?.rows[0]?.note, 'Dizleri içe kaçırma');
    assert.equal(duplicateProgramIds(created.phases).length, 0);
  });

  test('oluşturma cümlesi şablon sayısına göre', () => {
    const source = (templateName: string) => ({ templateId: 't_aaaaaaaa', templateName, at: simdi.toISOString() });
    const iki = createProgramRecord(
      {
        phased: true,
        currentPhaseId: 'p_uyum01',
        phases: [{ ...uyum, days: [gun('d_aaaaaa', 'Gün A', { source: source('A') }), gun('d_bbbbbb', 'Gün B', { source: source('B') }), gun('d_cccccc', 'Gün C', { source: source('A') })] }],
      },
      simdi,
    );
    assert.deepEqual(iki.log[0]?.changes, [{ text: "Program oluşturuldu: 'A', 'B' şablonlarından" }]);
    const bos = createProgramRecord({ phased: true, currentPhaseId: 'p_uyum01', phases: [uyum] }, simdi);
    assert.equal(bos.phased, true);
    assert.equal(bos.version, 2);
    assert.deepEqual(bos.log[0]?.changes, [{ text: 'Program oluşturuldu' }]);
  });

  test('şablondan gün sıradaki harfi alır ve kaynağın tarihini yazar', () => {
    const day = dayFromTemplate(uyum, sablon, ids(), simdi);
    assert.equal(day.name, 'Gün D');
    assert.deepEqual(day.source, { templateId: sablon.id, templateName: sablon.name, at: simdi.toISOString() });
    assert.equal(day.blocks.length, 2);
  });

  test('gün şablona çevrilirken notlar atılır; kimlikler kalır, girdi değişmez', () => {
    const day: Pick<ProgramDay, 'blocks'> = {
      blocks: [
        single('b_aaaaa1', 'r_aaaaa1', 'goblet-squat', { note: 'Sol diz ağrıyor' }),
        single('b_aaaaa2', 'r_aaaaa2', 'leg-press', { note: '   ' }),
        single('b_aaaaa3', 'r_aaaaa3', 'leg-curl', { note: 'Ayşe için hafif' }),
      ],
    };
    const before = JSON.stringify(day);
    const { template, droppedNotes } = dayToTemplate(day, 'Alt vücut B');
    assert.equal(JSON.stringify(day), before);
    assert.equal(droppedNotes, 2);
    assert.equal(template.name, 'Alt vücut B');
    assert.equal(template.description, '');
    assert.ok(template.blocks.every((block) => block.rows.every((row) => !('note' in row))));
    assert.deepEqual(
      template.blocks.map((block) => block.id),
      ['b_aaaaa1', 'b_aaaaa2', 'b_aaaaa3'],
    );
    assert.equal(template.blocks[0]?.rows[0]?.id, 'r_aaaaa1');
    const parsed = v.safeParse(templateSaveSchema, template);
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
  });
});

describe('rotasyon', () => {
  test('sıradaki gün: son günün arkasındaki, sonda başa döner', () => {
    assert.equal(nextDayId(program()), 'd_aaaaaa');
    assert.equal(nextDayId(program({ rotation: { lastDayId: 'd_aaaaaa' } })), 'd_bbbbbb');
    assert.equal(nextDayId(program({ rotation: { lastDayId: 'd_cccccc' } })), 'd_aaaaaa');
  });

  test('tek günlük evrede hep aynı gün; başka evrenin günü ilk günü verir', () => {
    const gucte = program({ current: { phaseId: 'p_guc001', startedAt: simdi.toISOString() } });
    assert.equal(nextDayId({ ...gucte, rotation: { lastDayId: 'd_dddddd' } }), 'd_dddddd');
    assert.equal(nextDayId(program({ rotation: { lastDayId: 'd_dddddd' } })), 'd_aaaaaa');
  });

  test('şu anki evre programda yoksa ilk evre', () => {
    assert.equal(nextDayId(program({ current: { phaseId: 'p_yok000', startedAt: simdi.toISOString() }, rotation: { lastDayId: 'd_aaaaaa' } })), 'd_bbbbbb');
  });

  test('gün tamamlanınca rotasyon ilerler; revision ve geçmiş değişmez', () => {
    const before = program();
    const after = completeDay(before, 'd_bbbbbb', simdi);
    assert.deepEqual(after.rotation, { lastDayId: 'd_bbbbbb', lastCompletedAt: simdi.toISOString() });
    assert.equal(after.revision, before.revision);
    assert.equal(after.log, before.log);
    assert.equal(nextDayId(after), 'd_cccccc');
    assert.equal(completeDay(before, 'd_dddddd', simdi), before);
  });

  const once = [uyum];
  const without = (...removed: string[]) => [{ ...uyum, days: uyum.days.filter((day) => !removed.includes(day.id)) }];

  test('son gün silinince sıradaki gün değişmez', () => {
    // B'den sonra C gelecekti; B silinince dayanak A olur, sıradaki yine C.
    const b = reconcileRotation(once, without('d_bbbbbb'), { lastDayId: 'd_bbbbbb', lastCompletedAt: 'x' });
    assert.deepEqual(b, { lastDayId: 'd_aaaaaa', lastCompletedAt: 'x' });
    assert.equal(nextDayId({ phases: without('d_bbbbbb'), current: { phaseId: 'p_uyum01', startedAt: '' }, rotation: b }), 'd_cccccc');

    const a = reconcileRotation(once, without('d_aaaaaa'), { lastDayId: 'd_aaaaaa' });
    assert.deepEqual(a, { lastDayId: 'd_cccccc' });
    assert.equal(nextDayId({ phases: without('d_aaaaaa'), current: { phaseId: 'p_uyum01', startedAt: '' }, rotation: a }), 'd_bbbbbb');

    const c = reconcileRotation(once, without('d_cccccc'), { lastDayId: 'd_cccccc' });
    assert.deepEqual(c, { lastDayId: 'd_bbbbbb' });
    assert.equal(nextDayId({ phases: without('d_cccccc'), current: { phaseId: 'p_uyum01', startedAt: '' }, rotation: c }), 'd_aaaaaa');
  });

  test('bütün günler silinirse dayanak düşer, son antrenman tarihi kalır', () => {
    const after = [{ ...uyum, days: [gun('d_eeeeee', 'Gün D')] }];
    assert.deepEqual(reconcileRotation(once, after, { lastDayId: 'd_bbbbbb', lastCompletedAt: 'x' }), { lastCompletedAt: 'x' });
  });

  test('gün duruyorsa ya da dayanak yoksa aynı nesne', () => {
    const rotation = { lastDayId: 'd_bbbbbb' };
    assert.equal(reconcileRotation(once, without('d_aaaaaa'), rotation), rotation);
    const empty = {};
    assert.equal(reconcileRotation(once, without('d_aaaaaa'), empty), empty);
  });
});

describe('evre durumu', () => {
  const start = '2026-09-01T00:00:00.000Z';
  const at = (ms: number) => new Date(new Date(start).getTime() + ms);
  const DAY = 24 * 60 * 60 * 1000;

  test('süresiz evre: kaçıncı hafta', () => {
    const open = program({ phases: [{ ...uyum, weeks: undefined }, guc], current: { phaseId: 'p_uyum01', startedAt: start } });
    assert.deepEqual(phaseStatus(open, at(10 * DAY)), { kind: 'open', week: 2 });
  });

  test('süre dolmadan sürüyor, tam dolunca sonraki evre önerilir', () => {
    const p = program({ current: { phaseId: 'p_uyum01', startedAt: start } });
    const endsAt = at(2 * WEEK_MS).toISOString();
    assert.deepEqual(phaseStatus(p, at(13 * DAY + 23 * 60 * 60 * 1000 + 59 * 60 * 1000)), { kind: 'running', week: 2, weeks: 2, endsAt });
    assert.deepEqual(phaseStatus(p, at(14 * DAY)), { kind: 'due', week: 3, weeks: 2, endsAt, nextPhaseId: 'p_guc001' });
  });

  test('son evrede süre dolunca "bitti"', () => {
    const p = program({ current: { phaseId: 'p_guc001', startedAt: start } });
    assert.equal(phaseStatus(p, at(6 * WEEK_MS)).kind, 'ended');
  });

  test('başlangıçtan önce 1. hafta', () => {
    assert.equal(phaseStatus(program({ current: { phaseId: 'p_uyum01', startedAt: start } }), at(-3 * DAY)).week, 1);
  });

  test('etiketler', () => {
    assert.equal(phaseStatusLabel({ kind: 'open', week: 3 }), '3. hafta · süresiz');
    assert.equal(phaseStatusLabel({ kind: 'running', week: 3, weeks: 6, endsAt: start }), '3. hafta / 6');
    assert.equal(phaseStatusLabel({ kind: 'due', week: 7, weeks: 6, endsAt: start, nextPhaseId: 'p_guc001' }), 'Süresi doldu (6 hafta)');
    assert.equal(phaseStatusLabel({ kind: 'ended', week: 7, weeks: 6, endsAt: start }), 'Süresi doldu (6 hafta)');
  });
});

describe('evre geçişi', () => {
  test('yeni evre şimdi başlar; son gün düşer, son antrenman tarihi kalır; geçmişe yazılır', () => {
    const before = program({ rotation: { lastDayId: 'd_bbbbbb', lastCompletedAt: '2026-09-20T10:00:00.000Z' } });
    const after = startPhase(before, 'p_guc001', simdi);
    assert.ok(after);
    assert.equal(after.revision, 4);
    assert.equal(after.updatedAt, simdi.toISOString());
    assert.deepEqual(after.current, { phaseId: 'p_guc001', startedAt: simdi.toISOString() });
    assert.deepEqual(after.rotation, { lastCompletedAt: '2026-09-20T10:00:00.000Z' });
    assert.deepEqual(after.log[0], {
      at: simdi.toISOString(),
      revision: 4,
      kind: 'phase',
      changes: [{ text: "Şu anki evre: 'Uyum' → 'Güç'" }],
    });
    assert.equal(after.log[1], kayit);
    assert.equal(nextDayId(after), 'd_dddddd');
  });

  test('aynı ya da bilinmeyen evre: null', () => {
    assert.equal(startPhase(program(), 'p_uyum01', simdi), null);
    assert.equal(startPhase(program(), 'p_yok000', simdi), null);
  });

  test('geçmiş en fazla 200 kayıt, en yenisi üstte', () => {
    const log = Array.from({ length: 200 }, (_, index): ProgramLogEntry => ({ ...kayit, revision: 200 - index }));
    const next = appendLog(log, { ...kayit, revision: 201 });
    assert.equal(next.length, 200);
    assert.equal(next[0]?.revision, 201);
    assert.equal(next.at(-1)?.revision, 2);
  });
});

describe('düzenleyici işlemleri', () => {
  test('evrenin tek günü ve şu anki ya da tek evre silinmez', () => {
    const phases = [uyum, guc];
    assert.equal(removeDay(phases, 'p_guc001', 'd_dddddd'), phases);
    assert.deepEqual(
      removeDay(phases, 'p_uyum01', 'd_bbbbbb')[0]?.days.map((day) => day.id),
      ['d_aaaaaa', 'd_cccccc'],
    );
    assert.equal(removePhase(phases, 'p_uyum01', 'p_uyum01'), phases);
    const only = [uyum];
    assert.equal(removePhase(only, 'p_uyum01', 'p_guc001'), only);
    assert.deepEqual(
      removePhase(phases, 'p_guc001', 'p_uyum01').map((phase) => phase.id),
      ['p_uyum01'],
    );
  });

  test('taşıma uçlarda bir şey yapmaz', () => {
    const phases = [uyum, guc];
    assert.equal(movePhase(phases, 'p_uyum01', -1), phases);
    assert.equal(movePhase(phases, 'p_guc001', 1), phases);
    assert.deepEqual(
      movePhase(phases, 'p_guc001', -1).map((phase) => phase.id),
      ['p_guc001', 'p_uyum01'],
    );
    assert.equal(moveDay(phases, 'p_uyum01', 'd_aaaaaa', -1), phases);
    assert.equal(moveDay(phases, 'p_uyum01', 'd_cccccc', 1), phases);
    assert.deepEqual(
      moveDay(phases, 'p_uyum01', 'd_cccccc', -1)[0]?.days.map((day) => day.id),
      ['d_aaaaaa', 'd_cccccc', 'd_bbbbbb'],
    );
  });

  test('evrede 7, programda 28 gün; en fazla 12 evre', () => {
    const next = ids();
    const yedili: ProgramPhase = { id: 'p_yedi00', name: 'Yedi', days: Array.from({ length: 7 }, () => blankDay({ days: [] }, next)) };
    assert.equal(canAddDay([yedili], 'p_yedi00'), false);
    assert.equal(canAddDay([uyum], 'p_uyum01'), true);
    assert.equal(canAddDay([uyum], 'p_yok000'), false);
    const dort = Array.from({ length: 4 }, (_, index): ProgramPhase => ({ ...yedili, id: `p_dort0${index}`, name: `Evre ${index + 1}` }));
    assert.equal(canAddDay([...dort, uyum], 'p_uyum01'), false);
    assert.equal(canAddPhase(dort), false);
    const onIki = Array.from({ length: 12 }, (_, index): ProgramPhase => ({ ...guc, id: `p_on${String(index).padStart(4, '0')}`, name: `Evre ${index + 1}` }));
    assert.equal(canAddPhase(onIki), false);
    assert.equal(canAddPhase(onIki.slice(1)), true);
    const eklendi = addDay([uyum], 'p_uyum01', blankDay(uyum, next), 'd_aaaaaa');
    assert.deepEqual(
      eklendi[0]?.days.map((day) => day.name),
      ['Gün A', 'Gün D', 'Gün B', 'Gün C'],
    );
    assert.equal(addPhase(onIki, blankPhase(onIki, next)), onIki);
  });

  test('evre kopyası: her yerde yeni kimlik, "… kopyası" adı', () => {
    const next = ids();
    const first = copyPhase([uyum, guc], uyum, next);
    assert.equal(first.name, 'Uyum kopyası');
    assert.equal(first.weeks, 2);
    assert.deepEqual(
      first.days.map((day) => day.name),
      ['Gün A', 'Gün B', 'Gün C'],
    );
    const phases = addPhase([uyum, guc], first, 'p_uyum01');
    assert.equal(duplicateProgramIds(phases).length, 0);
    assert.deepEqual(
      phases.map((phase) => phase.name),
      ['Uyum', 'Uyum kopyası', 'Güç'],
    );
    const second = copyPhase(phases, uyum, next);
    assert.equal(second.name, 'Uyum kopyası 2');
    const all = allIds([...phases, second]);
    assert.equal(new Set(all).size, all.length);
  });

  const exercise = (id: string, fields: Partial<PlanExercise> = {}): PlanExercise => ({
    id,
    title: id,
    category: 'compound',
    trackingType: 'weight_reps',
    equipment: 'barbell',
    primaryMuscles: [],
    secondaryMuscles: [],
    ...fields,
  });

  test('sunucu denetimi: hata anahtarı evre ve gün yolunu taşır; varsayılan kural düşer, not kırpılır', () => {
    const body = {
      phased: true,
      phases: [
        {
          ...uyum,
          name: '  Uyum ',
          daysPerWeek: 3,
          days: [
            {
              ...A,
              blocks: [single('b_aaaaaa', 'r_aaaaaa', 'goblet-squat', { note: '  Derin çök  ', rule: { scheme: 'double', targetRir: 2 } })],
            },
          ],
        },
        { ...guc, days: [gun('d_dddddd', 'Gün A', { blocks: [single('b_dddddd', 'r_dddddd', 'silinmis')] })] },
      ],
    };
    const { phases, errors } = normalizeProgram(body, {
      exercises: new Map([['goblet-squat', exercise('goblet-squat')]]),
      deviceIds: new Set(),
    });
    assert.deepEqual(Object.keys(errors), ['phases.1.days.0.blocks.0.rows.0.exerciseId']);
    assert.equal(phases[0]?.name, 'Uyum');
    assert.equal(phases[0]?.weeks, 2);
    assert.equal(phases[0]?.daysPerWeek, 3);
    const row = phases[0]?.days[0]?.blocks[0]?.rows[0];
    assert.equal(row?.note, 'Derin çök');
    assert.equal(row?.rule, undefined);
  });

  test('silinmiş cihaz satırları bütün günlerde sayılır', () => {
    const phases = [
      { ...uyum, days: [gun('d_aaaaaa', 'Gün A', { blocks: [single('b_aaaaaa', 'r_aaaaaa', 'squat', { deviceId: 'eski-cihaz' })] }), B] },
      { ...guc, days: [gun('d_dddddd', 'Gün A', { blocks: [single('b_dddddd', 'r_dddddd', 'squat', { deviceId: 'eski-cihaz' })] })] },
    ];
    const prepared = prepareProgramForEditing(phases, new Set(['smith']));
    assert.deepEqual(prepared.droppedDeviceRowIds, ['r_aaaaaa', 'r_dddddd']);
    assert.equal(prepared.phases[0]?.days[0]?.blocks[0]?.rows[0]?.deviceId, undefined);
  });

  test('kütüphanede olmayan egzersizler gün gün', () => {
    const phases = [
      { ...uyum, days: [gun('d_aaaaaa', 'Gün A', { blocks: [single('b_aaaaaa', 'r_aaaaaa', 'eski-hareket')] }), B] },
      guc,
    ];
    assert.deepEqual(missingExerciseDays(phases, new Set(['goblet-squat'])), [
      { phaseId: 'p_uyum01', dayId: 'd_aaaaaa', rowIds: ['r_aaaaaa'] },
    ]);
    assert.deepEqual(missingExerciseDays(phases, new Set(['goblet-squat', 'eski-hareket'])), []);
  });
});

describe('evresiz program ve evreleri kaldırma', () => {
  test('eski programlarda evre seçimi: tek, süresiz evre = evresiz', () => {
    assert.equal(derivePhased([{ id: 'p_a', weeks: undefined }]), false);
    assert.equal(derivePhased([{ id: 'p_a', weeks: 2 }]), true);
    assert.equal(derivePhased([{ id: 'p_a' }, { id: 'p_b' }]), true);
  });

  test('boş iskelet evresiz; yeni evre son evrenin sıklığını alır, kopya da', () => {
    assert.equal(blankProgramBody(ids()).phased, false);
    assert.equal(blankProgramBody(ids()).phases[0]?.name, 'Evre 1');
    const next = ids();
    assert.equal(blankPhase([{ ...guc, daysPerWeek: 4 }], next).daysPerWeek, 4);
    assert.equal('daysPerWeek' in blankPhase([guc], next), false);
    assert.equal(copyPhase([guc], { ...guc, daysPerWeek: 3 }, next).daysPerWeek, 3);
  });

  const guc3: ProgramPhase = {
    id: 'p_guc001',
    name: 'Güç',
    weeks: 6,
    daysPerWeek: 3,
    days: [gun('d_dddddd', 'Gün A'), gun('d_eeeeee', 'Gün C')],
  };
  const uyum2: ProgramPhase = { id: 'p_uyum01', name: 'Uyum', weeks: 2, daysPerWeek: 2, days: [A, B] };

  test('evreler birleşir: şu anki evrenin kimliği ve sıklığı, program sırası, aynı ad "… 2"', () => {
    const { phases, renamed } = mergePhases([uyum2, guc3], 'p_guc001');
    assert.equal(phases.length, 1);
    const [only] = phases;
    assert.equal(only?.id, 'p_guc001');
    assert.equal(only?.name, 'Evre 1');
    assert.equal('weeks' in (only ?? {}), false);
    assert.equal(only?.daysPerWeek, 3);
    assert.deepEqual(
      only?.days.map((day) => [day.id, day.name]),
      [
        ['d_aaaaaa', 'Gün A'],
        ['d_bbbbbb', 'Gün B'],
        ['d_dddddd', 'Gün A 2'],
        ['d_eeeeee', 'Gün C'],
      ],
    );
    assert.deepEqual(renamed, [{ dayId: 'd_dddddd', from: 'Gün A', to: 'Gün A 2' }]);
    assert.equal(only?.days[0], A);
  });

  test('birleşince 7 günü aşan evreler kaldırılamaz', () => {
    assert.deepEqual(mergePhasesCheck([uyum2, guc3]), { ok: true, days: 4 });
    const big: ProgramPhase = { ...uyum2, days: Array.from({ length: 6 }, (_, i) => gun(`d_big00${i}`, `Gün ${i + 1}`)) };
    assert.deepEqual(mergePhasesCheck([big, { ...guc3, days: [gun('d_dddddd', 'X'), gun('d_eeeeee', 'Y')] }]), { ok: false, days: 8 });
  });

  test('gün başka evreye taşınır: yeni evrenin boş gününün yerine geçer', () => {
    const next = ids();
    const fresh = blankPhase([uyum], next);
    const phases = moveDayToPhase([uyum, fresh], 'd_cccccc', fresh.id);
    assert.deepEqual(
      phases[0]?.days.map((day) => day.id),
      ['d_aaaaaa', 'd_bbbbbb'],
    );
    assert.deepEqual(
      phases[1]?.days.map((day) => [day.id, day.name]),
      [['d_cccccc', 'Gün C']],
    );
  });

  test('aynı ad hedefte varsa "… 2"; tek gün ya da dolu hedef taşınmaz', () => {
    const target: ProgramPhase = { id: 'p_hedef1', name: 'Hedef', days: [gun('d_ffffff', 'Gün B')] };
    const moved = moveDayToPhase([uyum, target], 'd_bbbbbb', 'p_hedef1');
    assert.deepEqual(
      moved[1]?.days.map((day) => day.name),
      ['Gün B', 'Gün B 2'],
    );
    const phases = [uyum, guc];
    assert.equal(moveDayToPhase(phases, 'd_dddddd', 'p_uyum01'), phases);
    assert.equal(canMoveDay(phases, 'd_dddddd', 'p_uyum01'), false);
    const full: ProgramPhase = { id: 'p_dolu01', name: 'Dolu', days: Array.from({ length: 7 }, (_, i) => gun(`d_dolu0${i}`, `Gün ${i + 1}`)) };
    const withFull = [uyum, full];
    assert.equal(moveDayToPhase(withFull, 'd_aaaaaa', 'p_dolu01'), withFull);
    assert.equal(canMoveDay(phases, 'd_aaaaaa', 'p_uyum01'), false);
    assert.equal(canMoveDay(phases, 'd_aaaaaa', 'p_guc001'), true);
  });

  test('taşınan son gün: rotasyon eski evrede öncekinden sürer', () => {
    const target: ProgramPhase = { id: 'p_hedef1', name: 'Hedef', days: [gun('d_ffffff', 'Gün F')] };
    const after = moveDayToPhase([uyum, target], 'd_bbbbbb', 'p_hedef1');
    const rotation = reconcileRotation([uyum, target], after, { lastDayId: 'd_bbbbbb' });
    assert.deepEqual(rotation, { lastDayId: 'd_aaaaaa' });
    assert.equal(nextDayId({ phases: after, current: { phaseId: 'p_uyum01', startedAt: '' }, rotation }), 'd_cccccc');
  });

  test('evresi silinen son gün: dayanak düşer', () => {
    assert.deepEqual(reconcileRotation([uyum, guc], [guc], { lastDayId: 'd_bbbbbb', lastCompletedAt: 'x' }), { lastCompletedAt: 'x' });
  });

  test('evreler birleşince son gün aynı evrede kalır', () => {
    const merged = mergePhases([uyum2, guc3], 'p_guc001').phases;
    const rotation = { lastDayId: 'd_dddddd' };
    assert.equal(reconcileRotation([uyum2, guc3], merged, rotation), rotation);
  });
});

describe('sıklık ve haftalık yük', () => {
  test('etiket ve çarpan', () => {
    assert.equal(frequencyLabel(3), 'Haftada 3 gün');
    assert.equal(frequencyLabel(undefined), null);
    assert.equal(cycleFactor({ daysPerWeek: 3, days: [A, B, C, A, B] }), 0.6);
    assert.equal(cycleFactor({ days: [A] }), null);
    assert.equal(cycleFactor({ daysPerWeek: 3, days: [A] }), 3);
  });

  const exercise = (id: string, primaryMuscles: string[]): PlanExercise => ({
    id,
    title: id,
    category: 'compound',
    trackingType: 'weight_reps',
    equipment: 'barbell',
    primaryMuscles,
    secondaryMuscles: [],
  });
  const library = new Map([
    ['bench', exercise('bench', ['chest_lower'])],
    ['squat', exercise('squat', ['quadriceps'])],
  ]);
  const weightsOf = (item: PlanExercise) => Object.fromEntries(item.primaryMuscles.map((muscle) => [muscle, 1]));
  const ten = (tail: string, exerciseId: string) => single(`b_${tail}`, `r_${tail}`, exerciseId, { sets: uniformSets({ min: 8, max: 12 }, 10) });

  test('tek gün, iki 10 setlik göğüs hareketi, haftada 3: bir tur 20, haftada 60', () => {
    const day: ProgramDay = { id: 'd_aaaaaa', name: 'Gün A', blocks: [ten('aaaaa1', 'bench'), ten('aaaaa2', 'bench')] };
    const load = phaseMuscleLoad({ daysPerWeek: 3, days: [day] }, library, weightsOf);
    assert.deepEqual(load, { cycle: { chest_lower: 20 }, weekly: { chest_lower: 60 }, factor: 3 });
  });

  test('beş günlük döngü, haftada 3: bir turdaki 10 set haftada 6', () => {
    const days: ProgramDay[] = [
      { id: 'd_aaaaaa', name: 'Gün A', blocks: [ten('aaaaa1', 'squat')] },
      ...['b', 'c', 'd', 'e'].map((letter): ProgramDay => ({ id: `d_${letter.repeat(6)}`, name: `Gün ${letter}`, blocks: [ten(`${letter}aaaa1`, 'bench')] })),
    ];
    const load = phaseMuscleLoad({ daysPerWeek: 3, days }, library, weightsOf);
    assert.equal(load.weekly?.quadriceps, 6);
    assert.equal(load.cycle.quadriceps, 10);
    assert.equal(phaseMuscleLoad({ days }, library, weightsOf).weekly, null);
  });

  test('bu hafta: pazartesiden, uygulamanın saat diliminde, gün başına bir', () => {
    const now = new Date('2026-09-24T09:00:00.000Z');
    const result = weekProgress({
      completedAt: [
        '2026-09-20T22:30:00.000Z', // İstanbul'da pazartesi 01:30
        '2026-09-20T20:00:00.000Z', // İstanbul'da pazar 23:00: önceki hafta
        '2026-09-22T06:00:00.000Z',
        '2026-09-22T17:00:00.000Z', // aynı gün
        '2026-09-25T06:00:00.000Z', // gelecek
        'x',
      ],
      daysPerWeek: 3,
      now,
      timeZone: 'Europe/Istanbul',
    });
    assert.deepEqual(result, { done: 2, target: 3, weekStart: '2026-09-21' });
    assert.equal(weekProgress({ completedAt: [], now, timeZone: 'Europe/Istanbul' }).target, null);
  });
});

describe('eski program dosyası', () => {
  const legacy = {
    version: 1,
    revision: 2,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    phases: [
      {
        id: 'p_evre01',
        name: 'Evre 1',
        days: [
          {
            id: 'd_aaaaaa',
            name: 'Gün A',
            blocks: [{ id: 'b_aaaaaa', kind: 'single', sets: 4, restSeconds: 120, rows: [{ id: 'r_aaaaaa', exerciseId: 'squat', target: { min: 5, max: 8 } }] }],
          },
        ],
      },
    ],
    current: { phaseId: 'p_evre01', startedAt: '2026-09-01T00:00:00.000Z' },
    rotation: {},
    log: [],
  };

  test('sürüm 1 → 2: evre seçimi çıkarılır, satırlar sete çevrilir', () => {
    const upgraded = upgradeProgram(legacy) as ProgramState;
    assert.equal(upgraded.version, 2);
    assert.equal(upgraded.phased, false);
    assert.deepEqual(upgraded.phases[0]?.days[0]?.blocks[0]?.rows[0]?.sets, uniformSets({ min: 5, max: 8 }, 4));
    const parsed = v.safeParse(programSchema, legacy);
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
  });

  test('sürüm 2 olduğu gibi; nesne olmayan dokunulmaz', () => {
    const once = upgradeProgram(legacy);
    assert.deepEqual(upgradeProgram(once), once);
    assert.equal(upgradeProgram('x'), 'x');
    assert.equal(upgradeProgram(null), null);
  });
});
