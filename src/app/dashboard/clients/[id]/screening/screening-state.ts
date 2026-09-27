// Göreli ve uzantılı içe aktarma: taslak `node --test` ile de sınanır (`screening-state.test.ts`).
import type { ScreeningSide, ScreeningTests } from '../../../../../lib/schemas/health.ts';
import {
  SCREENING_TEST_IDS,
  SCREENING_TESTS,
  screeningKey,
  sideEntry,
  sidesOf,
  type NotTestedReason,
  type ResultChoice,
} from '../../../../../lib/screening.ts';

/*
 * Tarama formunun taslağı: sunucu sayfası başlangıcı kurar (`initialScreeningState`), form gönderirken kayda çevirir
 * (`testsOf`). `'use client'` dosyasından ayrı: sunucu bileşeni istemci modülünün işlevini çağıramaz.
 */

/** Bir tarafın formdaki hâli (sayılar metin: boş alan girilmedi). `legCm`: bacak boyu (yalnız dengede). */
export type SideState = {
  pain: boolean;
  painNote: string;
  result?: ResultChoice;
  reason?: NotTestedReason;
  missed: string[];
  seconds: string;
  reachCm: string;
  legCm: string;
};
export type TestExtra = { note: string; heelSupportHelps?: boolean };
export type ScreeningDraftState = { sides: Record<string, SideState>; extras: Record<string, TestExtra>; note: string; date: string };

export const EMPTY_SIDE: SideState = { pain: false, painNote: '', missed: [], seconds: '', reachCm: '', legCm: '' };

export function decimal(text: string): number | undefined {
  const value = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(value) ? undefined : value;
}

export function toEntry(state: SideState | undefined): ScreeningSide | undefined {
  if (!state) return undefined;
  if (state.pain) return { pain: true, ...(state.painNote.trim() ? { painNote: state.painNote.trim() } : {}) };
  if (!state.result) return undefined;
  const seconds = decimal(state.seconds);
  const reachCm = decimal(state.reachCm);
  // Eski taslakta (sessionStorage) alan yok.
  const legCm = decimal(state.legCm ?? '');
  return {
    result: state.result,
    ...(state.result === 'not_tested' && state.reason ? { reason: state.reason } : {}),
    ...(state.result === 'standard' || state.result === 'easier' ? { missed: state.missed } : {}),
    ...(seconds !== undefined ? { seconds } : {}),
    ...(reachCm !== undefined ? { reachCm } : {}),
    ...(legCm !== undefined ? { legCm } : {}),
  };
}

/** Formdan kaydın `tests`'i (sunucu yeniden temizler). */
export function testsOf(state: ScreeningDraftState): ScreeningTests {
  const tests: Record<string, unknown> = {};
  for (const testId of SCREENING_TEST_IDS) {
    const extra = state.extras[testId];
    const note = extra?.note.trim();
    if (SCREENING_TESTS[testId].sided) {
      const left = toEntry(state.sides[screeningKey(testId, 'left')]);
      const right = toEntry(state.sides[screeningKey(testId, 'right')]);
      if (left || right) tests[testId] = { ...(left ? { left } : {}), ...(right ? { right } : {}), ...(note ? { note } : {}) };
    } else {
      const center = toEntry(state.sides[testId]);
      if (center) tests[testId] = { ...center, ...(testId === 'squat' && extra?.heelSupportHelps !== undefined ? { heelSupportHelps: extra.heelSupportHelps } : {}), ...(note ? { note } : {}) };
    }
  }
  return tests as ScreeningTests;
}

function stateOfSide(entry: ScreeningSide | undefined): SideState {
  if (!entry) return EMPTY_SIDE;
  return {
    pain: Boolean(entry.pain),
    painNote: entry.painNote ?? '',
    ...(entry.result ? { result: entry.result } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
    missed: entry.missed ?? [],
    seconds: entry.seconds !== undefined ? String(entry.seconds) : '',
    reachCm: entry.reachCm !== undefined ? String(entry.reachCm).replace('.', ',') : '',
    legCm: entry.legCm !== undefined ? String(entry.legCm).replace('.', ',') : '',
  };
}

/** Kayıttan (düzenleme) ya da kısıtlardan (yeni; görüşü alınmamış kırmızı bayrak bölgesi) başlangıç. */
export function initialScreeningState(input: { date: string; tests?: ScreeningTests; note?: string; preset?: Record<string, true> }): ScreeningDraftState {
  const sides: Record<string, SideState> = {};
  const extras: Record<string, TestExtra> = {};
  for (const testId of SCREENING_TEST_IDS) {
    const raw = input.tests?.[testId] as { note?: string; heelSupportHelps?: boolean } | undefined;
    extras[testId] = { note: raw?.note ?? '', ...(raw?.heelSupportHelps !== undefined ? { heelSupportHelps: raw.heelSupportHelps } : {}) };
    for (const side of sidesOf(testId)) {
      const key = screeningKey(testId, side);
      const entry = input.tests ? sideEntry(input.tests, testId, side) : undefined;
      sides[key] = entry ? stateOfSide(entry) : input.preset?.[key] ? { ...EMPTY_SIDE, result: 'not_tested', reason: 'constraint' } : EMPTY_SIDE;
    }
  }
  return { sides, extras, note: input.note ?? '', date: input.date };
}
