import type { MovementPattern } from './alternatives.ts';
import type { Screening } from './schemas/health.ts';
import {
  cellsOf,
  cellTitle,
  newestFirst,
  OUTCOME_LABELS,
  painHistory,
  rankOf,
  SCREENING_PROTOCOL,
  SCREENING_TEST_IDS,
  SCREENING_TESTS,
  screeningHints,
  SIDE_KEY_LABELS,
  type Outcome,
  type ScreeningCell,
  type ScreeningTestId,
  type SideSuppress,
} from './screening.ts';

/**
 * Taramanın program düzenleyicisindeki izi (tasarım `docs/design/kisit-tarama.md` §4.6, faz 6) — saf, yalnız PT.
 *
 * - **Ağrı:** açık (gözden geçirilmemiş, sonra ağrısız test edilmemiş; `painHistory`) ağrının testinin kalıbındaki
 *   hareketler düzenleyicide **dikkat** alır: "Taramada ağrı: Kol kaldırma (sağ)". Egzersiz etiketleri taraf ayırmaz:
 *   sağ kolun ağrısı iki taraflı hareketi de işaretler (kısıtlarla aynı sınır).
 * - **Rozet (bilgi):** son taramada testin sonucu, hareketin kalıbı testin kalıplarındaysa: "Tarama: Squat ·
 *   Telafiyle"; ayrıntısı PT'nin ipucu (`screeningHints`).
 *
 * Tarama hiçbir hareketi yasaklamaz (§4.6): burada `block` yoktur, "Değiştir" ve danışanın kartı taramayı hiç okumaz.
 * Çağıran `screening` onayını denetler.
 */

export type ScreeningMark = {
  /** Açık ağrılar ("Taramada ağrı: Kol kaldırma (sağ)"): dikkat, yasak değil. */
  pain: string[];
  /** Bilgi rozeti: kısa ad ve ipucunun tamamı (`title`, ekran okuyucu). */
  info?: { label: string; detail: string };
};

/** Taramanın ağrısı dikkat verir; bu kalıptaki hareketler ("Taramada ağrı: …"). */
export function painWarnings(screenings: readonly Screening[]): Map<MovementPattern, string[]> {
  const byPattern = new Map<MovementPattern, string[]>();
  for (const pain of painHistory(screenings).open) {
    const text = `Taramada ağrı: ${cellTitle(pain.testId, pain.side)}`;
    for (const pattern of SCREENING_TESTS[pain.testId].painPatterns) {
      const list = byPattern.get(pattern) ?? [];
      if (!list.includes(text)) list.push(text);
      byPattern.set(pattern, list);
    }
  }
  return byPattern;
}

/** En düşük sonuç önce: ağrılı, yapılamadı, kolaylaştırılmış, telafiyle, temiz. */
function severity(outcome: Outcome): number {
  return outcome === 'pain' ? -1 : (rankOf(outcome) ?? 4);
}

type TestSummary = { testId: ScreeningTestId; label: string; order: number; detail: string };

/**
 * Son taramada testin özeti: en düşük sonuçlu taraf ("Split squat (sağ) · Kolaylaştırılmış"; iki taraf aynıysa
 * tarafsız). Açık ağrılı taraf rozete girmez (dikkati zaten söyler); test yapılmadıysa ya da yalnız açık ağrı
 * kaldıysa null.
 */
function testSummary(testId: ScreeningTestId, cells: readonly ScreeningCell[], openKeys: ReadonlySet<string>, hint: string): TestSummary | null {
  const shown = cells.filter((cell) => cell.outcome !== 'not_tested' && !openKeys.has(cell.key));
  if (shown.length === 0) return null;
  const worst = [...shown].sort((a, b) => severity(a.outcome) - severity(b.outcome))[0]!;
  const same = shown.length > 1 && shown.every((cell) => cell.outcome === worst.outcome);
  const side = worst.side === 'center' || same ? '' : ` (${SIDE_KEY_LABELS[worst.side].toLocaleLowerCase('tr')})`;
  return { testId, label: `${SCREENING_TESTS[testId].short}${side} · ${OUTCOME_LABELS[worst.outcome]}`, order: severity(worst.outcome), detail: hint };
}

/**
 * Düzenleyicinin tarama işaretleri: egzersiz → ağrı dikkati ve bilgi rozeti (yalnız birini taşıyan hareketler).
 * `titleOf` ipucundaki gerileme/ilerleme adları (kısıtın yasakladığı hareket için undefined: önerilmez); `suppress`
 * etkin kısıtlı tarafı asimetriden çıkarır (kısıt onayı varsa).
 */
export function screeningMarks(
  screenings: readonly Screening[],
  items: readonly { id: string; pattern?: MovementPattern | undefined }[],
  options: { titleOf: (id: string) => string | undefined; suppress?: SideSuppress | undefined },
): Record<string, ScreeningMark> {
  const marks: Record<string, ScreeningMark> = {};
  const pains = painWarnings(screenings);
  const latest = newestFirst(screenings).find((item) => item.protocol === SCREENING_PROTOCOL);
  const openKeys = new Set(painHistory(screenings).open.filter((pain) => pain.date === latest?.date).map((pain) => pain.key));
  const summaries = new Map<MovementPattern, TestSummary[]>();
  if (latest) {
    const cells = cellsOf(latest);
    const hints = screeningHints(latest, options.titleOf, options.suppress);
    for (const testId of SCREENING_TEST_IDS) {
      const hint = hints
        .filter((item) => item.testId === testId)
        .map((item) => item.text)
        .join(' ');
      const summary = testSummary(
        testId,
        cells.filter((cell) => cell.testId === testId),
        openKeys,
        hint,
      );
      if (!summary) continue;
      for (const pattern of SCREENING_TESTS[testId].patterns) summaries.set(pattern, [...(summaries.get(pattern) ?? []), summary]);
    }
  }
  for (const item of items) {
    if (!item.pattern) continue;
    const pain = pains.get(item.pattern) ?? [];
    const tests = [...(summaries.get(item.pattern) ?? [])].sort((a, b) => a.order - b.order || SCREENING_TEST_IDS.indexOf(a.testId) - SCREENING_TEST_IDS.indexOf(b.testId));
    const first = tests[0];
    const info = first
      ? {
          label: `Tarama: ${first.label}${tests.length > 1 ? ` · +${tests.length - 1}` : ''}`,
          detail: tests.map((test) => test.detail || `${test.label}.`).join(' '),
        }
      : undefined;
    if (pain.length === 0 && !info) continue;
    marks[item.id] = { pain, ...(info ? { info } : {}) };
  }
  return marks;
}
