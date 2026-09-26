import type { SessionDoc, SessionEntry, SessionSet } from '../schemas/session.ts';
import type { TemplateBlock, TemplateBody } from '../template-plan.ts';

/**
 * Antrenman kaydı testlerinin kalıpları — YALNIZ testler için. Kimlikler şemaya uyar (`s_` + 8, `e_` + 6,
 * `st_` + 8, `w_` + 6); zamanlar tek bir başlangıçtan dakika olarak (`at(3)` = 15:03).
 */

export const W1 = 'w_aaaaaa';
export const W2 = 'w_bbbbbb';
export const SESSION_ID = 's_k2m9x4qa';
export const DAY_A = 'd_aaaaaa';
export const DAY_B = 'd_bbbbbb';

const BASE = Date.parse('2026-09-26T15:00:00.000Z');

/** Başlangıçtan `minutes` dakika sonrası (ISO). */
export function at(minutes: number): string {
  return new Date(BASE + minutes * 60_000).toISOString();
}

export function sessionDoc(overrides: Partial<SessionDoc> = {}): SessionDoc {
  return {
    version: 1,
    id: SESSION_ID,
    status: 'active',
    date: '2026-09-26',
    startedAt: at(0),
    program: { revision: 1, dayId: DAY_A, dayName: 'Gün A' },
    writer: W1,
    entries: [],
    deletedSetIds: [],
    deletedEntryIds: [],
    waterTaps: [],
    notices: [],
    ...overrides,
  };
}

export function sessionEntry(id: string, overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id,
    exerciseId: 'bench-press',
    title: 'Bench Press',
    status: 'pending',
    updatedAt: at(0),
    by: W1,
    sets: [],
    ...overrides,
  };
}

export function workingSet(id: string, minute: number, overrides: Partial<SessionSet> = {}): SessionSet {
  return { id, type: 'working', kg: 60, reps: 10, at: at(minute), by: W1, ...overrides };
}

/** Plan satırı: `sets` hedefleri (8–10). */
function row(id: string, sets: number, exerciseId = 'bench-press'): TemplateBlock['rows'][number] {
  return { id, exerciseId, sets: Array.from({ length: sets }, () => ({ min: 8, max: 10 })) };
}

export function singleBlock(id: string, rowId: string, sets = 3, restSeconds = 90): TemplateBlock {
  return { id, kind: 'single', restSeconds, rows: [row(rowId, sets)] };
}

export function groupBlock(id: string, kind: 'superset' | 'circuit', rows: { id: string; sets: number }[], restSeconds = 120, transitionSeconds?: number): TemplateBlock {
  return { id, kind, restSeconds, ...(transitionSeconds !== undefined ? { transitionSeconds } : {}), rows: rows.map((item) => row(item.id, item.sets)) };
}

export function plan(...blocks: TemplateBlock[]): TemplateBody {
  return { blocks };
}

export const PHASE = 'p_aaaaaa';

/**
 * Ham `program.json` (sürüm 2): evresiz, Gün A (Bench 3 set + Leg Press 2 set) ve Gün B. `extra` şemada
 * olmayan alanlar içindir (ör. ileride `clientTargets`): bitiş yazımı onları düşürmemeli.
 */
export function programFile(rotation: { lastDayId?: string; lastCompletedAt?: string } = {}, extra: Record<string, unknown> = {}) {
  return {
    version: 2,
    phased: false,
    revision: 7,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    phases: [
      {
        id: PHASE,
        name: 'Evre 1',
        days: [
          { id: DAY_A, name: 'Gün A', blocks: [singleBlock('b_aaaaaa', 'r_aaaaaa', 3), singleBlock('b_bbbbbb', 'r_bbbbbb', 2)] },
          { id: DAY_B, name: 'Gün B', blocks: [singleBlock('b_cccccc', 'r_cccccc', 3)] },
        ],
      },
    ],
    current: { phaseId: PHASE, startedAt: '2026-09-01T10:00:00.000Z' },
    rotation,
    log: [],
    ...extra,
  };
}
