import {
  PROGRAM_LIMITS,
  appendLog,
  capChanges,
  currentPhaseChange,
  reconcileRotation,
  type LogKind,
  type ProgramBody,
  type ProgramChange,
  type ProgramDay,
  type ProgramPhase,
  type ProgramState,
} from './program-plan.ts';
import { PROGRESSION_LABELS, RIR_LABELS, type TrackingType } from './progression.ts';
import {
  BLOCK_KIND_LABELS,
  DEFAULT_TRANSITION_SECONDS,
  formatRest,
  type BlockKind,
  type TemplateBlock,
  type TemplateRow,
  type TemplateTarget,
} from './template-plan.ts';

/**
 * Program geçmişi (SPEC §7.4): PT'nin her kaydında eski ve yeni program karşılaştırılır,
 * okunur Türkçe cümleler çıkar ("Gün A: Goblet Squat 3×8–12 → 4×6–10 · Leg Press
 * çıkarıldı"). Gerekçe alanı yok. Cümleler `program.json`'daki geçmişe (kırpılmış) ve
 * commit mesajına (tamamı) girer.
 *
 * Satırlar satır kimliğiyle, bloklar blok kimliğiyle, günler ve evreler kendi
 * kimlikleriyle eşlenir: sıralama ya da gruplama "sil + ekle" diye yazılmaz.
 *
 * Saf fonksiyonlar; yol takma adıyla çalışma zamanı içe aktarması yapmaz.
 */

export type DiffContext = {
  exercises: ReadonlyMap<string, { title: string; trackingType: TrackingType }>;
  devices: ReadonlyMap<string, { name: string }>;
};

const NOTE_EXCERPT = 60;
const SUBJECT_MAX = 72;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function count(value: number): string {
  return value.toLocaleString('tr-TR');
}

/** "8–12", "8", "30–60 sn", "45 sn". */
function targetShort(target: TemplateTarget, trackingType: TrackingType): string {
  const range = target.min === target.max ? count(target.min) : `${count(target.min)}–${count(target.max)}`;
  return trackingType === 'duration' ? `${range} sn` : range;
}

/** Reçete: "3×8–12", "5×5", "3×30–60 sn". */
export function prescriptionText(sets: number, target: TemplateTarget, trackingType: TrackingType): string {
  return `${count(sets)}×${targetShort(target, trackingType)}`;
}

function restText(seconds: number): string {
  return seconds <= 0 ? 'yok' : formatRest(seconds);
}

function weeksText(weeks: number | undefined): string {
  return weeks === undefined ? 'süresiz' : `${count(weeks)} hafta`;
}

function kindLower(kind: BlockKind): string {
  return BLOCK_KIND_LABELS[kind].toLocaleLowerCase('tr');
}

type Located = { row: TemplateRow; block: TemplateBlock };

function flatten(blocks: readonly TemplateBlock[]): Map<string, Located> {
  return new Map(blocks.flatMap((block) => block.rows.map((row) => [row.id, { row, block }] as const)));
}

function sameRule(a: TemplateRow['rule'], b: TemplateRow['rule']): boolean {
  if (!a || !b) return !a && !b;
  return a.scheme === b.scheme && a.targetRir === b.targetRir;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Bir günün değişiklikleri (kapsamsız cümleler). */
export function diffDay(before: Pick<ProgramDay, 'blocks'>, after: Pick<ProgramDay, 'blocks'>, ctx: DiffContext): string[] {
  const title = (row: TemplateRow) => ctx.exercises.get(row.exerciseId)?.title ?? row.exerciseId;
  const tt = (row: TemplateRow): TrackingType => ctx.exercises.get(row.exerciseId)?.trackingType ?? 'weight_reps';
  const names = (block: TemplateBlock) => block.rows.map(title).join(' + ');

  const beforeRows = flatten(before.blocks);
  const afterRows = flatten(after.blocks);
  const beforeBlocks = new Map(before.blocks.map((block) => [block.id, block]));
  const afterBlocks = new Map(after.blocks.map((block) => [block.id, block]));

  // Grup cümleleri önce hesaplanır (tur değişimi satırlarda tekrar yazılmasın), sonra yazılır.
  const groupLines: string[] = [];
  const roundsReported = new Set<string>();
  for (const block of after.blocks) {
    if (block.kind === 'single') continue;
    const old = beforeBlocks.get(block.id);
    const label = BLOCK_KIND_LABELS[block.kind];
    if (!old || old.kind === 'single') {
      groupLines.push(`Yeni ${kindLower(block.kind)}: ${names(block)}`);
    } else if (old.kind !== block.kind) {
      groupLines.push(`${BLOCK_KIND_LABELS[old.kind]} → ${kindLower(block.kind)}: ${names(block)}`);
    } else if (
      !sameOrder(
        old.rows.map((row) => row.id),
        block.rows.map((row) => row.id),
      ) &&
      block.rows.some((row) => {
        const previous = beforeRows.get(row.id);
        return previous !== undefined && previous.block.id !== block.id;
      })
    ) {
      groupLines.push(`${label} güncellendi: ${names(block)}`);
    }
    if (old && old.kind !== 'single') {
      if (old.sets !== block.sets) {
        groupLines.push(`${label} (${names(block)}): ${count(old.sets)} → ${count(block.sets)} tur`);
        roundsReported.add(block.id);
      }
      if (old.restSeconds !== block.restSeconds) {
        groupLines.push(`${label} (${names(block)}): tur sonu dinlenme ${restText(old.restSeconds)} → ${restText(block.restSeconds)}`);
      }
      const oldTransition = old.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
      const newTransition = block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
      if (old.kind === 'circuit' && block.kind === 'circuit' && oldTransition !== newTransition) {
        groupLines.push(`${label} (${names(block)}): istasyon arası ${restText(oldTransition)} → ${restText(newTransition)}`);
      }
    }
  }
  for (const old of before.blocks) {
    if (old.kind === 'single') continue;
    const now = afterBlocks.get(old.id);
    if (now && now.kind !== 'single') continue;
    if (old.rows.some((row) => afterRows.has(row.id))) groupLines.push(`${BLOCK_KIND_LABELS[old.kind]} dağıtıldı: ${names(old)}`);
  }

  const rowLines: string[] = [];
  for (const [rowId, next] of afterRows) {
    const previous = beforeRows.get(rowId);
    if (!previous) continue;
    const a = previous.row;
    const b = next.row;
    const name = title(b);
    if (a.exerciseId !== b.exerciseId) rowLines.push(`${title(a)} → ${name}`);

    const targetChanged = targetShort(a.target, tt(a)) !== targetShort(b.target, tt(b));
    const setsChanged =
      previous.block.sets !== next.block.sets && !(roundsReported.has(next.block.id) && previous.block.id === next.block.id);
    if (targetChanged || setsChanged) {
      rowLines.push(
        `${name} ${prescriptionText(previous.block.sets, a.target, tt(a))} → ${prescriptionText(next.block.sets, b.target, tt(b))}`,
      );
    }

    if (previous.block.kind === 'single' && next.block.kind === 'single' && previous.block.restSeconds !== next.block.restSeconds) {
      rowLines.push(`${name} dinlenme ${restText(previous.block.restSeconds)} → ${restText(next.block.restSeconds)}`);
    }

    if (!sameRule(a.rule, b.rule)) {
      rowLines.push(
        b.rule
          ? `${name} kuralı: ${PROGRESSION_LABELS[b.rule.scheme]} · ${RIR_LABELS[b.rule.targetRir] ?? `${b.rule.targetRir} tekrar yedekte`}`
          : `${name} egzersizin kuralına döndü`,
      );
    }

    if (a.deviceId !== b.deviceId) {
      rowLines.push(
        b.deviceId ? `${name} cihazı: ${ctx.devices.get(b.deviceId)?.name ?? 'silinmiş cihaz'}` : `${name} egzersizin cihazına döndü`,
      );
    }

    if ((a.note ?? '') !== (b.note ?? '')) {
      rowLines.push(b.note ? `${name} notu: “${clip(b.note, NOTE_EXCERPT)}”` : `${name} notu silindi`);
    }
  }

  const removed = [...beforeRows.values()].filter(({ row }) => !afterRows.has(row.id)).map(({ row }) => `${title(row)} çıkarıldı`);
  const added = [...afterRows.values()].filter(({ row }) => !beforeRows.has(row.id)).map(({ row }) => `${title(row)} eklendi`);

  const keptAfter = [...afterRows.keys()].filter((id) => beforeRows.has(id));
  const keptBefore = [...beforeRows.keys()].filter((id) => afterRows.has(id));
  const order = sameOrder(keptBefore, keptAfter) ? [] : ['Hareket sırası değişti'];

  return [...rowLines, ...groupLines, ...removed, ...added, ...order];
}

/**
 * Programın değişiklikleri, sırayla: günlerin içi, evrelerde gün ekleme/silme/sıra,
 * evreler (ad, süre, ekleme, silme, sıra), şu anki evre. Evre birden çoksa kapsam
 * "Evre · Gün", tek evrede yalnız gün adı.
 */
export function diffProgram(before: ProgramBody, after: ProgramBody, ctx: DiffContext): ProgramChange[] {
  const changes: ProgramChange[] = [];
  const push = (text: string, scope?: string) =>
    changes.push({ ...(scope ? { scope: clip(scope, PROGRAM_LIMITS.changeScope) } : {}), text: clip(text, PROGRAM_LIMITS.changeText) });

  const multi = after.phases.length > 1;
  const dayScope = (phase: ProgramPhase, day: ProgramDay) => (multi ? `${phase.name} · ${day.name}` : day.name);
  const phaseScope = (phase: ProgramPhase) => (multi ? phase.name : undefined);

  const beforeDays = new Map(before.phases.flatMap((phase) => phase.days.map((day) => [day.id, day] as const)));
  const afterDays = new Map(after.phases.flatMap((phase) => phase.days.map((day) => [day.id, day] as const)));
  const beforePhases = new Map(before.phases.map((phase) => [phase.id, phase]));
  const afterPhases = new Map(after.phases.map((phase) => [phase.id, phase]));

  // 1. Günlerin içi.
  for (const phase of after.phases) {
    for (const day of phase.days) {
      const old = beforeDays.get(day.id);
      if (!old) continue;
      for (const text of diffDay(old, day, ctx)) push(text, dayScope(phase, day));
    }
  }

  // 2. Her iki sürümde de olan evrelerde günler: ad, ekleme, silme, sıra.
  for (const phase of after.phases) {
    const old = beforePhases.get(phase.id);
    if (!old) continue;
    const scope = phaseScope(phase);
    for (const day of phase.days) {
      const previous = old.days.find((item) => item.id === day.id);
      if (previous && previous.name !== day.name) push(`Gün adı: '${previous.name}' → '${day.name}'`, scope);
    }
    for (const day of phase.days) {
      if (beforeDays.has(day.id)) continue;
      push(day.source ? `${day.name} eklendi ('${day.source.templateName}' şablonundan)` : `${day.name} eklendi`, scope);
    }
    for (const day of old.days) {
      if (!afterDays.has(day.id)) push(`${day.name} silindi`, scope);
    }
    const oldIds = new Set(old.days.map((day) => day.id));
    const newIds = new Set(phase.days.map((day) => day.id));
    const keptBefore = old.days.filter((day) => newIds.has(day.id)).map((day) => day.id);
    const keptAfter = phase.days.filter((day) => oldIds.has(day.id)).map((day) => day.id);
    if (!sameOrder(keptBefore, keptAfter)) push(`Gün sırası: ${phase.days.map((day) => day.name).join(', ')}`, scope);
  }

  // 3. Evreler.
  for (const phase of after.phases) {
    const old = beforePhases.get(phase.id);
    if (!old) continue;
    if (old.name !== phase.name) push(`Evre adı: '${old.name}' → '${phase.name}'`);
    if (old.weeks !== phase.weeks) push(`'${phase.name}' süresi: ${weeksText(old.weeks)} → ${weeksText(phase.weeks)}`);
  }
  for (const phase of after.phases) {
    if (!beforePhases.has(phase.id)) push(`Evre '${phase.name}' eklendi${phase.weeks !== undefined ? ` (${weeksText(phase.weeks)})` : ''}`);
  }
  for (const phase of before.phases) {
    if (!afterPhases.has(phase.id)) push(`Evre '${phase.name}' silindi`);
  }
  const keptBefore = before.phases.filter((phase) => afterPhases.has(phase.id)).map((phase) => phase.id);
  const keptAfter = after.phases.filter((phase) => beforePhases.has(phase.id)).map((phase) => phase.id);
  if (!sameOrder(keptBefore, keptAfter)) push(`Evre sırası: ${after.phases.map((phase) => phase.name).join(', ')}`);

  // 4. Şu anki evre.
  if (before.currentPhaseId !== after.currentPhaseId) {
    const from = beforePhases.get(before.currentPhaseId)?.name ?? '';
    const to = afterPhases.get(after.currentPhaseId)?.name ?? '';
    const change = currentPhaseChange(from, to);
    push(change.text);
  }

  return changes;
}

/** Aynı kapsamdaki ardışık değişiklikler tek grup. */
export function groupChanges(changes: readonly ProgramChange[]): { scope?: string; texts: string[] }[] {
  const groups: { scope?: string; texts: string[] }[] = [];
  for (const change of changes) {
    const last = groups.at(-1);
    if (last && last.scope === change.scope) last.texts.push(change.text);
    else groups.push({ ...(change.scope !== undefined ? { scope: change.scope } : {}), texts: [change.text] });
  }
  return groups;
}

/** Tek satırlık özet: "Gün A: … · … · Evre 'Güç' eklendi". */
export function formatChangeSummary(changes: readonly ProgramChange[]): string {
  return groupChanges(changes)
    .map((group) => (group.scope ? `${group.scope}: ${group.texts.join(' · ')}` : group.texts.join(' · ')))
    .join(' · ');
}

/**
 * Commit mesajı: konu satırı özet (en fazla 72 karakter), birden çok değişiklik varsa ya
 * da konu kırpıldıysa gövdede her değişiklik bir satır (kırpılmadan). Git geçmişi tam kayıttır.
 */
export function commitMessage(kind: LogKind, changes: readonly ProgramChange[]): string {
  const summary = formatChangeSummary(changes);
  const full = summary
    ? kind === 'create'
      ? summary
      : `Program: ${summary}`
    : kind === 'create'
      ? 'Program oluşturuldu'
      : 'Program güncellendi';
  const subject = clip(full, SUBJECT_MAX);
  if (changes.length <= 1 && subject === full) return subject;
  const lines = changes.map((change) => `- ${change.scope ? `${change.scope}: ` : ''}${change.text}`);
  return `${subject}\n\n${lines.join('\n')}`;
}

/**
 * PT'nin kaydı: farkı çıkarır, değişiklik yoksa `null` (hiçbir şey yazılmaz). Varsa
 * revision +1, geçmişe kayıt (en fazla 60 değişiklik), şu anki evre değiştiyse yeni evre
 * şimdi başlar ve rotasyon onun ilk gününden; değişmediyse silinen son gün uzlaştırılır.
 * Dönen `changes` kırpılmamıştır (commit mesajı için).
 */
export function applyProgramEdit(
  stored: ProgramState,
  body: ProgramBody,
  ctx: DiffContext,
  now: Date,
): { program: ProgramState; changes: ProgramChange[] } | null {
  const storedDays = new Map(stored.phases.flatMap((phase) => phase.days.map((day) => [day.id, day] as const)));
  // Düzenleyici kaynağı göndermediyse kayıttaki kaynak korunur.
  const phases = body.phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => {
      const source = storedDays.get(day.id)?.source;
      return day.source || !source ? day : { ...day, source };
    }),
  }));

  const changes = diffProgram(
    { currentPhaseId: stored.current.phaseId, phases: stored.phases },
    { currentPhaseId: body.currentPhaseId, phases },
    ctx,
  );
  if (changes.length === 0) return null;

  const at = now.toISOString();
  const revision = stored.revision + 1;
  const currentChanged = body.currentPhaseId !== stored.current.phaseId;
  const kind: LogKind = currentChanged && changes.length === 1 ? 'phase' : 'edit';
  const { lastDayId: _dropped, ...withoutDay } = stored.rotation;

  return {
    program: {
      ...stored,
      revision,
      updatedAt: at,
      phases,
      current: currentChanged ? { phaseId: body.currentPhaseId, startedAt: at } : stored.current,
      rotation: currentChanged ? withoutDay : reconcileRotation(stored.phases, phases, stored.rotation),
      log: appendLog(stored.log, { at, revision, kind, changes: capChanges(changes) }),
    },
    changes,
  };
}
