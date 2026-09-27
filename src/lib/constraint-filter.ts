import {
  activeConstraints,
  AVOID_TAGS,
  avoidMatch,
  awaitsOpinion,
  conditionsOf,
  constraintsOf,
  overridable,
  overridesOf,
  pendingReports,
  regionText,
  regionWorked,
  TRIGGER_AVOID,
  TRIGGER_LABELS,
  yourRegion,
  type CareTags,
  type ConstraintRegion,
  type ConstraintSide,
} from './constraints.ts';
import { evaluateExercise, isTagged, type Decision, type FilterContext, type FilterGroup, type FilterSummary } from './exercise-filter.ts';
import { currentPhaseOf, nextDayId } from './program-plan.ts';
import type { Constraint, HealthRecord, Override } from './schemas/health.ts';
import type { Program } from './schemas/program.ts';

/**
 * Kısıt süzgeci (tasarım `docs/design/kisit-tarama.md` §3) — saf. Danışanın kısıtları + hareketin medikal
 * etiketleri → hareket başına tek işaret; program düzenleyicisinin kütüphane sheet'i, antrenmandaki "Değiştir",
 * danışanın hareket kartındaki not, program sayfasındaki ve Genel bakış'taki çelişki bununla.
 *
 * - **Kısıt başına bağlam:** her etkin kısıtın tanısı ve gözlemi `evaluateExercise` ile o kısıtın kendi bağlamında
 *   (ameliyat haftası, greft, tendinopati evresi; semptom yönü yalnız ağrı takibi onaylıysa en yeni yoklamadan).
 * - **Kaçınmalar** (`avoid`) kısıtın kendi kuralları: bölge kapısı, üç değerli mantık, etiket eksikse kalıp yedeği
 *   (ailedeyse dikkat, değilse eksik bilgi; hiçbir zaman "uygun" değil).
 * - **Görüşü alınmamış kırmızı bayrak:** bölgeyi çalıştıran harekete en az dikkat.
 * - **Bekleyen bildirim:** yalnız zorlayanları, yalnız dikkat (güvenli yön hemen, §2.4); bölgeden tahmin yok.
 * - **İzin** (`overrides`): o kısıtın bulguları o harekette susar; görüşü alınmamış kırmızı bayrakta ve kauda
 *   ekinada susmaz.
 */

export type CareKind = 'rule' | 'avoid' | 'fallback' | 'referral' | 'report';

export type CareReason = {
  constraintId: string;
  /** "Sol diz". */
  label: string;
  decision: Decision;
  /** PT'ye gerekçe. */
  message: string;
  kind: CareKind;
};

export type CareResult = {
  /** En ağır karar (susturulanlar hariç); yoksa null. */
  decision: Decision | null;
  reasons: CareReason[];
  /** İzinle susan gerekçeler. */
  silenced: CareReason[];
  /** Değerlendirilemeyen kural (etiket ya da sabit bilgi eksik). */
  unassessed: number;
  untagged: boolean;
  /** İzinsiz yasak koyan kısıtlar. */
  blockedBy: string[];
  /** Yasağına izin verilebilecek kısıtlar ("Yine de ekle"). */
  overridableBy: string[];
};

export type SymptomDirection = NonNullable<FilterContext['symptomDirection']>;

export type CareInput = {
  active: readonly Constraint[];
  reports: readonly Constraint[];
  overrides: readonly Override[];
  /** Uygulamanın saat dilimindeki bugün (ameliyat haftası). */
  today: string;
  symptomDirection?: SymptomDirection | undefined;
};

export const EMPTY_CARE: CareInput = { active: [], reports: [], overrides: [], today: '1970-01-01' };

/**
 * Kayıttan süzgecin girdisi. Çağıran `conditions` onayını denetler (yoksa `EMPTY_CARE`); semptom yönü yalnız ağrı
 * takibi onaylıysa (en yeni tarihli yoklamadan).
 */
export function careInputOf(
  record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate' | 'overrides' | 'checkIns'>,
  options: { today: string; painConsent: boolean },
): CareInput {
  const active = activeConstraints(record);
  const ids = new Set(active.map((item) => item.id));
  let symptomDirection: SymptomDirection | undefined;
  if (options.painConsent) {
    let latest = '';
    for (const item of record.checkIns) {
      if (item.symptomDirection && item.date >= latest) {
        latest = item.date;
        symptomDirection = item.symptomDirection;
      }
    }
  }
  return {
    active,
    reports: pendingReports(record),
    overrides: overridesOf(record).filter((item) => ids.has(item.source)),
    today: options.today,
    ...(symptomDirection ? { symptomDirection } : {}),
  };
}

export function hasCare(input: CareInput): boolean {
  return input.active.length > 0 || input.reports.length > 0;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
}

/** Kısıtın kendi bağlamı: iki ameliyat tarihi birbirine karışmaz. */
export function contextFor(constraint: Constraint, input: Pick<CareInput, 'today' | 'symptomDirection'>): FilterContext {
  const context: FilterContext = {};
  const surgery = constraint.details?.surgeryDate;
  if (surgery) {
    const days = dayNumber(input.today) - dayNumber(surgery);
    if (days >= 0) context.weeksPostOp = Math.floor(days / 7);
  }
  if (constraint.details?.graft) context.graftType = constraint.details.graft;
  if (constraint.details?.stage) context.tendinopathyStage = constraint.details.stage;
  if (input.symptomDirection) context.symptomDirection = input.symptomDirection;
  return context;
}

const ORDER: Record<Decision, number> = { block: 3, warn: 2, cue: 1 };

function lower(text: string): string {
  return text.toLocaleLowerCase('tr');
}

/** Bir kısıtın bu hareketteki gerekçeleri ve değerlendirilemeyen kuralları. */
function constraintReasons(tags: CareTags, constraint: Constraint, input: CareInput): { reasons: CareReason[]; unassessed: number } {
  const label = regionText(constraint);
  const reasons: CareReason[] = [];
  let unassessed = 0;
  const context = contextFor(constraint, input);
  for (const condition of conditionsOf(constraint)) {
    const result = evaluateExercise(tags, [condition], context);
    for (const finding of result.findings) {
      reasons.push({ constraintId: constraint.id, label, decision: finding.decision, message: `${label}: ${finding.message}`, kind: 'rule' });
    }
    unassessed += result.skipped;
  }
  for (const tag of constraint.avoid) {
    const avoid = AVOID_TAGS[tag];
    const hit = avoidMatch(tag, tags, constraint.region);
    if (hit) {
      reasons.push({ constraintId: constraint.id, label, decision: avoid.decision, message: `${label}: ${lower(avoid.label)}`, kind: 'avoid' });
    } else if (hit === null) {
      if (tags.pattern && avoid.families.includes(tags.pattern)) {
        reasons.push({
          constraintId: constraint.id,
          label,
          decision: 'warn',
          message: `${label}: etiket eksik; ${lower(avoid.label)} olabilir`,
          kind: 'fallback',
        });
      } else {
        unassessed += 1;
      }
    }
  }
  if (awaitsOpinion(constraint) && regionWorked(tags, constraint.region)) {
    reasons.push({
      constraintId: constraint.id,
      label,
      decision: 'warn',
      message: `${label}: sağlık profesyonelinin görüşü bekleniyor`,
      kind: 'referral',
    });
  }
  return { reasons, unassessed };
}

/** Bekleyen bildirimin zorlayanları: yalnız dikkat (etiket eksikse ailedeyse). */
function reportReasons(tags: CareTags, report: Constraint): CareReason[] {
  const label = regionText(report);
  const reasons: CareReason[] = [];
  for (const trigger of report.triggers ?? []) {
    const tag = TRIGGER_AVOID[trigger];
    const hit = avoidMatch(tag, tags, report.region);
    if (hit || (hit === null && tags.pattern && AVOID_TAGS[tag].families.includes(tags.pattern))) {
      reasons.push({
        constraintId: report.id,
        label,
        decision: 'warn',
        message: `Danışan bildirdi (karar bekliyor): ${label} · ${lower(TRIGGER_LABELS[trigger])}`,
        kind: 'report',
      });
    }
  }
  return reasons;
}

/** Hareketin bu danışan için işareti. */
export function evaluateCare(tags: CareTags & { id: string }, input: CareInput): CareResult {
  const reasons: CareReason[] = [];
  const silenced: CareReason[] = [];
  const blockedBy: string[] = [];
  const overridableBy: string[] = [];
  let unassessed = 0;
  for (const constraint of input.active) {
    const own = constraintReasons(tags, constraint, input);
    const permitted = overridable(constraint) && input.overrides.some((item) => item.exerciseId === tags.id && item.source === constraint.id);
    if (permitted) {
      silenced.push(...own.reasons);
      continue;
    }
    reasons.push(...own.reasons);
    unassessed += own.unassessed;
    if (own.reasons.some((reason) => reason.decision === 'block')) {
      blockedBy.push(constraint.id);
      if (overridable(constraint)) overridableBy.push(constraint.id);
    }
  }
  for (const report of input.reports) reasons.push(...reportReasons(tags, report));
  reasons.sort((a, b) => ORDER[b.decision] - ORDER[a.decision]);
  const decision = reasons[0]?.decision ?? null;
  return { decision, reasons, silenced, unassessed: decision === 'block' ? 0 : unassessed, untagged: !isTagged(tags), blockedBy, overridableBy };
}

/** Kümeler bugünkü süzgeçle aynı: yaptırma · dikkat (ipucu dahil) · uygun · kontrol edilmedi · eksik bilgi. */
export function careGroup(result: Pick<CareResult, 'decision' | 'untagged' | 'unassessed'>): FilterGroup {
  if (result.decision === 'block') return 'blocked';
  if (result.decision) return 'warned';
  if (result.untagged) return 'untagged';
  return result.unassessed > 0 ? 'unassessed' : 'clear';
}

/** "Değiştir" sırası (§3.4): uygun → ipucu → dikkat → eksik bilgi → kontrol edilmedi; yasak en sonda (listeye girmez). */
export function careRank(result: Pick<CareResult, 'decision' | 'untagged' | 'unassessed'>): number {
  if (result.decision === 'block') return 5;
  if (result.decision === 'warn') return 2;
  if (result.decision === 'cue') return 1;
  if (result.untagged) return 4;
  return result.unassessed > 0 ? 3 : 0;
}

/**
 * Muadilleri kısıtlara göre düzenler: yasak (izinsiz) çıkar, her grubun içinde `careRank` sırası; aynı sırada
 * gelen sıra korunur. `changed`: sıra gerçekten değişti; `anyClear`: en az biri uygun ("uygun olanlar önce" yalnız
 * o zaman söylenir).
 */
export function orderByCare<T>(items: readonly T[], resultOf: (item: T) => CareResult): { items: T[]; changed: boolean; anyClear: boolean } {
  const ranked = items
    .map((item, index) => ({ item, index, rank: careRank(resultOf(item)) }))
    .filter((entry) => entry.rank < 5);
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank || a.index - b.index);
  const changed = sorted.some((entry, position) => entry.index !== ranked[position]?.index);
  return { items: sorted.map((entry) => entry.item), changed, anyClear: sorted.some((entry) => entry.rank === 0) };
}

/**
 * Kısıtların damgası: telefonda saklanan gün planı kısıtlar ya da izinler değişince (ya da onay çekilince) eskir
 * (`programStamp`'in arkasına eklenir; Bugün ve gün planı aynı hesabı yapar). Onay yoksa boş.
 */
export function careStampOf(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate' | 'overrides'> | null): string {
  if (!record) return '';
  const parts = [
    ...constraintsOf(record).map((item) => `${item.id}@${item.updatedAt}`),
    ...overridesOf(record).map((item) => `${item.exerciseId}:${item.source}@${item.at}`),
  ].sort();
  let hash = 5381;
  for (const char of parts.join(',')) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return `|k${parts.length}.${hash.toString(36)}`;
}

/* --- danışanın hareket kartı --- */

export type RowCareKind = 'note' | 'avoid' | 'report' | 'referral';

/** Günün planındaki satırın notu (§3.5): tanı adı yok, bölge ve taraf var. */
export type RowCare = { kind: RowCareKind; label: string; region: ConstraintRegion; side?: ConstraintSide; note?: string };

const KIND_ORDER: Record<RowCareKind, number> = { avoid: 4, referral: 3, report: 2, note: 1 };

/**
 * Satırın notu: izinsiz yasak (`avoid`: "Değiştir'den bir muadil seç") > görüş bekleniyor > bekleyen bildirim >
 * onaylı kısıtın dikkat/ipucu bulgusu ya da izinli yasak (`note`, PT'nin danışana notuyla). Etiketi eksik
 * kalıp yedeği dikkat olarak not üretir; eksik bilgi ve etiketsiz hareket not üretmez.
 */
export function rowCareOf(result: CareResult, input: CareInput): RowCare | null {
  const byId = new Map([...input.active, ...input.reports].map((item) => [item.id, item]));
  let best: { kind: RowCareKind; constraint: Constraint } | null = null;
  const consider = (kind: RowCareKind, id: string) => {
    const constraint = byId.get(id);
    if (!constraint) return;
    if (!best || KIND_ORDER[kind] > KIND_ORDER[best.kind]) best = { kind, constraint };
  };
  for (const id of result.blockedBy) consider('avoid', id);
  for (const reason of result.reasons) {
    if (reason.kind === 'referral') consider('referral', reason.constraintId);
    else if (reason.kind === 'report') consider('report', reason.constraintId);
    else if (reason.decision !== 'block') consider('note', reason.constraintId);
  }
  for (const reason of result.silenced) consider('note', reason.constraintId);
  if (!best) return null;
  const { kind, constraint } = best as { kind: RowCareKind; constraint: Constraint };
  return {
    kind,
    label: regionText(constraint),
    region: constraint.region,
    ...(constraint.side ? { side: constraint.side } : {}),
    ...(kind === 'note' && constraint.clientNote ? { note: constraint.clientNote } : {}),
  };
}

/** Kartın sheet'i: başlık "Sol diz için not" ve metin (danışana, telaşsız; "yasak", "risk", tanı adı yok). */
export function rowCareText(care: RowCare): { title: string; text: string } {
  const title = `${care.label} için not`;
  const where = { region: care.region, side: care.side };
  switch (care.kind) {
    case 'avoid':
      return { title, text: `Antrenörün bu hareketi ${yourRegion(where, 'gen')} için değiştirecek. Bugün 'Değiştir'den bir muadil seç.` };
    case 'referral':
      return { title, text: 'Antrenörün bu bölge için sağlık profesyonelinin görüşünü bekliyor. Ağrı yaparsa hareketi geç.' };
    case 'report':
      return { title, text: `Bildirdiğin ${care.label.toLocaleLowerCase('tr')} için zorlayabilir; ağrı yaparsa geç.` };
    default:
      return {
        title,
        text:
          care.note ??
          `Antrenörün bu hareketi ${yourRegion(where, 'acc')} düşünerek planladı. Ağrısız aralıkta kal; ağrı artarsa hareketi geç ya da Değiştir'e dokun.`,
      };
  }
}

/** "Değiştir"deki kısa satır ("Sol diz için dikkatli"). */
export function optionCareText(result: CareResult): string | null {
  const first = result.reasons.find((reason) => reason.decision === 'warn' || reason.decision === 'cue');
  if (!first) return null;
  return first.kind === 'report' ? `Bildirdiğin ${first.label.toLocaleLowerCase('tr')} için dikkatli` : `${first.label} için dikkatli`;
}

/* --- PT: sheet, önizleme, çelişkiler --- */

/** Kütüphane sheet'inin satır işareti (sunucudan istemciye taşınır). */
export type SheetCare = {
  group: FilterGroup;
  decision: Decision | null;
  messages: string[];
  unassessed: number;
  /** "Yine de ekle": izin verilebilecek kısıtlar. */
  overridable: { id: string; label: string }[];
  /** Yasak var ama hiçbirine izin verilemez (görüş bekleniyor, kauda ekina). */
  locked: boolean;
};

export function sheetCareOf(result: CareResult, input: CareInput): SheetCare {
  const labels = new Map(input.active.map((item) => [item.id, regionText(item)]));
  return {
    group: careGroup(result),
    decision: result.decision,
    messages: [...new Set(result.reasons.map((reason) => reason.message))],
    unassessed: result.unassessed,
    overridable: result.overridableBy.map((id) => ({ id, label: labels.get(id) ?? '' })),
    locked: result.blockedBy.length > 0 && result.overridableBy.length < result.blockedBy.length,
  };
}

/**
 * Program düzenleyicisinin kısıt bilgisi (tasarım `kisit-tarama.md` §3.2, §3.3): sunucuda hesaplanır, sheet'e ve
 * kart rozetine gider. `unavailable`: onay yok (durum söylenir, veri değil); o zaman harita boş.
 */
export type EditorCare = {
  clientId: string;
  unavailable?: string;
  /** Etkin kısıtların bölgeleri ("Bel", "Sağ omuz"). */
  summary: string[];
  /** Karar bekleyen danışan bildirimleri ("Sol diz"). */
  pending: string[];
  /** Egzersiz → işaret (yalnız uygun olmayanlar). */
  map: Record<string, SheetCare>;
};

export function editorCareOf(clientId: string, items: readonly (CareTags & { id: string })[], input: CareInput): EditorCare {
  return {
    clientId,
    summary: input.active.map(regionText),
    pending: input.reports.map(regionText),
    map: careMap(items, input),
  };
}

/** Bütün kütüphane için işaretler (yalnız uygun olmayanlar; uygun hareket haritada yok). */
export function careMap(items: readonly (CareTags & { id: string })[], input: CareInput): Record<string, SheetCare> {
  const map: Record<string, SheetCare> = {};
  if (!hasCare(input)) return map;
  for (const item of items) {
    const care = sheetCareOf(evaluateCare(item, input), input);
    if (care.group !== 'clear' || care.messages.length > 0) map[item.id] = care;
  }
  return map;
}

/**
 * Egzersiz listesinin `?client=` önizlemesi: sunucuda hesaplanan haritadan listenin özeti (`summarizeFilter` ile aynı
 * biçim). Haritada olmayan hareket uygundur.
 */
export function careSummary(items: readonly { id: string }[], map: Readonly<Record<string, SheetCare>>): FilterSummary {
  const summary: FilterSummary = {
    cards: new Map(),
    groups: new Map(),
    counts: { blocked: 0, warned: 0, clear: 0, untagged: 0, unassessed: 0 },
    warnedUnassessed: 0,
    pending: { rules: 0, needs: [] },
  };
  for (const item of items) {
    const care = map[item.id];
    const group = care?.group ?? 'clear';
    summary.groups.set(item.id, group);
    summary.counts[group] += 1;
    if (!care) continue;
    const unassessed = group === 'untagged' || care.decision === 'block' ? 0 : care.unassessed;
    if (group === 'warned' && unassessed > 0) summary.warnedUnassessed += 1;
    if (care.decision || unassessed > 0) summary.cards.set(item.id, { decision: care.decision, message: care.messages[0] ?? null, unassessed });
  }
  return summary;
}

/** Kümelere göre sayılar (kısıt formunun önizlemesi, sheet'in üst satırı). */
export function careCounts(items: readonly (CareTags & { id: string })[], input: CareInput): Record<FilterGroup, number> {
  const counts: Record<FilterGroup, number> = { blocked: 0, warned: 0, clear: 0, untagged: 0, unassessed: 0 };
  for (const item of items) counts[careGroup(evaluateCare(item, input))] += 1;
  return counts;
}

export type Conflict = {
  phaseId: string;
  dayId: string;
  dayName: string;
  rowId: string;
  exerciseId: string;
  title: string;
  /** "Sol diz: sıçrama / balistik". */
  message: string;
  /** Çelişen satır danışanın sıradaki gününde mi (Dikkat maddesi 85). */
  next: boolean;
};

/** Şu anki evredeki izinsiz yasaklar (program sayfası, düzenleyici, Genel bakış). */
export function programConflicts(
  program: Pick<Program, 'phases' | 'current' | 'rotation'>,
  exercises: ReadonlyMap<string, CareTags & { id: string; title: string }>,
  input: CareInput,
): Conflict[] {
  if (input.active.length === 0) return [];
  const current = currentPhaseOf(program);
  if (!current) return [];
  const next = nextDayId(program);
  const conflicts: Conflict[] = [];
  for (const day of current.phase.days) {
    for (const block of day.blocks) {
      for (const row of block.rows) {
        const exercise = exercises.get(row.exerciseId);
        if (!exercise) continue;
        const result = evaluateCare(exercise, input);
        if (result.blockedBy.length === 0) continue;
        const reason = result.reasons.find((item) => item.decision === 'block');
        conflicts.push({
          phaseId: current.phase.id,
          dayId: day.id,
          dayName: day.name,
          rowId: row.id,
          exerciseId: row.exerciseId,
          title: exercise.title,
          message: reason?.message ?? '',
          next: day.id === next,
        });
      }
    }
  }
  return conflicts;
}

/** Program satırlarının işaretleri (düzenleyicideki kart rozeti): satır → kısa gerekçe. */
export function rowMarks(
  program: Pick<Program, 'phases'>,
  exercises: ReadonlyMap<string, CareTags & { id: string }>,
  input: CareInput,
): Record<string, { decision: Decision; message: string }> {
  const marks: Record<string, { decision: Decision; message: string }> = {};
  if (!hasCare(input)) return marks;
  for (const phase of program.phases) {
    for (const day of phase.days) {
      for (const block of day.blocks) {
        for (const row of block.rows) {
          const exercise = exercises.get(row.exerciseId);
          if (!exercise) continue;
          const result = evaluateCare(exercise, input);
          const first = result.reasons[0];
          if (result.decision && first) marks[row.id] = { decision: result.decision, message: first.message };
        }
      }
    }
  }
  return marks;
}
