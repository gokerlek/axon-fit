import {
  appendLog,
  capChanges,
  currentPhaseChange,
  keepHiddenPhase,
  reconcileRotation,
  type LogKind,
  type ProgramBody,
  type ProgramChange,
  type ProgramDay,
  type ProgramPhase,
  type ProgramState,
} from './program-plan.ts';
import { PROGRESSION_LABELS, RIR_LABELS, type TrackingType } from './progression.ts';
import { amrapIndexes, resizeSets, setShape, setsText, type SetSpec } from './set-plan.ts';
import {
  BLOCK_KIND_LABELS,
  DEFAULT_TRANSITION_SECONDS,
  formatRest,
  roundsOf,
  type BlockKind,
  type TemplateBlock,
  type TemplateRow,
  type TemplateTarget,
} from './template-plan.ts';

/**
 * Program geçmişi (SPEC §7.4): PT'nin her kaydında eski ve yeni program karşılaştırılır,
 * okunur Türkçe cümleler çıkar ("Gün A: Goblet Squat 3×8–12 → 12/10/8 (piramit %80/%90/%100) · Leg
 * Press: son set AMRAP · Haftada 2 → 3 gün"). Gerekçe alanı yok. Cümleler
 * `program.json`'daki geçmişe (kırpılmış; tek kırpma noktası `appendLog`) ve commit mesajına (tamamı) girer.
 *
 * Satırlar satır kimliğiyle, bloklar blok kimliğiyle, günler ve evreler kendi
 * kimlikleriyle eşlenir: sıralama ya da gruplama "sil + ekle" diye yazılmaz. Setler
 * satırla taşındığı için gruplama ve gruptan çıkarma set cümlesi üretmez.
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

/** Reçete: "3×8–12", "5×5", "3×30–60 sn" (düz setler; set başına biçim `setsText`). */
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

/** Bütün hareketlerin set sayısı aynı mı (tur değişimi grup cümlesiyle anlatılabilir). */
function uniformCount(block: TemplateBlock): boolean {
  const first = block.rows[0]?.sets.length;
  return block.rows.every((row) => row.sets.length === first);
}

/** Yalnız AMRAP işaretleri mi değişti (sayı, aralık, yüzde aynı). */
function amrapOnly(a: readonly SetSpec[], b: readonly SetSpec[]): boolean {
  return (
    a.length === b.length &&
    a.every((set, index) => {
      const other = b[index];
      return other !== undefined && set.min === other.min && set.max === other.max && set.loadPct === other.loadPct;
    })
  );
}

/** AMRAP değişiminin cümlesi: "son set AMRAP", "AMRAP 2., 3. set", "AMRAP kaldırıldı"… */
function amrapChange(a: readonly SetSpec[], b: readonly SetSpec[]): string {
  const before = setShape(a).amrap;
  const after = setShape(b).amrap;
  const single = b.length === 1;
  if (after === 'none') return before === 'last' && !single ? 'son set AMRAP kaldırıldı' : 'AMRAP kaldırıldı';
  if (after === 'last') return single ? 'AMRAP' : 'son set AMRAP';
  if (after === 'all') return 'bütün setler AMRAP';
  return `AMRAP ${amrapIndexes(b)
    .map((index) => `${index + 1}.`)
    .join(', ')} set`;
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
      // Tur cümlesi yalnız hareketlerin set sayısı önce de sonra da eşitse; değilse satır cümleleri anlatır.
      const oldRounds = roundsOf(old);
      const newRounds = roundsOf(block);
      if (oldRounds !== newRounds && uniformCount(old) && uniformCount(block)) {
        groupLines.push(`${label} (${names(block)}): ${count(oldRounds)} → ${count(newRounds)} tur`);
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

    // Gruptan çıkan satır (grup aynı türde sürdüğü için grup cümlesi yok): dağıtma değilse yazılır.
    const group = afterBlocks.get(previous.block.id);
    if (previous.block.kind !== 'single' && next.block.kind === 'single' && group && group.kind !== 'single') {
      rowLines.push(`${name} gruptan çıkarıldı (dinlenme ${restText(next.block.restSeconds)})`);
    }

    const textA = setsText(a.sets, tt(a));
    const textB = setsText(b.sets, tt(b));
    if (textA !== textB) {
      const roundsOnly =
        roundsReported.has(next.block.id) &&
        previous.block.id === next.block.id &&
        setsText(resizeSets(a.sets, b.sets.length), tt(a)) === textB;
      if (tt(a) === tt(b) && amrapOnly(a.sets, b.sets)) rowLines.push(`${name}: ${amrapChange(a.sets, b.sets)}`);
      else if (!roundsOnly) rowLines.push(`${name} ${textA} → ${textB}`);
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

/** "haftada 3 gün". */
function perWeek(daysPerWeek: number): string {
  return `haftada ${count(daysPerWeek)} gün`;
}

/** Evre özetinin parçaları: süre, sıklık, günler ("2 hafta · haftada 3 gün · Gün A, Gün B"). */
function phaseParts(phase: ProgramPhase, withDays: boolean): string {
  return [
    phase.weeks !== undefined ? weeksText(phase.weeks) : null,
    phase.daysPerWeek !== undefined ? perWeek(phase.daysPerWeek) : null,
    withDays ? phase.days.map((day) => day.name).join(', ') : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/** Sıklık değişimi: evresizde programın, evreli programda evrenin. */
function frequencyChange(before: number | undefined, after: number | undefined, phaseName: string | null): string | null {
  if (before === after) return null;
  if (phaseName === null) {
    if (before === undefined) return `Sıklık: ${perWeek(after as number)}`;
    if (after === undefined) return `Sıklık kaldırıldı (önce ${perWeek(before)})`;
    return `Haftada ${count(before)} → ${count(after)} gün`;
  }
  if (before === undefined) return `'${phaseName}' sıklığı: ${perWeek(after as number)}`;
  if (after === undefined) return `'${phaseName}' sıklığı kaldırıldı (önce ${perWeek(before)})`;
  return `'${phaseName}': haftada ${count(before)} → ${count(after)} gün`;
}

/**
 * Programın değişiklikleri, sırayla: günlerin içi, günler (ad, ekleme, silme, sıra, evre
 * değişimi), evreler (bölme/kaldırma, ad, süre, sıklık, ekleme, silme, sıra), şu anki
 * evre. Evre birden çoksa kapsam "Evre · Gün", tek evrede yalnız gün adı. Evrelere
 * bölme ve evreleri kaldırma tek cümledir: o kayıtta evre adı, süre, ekleme ve günlerin
 * evre değiştirmesi ayrıca yazılmaz. Cümleler kırpılmaz: dosyanın sınırı (300/90) `appendLog`'da.
 */
export function diffProgram(before: ProgramBody, after: ProgramBody, ctx: DiffContext): ProgramChange[] {
  const changes: ProgramChange[] = [];
  const push = (text: string, scope?: string) => changes.push({ ...(scope ? { scope } : {}), text });

  const toggledOn = !before.phased && after.phased;
  const toggledOff = before.phased && !after.phased;
  const toggled = toggledOn || toggledOff;
  const multi = after.phases.length > 1;
  const dayScope = (phase: ProgramPhase, day: ProgramDay) => (multi ? `${phase.name} · ${day.name}` : day.name);
  const phaseScope = (phase: ProgramPhase) => (multi ? phase.name : undefined);

  const phaseOfDay = (phases: readonly ProgramPhase[]) =>
    new Map(phases.flatMap((phase) => phase.days.map((day) => [day.id, { phase, day }] as const)));
  const beforeDays = phaseOfDay(before.phases);
  const afterDays = phaseOfDay(after.phases);
  const beforePhases = new Map(before.phases.map((phase) => [phase.id, phase]));
  const afterPhases = new Map(after.phases.map((phase) => [phase.id, phase]));

  // 1. Günlerin içi.
  for (const phase of after.phases) {
    for (const day of phase.days) {
      const old = beforeDays.get(day.id)?.day;
      if (!old) continue;
      for (const text of diffDay(old, day, ctx)) push(text, dayScope(phase, day));
    }
  }

  // 2. Günler: ad (programın her yerinde); her iki sürümde de olan evrelerde ekleme, silme,
  // sıra (yeni evrenin günleri evreyle birlikte yazılır); evresi değişen gün.
  for (const phase of after.phases) {
    const scope = phaseScope(phase);
    for (const day of phase.days) {
      const previous = beforeDays.get(day.id)?.day;
      if (previous && previous.name !== day.name) push(`Gün adı: '${previous.name}' → '${day.name}'`, scope);
    }
    const old = beforePhases.get(phase.id);
    if (!old) continue;
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
  // Silinen evrenin günleri evreyle birlikte yazılır; evreler kaldırılırken silinen gün ayrıca.
  if (toggledOff) {
    for (const phase of before.phases) {
      if (afterPhases.has(phase.id)) continue;
      for (const day of phase.days) if (!afterDays.has(day.id)) push(`${day.name} silindi`);
    }
  }
  if (!toggled) {
    for (const phase of after.phases) {
      for (const day of phase.days) {
        const previous = beforeDays.get(day.id);
        if (previous && previous.phase.id !== phase.id) push(`${day.name} → '${phase.name}' evresine taşındı`);
      }
    }
  }

  // 3. Evreler.
  if (toggledOn) {
    push(`Evrelere bölündü: ${after.phases.map((phase) => `'${phase.name}' (${phaseParts(phase, true)})`).join(', ')}`);
  } else if (toggledOff) {
    push(`Evreler kaldırıldı; günler tek listede: ${after.phases.flatMap((phase) => phase.days.map((day) => day.name)).join(', ')}`);
  } else {
    for (const phase of after.phases) {
      const old = beforePhases.get(phase.id);
      if (!old) continue;
      if (old.name !== phase.name) push(`Evre adı: '${old.name}' → '${phase.name}'`);
      if (old.weeks !== phase.weeks) push(`'${phase.name}' süresi: ${weeksText(old.weeks)} → ${weeksText(phase.weeks)}`);
    }
  }
  if (!toggledOn) {
    for (const phase of after.phases) {
      const old = beforePhases.get(phase.id);
      if (!old) continue;
      const text = frequencyChange(old.daysPerWeek, phase.daysPerWeek, after.phased ? phase.name : null);
      if (text) push(text);
    }
  }
  if (!toggled) {
    for (const phase of after.phases) {
      if (beforePhases.has(phase.id)) continue;
      const parts = phaseParts(phase, false);
      push(`Evre '${phase.name}' eklendi${parts ? ` (${parts})` : ''}`);
    }
    for (const phase of before.phases) {
      if (!afterPhases.has(phase.id)) push(`Evre '${phase.name}' silindi`);
    }
    const keptBefore = before.phases.filter((phase) => afterPhases.has(phase.id)).map((phase) => phase.id);
    const keptAfter = after.phases.filter((phase) => beforePhases.has(phase.id)).map((phase) => phase.id);
    if (!sameOrder(keptBefore, keptAfter)) push(`Evre sırası: ${after.phases.map((phase) => phase.name).join(', ')}`);
  }

  // 4. Şu anki evre (evreler kaldırılırken yazılmaz: tek liste kalır).
  if (!toggledOff && before.currentPhaseId !== after.currentPhaseId) {
    const to = afterPhases.get(after.currentPhaseId)?.name ?? '';
    if (toggledOn) {
      push(`Şu anki evre: '${to}'`);
    } else {
      const from = beforePhases.get(before.currentPhaseId)?.name ?? '';
      push(currentPhaseChange(from, to).text);
    }
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
 * şimdi başlar ve rotasyon onun ilk gününden; değişmediyse silinen ya da başka evreye
 * taşınan son gün uzlaştırılır. Evrelere bölme/kaldırma "Düzenlendi" kaydıdır. Evresiz program
 * evresiz kalırsa gizli evre kayıttakidir (`keepHiddenPhase`): fark gün düzeyinde, rotasyon sürer.
 * Dönen `changes` kırpılmamıştır (commit mesajı için).
 */
export function applyProgramEdit(
  stored: ProgramState,
  input: ProgramBody,
  ctx: DiffContext,
  now: Date,
): { program: ProgramState; changes: ProgramChange[] } | null {
  const body = keepHiddenPhase(stored, input);
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
    { phased: stored.phased, currentPhaseId: stored.current.phaseId, phases: stored.phases },
    { phased: body.phased, currentPhaseId: body.currentPhaseId, phases },
    ctx,
  );
  if (changes.length === 0) return null;

  const at = now.toISOString();
  const revision = stored.revision + 1;
  const currentChanged = body.currentPhaseId !== stored.current.phaseId;
  const toggled = stored.phased !== body.phased;
  const kind: LogKind = currentChanged && changes.length === 1 && !toggled ? 'phase' : 'edit';
  const { lastDayId: _dropped, ...withoutDay } = stored.rotation;

  return {
    program: {
      ...stored,
      phased: body.phased,
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
