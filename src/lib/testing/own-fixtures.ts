import type { OwnProgram } from '../own-programs.ts';
import type { TemplateBlock } from '../template-plan.ts';

/**
 * Kendi program testlerinin kalıpları — YALNIZ testler için. "Evde": tek gizli evre, Gün A (Goblet Squat 3 set,
 * Şınav 3 set) ve Gün B (Plank 3 set); kimlikler PT programınınkilerden (`session-fixtures.ts`) farklı.
 */

export const OWN_ID = 'op_evde0001';
export const OWN_PHASE = 'p_ownaaa';
export const OWN_DAY_A = 'd_ownaaa';
export const OWN_DAY_B = 'd_ownbbb';
export const OWN_ROW_GOBLET = 'r_owngob';
export const OWN_ROW_PUSH = 'r_ownpsh';
export const OWN_ROW_PLANK = 'r_ownplk';

const at = '2026-09-20T18:00:00.000Z';

function block(id: string, rowId: string, exerciseId: string, sets = 3, range: [number, number] = [8, 12], restSeconds = 90): TemplateBlock {
  return { id, kind: 'single', restSeconds, rows: [{ id: rowId, exerciseId, sets: Array.from({ length: sets }, () => ({ min: range[0], max: range[1] })) }] };
}

/** "Evde" programı (ham dosya); `overrides` alanları değiştirir. */
export function ownProgram(overrides: Partial<OwnProgram> = {}): OwnProgram {
  return {
    version: 2,
    id: OWN_ID,
    name: 'Evde',
    phased: false,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    phases: [
      {
        id: OWN_PHASE,
        name: 'Evre 1',
        days: [
          { id: OWN_DAY_A, name: 'Gün A', blocks: [block('b_owngob', OWN_ROW_GOBLET, 'goblet-squat'), block('b_ownpsh', OWN_ROW_PUSH, 'push-up', 3, [10, 14], 60)] },
          { id: OWN_DAY_B, name: 'Gün B', blocks: [block('b_ownplk', OWN_ROW_PLANK, 'plank', 3, [30, 45], 60)] },
        ],
      },
    ],
    current: { phaseId: OWN_PHASE, startedAt: at },
    rotation: {},
    log: [{ at, revision: 1, kind: 'create', changes: [{ text: 'Program oluşturuldu' }] }],
    ...overrides,
  };
}
