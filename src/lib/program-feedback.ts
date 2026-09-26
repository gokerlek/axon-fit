import { locateRow, plainSets, setClientTarget, sameSets, targetLabel } from './client-targets.ts';
import { formatKg, formatNumber } from './format.ts';
import { appendLog, capChanges, type ClientTargets, type ProgramChange, type ProgramLogEntry, type ProgramPhase } from './program-plan.ts';
import { gridOf, isOverload, type SuggestionReason, type TrackingType } from './progression.ts';
import { parseProposals, serializeProposals, upsertProposals, type ProposalInput, type ProposalKind } from './proposals.ts';
import type {
  FeedbackAnswer,
  FeedbackDecision,
  FinishFeedback,
  NoticeKind,
  SessionDoc,
  SessionEntry,
  SessionSet,
  SkipReason,
} from './schemas/session.ts';
import { setsText, SET_LIMITS, type SetSpec } from './set-plan.ts';
import { FALLBACK_REST_SECONDS, TEMPLATE_LIMITS, type TemplateRow } from './template-plan.ts';
import { entryForRow, type Stamp } from './workout-cursor.ts';
import { extraKey, type ExtraRows, type RowPrevious, type WorkoutDay, type WorkoutRow } from './workout-plan.ts';

/**
 * Program güncelleme (tasarım §2.7 c, §6; PT kararı 6) — saf. Bitişte plan ile yapılanın farkı çıkarılır
 * ve tek soruyla sorulur: "Programını güncelleyelim mi?" Maddeler hazır seçimle gelir; "Evet, güncelle"
 * seçilileri uygular, "Hayır, aynı kalsın" hiçbirini, "Tek tek seç" danışanın işaretlediklerini.
 *
 * Satır başına, `oneOff` olmayan çalışma setleriyle (§6.1):
 * - **Ağırlık yukarı** (tam yük setlerinin en ağırı planın en az bir adım üstü, bu setlerde tekrar alt
 *   sınırda ya da üstünde): doğrudan, seçili "Bundan sonra W". Onaylı aşırı yükte seçili değil ("Bir
 *   defalık"). Kilo programda yazılı değildir (motor geçmişten planlar): uygulamak geçmişe danışan kaydı
 *   yazmaktır. İşaretsiz → `oneOff` (motor bu seansı yok sayar).
 * - **Ağırlık aşağı** (bütün tam yük setleri planın en az bir adım altı): doğrudan, seçili. İşaretsiz →
 *   `lighter` (§5.5: ilk kez nötr, ikincide kaçırma).
 * - **Tekrar/süre hedefi** (vücut ağırlığı ve süreli harekette; ağırlıklıda yalnız cihazın tavanında):
 *   bütün setler hedefin tepesinin 2 tekrar (süre: 10 sn) üstünde, bu ve önceki antrenmanda (2-for-2) →
 *   hedef kayar; bütün setler alt sınırın altında, üst üste 2 antrenman → hedef iner (ağırlıklıda iniş
 *   motorun işi). Genişlik korunur: yukarıda en düşük sete göre (8–12, en düşük set 14 → 10–14), aşağıda
 *   en iyi sete göre. Düz setlerde doğrudan (`clientTargets`), piramit/back-off/AMRAP'ta PT'ye öneri.
 * - **Set sayısı** (yapılan çalışma seti plandan fazla ya da bilerek geçilip az, aynı yönde üst üste 2 antrenman),
 *   **hareket geçildi** (aynı satır aynı nedenle üst üste 2 antrenman; "Hareketi geç" ile, erken bitişte yalnız
 *   yapılmadan kalan sayılmaz) → PT'ye öneri, seçili. **"Değiştir"** ile
 *   yapılan muadil ve **eklenen hareket** → PT'ye öneri, seçili değil. Öneri katmanının set artışı
 *   (`algo_sets`, §5.6) dışarıdan gelir, seçili.
 * - **Cevapsız** (sheet kararsız kapandı): yukarı ağırlık sayılır, aşağı `lighter`, hedef değişmez, öneri gitmez
 *   (açık soru 1).
 *
 * Sunucu tarafı (`planProgramFeedback`): kararlar seans belgesiyle yeniden denetlenir; kilo ve hedef
 * `program.json`'a danışan kaydı olarak (log türü `client`, `sessionId`'li, revision artmaz; hedef
 * `clientTargets`'e), öneriler `proposals.json`'a. Hedefin dayandığı setler o arada değiştiyse (PT
 * kaydetti) doğrudan yazılmaz, öneriye döner. Aynı seansın kaydı ikinci kez eklenmez.
 */

/** Ağırlık maddesi bu gerekçelerle planlanan harekette sorulmaz: plan zaten bilinçli olarak hafif ya da ağrıya göre. */
const WEIGHT_SKIP_REASONS: ReadonlySet<SuggestionReason> = new Set(['deload', 'pain_hold', 'pain_reduce', 'pain_reduce_unavailable', 'paused']);
/** Tekrar hedefi kayması için tepenin üstü: tekrar ve süre (sn). */
export const TARGET_MARGIN = { reps: 2, seconds: 10 } as const;

const EPSILON = 1e-6;

export type FeedbackMode = 'direct' | 'proposal';

/** Bitiş sheet'inin bir maddesi. */
export type FeedbackItem = Omit<FeedbackDecision, 'apply'> & {
  /** Maddenin anahtarı (tür + satır): sheet'teki onay kutusu. */
  key: string;
  /** `direct`: "Evet"le programa yazılır; `proposal`: antrenörüne öneri. */
  mode: FeedbackMode;
  /** Hazır seçim (§6.1 "Sheet'te seçili"). */
  checked: boolean;
  /** Sheet'teki satır: "Bench Press: bundan sonra 65 kg". */
  text: string;
  /** İşaretsizken ne olur ya da öneri notu: "İşaretsiz: bir defalık (60 kg kalır)", "Antrenörüne öner". */
  hint: string;
};

/** Öneri katmanının set artışı (§5.6; `recommend.ts`): bitişte "Antrenörüne öner: Bench Press 3 → 4 set". */
export type SetSuggestion = { rowId: string; from: number; to: number; why: string };

const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  busy: 'Alet dolu',
  no_equipment: 'Ekipman yok',
  no_time: 'Zamanım yok',
  tired: 'Yoruldum',
  other: 'Diğer',
};

function working(entry: Pick<SessionEntry, 'sets'>): SessionSet[] {
  return entry.sets.filter((set) => set.type === 'working');
}

function valueOf(set: Pick<SessionSet, 'reps' | 'seconds'>): number {
  return set.reps ?? set.seconds ?? 0;
}

/** Hedefin kısa anlatımı: "10–14 tekrar", "40–60 sn"; düz olmayanda setlerin kısa biçimi. */
function targetPhrase(sets: readonly SetSpec[], trackingType: TrackingType): string {
  if (!plainSets(sets)) return setsText(sets, trackingType);
  const label = targetLabel(sets, trackingType);
  return trackingType === 'duration' ? label : `${label} tekrar`;
}

/**
 * Hedef kaydırma: her set aynı miktarda (`delta`) kayar, genişlik korunur; alt sınır 1, üst sınır tekrarda
 * 100, sürede 3600 (SPEC sınırları). Sınıra dayanan sette genişlik sınırdan geriye doğru korunur.
 */
export function shiftSets(sets: readonly SetSpec[], delta: number, trackingType: TrackingType): SetSpec[] {
  const limit = trackingType === 'duration' ? TEMPLATE_LIMITS.secondsMax : TEMPLATE_LIMITS.repsMax;
  return sets.map((set) => {
    const width = set.max - set.min;
    let min = set.min + delta;
    let max = set.max + delta;
    if (min < 1) {
      min = 1;
      max = Math.min(limit, 1 + width);
    }
    if (max > limit) {
      max = limit;
      min = Math.max(1, limit - width);
    }
    return { ...set, min, max };
  });
}

type RowContext = {
  day: WorkoutDay;
  row: TemplateRow;
  plan: WorkoutRow;
  entry: SessionEntry;
  doc: SessionDoc;
};

function base(context: RowContext): Pick<FeedbackItem, 'entryId' | 'rowId' | 'dayId' | 'exerciseId' | 'title' | 'trackingType'> {
  return {
    entryId: context.entry.id,
    rowId: context.row.id,
    dayId: context.day.dayId,
    exerciseId: context.plan.exerciseId,
    title: context.plan.title,
    trackingType: context.plan.trackingType,
  };
}

/** Planın o günkü set sayısı: setlere yazılmış plan (hafifletmede daha az), yoksa satırın setleri. */
function plannedCount(sets: readonly SessionSet[], row: TemplateRow): number {
  const recorded = sets.reduce((max, set) => Math.max(max, set.plannedSetCount ?? 0), 0);
  return recorded > 0 ? recorded : row.sets.length;
}

function weightItem(context: RowContext): FeedbackItem | null {
  const { plan, entry, doc } = context;
  const grid = plan.trackingType === 'weight_reps' ? gridOf(plan.spec) : null;
  const top = plan.plan.topWeightKg;
  if (!grid || top <= 0 || WEIGHT_SKIP_REASONS.has(plan.plan.reason) || doc.adjust === 'lighter' || entry.oneOff || entry.lighter) return null;
  const full = working(entry).filter((set) => !set.extra && set.target?.loadPct === undefined && set.kg !== undefined);
  if (full.length === 0) return null;
  const heaviest = Math.max(...full.map((set) => set.kg as number));
  const upStep = grid.up(top, 1);
  if (heaviest > top + EPSILON && heaviest >= upStep - EPSILON) {
    const topSets = full.filter((set) => Math.abs((set.kg as number) - heaviest) < EPSILON);
    if (!topSets.every((set) => valueOf(set) >= (set.target?.min ?? 0))) return null;
    const overload = full.some((set) => set.overload) || isOverload(top, heaviest);
    return {
      ...base(context),
      key: `weight:${context.row.id}`,
      kind: 'weight_up',
      mode: 'direct',
      checked: !overload,
      kg: { from: top, to: heaviest, ...(overload ? { overload: true } : {}) },
      text: `${plan.title}: bundan sonra ${formatKg(heaviest)}`,
      hint: `İşaretsiz: bir defalık (${formatKg(top)} kalır)`,
    };
  }
  const below = grid.below(top, top);
  if (below < top - EPSILON && full.every((set) => (set.kg as number) <= below + EPSILON)) {
    return {
      ...base(context),
      key: `weight:${context.row.id}`,
      kind: 'weight_down',
      mode: 'direct',
      checked: true,
      kg: { from: top, to: heaviest },
      text: `${plan.title}: bundan sonra ${formatKg(heaviest)}`,
      hint: `İşaretsiz: bu seferlik (${formatKg(top)} kalır)`,
    };
  }
  return null;
}

function targetItem(context: RowContext): FeedbackItem | null {
  const { plan, entry, row } = context;
  const weighted = plan.trackingType === 'weight_reps';
  if (weighted && plan.plan.reason !== 'device_max') return null;
  if (entry.oneOff) return null;
  const counted = working(entry)
    .filter((set) => !set.extra)
    .sort((a, b) => (a.setIndex ?? 0) - (b.setIndex ?? 0));
  const planned = plannedCount(working(entry), row);
  const previous = plan.previous;
  if (counted.length < planned || counted.length === 0 || !previous) return null;
  const sets = row.sets;
  const targetAt = (index: number | undefined): SetSpec => sets[index ?? 0] ?? (sets[0] as SetSpec);
  const targetOf = (set: SessionSet): SetSpec => set.target ?? targetAt(set.setIndex);
  const margin = plan.trackingType === 'duration' ? TARGET_MARGIN.seconds : TARGET_MARGIN.reps;
  // AMRAP setinde tepeyi aşmak olağandır: varsa AMRAP'sız setler karar verir.
  const plainNow = counted.filter((set) => !targetOf(set).amrap);
  const now = plainNow.length > 0 ? plainNow : counted;
  const plainBefore = previous.values.filter((item) => !targetAt(item.setIndex).amrap);
  const before = plainNow.length > 0 ? plainBefore : previous.values;
  if (before.length < now.length) return null;

  let delta = 0;
  let direction: 'up' | 'down' | null = null;
  if (now.every((set) => valueOf(set) >= targetOf(set).max + margin) && before.every((item) => item.value >= targetAt(item.setIndex).max + margin)) {
    direction = 'up';
    delta = Math.min(...now.map((set) => valueOf(set) - targetOf(set).max));
  } else if (!weighted && now.every((set) => valueOf(set) < targetOf(set).min) && before.every((item) => item.value < targetAt(item.setIndex).min)) {
    direction = 'down';
    delta = Math.max(...now.map((set) => valueOf(set) - targetOf(set).min));
  }
  if (!direction || delta === 0) return null;
  const to = shiftSets(sets, delta, plan.trackingType);
  if (sameSets(to, sets)) return null;
  const direct = plainSets(sets);
  const unit = plan.trackingType === 'duration' ? `${margin} sn` : `${margin} tekrar`;
  return {
    ...base(context),
    key: `target:${row.id}`,
    kind: 'target',
    mode: direct ? 'direct' : 'proposal',
    checked: true,
    target: { from: sets.map((set) => ({ ...set })), to },
    text: `${plan.title}: hedef ${targetPhrase(to, plan.trackingType)}`,
    hint: direct ? 'İşaretsiz: hedef aynı kalır' : 'Antrenörüne öner',
    why: direction === 'up' ? `2 antrenmandır bütün setlerde hedefin en az ${unit} üstü` : '2 antrenmandır bütün setlerde hedefin altı',
  };
}

function setsItem(context: RowContext, previous: RowPrevious | undefined): FeedbackItem | null {
  const { plan, entry, row, doc } = context;
  if (!previous || previous.planned === 0) return null;
  const sets = working(entry);
  const done = sets.length;
  const planned = plannedCount(sets, row);
  // Az: bilerek geçilen setler ("Hareketi geç"); erken bitişte yapılmadan kalanlar sayılmaz.
  const now = done > planned ? 'up' : done < planned && skippedOn(entry) ? 'down' : null;
  const before = previous.done > previous.planned ? 'up' : previous.done < previous.planned && previous.done > 0 && previous.skipped ? 'down' : null;
  if (!now || now !== before || (now === 'down' && doc.adjust === 'lighter')) return null;
  const from = row.sets.length;
  const to = now === 'up' ? Math.min(done, previous.done, SET_LIMITS.perRow) : Math.max(done, previous.done, 1);
  if (to === from) return null;
  return {
    ...base(context),
    key: `sets:${row.id}`,
    kind: 'sets',
    mode: 'proposal',
    checked: true,
    count: { from, to },
    text: `${plan.title}: ${formatNumber(from)} → ${formatNumber(to)} set`,
    hint: 'Antrenörüne öner',
    why: done === previous.done ? `2 antrenmandır ${formatNumber(done)} set yapıldı` : `Son 2 antrenmanda ${formatNumber(previous.done)} ve ${formatNumber(done)} set yapıldı`,
  };
}

/** Bilerek geçildi: Geçilenler'de ya da sona alındı. Erken bitişte yalnız yapılmadan kalan hareket geçilmiş sayılmaz. */
function skippedOn(entry: Pick<SessionEntry, 'status' | 'skip'>): boolean {
  return entry.status === 'skipped' || entry.skip?.moved === true;
}

function removeItem(context: RowContext): FeedbackItem | null {
  const { plan, entry } = context;
  const previous = plan.previous;
  if (!skippedOn(entry) || !previous?.skipped || previous.done > 0 || (entry.skip?.reason ?? null) !== (previous.reason ?? null)) return null;
  const reason = entry.skip?.reason;
  return {
    ...base(context),
    key: `remove:${context.row.id}`,
    kind: 'remove',
    mode: 'proposal',
    checked: true,
    text: `${plan.title}: çıkar ya da değiştir`,
    hint: 'Antrenörüne öner',
    why: `2 antrenmandır geçildi${reason ? ` (${SKIP_REASON_LABELS[reason]})` : ''}`,
  };
}

/**
 * Bitişin maddeleri (telefonda): `day` başlangıçtaki gün (programın satırları; muadiller ve eklenenler
 * olmadan), `extras` muadil ve eklenen hareketlerin planları. Önce doğrudan maddeler, sonra öneriler;
 * satır sırasıyla.
 */
export function feedbackItems(input: { day: WorkoutDay; doc: SessionDoc; extras: ExtraRows; suggestions?: readonly SetSuggestion[] }): FeedbackItem[] {
  const { day, doc } = input;
  const direct: FeedbackItem[] = [];
  const proposals: FeedbackItem[] = [];
  const push = (item: FeedbackItem | null) => {
    if (item) (item.mode === 'direct' ? direct : proposals).push(item);
  };
  const rowsWithSets = new Set<string>();

  for (const block of day.blocks) {
    for (const row of block.rows) {
      const plan = day.rows[row.id];
      const entry = plan ? entryForRow(doc.entries, row.id) : undefined;
      if (!plan || !entry) continue;
      const context: RowContext = { day, row, plan, entry, doc };
      const sets = working(entry);
      if (entry.swappedFrom === row.id) {
        if (sets.length === 0 || entry.exerciseId === row.exerciseId) continue;
        const extra = input.extras[extraKey(row.id, entry.exerciseId)];
        const swapSets = extra && !sameSets(extra.template.sets, row.sets) ? extra.template.sets.map((set) => ({ ...set })) : undefined;
        push({
          ...base(context),
          key: `swap:${row.id}`,
          kind: 'swap',
          mode: 'proposal',
          checked: false,
          swap: { exerciseId: entry.exerciseId, title: entry.title, ...(swapSets ? { sets: swapSets } : {}) },
          text: `${plan.title} yerine ${entry.title}`,
          hint: 'Antrenörüne öner: bundan sonra bu',
          why: `Bu antrenmanda ${entry.title} yapıldı`,
        });
        continue;
      }
      if (sets.length === 0) {
        push(removeItem(context));
        continue;
      }
      rowsWithSets.add(row.id);
      push(weightItem(context));
      push(targetItem(context));
      push(setsItem(context, plan.previous));
    }
  }

  for (const entry of doc.entries) {
    if (!entry.added || entry.rowId || entry.swappedFrom || working(entry).length === 0) continue;
    const extra = input.extras[extraKey(entry.id, entry.exerciseId)];
    const logged = working(entry)
      .filter((set) => !set.extra && set.target)
      .map((set) => ({ ...(set.target as SetSpec) }));
    const sets = extra?.template.sets.map((set) => ({ ...set })) ?? logged;
    if (sets.length === 0) continue;
    const trackingType: TrackingType = extra?.row.trackingType ?? (working(entry)[0]?.seconds !== undefined ? 'duration' : 'bodyweight_reps');
    push({
      key: `add:${entry.id}`,
      kind: 'add',
      mode: 'proposal',
      checked: false,
      entryId: entry.id,
      dayId: day.dayId,
      exerciseId: entry.exerciseId,
      title: entry.title,
      trackingType,
      add: { sets: sets.slice(0, SET_LIMITS.perRow), restSeconds: extra?.restSeconds ?? FALLBACK_REST_SECONDS },
      text: `${entry.title} ekle`,
      hint: 'Antrenörüne öner: programa ekle',
      why: 'Bu antrenmanda eklendi',
    });
  }

  for (const suggestion of input.suggestions ?? []) {
    const plan = day.rows[suggestion.rowId];
    const entry = plan ? entryForRow(doc.entries, suggestion.rowId) : undefined;
    // Bugün yapılmayan (geçilen) ya da muadille yapılan satıra set artışı önerilmez; danışanın set önerisi varsa o yeter.
    if (!plan || !entry || entry.swappedFrom || entry.status === 'skipped' || working(entry).length === 0) continue;
    if (proposals.some((item) => item.kind === 'sets' && item.rowId === suggestion.rowId)) continue;
    proposals.push({
      key: `algo_sets:${suggestion.rowId}`,
      kind: 'algo_sets',
      mode: 'proposal',
      checked: true,
      entryId: entry.id,
      rowId: suggestion.rowId,
      dayId: day.dayId,
      exerciseId: plan.exerciseId,
      title: plan.title,
      trackingType: plan.trackingType,
      count: { from: suggestion.from, to: suggestion.to },
      text: `${plan.title}: ${formatNumber(suggestion.from)} → ${formatNumber(suggestion.to)} set`,
      hint: 'Antrenörüne öner',
      why: suggestion.why,
    });
  }
  return [...direct, ...proposals];
}

/* --- cevap --- */

/**
 * Cevabın kararları: "Evet" hazır seçimi uygular, "Tek tek seç" işaretlileri, "Hayır" hiçbirini; cevapsız
 * yalnız (aşırı yük olmayan) yukarı ağırlığı sayar.
 */
export function resolveFeedback(items: readonly FeedbackItem[], answer: FeedbackAnswer, picked: ReadonlySet<string> = new Set()): FinishFeedback {
  const apply = (item: FeedbackItem): boolean => {
    switch (answer) {
      case 'yes':
        return item.checked;
      case 'pick':
        return picked.has(item.key);
      case 'no':
        return false;
      case 'none':
        return item.kind === 'weight_up' && !item.kg?.overload;
    }
  };
  return {
    answer,
    items: items.map((item) => {
      const { key: _key, mode: _mode, checked: _checked, text: _text, hint: _hint, ...decision } = item;
      return { ...decision, apply: apply(item) };
    }),
  };
}

/**
 * Kararların seansa izi (§6.2): uygulanmayan yukarı ağırlık `oneOff` (motor o seansı yok sayar), aşağı
 * ağırlık `lighter` (ilk kez nötr). Zaten işaretliyse dokunulmaz (değişiklik saati kaymaz).
 */
export function withFeedbackFlags(doc: SessionDoc, decisions: readonly FeedbackDecision[], stamp: Stamp): SessionDoc {
  const flags = new Map<string, 'oneOff' | 'lighter'>();
  for (const decision of decisions) {
    if (decision.apply) continue;
    if (decision.kind === 'weight_up') flags.set(decision.entryId, 'oneOff');
    else if (decision.kind === 'weight_down') flags.set(decision.entryId, 'lighter');
  }
  if (flags.size === 0) return doc;
  let changed = false;
  const entries = doc.entries.map((entry) => {
    const flag = flags.get(entry.id);
    if (!flag || entry[flag]) return entry;
    changed = true;
    return { ...entry, [flag]: true, updatedAt: stamp.at, by: stamp.by };
  });
  return changed ? { ...doc, entries } : doc;
}

/** Özet sheet'i: seçili maddelerden en çok 3 satır (önce doğrudan olanlar), kalanı "+n"; seçili olmayan sayısı. */
export function feedbackSummary(items: readonly FeedbackItem[], checked: ReadonlySet<string>): { lines: FeedbackItem[]; more: number; unchecked: number } {
  const on = items.filter((item) => checked.has(item.key));
  const ordered = [...on.filter((item) => item.mode === 'direct'), ...on.filter((item) => item.mode === 'proposal')];
  return { lines: ordered.slice(0, 3), more: Math.max(0, ordered.length - 3), unchecked: items.length - on.length };
}

/** Bitişten sonra danışana: "Programın güncellendi" / "Önerin antrenörüne gönderildi" ve ayrıntısı; bir şey yoksa null. */
export function feedbackMessage(outcome: FeedbackOutcome): { title: string; description: string } | null {
  if (outcome.direct === 0 && outcome.proposals === 0) return null;
  if (outcome.converted > 0) return { title: 'Program o arada değişti; önerin antrenörüne gönderildi.', description: 'Antrenörün onaylayınca programına yazılır.' };
  if (outcome.direct > 0) {
    return {
      title: 'Programın güncellendi',
      description: outcome.proposals > 0 ? `${formatNumber(outcome.proposals)} öneri antrenörünün onayında` : 'Antrenörüne bildirildi',
    };
  }
  return { title: 'Önerin antrenörüne gönderildi', description: 'Antrenörün onaylayınca programına yazılır.' };
}

/* --- sunucu: kararları programa ve önerilere yazmak --- */

export type FeedbackOutcome = {
  /** Programa doğrudan yazılan (kilo ve hedef) madde sayısı. */
  direct: number;
  /** Antrenöre giden öneri sayısı. */
  proposals: number;
  /** Doğrudan yazılacakken program o arada değiştiği için öneriye dönen. */
  converted: number;
};

type FeedbackProgram = {
  revision: number;
  phases: ProgramPhase[];
  clientTargets?: ClientTargets | undefined;
  log: ProgramLogEntry[];
};

export type ProgramFeedbackPlan = {
  /** `program.json`'un yeni ham içeriği (bilinmeyen alanlar korunur); değişmediyse null. */
  program: Record<string, unknown> | null;
  /** `proposals.json`'un yeni içeriği; değişmediyse null. */
  proposals: { version: 1; items: unknown[] } | null;
  /** Program geçmişine giden cümleler (commit mesajı için). */
  changes: ProgramChange[];
  outcome: FeedbackOutcome;
  /** Seansın bildirimleri: `program_update` (doğrudan), `proposal` (öneri). */
  notices: NoticeKind[];
};

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Kararın seans belgesiyle tutarlılığı: hareket kaydı var, hareketi aynı; kiloda yapılan set var; muadil ve ekleme kendi kaydında. */
function consistent(decision: FeedbackDecision, doc: SessionDoc): SessionEntry | null {
  const entry = doc.entries.find((item) => item.id === decision.entryId);
  if (!entry) return null;
  switch (decision.kind) {
    case 'weight_up':
    case 'weight_down':
      return entry.rowId === decision.rowId && entry.exerciseId === decision.exerciseId && decision.kg && working(entry).some((set) => set.kg === decision.kg?.to)
        ? entry
        : null;
    case 'swap':
      return decision.swap && entry.swappedFrom === decision.rowId && entry.exerciseId === decision.swap.exerciseId ? entry : null;
    case 'add':
      return entry.added && !entry.rowId && entry.exerciseId === decision.exerciseId && decision.add ? entry : null;
    case 'target':
      return decision.target && decision.target.from.length === decision.target.to.length && (entry.rowId === decision.rowId || entry.swappedFrom === decision.rowId)
        ? entry
        : null;
    case 'sets':
    case 'algo_sets':
    case 'remove':
      return decision.rowId && (entry.rowId === decision.rowId || entry.swappedFrom === decision.rowId) ? entry : null;
  }
}

/** Önerinin metni (PT'nin kartı, bildirim): "Leg Press 3 → 4 set", "Bench Press yerine Dumbbell Press". */
export function proposalText(decision: Pick<FeedbackDecision, 'kind' | 'title' | 'trackingType' | 'count' | 'target' | 'swap'> & { entryTitle?: string }): string {
  switch (decision.kind) {
    case 'sets':
    case 'algo_sets':
      return `${decision.title} ${formatNumber(decision.count?.from ?? 0)} → ${formatNumber(decision.count?.to ?? 0)} set`;
    case 'target':
      return decision.target
        ? `${decision.title} ${setsText(decision.target.from, decision.trackingType)} → ${setsText(decision.target.to, decision.trackingType)}`
        : decision.title;
    case 'swap':
      return `${decision.title} yerine ${decision.swap?.title ?? decision.entryTitle ?? ''}`.trim();
    case 'remove':
      return `${decision.title}: çıkar ya da değiştir`;
    case 'add':
      return `${decision.entryTitle ?? decision.title} ekle`;
    default:
      return decision.title;
  }
}

/**
 * Bitişin program yazımı (tek commit'in parçası, §4.7): uygulanacak kararlar seans belgesiyle denetlenir;
 * kilo ve hedef danışan kaydı olarak programa (revision artmaz; kayıt `sessionId`'li, aynı seansın kaydı
 * varsa hiçbiri yeniden yazılmaz), öneriler `proposals.json`'a (seans + satır + tür ile upsert). Hedefin
 * dayandığı setler değiştiyse (PT o arada kaydetti ya da satır silindi) öneriye döner (`converted`).
 * `rawProgram`: dosyanın ham içeriği (bilinmeyen alanlar düşmesin); `program` onun ayrıştırılmışı.
 */
export function planProgramFeedback(input: {
  doc: SessionDoc;
  feedback: FinishFeedback | undefined;
  program: FeedbackProgram | null;
  rawProgram: Record<string, unknown> | null;
  proposals: unknown;
  now: Date;
  random?: (n: number) => Uint8Array;
}): ProgramFeedbackPlan {
  const { doc, program } = input;
  const at = doc.finishedAt ?? input.now.toISOString();
  const outcome: FeedbackOutcome = { direct: 0, proposals: 0, converted: 0 };
  const empty: ProgramFeedbackPlan = { program: null, proposals: null, changes: [], outcome, notices: [] };
  const decisions = (input.feedback?.items ?? []).filter((item) => item.apply);
  if (decisions.length === 0) return empty;
  // Aynı seansın danışan kaydı varsa bitiş zaten uygulanmıştır (yeniden deneme): program yeniden yazılmaz.
  const applied = program?.log.some((entry) => entry.kind === 'client' && entry.sessionId === doc.id) ?? false;

  const lines: ProgramChange[] = [];
  const proposals: ProposalInput[] = [];
  let targets = program?.clientTargets;
  const dayScope = doc.program?.dayName;
  const scopeOf = (rowId: string | undefined) => (rowId && program ? (locateRow(program.phases, rowId)?.dayName ?? dayScope) : dayScope);
  const line = (rowId: string | undefined, text: string) => {
    const scope = scopeOf(rowId);
    lines.push({ ...(scope ? { scope } : {}), text });
  };
  const propose = (decision: FeedbackDecision & { kind: ProposalKind }, entry: SessionEntry, override?: string) => {
    const why = override ?? decision.why;
    proposals.push({
      at,
      sessionId: doc.id,
      dayId: decision.dayId,
      ...(decision.rowId ? { rowId: decision.rowId } : {}),
      exerciseId: decision.exerciseId,
      title: clip(decision.title, 120),
      kind: decision.kind,
      ...(decision.count ? { from: decision.count.from, to: decision.count.to } : {}),
      ...(decision.target ? { target: decision.target } : {}),
      ...(decision.swap ? { swap: decision.swap } : {}),
      ...(decision.add ? { add: decision.add } : {}),
      text: clip(proposalText({ ...decision, entryTitle: entry.title }), 300),
      ...(why ? { why: clip(why, 300) } : {}),
    });
  };

  for (const decision of decisions) {
    const entry = consistent(decision, doc);
    if (!entry) continue;
    switch (decision.kind) {
      case 'weight_up':
      case 'weight_down': {
        const kg = decision.kg as NonNullable<FeedbackDecision['kg']>;
        line(decision.rowId, `${decision.title}: çalışma ağırlığı ${formatNumber(kg.from)} → ${formatKg(kg.to)}`);
        outcome.direct += 1;
        break;
      }
      case 'target': {
        const target = decision.target as NonNullable<FeedbackDecision['target']>;
        const direct = plainSets(target.from) && plainSets(target.to);
        const result =
          direct && program && decision.rowId
            ? setClientTarget(program.phases, targets, { rowId: decision.rowId, from: target.from, to: target.to, sessionId: doc.id, at })
            : null;
        if (result && result.status !== 'conflict') {
          targets = result.clientTargets;
          line(decision.rowId, `${decision.title} ${setsText(target.from, decision.trackingType)} → ${setsText(target.to, decision.trackingType)}`);
          outcome.direct += 1;
          break;
        }
        if (direct) outcome.converted += 1;
        propose({ ...decision, kind: 'target' }, entry, direct ? 'Program o arada değişti; danışanın hedef önerisi' : undefined);
        outcome.proposals += 1;
        break;
      }
      case 'sets':
      case 'algo_sets':
        if (!decision.count || decision.count.from === decision.count.to) break;
        propose({ ...decision, kind: decision.kind }, entry);
        outcome.proposals += 1;
        break;
      case 'swap':
      case 'remove':
      case 'add':
        propose({ ...decision, kind: decision.kind }, entry);
        outcome.proposals += 1;
        break;
    }
  }

  let nextProgram: Record<string, unknown> | null = null;
  if (lines.length > 0 && program && input.rawProgram && !applied) {
    const { clientTargets: _previous, ...raw } = input.rawProgram;
    const log = appendLog(program.log, { at, revision: program.revision, kind: 'client', sessionId: doc.id, changes: capChanges(lines) });
    nextProgram = { ...raw, ...(targets ? { clientTargets: targets } : {}), log };
  }

  let nextProposals: ProgramFeedbackPlan['proposals'] = null;
  if (proposals.length > 0) {
    const upserted = upsertProposals(parseProposals(input.proposals), proposals, input.random);
    if (upserted.changed) nextProposals = serializeProposals(upserted.file);
  }

  const notices: NoticeKind[] = [...(outcome.direct > 0 ? (['program_update'] as const) : []), ...(outcome.proposals > 0 ? (['proposal'] as const) : [])];
  return { program: nextProgram, proposals: nextProposals, changes: lines, outcome, notices };
}
