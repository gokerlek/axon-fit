import { locateRow, sameSets } from './client-targets.ts';
import { formatKg, formatNumber } from './format.ts';
import type { OwnProgram, OwnProgramPhase } from './own-programs.ts';
import { consistent, proposalText, type FeedbackOutcome } from './program-feedback.ts';
import { appendLog, capChanges, programIdSource, type ProgramChange, type ProgramPhase } from './program-plan.ts';
import { applyProposal, type Proposal, type ProposalKind } from './proposals.ts';
import type { FeedbackDecision, FinishFeedback, NoticeKind, SessionDoc } from './schemas/session.ts';
import { setsText, type SetSpec } from './set-plan.ts';

/**
 * Bitişin kendi program kipi (`docs/design/kendi-program.md` §3.4) — saf. Seansın günü danışanın kendi
 * programındaysa "Evde programını güncelleyelim mi?"nin kararları doğrudan programa yazılır; öneri, `proposals.json`
 * ve `clientTargets` yoktur:
 * - kilo → yalnız geçmişe kayıt (motor geçmişten planlar);
 * - tekrar/süre hedefi, set sayısı, algoritmanın set artışı, "Değiştir", ekleme, çıkarma → satırın kendisine,
 *   `applyProposal`'ın saf adımlarıyla (öneri dosyası yazılmaz).
 *
 * **O arada değişen program:** her madde satırın antrenman başındaki hâlini taşır (`row`). Programın revision'ı
 * seansınkinden farklıysa satır kayıtta aranır; yoksa ya da hareketi veya setleri farklıysa yazılmaz, `stale`
 * sayılır (silinen satır geri gelmez, PT'nin ya da öteki cihazın kaydı ezilmez). Eklemede gün yoksa yazılmaz.
 *
 * Satır değiştiyse revision +1 (açık düzenleyici 412 alır, sessiz ezilme olmaz); geçmişe `client` kaydı
 * (`sessionId`'li; aynı seansın kaydı varsa bitiş zaten uygulanmıştır, program yeniden yazılmaz).
 */

export type OwnFeedbackPlan = {
  /** Programın yeni hâli; değişmediyse null. */
  program: OwnProgram | null;
  /** Satırlar değişti mi (revision +1). */
  rowsChanged: boolean;
  /** Geçmişe giden cümleler (commit mesajı için). */
  changes: ProgramChange[];
  outcome: FeedbackOutcome;
  /** Seansın bildirimleri: `program_update` (programa yazıldı). */
  notices: NoticeKind[];
};

const ROW_KINDS: ReadonlySet<FeedbackDecision['kind']> = new Set(['target', 'sets', 'algo_sets', 'swap', 'remove', 'add']);

function rowsOf(phases: readonly OwnProgramPhase[]): Map<string, { exerciseId: string; sets: readonly SetSpec[] }> {
  return new Map(phases.flatMap((phase) => phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => [row.id, { exerciseId: row.exerciseId, sets: row.sets }] as const)))));
}

/** Satır o arada değişti mi (revision farklıyken): kayıtta yok, ya da hareketi veya setleri antrenman başındakinden farklı. */
function staleRow(decision: FeedbackDecision, rows: ReturnType<typeof rowsOf>, changed: boolean): boolean {
  if (!decision.rowId) return false;
  const stored = rows.get(decision.rowId);
  if (!stored) return true;
  if (!changed) return false;
  return !decision.row || decision.row.exerciseId !== stored.exerciseId || !sameSets(decision.row.sets, stored.sets);
}

/** Kararın öneri biçimi (`applyProposal`'ın girdisi; dosyaya yazılmaz). */
function asProposal(decision: FeedbackDecision & { kind: ProposalKind }, doc: SessionDoc, at: string): Proposal {
  return {
    id: 'pr_own000',
    at,
    sessionId: doc.id,
    dayId: decision.dayId,
    ...(decision.rowId ? { rowId: decision.rowId } : {}),
    exerciseId: decision.exerciseId,
    title: decision.title,
    kind: decision.kind,
    ...(decision.count ? { from: decision.count.from, to: decision.count.to } : {}),
    ...(decision.target ? { target: decision.target } : {}),
    ...(decision.swap ? { swap: decision.swap } : {}),
    ...(decision.add ? { add: decision.add } : {}),
    text: decision.title,
    status: 'pending',
  };
}

/** Programa yazılan maddenin cümlesi (geçmiş ve commit mesajı). */
function ownChangeText(decision: FeedbackDecision, entryTitle: string): string {
  switch (decision.kind) {
    case 'target':
      return decision.target ? `${decision.title} ${setsText(decision.target.from, decision.trackingType)} → ${setsText(decision.target.to, decision.trackingType)}` : decision.title;
    case 'remove':
      return `${decision.title} çıkarıldı`;
    case 'add':
      return `${entryTitle} eklendi`;
    default:
      return proposalText({ ...decision, entryTitle });
  }
}

export function planOwnFeedback(input: {
  doc: SessionDoc;
  feedback: FinishFeedback | undefined;
  program: OwnProgram;
  now: Date;
  random?: (n: number) => Uint8Array;
}): OwnFeedbackPlan {
  const { doc, program } = input;
  const at = doc.finishedAt ?? input.now.toISOString();
  const outcome: FeedbackOutcome = { direct: 0, proposals: 0, converted: 0, stale: 0 };
  const empty: OwnFeedbackPlan = { program: null, rowsChanged: false, changes: [], outcome, notices: [] };
  const decisions = (input.feedback?.items ?? []).filter((item) => item.apply);
  if (decisions.length === 0) return empty;
  // Aynı seansın kaydı varsa bitiş zaten uygulanmıştır (yeniden deneme): program yeniden yazılmaz.
  if (program.log.some((entry) => entry.kind === 'client' && entry.sessionId === doc.id)) return empty;

  const changedSinceStart = program.revision !== doc.program?.revision;
  const original = rowsOf(program.phases);
  const ids = programIdSource(program.phases as ProgramPhase[], input.random);
  let phases = program.phases;
  const lines: ProgramChange[] = [];
  const scopeOf = (rowId: string | undefined, dayId: string) =>
    (rowId ? locateRow(phases as ProgramPhase[], rowId)?.dayName : undefined) ??
    phases.flatMap((phase) => phase.days).find((day) => day.id === dayId)?.name ??
    doc.program?.dayName;
  const line = (scope: string | undefined, text: string) => lines.push({ ...(scope ? { scope } : {}), text });

  for (const decision of decisions) {
    const entry = consistent(decision, doc);
    if (!entry) continue;
    if (decision.kind === 'weight_up' || decision.kind === 'weight_down') {
      const kg = decision.kg as NonNullable<FeedbackDecision['kg']>;
      line(scopeOf(decision.rowId, decision.dayId), `${decision.title}: çalışma ağırlığı ${formatNumber(kg.from)} → ${formatKg(kg.to)}`);
      outcome.direct += 1;
      continue;
    }
    if (!ROW_KINDS.has(decision.kind)) continue;
    if (decision.kind === 'add' ? !phases.some((phase) => phase.days.some((day) => day.id === decision.dayId)) : staleRow(decision, original, changedSinceStart)) {
      outcome.stale = (outcome.stale ?? 0) + 1;
      continue;
    }
    // Cümlenin kapsamı yazmadan önce (çıkarılan satırın günü sonra bulunamaz).
    const scope = scopeOf(decision.rowId, decision.dayId);
    const applied = applyProposal({ phases: phases as ProgramPhase[] }, asProposal(decision as FeedbackDecision & { kind: ProposalKind }, doc, at), ids);
    if (applied.status === 'stale') {
      outcome.stale = (outcome.stale ?? 0) + 1;
      continue;
    }
    phases = applied.phases as OwnProgramPhase[];
    line(scope, ownChangeText(decision, entry.title));
    outcome.direct += 1;
  }

  if (lines.length === 0) return { ...empty, outcome };
  const rowsChanged = phases !== program.phases;
  const revision = rowsChanged ? program.revision + 1 : program.revision;
  const next: OwnProgram = {
    ...program,
    ...(rowsChanged ? { phases, revision, updatedAt: at } : {}),
    log: appendLog(program.log, { at, revision, kind: 'client', sessionId: doc.id, changes: capChanges(lines) }),
  };
  return { program: next, rowsChanged, changes: lines, outcome, notices: outcome.direct > 0 ? ['program_update'] : [] };
}
