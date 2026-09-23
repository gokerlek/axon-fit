import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import type { ProgramDay, ProgramLogEntry, ProgramPhase, ProgramState } from '../program-plan.ts';
import type { TemplateBlock } from '../template-plan.ts';
import { programFormSchema, programSaveSchema, programSchema } from './program.ts';

const at = '2026-09-24T09:00:00.000Z';

function block(tail: string): TemplateBlock {
  return {
    id: `b_${tail}`,
    kind: 'single',
    sets: 3,
    restSeconds: 120,
    rows: [{ id: `r_${tail}`, exerciseId: 'goblet-squat', target: { min: 8, max: 12 } }],
  };
}

function day(tail: string, name: string, fields: Partial<ProgramDay> = {}): ProgramDay {
  return { id: `d_${tail}`, name, blocks: [block(tail)], ...fields };
}

/** Kimlikleri benzersiz evreler: her evrede verilen sayıda gün. */
function phases(counts: number[]): ProgramPhase[] {
  let n = 0;
  return counts.map((days, index) => ({
    id: `p_ph${String(index).padStart(4, '0')}`,
    name: `Evre ${index + 1}`,
    days: Array.from({ length: days }, (_, j) => day(`dy${String(n++).padStart(4, '0')}`, `Gün ${j + 1}`)),
  }));
}

const log: ProgramLogEntry = { at, revision: 1, kind: 'create', changes: [{ text: 'Program oluşturuldu' }] };

function program(fields: Partial<ProgramState> = {}): ProgramState {
  return {
    version: 1,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    phases: [
      { id: 'p_uyum01', name: 'Uyum', weeks: 2, days: [day('aaaaaa', 'Gün A'), day('bbbbbb', 'Gün B')] },
      { id: 'p_guc001', name: 'Güç', days: [day('cccccc', 'Gün A')] },
    ],
    current: { phaseId: 'p_uyum01', startedAt: at },
    rotation: {},
    log: [log],
    ...fields,
  };
}

function paths(result: { issues?: readonly v.BaseIssue<unknown>[] | undefined }): string[] {
  return (result.issues ?? []).map((issue) => issue.path?.map((segment) => String(segment.key)).join('.') ?? '');
}

describe('program şeması', () => {
  test('geçerli program okunur; bilinmeyen alanlar atılır', () => {
    const base = program();
    const withExtra = {
      ...base,
      clientName: 'Ayşe',
      phases: base.phases.map((phase) => ({ ...phase, secret: 'x' })),
    };
    const parsed = v.safeParse(programSchema, withExtra);
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
    assert.equal(parsed.success && 'clientName' in parsed.output, false);
    assert.equal(parsed.success && 'secret' in (parsed.output.phases[0] ?? {}), false);
  });

  test('boş gün kaydedilmez; hata günün bloklarında', () => {
    const base = program();
    const empty = { ...base, phases: [{ ...base.phases[0], days: [{ id: 'd_aaaaaa', name: 'Gün A', blocks: [] }] }, base.phases[1]] };
    const parsed = v.safeParse(programSchema, empty);
    assert.equal(parsed.success, false);
    const issue = parsed.issues?.find((item) => item.message === 'Güne en az bir hareket ekle.');
    assert.ok(issue);
    assert.equal(issue.path?.map((segment) => String(segment.key)).join('.'), 'phases.0.days.0.blocks');
  });

  test('günsüz evre olmaz', () => {
    const base = program();
    assert.equal(v.safeParse(programSchema, { ...base, phases: [{ ...base.phases[0], days: [] }, base.phases[1]] }).success, false);
  });

  test('evrede aynı adda iki gün olmaz; farklı evrelerde olur', () => {
    const base = program();
    const same = { ...base, phases: [{ ...base.phases[0], days: [day('aaaaaa', 'Gün A'), day('bbbbbb', 'gün a ')] }, base.phases[1]] };
    assert.equal(v.safeParse(programSchema, same).success, false);
    // Örnek programda "Gün A" iki evrede de var.
    assert.equal(v.safeParse(programSchema, base).success, true);
  });

  test('iki günde aynı satır kimliği olmaz', () => {
    const base = program();
    const second = day('bbbbbb', 'Gün B', {
      blocks: [{ ...block('bbbbbb'), rows: [{ id: 'r_aaaaaa', exerciseId: 'leg-press', target: { min: 8, max: 12 } }] }],
    });
    const dup = { ...base, phases: [{ ...base.phases[0], days: [day('aaaaaa', 'Gün A'), second] }, base.phases[1]] };
    const parsed = v.safeParse(programSchema, dup);
    assert.equal(parsed.success, false);
    assert.ok(parsed.issues?.some((issue) => issue.message === 'Evre, gün, blok ve satır kimlikleri benzersiz olmalı.'));
  });

  test('şu anki evre programda olmalı; formda hata şu anki evre alanında', () => {
    assert.equal(v.safeParse(programSchema, program({ current: { phaseId: 'p_yok000', startedAt: at } })).success, false);
    const form = v.safeParse(programFormSchema, { currentPhaseId: 'p_yok000', phases: program().phases });
    assert.equal(form.success, false);
    assert.deepEqual(paths(form), ['currentPhaseId']);
  });

  test('süre 1–52 tam hafta ya da yok', () => {
    const withWeeks = (weeks: number | undefined) => {
      const base = program();
      return { ...base, phases: [{ ...base.phases[0], weeks }, base.phases[1]] };
    };
    assert.equal(v.safeParse(programSchema, withWeeks(0)).success, false);
    assert.equal(v.safeParse(programSchema, withWeeks(53)).success, false);
    assert.equal(v.safeParse(programSchema, withWeeks(2.5)).success, false);
    assert.equal(v.safeParse(programSchema, withWeeks(undefined)).success, true);
    assert.equal(v.safeParse(programSchema, withWeeks(52)).success, true);
  });

  test('en fazla 12 evre ve toplam 28 gün', () => {
    const twelve = phases(Array.from({ length: 12 }, () => 1));
    assert.equal(v.safeParse(programSchema, program({ phases: twelve, current: { phaseId: twelve[0]?.id ?? '', startedAt: at } })).success, true);
    const thirteen = phases(Array.from({ length: 13 }, () => 1));
    assert.equal(v.safeParse(programSchema, program({ phases: thirteen, current: { phaseId: thirteen[0]?.id ?? '', startedAt: at } })).success, false);
    const full = phases([7, 7, 7, 7]);
    assert.equal(v.safeParse(programSchema, program({ phases: full, current: { phaseId: full[0]?.id ?? '', startedAt: at } })).success, true);
    const over = phases([7, 7, 7, 7, 1]);
    const parsed = v.safeParse(programSchema, program({ phases: over, current: { phaseId: over[0]?.id ?? '', startedAt: at } }));
    assert.equal(parsed.success, false);
    assert.ok(parsed.issues?.some((issue) => issue.message === 'Programda en fazla 28 gün olur.'));
  });

  test('geçmiş en fazla 200 kayıt', () => {
    const entries = (n: number) => Array.from({ length: n }, () => log);
    assert.equal(v.safeParse(programSchema, program({ log: entries(200) })).success, true);
    assert.equal(v.safeParse(programSchema, program({ log: entries(201) })).success, false);
  });

  test('kayıt ucu: baseRevision null (yeni) ya da 1 ve üstü', () => {
    const body = { currentPhaseId: 'p_uyum01', phases: program().phases };
    assert.equal(v.safeParse(programSaveSchema, { ...body, baseRevision: null }).success, true);
    assert.equal(v.safeParse(programSaveSchema, { ...body, baseRevision: 7 }).success, true);
    assert.equal(v.safeParse(programSaveSchema, { ...body, baseRevision: 0 }).success, false);
  });
});
