import type { MovementPattern } from './alternatives.ts';
import {
  CONDITION_IDS,
  clientSafeLabel,
  conditionInfo,
  conditionKind,
  conditionLabel,
  EMERGENCY_CONDITION_ID,
  parseCondition,
  RETIRED_CONDITION_IDS,
  type ConditionId,
  type ConditionKind,
  type ConditionRegion,
} from './conditions.ts';
import { and, has, isTagged, loaded, touches, type ExerciseTags } from './exercise-filter.ts';
import { formatDay } from './format.ts';
import type { Constraint, ConstraintLogEntry, HealthRecord, Override } from './schemas/health.ts';

/**
 * Danışanın kısıtları (tasarım `docs/design/kisit-tarama.md` §2) — saf. `health.json` → `constraints[]`,
 * `overrides[]`, `constraintLog[]` üzerinde işlemler; sunucu (`health.ts`) ve tarayıcı ortak.
 *
 * - **Kısıt** bir kayıttır: bölge, taraf, tür, şiddet, başlangıç, kaçınılacak hareketler (kütüphanenin medikal
 *   etiketlerine eşlenir), isteğe bağlı sağlık profesyonelinin koyduğu tanı (kaynağıyla) ve PT'nin gözlemi.
 * - **Danışan bildirir**, PT karar verir. Güvenli yön hemen: bekleyen bildirimin "zorlayanlar"ı yalnız dikkat
 *   olarak işler (`constraint-filter.ts`), kötüleşme hemen yazılır; gevşeten yönü yalnız PT açar **[sentez]**.
 * - **Kırmızı bayrak** iki tarihli adımla yürür: yönlendirme (`referredAt`) ve görüş (`clearance`) (§2.6).
 * - Her değişiklik okunur bir satırla `constraintLog`'a (en yenisi üstte, 200 satır); commit mesajı geneldir.
 *
 * Eylemler kaydın yeni halini döndürür; kural ihlalinde `ConstraintError` (durum koduyla) fırlatır.
 */

/* --- adlar --- */

export const CONSTRAINT_REGIONS = [
  'neck',
  'shoulder',
  'elbow',
  'wrist_hand',
  'upper_back',
  'lower_back',
  'hip',
  'knee',
  'ankle_foot',
  'other',
] as const;
export type ConstraintRegion = (typeof CONSTRAINT_REGIONS)[number];

export const REGION_LABELS: Record<ConstraintRegion, string> = {
  neck: 'Boyun',
  shoulder: 'Omuz',
  elbow: 'Dirsek',
  wrist_hand: 'El bileği',
  upper_back: 'Sırt',
  lower_back: 'Bel',
  hip: 'Kalça',
  knee: 'Diz',
  ankle_foot: 'Ayak bileği',
  other: 'Başka bir yer',
};

/** Çift bölgeler: taraf zorunlu. */
export const PAIRED_REGIONS: ReadonlySet<ConstraintRegion> = new Set(['shoulder', 'elbow', 'wrist_hand', 'hip', 'knee', 'ankle_foot']);

export function isPaired(region: ConstraintRegion): boolean {
  return PAIRED_REGIONS.has(region);
}

/** Bölgenin sözlükteki karşılığı (tanı seçicisi bununla süzülür). */
export const REGION_CONDITION_REGIONS: Record<ConstraintRegion, readonly ConditionRegion[]> = {
  neck: ['neck'],
  shoulder: ['shoulder'],
  elbow: ['elbow'],
  wrist_hand: ['wrist'],
  upper_back: ['spine', 'neck'],
  lower_back: ['spine'],
  hip: ['hip'],
  knee: ['knee'],
  ankle_foot: ['ankle'],
  other: ['systemic'],
};

export const CONSTRAINT_SIDES = ['left', 'right', 'both'] as const;
export type ConstraintSide = (typeof CONSTRAINT_SIDES)[number];
export const SIDE_LABELS: Record<ConstraintSide, string> = { left: 'Sol', right: 'Sağ', both: 'İki taraf' };

export const CONSTRAINT_TYPES = ['injury', 'condition', 'post_op', 'limitation'] as const;
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];
export const TYPE_LABELS: Record<ConstraintType, string> = {
  injury: 'Sakatlık',
  condition: 'Rahatsızlık',
  post_op: 'Ameliyat sonrası',
  limitation: 'Hareket kısıtı',
};
/** Danışanın bildirim sheet'indeki cevaplar. */
export const TYPE_CLIENT_LABELS: Record<ConstraintType, string> = {
  injury: 'Yeni bir sakatlık',
  condition: 'Eskiden beri süren bir sorun',
  post_op: 'Ameliyat oldum',
  limitation: 'Doktorum bir şeyden kaçınmamı söyledi',
};

export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = { mild: 'Hafif', moderate: 'Orta', severe: 'Şiddetli' };
/**
 * Tanımlar **[sentez]**: gösterim ve "kötüleşti" içindir. PT'nin seçtiği şiddet süzgeci değiştirmez; yalnız danışanın
 * PT'nin henüz bakmadığı "şiddetli"si (`severeUnreviewed`) bölgeyi çalıştıran harekete dikkat ekler.
 */
export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  mild: 'Antrenmanı etkilemiyor',
  moderate: 'Bazı hareketlerde zorluyor',
  severe: 'Günlük hayatı etkiliyor',
};

export const DIAGNOSIS_SOURCES = ['clinician', 'client'] as const;
export type DiagnosisSource = (typeof DIAGNOSIS_SOURCES)[number];
export const DIAGNOSIS_SOURCE_LABELS: Record<DiagnosisSource, string> = {
  clinician: 'Hekim ya da fizyoterapist',
  client: 'Danışanın beyanı',
};

export const CLEARANCE_BASES = ['client_report', 'written_report'] as const;
export type ClearanceBasis = (typeof CLEARANCE_BASES)[number];
export const CLEARANCE_BASIS_LABELS: Record<ClearanceBasis, string> = {
  client_report: 'Danışanın beyanı',
  written_report: 'Yazılı rapor',
};

export const GRAFTS = ['hamstring', 'patellar_tendon', 'other'] as const;
export type Graft = (typeof GRAFTS)[number];
export const GRAFT_LABELS: Record<Graft, string> = { hamstring: 'Hamstring', patellar_tendon: 'Patellar tendon', other: 'Başka' };

export const STAGES = [1, 2, 3, 4] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  1: '1 · izometrik',
  2: '2 · izotonik',
  3: '3 · enerji depolama',
  4: '4 · spora dönüş',
};

/** Danışanın "Neler zorluyor?" cevapları. */
export const TRIGGERS = ['squat', 'overhead', 'bend', 'jump', 'lean_back'] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const TRIGGER_LABELS: Record<Trigger, string> = {
  squat: 'Çömelmek',
  overhead: 'Kolu başın üstüne kaldırmak',
  bend: 'Öne eğilmek',
  jump: 'Zıplamak',
  lean_back: 'Geriye eğilmek',
};

/** Bildirimin "Ne zamandan beri?" cevabı → başlangıç (yaklaşık). */
export const ONSET_CHOICES = ['week', 'month', 'months', 'longer'] as const;
export type OnsetChoice = (typeof ONSET_CHOICES)[number];
export const ONSET_CHOICE_LABELS: Record<OnsetChoice, string> = { week: 'Bu hafta', month: 'Bu ay', months: '1–6 ay', longer: 'Daha uzun' };

/* --- kaçınılacak hareketler --- */

export const AVOID_TAG_IDS = [
  'deep_knee_flexion',
  'knee_end_extension_open',
  'deep_hip_flexion',
  'overhead',
  'abduction_external_rotation',
  'behind_body',
  'ir_under_load',
  'loaded_horizontal_adduction',
  'loaded_spinal_flexion',
  'spinal_flexion_rotation',
  'loaded_spinal_extension',
  'high_axial_load',
  'high_shear',
  'ballistic',
  'forward_bend',
] as const;
export type AvoidTagId = (typeof AVOID_TAG_IDS)[number];

/** Kaçınmanın okuduğu etiket (kütüphane testi ailedeki hareketlerin bunları taşıdığını denetler). */
export type AvoidReads = keyof ExerciseTags | 'pattern';

/** Dengeleyici kaslar yalnız el bileği ve dirsek ölçütünde okunur (tutuş; `regionWorked`). */
export type CareTags = ExerciseTags & { pattern?: MovementPattern | undefined; stabilizerMuscles?: readonly string[] | undefined };

export type AvoidTag = {
  /** PT'ye ("Kaçın: derin diz bükme"). */
  label: string;
  /** PT'nin açık talimatı yasaktır; öne eğilme yalnız dikkat (Saraceni 2020). */
  decision: 'block' | 'warn';
  /** Etiket eksikse "dikkat" alan kalıplar (kalıp yedeği); boşsa yedek yok. */
  families: readonly MovementPattern[];
  reads: readonly AvoidReads[];
  match: (tags: CareTags) => boolean | null;
};

const alignment = (tags: CareTags, values: readonly string[]) =>
  tags.spinalAlignment === undefined ? null : values.includes(tags.spinalAlignment);

export const AVOID_TAGS: Record<AvoidTagId, AvoidTag> = {
  deep_knee_flexion: {
    label: 'Derin diz bükme (90° üstü)',
    decision: 'block',
    families: ['squat', 'lunge'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'knee_flexion_over_90'),
  },
  knee_end_extension_open: {
    label: 'Açık zincirde son aralık diz açma',
    decision: 'block',
    families: ['knee_extension'],
    reads: ['kineticChain', 'jointWindows'],
    match: (tags) => and(tags.kineticChain === undefined ? null : tags.kineticChain === 'open', has(tags.jointWindows, 'knee_terminal_extension_0_30')),
  },
  deep_hip_flexion: {
    label: 'Derin kalça bükme (90° üstü)',
    decision: 'block',
    families: ['squat', 'lunge'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'hip_flexion_over_90'),
  },
  overhead: {
    label: 'Kol baş üstünde (90° üstü)',
    decision: 'block',
    families: ['vertical_push', 'vertical_pull'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'shoulder_elevation_over_90'),
  },
  abduction_external_rotation: {
    label: '90° kol açma + son aralık dış rotasyon',
    decision: 'block',
    families: ['vertical_push', 'vertical_pull'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'shoulder_abduction_90_end_range_er'),
  },
  behind_body: {
    label: 'Dirsek gövdenin arkasında',
    decision: 'block',
    families: ['vertical_push', 'horizontal_push'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'glenohumeral_extension_beyond_neutral'),
  },
  ir_under_load: {
    label: 'Yük altında iç rotasyon',
    decision: 'block',
    families: [],
    reads: ['internalRotationUnderLoad'],
    // Etiket yalnız iç rotasyonlu harekette yazılır: etiketli harekette yoksa hayır.
    match: (tags) => (tags.internalRotationUnderLoad === true ? true : isTagged(tags) ? false : null),
  },
  loaded_horizontal_adduction: {
    label: 'Dirençle göğüste kapanma',
    decision: 'block',
    families: ['horizontal_push', 'chest_fly'],
    reads: ['loadVector', 'resistanceProfile'],
    match: (tags) =>
      and(
        tags.loadVector === undefined ? null : tags.loadVector === 'horizontal_adduction',
        tags.resistanceProfile === undefined ? null : tags.resistanceProfile !== 'bodyweight',
      ),
  },
  loaded_spinal_flexion: {
    label: 'Yüklü öne bükülme',
    decision: 'block',
    families: ['hinge'],
    reads: ['spinalAlignment', 'axialLoading'],
    match: (tags) => and(alignment(tags, ['flexion']), loaded(tags)),
  },
  spinal_flexion_rotation: {
    label: 'Öne bükülme + dönme',
    decision: 'block',
    families: ['core_rotation'],
    reads: ['spinalAlignment'],
    match: (tags) => alignment(tags, ['flexion_with_rotation']),
  },
  loaded_spinal_extension: {
    label: 'Yüklü geriye bükülme',
    decision: 'block',
    families: ['hinge'],
    reads: ['spinalAlignment', 'axialLoading'],
    match: (tags) => and(alignment(tags, ['extension', 'extension_with_rotation']), loaded(tags)),
  },
  high_axial_load: {
    label: 'Yüksek eksenel yük (bar sırtta)',
    decision: 'block',
    families: ['squat', 'hinge', 'lunge', 'vertical_push'],
    reads: ['axialLoading'],
    match: (tags) => (tags.axialLoading === undefined ? null : tags.axialLoading === 'high'),
  },
  high_shear: {
    label: 'Yüksek kesme kuvveti',
    decision: 'block',
    families: ['hinge'],
    reads: ['shearForce'],
    match: (tags) => (tags.shearForce === undefined ? null : tags.shearForce === 'high'),
  },
  ballistic: {
    label: 'Sıçrama / balistik',
    decision: 'block',
    families: ['squat', 'lunge', 'hinge'],
    reads: ['contractionType'],
    match: (tags) => (tags.contractionType === undefined ? null : tags.contractionType === 'energy_storage_ballistic'),
  },
  forward_bend: {
    label: 'Öne eğilme / yerden kaldırma',
    decision: 'warn',
    families: [],
    reads: ['pattern'],
    match: (tags) => (tags.pattern === undefined ? null : tags.pattern === 'hinge'),
  },
};

/** Danışanın zorlayanı → önerilen kaçınma (§2.2). */
export const TRIGGER_AVOID: Record<Trigger, AvoidTagId> = {
  squat: 'deep_knee_flexion',
  overhead: 'overhead',
  bend: 'forward_bend',
  jump: 'ballistic',
  lean_back: 'loaded_spinal_extension',
};

export function avoidFromTriggers(triggers: readonly Trigger[] | undefined): AvoidTagId[] {
  return [...new Set((triggers ?? []).map((trigger) => TRIGGER_AVOID[trigger]))].sort(
    (a, b) => AVOID_TAG_IDS.indexOf(a) - AVOID_TAG_IDS.indexOf(b),
  );
}

const KNEE_WINDOW = /^knee/;

/**
 * Bölge kapısı **[sentez]**: diz ve omuz kısıtının kaçınmaları yalnız o eklemi yükleyen harekete işler. Omuz
 * `touches()`; diz daha dar: diz penceresi ya da ön bacak (arka bacak kalça hareketinde de çalışır, yoksa
 * "Sol diz · kaçın: sıçrama" Kettlebell Swing'i yasaklardı). Kas ve pencere bilgisi yoksa bilinmiyor.
 */
export function regionGate(tags: CareTags, region: ConstraintRegion): boolean | null {
  if (region === 'shoulder') return touches(tags, 'shoulder');
  if (region !== 'knee') return true;
  const windows = tags.jointWindows;
  const muscles = [...(tags.primaryMuscles ?? []), ...(tags.secondaryMuscles ?? [])];
  if (windows?.some((window) => KNEE_WINDOW.test(window))) return true;
  if (muscles.includes('quadriceps')) return true;
  return windows === undefined && muscles.length === 0 ? null : false;
}

/** Kaçınma bu harekete işliyor mu (bölge kapısıyla, üç değerli). */
export function avoidMatch(tag: AvoidTagId, tags: CareTags, region: ConstraintRegion): boolean | null {
  return and(regionGate(tags, region), AVOID_TAGS[tag].match(tags));
}

/** Dirseği bükenler ve açanlar (hedef ya da yardımcı). */
const ELBOW_MOVERS: readonly string[] = ['biceps', 'triceps_long', 'triceps_lateral'];
/** Ön kol: el bileğini hareket ettirir, tutuşu taşır; ortak başlangıçları dirsekte (epikondiller). */
const FOREARM: readonly string[] = ['forearm_flexors', 'forearm_extensors'];
/** Kalçayı hareket ettirenler; arka bacak ve ön bacak (iki eklemli) sayılmaz: leg curl ve leg extension kalçayı oynatmaz. */
const HIP_MOVERS: readonly string[] = ['glutes', 'glute_medius', 'hip_flexors', 'adductors'];
const HIP_PATTERNS: readonly MovementPattern[] = ['hinge', 'hip_extension', 'hip_abduction', 'hip_adduction'];
/** Ayak bileğini hareket ettirenler (baldır, kaval önü). */
const ANKLE_MOVERS: readonly string[] = ['gastroc_medial', 'gastroc_lateral', 'soleus', 'tibialis'];
/** Ayak yerde, kaval kemiği ayağın üstünde öne gider (yük altında dorsifleksiyon) ya da yükle yürünür. */
const ANKLE_PATTERNS: readonly MovementPattern[] = ['squat', 'lunge', 'calf_raise', 'carry'];
/** Vücut ağırlığı ellerin üstünde: kapalı zincir itiş (şınav, dips). */
const HAND_BEARING_PATTERNS: readonly MovementPattern[] = ['horizontal_push', 'vertical_push'];
const KNEE_BEND_WINDOWS: readonly string[] = ['knee_flexion_45_90', 'knee_flexion_over_90'];

/**
 * "Bölgeyi çalıştıran" (§2.6): görüşü alınmamış kırmızı bayrakta ve danışanın bakılmamış "şiddetli"sinde
 * (`severeUnreviewed`) bu hareketler en az dikkat alır. Burada kuşkuda dikkat daha güvenli (bölge kapısından geniş),
 * ama her ölçüt etiketin açıkça söylediğine dayanır **[sentez]**:
 * - **diz, omuz:** `touches()` (eklemin pencereleri ya da kasları);
 * - **omurga (bel, sırt), boyun:** eksenel yük (`axialLoading ∉ {none}`);
 * - **dirsek:** dirseği büken ya da açan kas hedef/yardımcı, ya da ön kol herhangi bir düzeyde (tutuş, dengeleyici
 *   dahil: kütüphane ön kolu yalnız tutuşun belirgin olduğu harekette yazar; kavrama epikondil ağrısını zorlar);
 * - **el bileği:** ön kol herhangi bir düzeyde ya da vücut ağırlığı ellerin üstünde (kapalı zincir yatay/dikey itiş);
 *   elde taşınan yük (bench'te bar, dambıl pressleri) etiketlerde yok, sayılmaz;
 * - **kalça:** kalçayı hareket ettiren kas hedef/yardımcı, 90° üstü kalça bükme penceresi ya da kalça kalıbı
 *   (menteşe, kalça itişi, açma, kapama);
 * - **ayak bileği:** baldır ya da kaval önü hedef/yardımcı, squat/lunge/baldır/taşıma kalıbı ya da kapalı zincirde
 *   45° üstü diz bükme;
 * - **başka bir yer:** ölçüt yok (bölge adı bir eklem söylemez): hayır.
 * Kas, pencere ve kalıp bilgisi hiç yoksa bilinmiyor (null): dikkat üretilmez.
 */
export function regionWorked(tags: CareTags, region: ConstraintRegion): boolean | null {
  if (region === 'knee') return touches(tags, 'knee');
  if (region === 'shoulder') return touches(tags, 'shoulder');
  if (region === 'lower_back' || region === 'upper_back' || region === 'neck') {
    return tags.axialLoading === undefined ? null : tags.axialLoading !== 'none';
  }
  if (region === 'other') return false;
  const movers = [...(tags.primaryMuscles ?? []), ...(tags.secondaryMuscles ?? [])];
  const all = [...movers, ...(tags.stabilizerMuscles ?? [])];
  if (all.length === 0 && tags.pattern === undefined && tags.jointWindows === undefined) return null;
  const moves = (list: readonly string[]) => movers.some((muscle) => list.includes(muscle));
  const grips = all.some((muscle) => FOREARM.includes(muscle));
  const pattern = (list: readonly MovementPattern[]) => tags.pattern !== undefined && list.includes(tags.pattern);
  switch (region) {
    case 'elbow':
      return moves(ELBOW_MOVERS) || grips;
    case 'wrist_hand':
      return grips || (tags.kineticChain === 'closed' && pattern(HAND_BEARING_PATTERNS));
    case 'hip':
      return moves(HIP_MOVERS) || Boolean(tags.jointWindows?.includes('hip_flexion_over_90')) || pattern(HIP_PATTERNS);
    case 'ankle_foot':
      return (
        moves(ANKLE_MOVERS) ||
        pattern(ANKLE_PATTERNS) ||
        (tags.kineticChain === 'closed' && Boolean(tags.jointWindows?.some((window) => KNEE_BEND_WINDOWS.includes(window))))
      );
  }
}

/* --- sınırlar --- */

export const CONSTRAINT_LIMITS = {
  total: 30,
  active: 12,
  overrides: 100,
  log: 200,
  logText: 300,
  note: 500,
  clientNote: 140,
  reportNote: 280,
  scope: 140,
} as const;

/* --- durum --- */

export class ConstraintError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Kısıtın sözlükteki tanısı ve gözlemi (niteleyicisiyle). */
export function conditionsOf(constraint: Pick<Constraint, 'conditionId' | 'findingId'>) {
  return [constraint.conditionId, constraint.findingId].flatMap((raw) => {
    const parsed = raw ? parseCondition(raw) : null;
    return parsed ? [parsed] : [];
  });
}

/** Danışanın henüz karar verilmemiş bildirimi. */
export function isPendingReport(constraint: Constraint): boolean {
  return constraint.source === 'client' && !constraint.confirmedAt && !constraint.declined && constraint.status === 'active';
}

/** Süzgece giren etkin kısıt: açık, reddedilmemiş, PT'nin ya da onaylanmış. */
export function isActive(constraint: Constraint): boolean {
  return constraint.status === 'active' && !constraint.declined && (constraint.source === 'pt' || Boolean(constraint.confirmedAt));
}

export function isRedFlag(constraint: Pick<Constraint, 'conditionId' | 'findingId'>): boolean {
  return conditionsOf(constraint).some((condition) => conditionInfo(condition.id).redFlag);
}

export function isEmergency(constraint: Pick<Constraint, 'conditionId'>): boolean {
  return constraint.conditionId ? parseCondition(constraint.conditionId)?.id === EMERGENCY_CONDITION_ID : false;
}

/** Görüşü alınmamış kırmızı bayrak (yönlendirilmiş olsa da). */
export function awaitsOpinion(constraint: Constraint): boolean {
  return isActive(constraint) && isRedFlag(constraint) && !constraint.clearance;
}

/**
 * Danışanın PT'nin henüz bakmadığı "şiddetli"si (güvenli yön hemen, §2.4) **[sentez]**: onaylı kısıtta "Kötüleşti ·
 * şiddetli" "Gördüm"e (ya da kapatmaya) kadar; karar bekleyen bildirimde şiddet "şiddetli"yse PT karar verene kadar.
 * Bu sürece bölgeyi çalıştıran hareket en az dikkat alır (`constraint-filter.ts`), Dikkat maddesi kırmızı ünlemle en
 * üste yakın durur (`attention.ts`). Arada "Düzeldi" demek bunu kaldırmaz: gevşeten yönü yalnız PT açar.
 */
export function severeUnreviewed(constraint: Constraint): boolean {
  if (isPendingReport(constraint)) return constraint.severity === 'severe';
  return isActive(constraint) && constraint.clientChange?.severity === 'severe';
}

/** Yasağına izin verilebilir mi: kırmızı bayrakta görüş alınmadan ve kauda ekinada hayır. */
export function overridable(constraint: Constraint): boolean {
  return !isEmergency(constraint) && !(isRedFlag(constraint) && !constraint.clearance);
}

/** Süzgece etkisi var mı: kaçınma, tanı ya da gözlem. Yoksa danışan "Antrenörün gördü" okur. */
export function hasFilterEffect(constraint: Pick<Constraint, 'avoid' | 'conditionId' | 'findingId'>): boolean {
  return constraint.avoid.length > 0 || Boolean(constraint.conditionId) || Boolean(constraint.findingId);
}

/* --- metinler --- */

/** "Sol diz", "Bel", "İki omuz". */
export function regionText(constraint: Pick<Constraint, 'region' | 'side'>): string {
  const label = REGION_LABELS[constraint.region];
  if (!constraint.side || !isPaired(constraint.region)) return label;
  const prefix = constraint.side === 'left' ? 'Sol' : constraint.side === 'right' ? 'Sağ' : 'İki';
  return `${prefix} ${label.toLocaleLowerCase('tr')}`;
}

/** Danışana ikinci tekil: "sol dizin" (için), "sol dizini" (düşünerek), "sol dizine" (uygun). */
const REGION_FORMS: Record<ConstraintRegion, { gen: string; acc: string; dat: string }> = {
  neck: { gen: 'boynun', acc: 'boynunu', dat: 'boynuna' },
  shoulder: { gen: 'omzun', acc: 'omzunu', dat: 'omzuna' },
  elbow: { gen: 'dirseğin', acc: 'dirseğini', dat: 'dirseğine' },
  wrist_hand: { gen: 'el bileğin', acc: 'el bileğini', dat: 'el bileğine' },
  upper_back: { gen: 'sırtın', acc: 'sırtını', dat: 'sırtına' },
  lower_back: { gen: 'belin', acc: 'belini', dat: 'beline' },
  hip: { gen: 'kalçan', acc: 'kalçanı', dat: 'kalçana' },
  knee: { gen: 'dizin', acc: 'dizini', dat: 'dizine' },
  ankle_foot: { gen: 'ayak bileğin', acc: 'ayak bileğini', dat: 'ayak bileğine' },
  other: { gen: 'bu bölgen', acc: 'bu bölgeni', dat: 'bu bölgene' },
};

export function yourRegion(constraint: Pick<Constraint, 'region' | 'side'>, form: 'gen' | 'acc' | 'dat'): string {
  const word = REGION_FORMS[constraint.region][form];
  if (!constraint.side || !isPaired(constraint.region)) return word;
  const prefix = constraint.side === 'left' ? 'sol' : constraint.side === 'right' ? 'sağ' : 'iki';
  return `${prefix} ${word}`;
}

/** PT'nin başlığı: "Sol diz · Patellofemoral ağrı (şiddetli)"; tanı yoksa gözlem, o da yoksa tür. */
export function constraintTitle(constraint: Constraint): string {
  const [first] = conditionsOf(constraint);
  return `${regionText(constraint)} · ${first ? conditionLabel(first) : TYPE_LABELS[constraint.type]}`;
}

/** Başlangıç: "2024", "Ağu 2026", "12 Eylül 2026"; yaklaşıksa önünde "yaklaşık". */
export function onsetText(onset: string | undefined, approx?: boolean): string | null {
  if (!onset) return null;
  const text =
    onset.length === 4
      ? onset
      : onset.length === 7
        ? new Intl.DateTimeFormat('tr-TR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${onset}-01T00:00:00Z`))
        : formatDay(onset);
  return approx ? `yaklaşık ${text}` : text;
}

/** Kartın ikinci satırı: "Rahatsızlık · orta · başlangıç Ağu 2026". */
export function constraintMeta(constraint: Pick<Constraint, 'type' | 'severity' | 'onset' | 'onsetApprox'>): string {
  const onset = onsetText(constraint.onset, constraint.onsetApprox);
  return [
    TYPE_LABELS[constraint.type],
    constraint.severity ? SEVERITY_LABELS[constraint.severity].toLocaleLowerCase('tr') : null,
    onset ? `başlangıç ${onset}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function avoidText(avoid: readonly AvoidTagId[]): string {
  return avoid.map((tag) => AVOID_TAGS[tag].label.toLocaleLowerCase('tr')).join(', ');
}

export function triggersText(triggers: readonly Trigger[] | undefined): string {
  return (triggers ?? []).map((trigger) => TRIGGER_LABELS[trigger].toLocaleLowerCase('tr')).join(', ');
}

/**
 * Danışanın göreceği tanı adı (§5.2): yalnız hekim/fizyoterapist kaynaklı, tanı türünde, niteleyicisiz temel ad.
 * Gözlem hiç görünmez.
 */
export function clientDiagnosis(constraint: Pick<Constraint, 'conditionId' | 'diagnosisSource'>): string | null {
  if (!constraint.conditionId || constraint.diagnosisSource !== 'clinician') return null;
  const parsed = parseCondition(constraint.conditionId);
  return parsed ? clientSafeLabel(parsed.id) : null;
}

/* --- tanı seçicisi --- */

/** Bölgeye ve türe göre sözlük kimlikleri (emekli kimlikler hiç çıkmaz; kauda ekina bel, sırt ve "başka yer"de). */
export function conditionsForRegion(region: ConstraintRegion | null, kind: ConditionKind): ConditionId[] {
  const regions = region ? REGION_CONDITION_REGIONS[region] : null;
  return CONDITION_IDS.filter((id) => {
    if (RETIRED_CONDITION_IDS.has(id) || conditionKind(id) !== kind) return false;
    if (!regions) return true;
    if (id === EMERGENCY_CONDITION_ID) return region === 'lower_back' || region === 'upper_back' || region === 'other';
    return regions.includes(conditionInfo(id).region);
  });
}

/** Tanı ameliyat tarihi, greft ya da evre istiyor mu (formda alan göstermek için). */
export function detailFields(conditionId: string | undefined): { surgery: boolean; graft: boolean; stage: boolean } {
  const parsed = conditionId ? parseCondition(conditionId) : null;
  if (!parsed) return { surgery: false, graft: false, stage: false };
  const postOp = parsed.id === 'acl_reconstruction_early' || parsed.id === 'meniscus_repair_postop' || parsed.qualifier === 'postop';
  return { surgery: postOp, graft: parsed.id === 'acl_reconstruction_early', stage: parsed.id === 'patellar_tendinopathy' };
}

/* --- kayıt: okuma ve eski biçim --- */

const LEGACY_AT = '1970-01-01T00:00:00.000Z';

const LEGACY_REGION: Record<ConditionRegion, ConstraintRegion> = {
  spine: 'lower_back',
  neck: 'neck',
  shoulder: 'shoulder',
  elbow: 'elbow',
  wrist: 'wrist_hand',
  hip: 'hip',
  knee: 'knee',
  ankle: 'ankle_foot',
  systemic: 'other',
};

function legacyId(index: number): string {
  return `k_old${index.toString(36).padStart(3, '0')}`;
}

/**
 * Kaydın kısıtları. Yeni biçimde `constraints`; yoksa eski `conditions: string[]` her kimlik bir kısıta çevrilir
 * (§5.4): PT'nin, onaylı, bölge sözlükten (çift bölgede iki taraf), tanının kaynağı danışanın beyanı, bulgu
 * türündekiler gözlem. Tek ameliyatlı tanı varsa üst düzeydeki `surgeryDate` onun ayrıntısına taşınır.
 */
export function constraintsOf(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): Constraint[] {
  if (record.constraints) return record.constraints;
  const legacy = (record.conditions ?? []).flatMap((raw) => {
    const parsed = parseCondition(raw);
    return parsed ? [{ raw, parsed }] : [];
  });
  const postOps = legacy.filter(({ raw }) => detailFields(raw).surgery);
  return legacy.map(({ raw, parsed }, index): Constraint => {
    const info = conditionInfo(parsed.id);
    const region = LEGACY_REGION[info.region];
    const finding = conditionKind(parsed.id) === 'finding';
    const surgery = record.surgeryDate && postOps.length === 1 && postOps[0]?.raw === raw ? { details: { surgeryDate: record.surgeryDate } } : {};
    return {
      id: legacyId(index),
      region,
      ...(isPaired(region) ? { side: 'both' as const } : {}),
      type: 'condition',
      ...(finding ? { findingId: raw } : { conditionId: raw, diagnosisSource: 'client' as const }),
      ...surgery,
      avoid: [],
      status: 'active',
      source: 'pt',
      confirmedAt: LEGACY_AT,
      createdAt: LEGACY_AT,
      updatedAt: LEGACY_AT,
    };
  });
}

export function overridesOf(record: Pick<HealthRecord, 'overrides'>): Override[] {
  return record.overrides ?? [];
}

export function constraintLogOf(record: Pick<HealthRecord, 'constraintLog'>): ConstraintLogEntry[] {
  return record.constraintLog ?? [];
}

/** Kısıt yazımından önce kaydı yeni biçime getirir: eski `conditions` ve `surgeryDate` düşer. */
export function withConstraintsMigrated(record: HealthRecord): HealthRecord {
  const { conditions: _conditions, surgeryDate: _surgery, ...rest } = record;
  return { ...rest, version: 2, constraints: constraintsOf(record) };
}

export function activeConstraints(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): Constraint[] {
  return constraintsOf(record).filter(isActive);
}

export function pendingReports(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): Constraint[] {
  return constraintsOf(record).filter(isPendingReport);
}

/* --- kayıt satırları --- */

export type LogKind = ConstraintLogEntry['kind'];

export function appendConstraintLog(record: HealthRecord, entry: ConstraintLogEntry): HealthRecord {
  const text = entry.text.length > CONSTRAINT_LIMITS.logText ? `${entry.text.slice(0, CONSTRAINT_LIMITS.logText - 1)}…` : entry.text;
  return { ...record, constraintLog: [{ ...entry, text }, ...constraintLogOf(record)].slice(0, CONSTRAINT_LIMITS.log) };
}

/* --- eylemler --- */

/** PT'nin formu (ekle / düzenle / onayla ve düzenle): sunucu şemadan geçirip verir. */
export type ConstraintInput = {
  region: ConstraintRegion;
  side?: ConstraintSide | undefined;
  type: ConstraintType;
  conditionId?: string | undefined;
  diagnosisSource?: DiagnosisSource | undefined;
  findingId?: string | undefined;
  details?: { surgeryDate?: string | undefined; graft?: Graft | undefined; stage?: Stage | undefined } | undefined;
  severity?: Severity | undefined;
  onset?: string | undefined;
  onsetApprox?: boolean | undefined;
  avoid: AvoidTagId[];
  note?: string | undefined;
  clientNote?: string | undefined;
};

/** Danışanın bildirimi. */
export type ReportInput = {
  region: ConstraintRegion;
  side?: ConstraintSide | undefined;
  type: ConstraintType;
  severity: Severity;
  since?: OnsetChoice | undefined;
  triggers: Trigger[];
  note?: string | undefined;
};

type Actor = 'pt' | 'client';

function findConstraint(record: HealthRecord, id: string): { list: Constraint[]; index: number; constraint: Constraint } {
  const list = constraintsOf(record);
  const index = list.findIndex((item) => item.id === id);
  const constraint = list[index];
  if (!constraint) throw new ConstraintError('Kısıt bulunamadı; silinmiş olabilir.', 404);
  return { list, index, constraint };
}

function checkBase(constraint: Constraint, baseUpdatedAt: string | undefined): void {
  if (baseUpdatedAt !== undefined && baseUpdatedAt !== constraint.updatedAt) {
    throw new ConstraintError('Bu kısıt o arada değişti. Sayfayı yenileyip yeniden bak.', 412);
  }
}

function replaceAt(record: HealthRecord, list: Constraint[], index: number, next: Constraint): HealthRecord {
  return { ...record, constraints: list.map((item, position) => (position === index ? next : item)) };
}

function log(record: HealthRecord, at: string, by: Actor, id: string, kind: LogKind, text: string): HealthRecord {
  return appendConstraintLog(record, { at, by, id, kind, text });
}

function withoutEmpty<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as T;
}

/**
 * Formdan gelen alanları kısıta uygular: taraf yalnız çift bölgede; tanının kaynağı yalnız tanıyla; ayrıntılar
 * yalnız ilgili tanıda. Tutarlılık hatası 400.
 */
function applyInput(base: Omit<Constraint, keyof ConstraintInput>, input: ConstraintInput): Constraint {
  if (isPaired(input.region) && !input.side) throw new ConstraintError('Taraf seç.', 400);
  const condition = input.conditionId ? parseCondition(input.conditionId) : null;
  if (input.conditionId && (!condition || conditionKind(condition.id) !== 'diagnosis')) throw new ConstraintError('Tanı sözlükte yok.', 400);
  if (condition && !input.diagnosisSource) throw new ConstraintError('Tanının kaynağını seç.', 400);
  const finding = input.findingId ? parseCondition(input.findingId) : null;
  if (input.findingId && (!finding || conditionKind(finding.id) !== 'finding')) throw new ConstraintError('Gözlem sözlükte yok.', 400);
  const wanted = detailFields(input.conditionId);
  const details = withoutEmpty({
    surgeryDate: wanted.surgery ? input.details?.surgeryDate : undefined,
    graft: wanted.graft ? input.details?.graft : undefined,
    stage: wanted.stage ? input.details?.stage : undefined,
  });
  return withoutEmpty({
    ...base,
    region: input.region,
    side: isPaired(input.region) ? input.side : undefined,
    type: input.type,
    conditionId: input.conditionId || undefined,
    diagnosisSource: condition ? input.diagnosisSource : undefined,
    findingId: input.findingId || undefined,
    details: Object.keys(details).length > 0 ? details : undefined,
    severity: input.severity,
    onset: input.onset || undefined,
    onsetApprox: input.onset && input.onsetApprox ? true : undefined,
    avoid: [...new Set(input.avoid)].sort((a, b) => AVOID_TAG_IDS.indexOf(a) - AVOID_TAG_IDS.indexOf(b)),
    note: input.note?.trim() || undefined,
    clientNote: input.clientNote?.trim() || undefined,
  }) as Constraint;
}

function checkLimits(list: readonly Constraint[]): void {
  if (list.length > CONSTRAINT_LIMITS.total) throw new ConstraintError(`En fazla ${CONSTRAINT_LIMITS.total} kısıt tutulur; kapananlardan silebilirsin.`, 409);
  if (list.filter((item) => item.status === 'active' && !item.declined).length > CONSTRAINT_LIMITS.active) {
    throw new ConstraintError(`En fazla ${CONSTRAINT_LIMITS.active} etkin kısıt olabilir; birini kapat.`, 409);
  }
}

/** Kısıt kimliği: `k_` + 6 küçük harf/rakam; çağıran üretir (sunucuda rastgele). */
export const CONSTRAINT_ID_PATTERN = /^k_[a-z0-9]{6}$/;

/** PT kısıt ekler (onaylı). */
export function addConstraint(
  record: HealthRecord,
  input: ConstraintInput & { origin?: 'screening' | undefined },
  ctx: { id: string; now: string },
): HealthRecord {
  const list = constraintsOf(record);
  if (list.some((item) => item.id === ctx.id)) throw new ConstraintError('Kimlik çakıştı; yeniden dene.', 409);
  const constraint = applyInput(
    withoutEmpty({ id: ctx.id, status: 'active' as const, source: 'pt' as const, confirmedAt: ctx.now, origin: input.origin, createdAt: ctx.now, updatedAt: ctx.now }),
    input,
  );
  const next = [...list, constraint];
  checkLimits(next);
  const avoid = constraint.avoid.length > 0 ? ` · kaçın: ${avoidText(constraint.avoid)}` : '';
  return log({ ...record, constraints: next }, ctx.now, 'pt', ctx.id, 'added', `${regionText(constraint)} eklendi${avoid}`);
}

/** Alan alan ne değişti (kayıt satırı için); değişiklik yoksa boş. */
function changeText(before: Constraint, after: Constraint): string[] {
  const parts: string[] = [];
  if (before.region !== after.region || before.side !== after.side) parts.push(`bölge ${regionText(after).toLocaleLowerCase('tr')}`);
  if (before.type !== after.type) parts.push(`tür ${TYPE_LABELS[after.type].toLocaleLowerCase('tr')}`);
  if (before.severity !== after.severity) {
    parts.push(`${before.severity ? SEVERITY_LABELS[before.severity].toLocaleLowerCase('tr') : 'şiddet yok'} → ${after.severity ? SEVERITY_LABELS[after.severity].toLocaleLowerCase('tr') : 'şiddet yok'}`);
  }
  if (before.conditionId !== after.conditionId) parts.push(after.conditionId ? 'tanı değişti' : 'tanı kaldırıldı');
  if (before.findingId !== after.findingId) parts.push(after.findingId ? 'gözlem değişti' : 'gözlem kaldırıldı');
  if (before.avoid.join() !== after.avoid.join()) parts.push(after.avoid.length > 0 ? `kaçın: ${avoidText(after.avoid)}` : 'kaçınma yok');
  if (before.clientNote !== after.clientNote) parts.push('danışana not');
  if (before.note !== after.note) parts.push('not');
  if (JSON.stringify(before.details ?? {}) !== JSON.stringify(after.details ?? {})) parts.push('ayrıntılar');
  if (before.onset !== after.onset) parts.push('başlangıç');
  return parts;
}

/** PT kısıtı düzenler. Danışanın bekleyen bildirimi düzenlenince onaylanmış olur ("Onayla ve düzenle"). */
export function editConstraint(
  record: HealthRecord,
  id: string,
  input: ConstraintInput,
  ctx: { now: string; baseUpdatedAt?: string | undefined },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  const confirming = isPendingReport(constraint);
  const { region: _r, side: _s, type: _t, conditionId: _c, diagnosisSource: _d, findingId: _f, details: _dt, severity: _sv, onset: _o, onsetApprox: _oa, avoid: _a, note: _n, clientNote: _cn, ...base } = constraint;
  const next = applyInput({ ...base, ...(confirming ? { confirmedAt: ctx.now } : {}), updatedAt: ctx.now }, input);
  const changes = changeText(constraint, next);
  if (!confirming && changes.length === 0) return record;
  const updated = replaceAt(record, list, index, next);
  checkLimits(constraintsOf(updated));
  const text = confirming
    ? `${regionText(next)} onaylandı${next.avoid.length > 0 ? ` · kaçın: ${avoidText(next.avoid)}` : ''}`
    : `${regionText(next)}: ${changes.join(', ')}`;
  return log(updated, ctx.now, 'pt', id, confirming ? 'confirmed' : 'edited', text);
}

/**
 * "Olduğu gibi onayla": danışanın zorlayanları eşlenen kaçınmalara çevrilir (öncekilerle birleşir). Zorlayan
 * yoksa kısıt süzgeçsiz kaydedilir ("Kaydet (süzgeçsiz)"; danışan "Antrenörün gördü" okur).
 */
export function confirmAsIs(record: HealthRecord, id: string, ctx: { now: string; baseUpdatedAt?: string | undefined }): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isPendingReport(constraint)) throw new ConstraintError('Bu bildirim zaten karara bağlanmış.', 409);
  const avoid = [...new Set([...constraint.avoid, ...avoidFromTriggers(constraint.triggers)])].sort(
    (a, b) => AVOID_TAG_IDS.indexOf(a) - AVOID_TAG_IDS.indexOf(b),
  );
  const next: Constraint = { ...constraint, avoid, confirmedAt: ctx.now, updatedAt: ctx.now };
  const updated = replaceAt(record, list, index, next);
  checkLimits(constraintsOf(updated));
  const text = avoid.length > 0 ? `${regionText(next)} onaylandı · kaçın: ${avoidText(avoid)}` : `${regionText(next)} görüldü (süzgeçsiz)`;
  return log(updated, ctx.now, 'pt', id, 'confirmed', text);
}

/** "Kaydetmeden kapat": bildirim kısıt olmadan kapanır; danışan notu görür. */
export function declineReport(
  record: HealthRecord,
  id: string,
  ctx: { now: string; note?: string | undefined; baseUpdatedAt?: string | undefined },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isPendingReport(constraint)) throw new ConstraintError('Bu bildirim zaten karara bağlanmış.', 409);
  const note = ctx.note?.trim();
  const next: Constraint = { ...constraint, declined: { at: ctx.now, ...(note ? { note } : {}) }, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'declined', `${regionText(next)} bildirimi kısıt olarak alınmadı`);
}

export function resolveConstraint(record: HealthRecord, id: string, ctx: { now: string; baseUpdatedAt?: string | undefined }): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (constraint.status === 'resolved') return record;
  const { clientChange: _change, ...rest } = constraint;
  const next: Constraint = { ...rest, status: 'resolved', resolvedAt: ctx.now, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'resolved', `${regionText(next)} kapandı`);
}

export function reopenConstraint(record: HealthRecord, id: string, ctx: { now: string; baseUpdatedAt?: string | undefined }): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (constraint.status === 'active' && !constraint.declined) return record;
  const { resolvedAt: _resolved, declined: _declined, ...rest } = constraint;
  // Reddedilmiş bildirim yeniden açılınca PT'nin kaydı olur (karar verildi).
  const next: Constraint = { ...rest, status: 'active', ...(constraint.declined ? { confirmedAt: ctx.now } : {}), updatedAt: ctx.now };
  const updated = replaceAt(record, list, index, next);
  checkLimits(constraintsOf(updated));
  return log(updated, ctx.now, 'pt', id, 'reopened', `${regionText(next)} yeniden açıldı`);
}

/** Danışanın güncellemesini gördü; `close` ile "düzeldi" diyen kısıtı kapatır. */
export function ackClientChange(
  record: HealthRecord,
  id: string,
  ctx: { now: string; close?: boolean | undefined; baseUpdatedAt?: string | undefined },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!constraint.clientChange) return record;
  const { clientChange: _change, ...rest } = constraint;
  if (ctx.close) {
    const next: Constraint = { ...rest, status: 'resolved', resolvedAt: ctx.now, updatedAt: ctx.now };
    return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'resolved', `${regionText(next)} kapandı (danışan düzeldi dedi)`);
  }
  const next: Constraint = { ...rest, updatedAt: ctx.now };
  return replaceAt(record, list, index, next);
}

/** "Sağlık profesyoneline yönlendirdim" (tarih). */
export function referConstraint(
  record: HealthRecord,
  id: string,
  ctx: { now: string; date: string; baseUpdatedAt?: string | undefined },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isRedFlag(constraint)) throw new ConstraintError('Yönlendirme yalnız kırmızı bayraklı tanıda kaydedilir.', 409);
  const next: Constraint = { ...constraint, referredAt: ctx.date, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'referred', `${regionText(next)}: sağlık profesyoneline yönlendirildi`);
}

/** "Görüş alındı": tarih, dayanak, kısa kapsam. Kauda ekinada görüş yasağı kaldırmaz ama kaydedilir. */
export function clearConstraint(
  record: HealthRecord,
  id: string,
  ctx: { now: string; date: string; basis: ClearanceBasis; scope?: string | undefined; baseUpdatedAt?: string | undefined },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isRedFlag(constraint)) throw new ConstraintError('Görüş yalnız kırmızı bayraklı tanıda kaydedilir.', 409);
  const scope = ctx.scope?.trim();
  const next: Constraint = {
    ...constraint,
    referredAt: constraint.referredAt ?? ctx.date,
    clearance: { at: ctx.date, basis: ctx.basis, ...(scope ? { scope } : {}) },
    updatedAt: ctx.now,
  };
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'cleared', `${regionText(next)}: görüş alındı (${CLEARANCE_BASIS_LABELS[ctx.basis].toLocaleLowerCase('tr')})`);
}

/** Yanlış kaydı çıkarır; izinleri de. */
export function removeConstraint(record: HealthRecord, id: string, ctx: { now: string; by?: Actor }): HealthRecord {
  const { constraint } = findConstraint(record, id);
  const next: HealthRecord = {
    ...record,
    constraints: constraintsOf(record).filter((item) => item.id !== id),
    overrides: overridesOf(record).filter((item) => item.source !== id),
  };
  return log(next, ctx.now, ctx.by ?? 'pt', id, 'removed', `${regionText(constraint)} silindi`);
}

/** Danışana özel izin ("Yine de ekle", "İzin ver"). */
export function addOverride(
  record: HealthRecord,
  input: { exerciseId: string; source: string; note?: string | undefined },
  ctx: { now: string; title: string },
): HealthRecord {
  const { constraint } = findConstraint(record, input.source);
  if (!isActive(constraint)) throw new ConstraintError('İzin yalnız etkin kısıta verilir.', 409);
  if (!overridable(constraint)) {
    throw new ConstraintError(
      isEmergency(constraint) ? 'Bu kısıtta izin verilemez.' : 'Sağlık profesyonelinin görüşü kaydedilene kadar izin verilemez.',
      409,
    );
  }
  const list = overridesOf(record).filter((item) => !(item.exerciseId === input.exerciseId && item.source === input.source));
  const note = input.note?.trim();
  const next = [...list, { exerciseId: input.exerciseId, source: input.source, at: ctx.now, ...(note ? { note } : {}) }];
  if (next.length > CONSTRAINT_LIMITS.overrides) throw new ConstraintError(`En fazla ${CONSTRAINT_LIMITS.overrides} izin tutulur.`, 409);
  return log({ ...record, overrides: next }, ctx.now, 'pt', input.source, 'override_added', `${regionText(constraint)}: izin verildi · ${ctx.title}`);
}

export function removeOverride(
  record: HealthRecord,
  input: { exerciseId: string; source: string },
  ctx: { now: string; title: string },
): HealthRecord {
  const list = overridesOf(record);
  const kept = list.filter((item) => !(item.exerciseId === input.exerciseId && item.source === input.source));
  if (kept.length === list.length) throw new ConstraintError('İzin bulunamadı; kaldırılmış olabilir.', 404);
  const constraint = constraintsOf(record).find((item) => item.id === input.source);
  const where = constraint ? regionText(constraint) : 'Kısıt';
  return log({ ...record, overrides: kept }, ctx.now, 'pt', input.source, 'override_removed', `${where}: izin kaldırıldı · ${ctx.title}`);
}

/* --- danışanın eylemleri --- */

function addMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number);
  const total = (y ?? 1970) * 12 + ((m ?? 1) - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "Ne zamandan beri?" → yaklaşık başlangıç: bu hafta ve bu ay bugünün ayı, 1–6 ay üç ay önce, daha uzun geçen yıl. */
export function onsetFromChoice(choice: OnsetChoice | undefined, today: string): { onset?: string; onsetApprox?: true } {
  if (!choice) return {};
  if (choice === 'week') return { onset: today, onsetApprox: true };
  if (choice === 'month') return { onset: today.slice(0, 7), onsetApprox: true };
  if (choice === 'months') return { onset: addMonths(today, -3), onsetApprox: true };
  return { onset: String(Number(today.slice(0, 4)) - 1), onsetApprox: true };
}

function reportFields(input: ReportInput, today: string) {
  if (isPaired(input.region) && !input.side) throw new ConstraintError('Hangi taraf olduğunu seç.', 400);
  const note = input.note?.trim();
  const triggers = [...new Set(input.triggers)].sort((a, b) => TRIGGERS.indexOf(a) - TRIGGERS.indexOf(b));
  return withoutEmpty({
    region: input.region,
    side: isPaired(input.region) ? input.side : undefined,
    type: input.type,
    severity: input.severity,
    ...onsetFromChoice(input.since, today),
    triggers: triggers.length > 0 ? triggers : undefined,
    reportNote: note || undefined,
  });
}

/** Danışan yeni bir şey bildirir. */
export function reportConstraint(record: HealthRecord, input: ReportInput, ctx: { id: string; now: string; today: string }): HealthRecord {
  const list = constraintsOf(record);
  if (list.some((item) => item.id === ctx.id)) throw new ConstraintError('Kimlik çakıştı; yeniden dene.', 409);
  if (list.filter(isPendingReport).length >= 5) throw new ConstraintError('Antrenörünün bakmadığı 5 bildirimin var; önce onları beklemelisin.', 409);
  const constraint = { id: ctx.id, ...reportFields(input, ctx.today), avoid: [], status: 'active', source: 'client', createdAt: ctx.now, updatedAt: ctx.now } as Constraint;
  const next = [...list, constraint];
  checkLimits(next);
  const severity = constraint.severity ? ` (${SEVERITY_LABELS[constraint.severity].toLocaleLowerCase('tr')})` : '';
  return log({ ...record, constraints: next }, ctx.now, 'client', ctx.id, 'reported', `${regionText(constraint)} bildirildi${severity}`);
}

function ownPending(record: HealthRecord, id: string) {
  const found = findConstraint(record, id);
  if (!isPendingReport(found.constraint)) throw new ConstraintError('Antrenörün bu bildirime baktı; artık "Kötüleşti" ya da "Düzeldi" diyebilirsin.', 409);
  return found;
}

/** Danışan bekleyen bildirimini düzeltir. */
export function editReport(record: HealthRecord, id: string, input: ReportInput, ctx: { now: string; today: string }): HealthRecord {
  const { list, index, constraint } = ownPending(record, id);
  const { region: _r, side: _s, type: _t, severity: _sv, onset: _o, onsetApprox: _oa, triggers: _tr, reportNote: _rn, ...base } = constraint;
  const next = { ...base, ...reportFields(input, ctx.today), updatedAt: ctx.now } as Constraint;
  return log(replaceAt(record, list, index, next), ctx.now, 'client', id, 'edited', `${regionText(next)} bildirimi düzeltildi`);
}

/** Danışan bekleyen bildirimini geri çeker (kayıttan çıkar; satır kalır). */
export function withdrawReport(record: HealthRecord, id: string, ctx: { now: string }): HealthRecord {
  const { constraint } = ownPending(record, id);
  const next: HealthRecord = { ...record, constraints: constraintsOf(record).filter((item) => item.id !== id) };
  return log(next, ctx.now, 'client', id, 'withdrawn', `Bildirim geri çekildi: ${regionText(constraint)}`);
}

const SEVERITY_RANK: Record<Severity, number> = { mild: 1, moderate: 2, severe: 3 };

/**
 * "Kötüleşti" (güvenli yön, hemen yazılır): şiddet görünür, PT'nin Dikkat maddesi doğar. Şiddet yalnız artar. PT
 * bakmadan ikinci kez kötüleşirse başlangıç ilk bakılmamış şiddettir ("hafif → şiddetli", aradaki "orta" değil).
 */
export function reportWorse(record: HealthRecord, id: string, severity: Severity, ctx: { now: string }): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  if (!isActive(constraint)) throw new ConstraintError('Bu kısıt artık etkin değil.', 409);
  const before = constraint.severity;
  if (before && SEVERITY_RANK[severity] <= SEVERITY_RANK[before]) throw new ConstraintError('Şiddet şimdikinden yüksek olmalı.', 400);
  const pending = constraint.clientChange && !constraint.clientChange.resolved ? constraint.clientChange : null;
  const origin = pending ? pending.previousSeverity : before;
  const next: Constraint = {
    ...constraint,
    severity,
    clientChange: { at: ctx.now, severity, ...(origin ? { previousSeverity: origin } : {}) },
    updatedAt: ctx.now,
  };
  const from = before ? `${SEVERITY_LABELS[before].toLocaleLowerCase('tr')} → ` : '';
  return log(replaceAt(record, list, index, next), ctx.now, 'client', id, 'worsened', `${regionText(next)}: ${from}${SEVERITY_LABELS[severity].toLocaleLowerCase('tr')} (danışan)`);
}

/**
 * "Düzeldi": kısıt PT onaylayana kadar kapanmaz (gevşeten yön). PT'nin bakmadığı bir kötüleşme varsa şiddeti
 * güncellemede kalır: "şiddetli"nin dikkati "Düzeldi" ile değil PT'nin kararıyla kalkar (`severeUnreviewed`).
 */
export function reportBetter(record: HealthRecord, id: string, ctx: { now: string }): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  if (!isActive(constraint)) throw new ConstraintError('Bu kısıt artık etkin değil.', 409);
  const worse = constraint.clientChange?.severity ? constraint.clientChange : null;
  const carried = worse ? { severity: worse.severity, ...(worse.previousSeverity ? { previousSeverity: worse.previousSeverity } : {}) } : {};
  const next: Constraint = { ...constraint, clientChange: { at: ctx.now, resolved: true, ...carried }, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'client', id, 'improved', `${regionText(next)}: düzeldi dedi (danışan)`);
}

/* --- danışanın görünümü --- */

export type ClientConstraintState = 'pending' | 'confirmed' | 'seen' | 'declined' | 'resolved';

export type ClientConstraintView = {
  id: string;
  region: ConstraintRegion;
  side?: ConstraintSide;
  title: string;
  type: string;
  severity?: Severity;
  diagnosis: string | null;
  clientNote?: string;
  reportNote?: string;
  state: ClientConstraintState;
  /** Kararın ya da bildirimin anı. */
  at: string;
  declinedNote?: string;
  /** Danışanın bekleyen güncellemesi ("Düzeldi dedin, antrenörün bakacak"). */
  change?: 'worse' | 'better';
  triggers?: Trigger[];
  since?: OnsetChoice;
  /** Bekleyen bildirimde düzeltme formunu doldurmak için. */
  typeId: ConstraintType;
};

/**
 * Danışanın Sağlık sayfasındaki kısıtları (§5.2): bölge · taraf · tür · şiddet · antrenörün notu; tanı adı yalnız
 * hekim kaynaklı ve niteleyicisiz; gözlem ve PT'nin notu hiç yok.
 */
export function clientConstraintView(constraint: Constraint): ClientConstraintView {
  const state: ClientConstraintState = constraint.declined
    ? 'declined'
    : constraint.status === 'resolved'
      ? 'resolved'
      : isPendingReport(constraint)
        ? 'pending'
        : hasFilterEffect(constraint)
          ? 'confirmed'
          : 'seen';
  const at = constraint.declined?.at ?? (state === 'resolved' ? constraint.resolvedAt : undefined) ?? constraint.confirmedAt ?? constraint.createdAt;
  return withoutEmpty({
    id: constraint.id,
    region: constraint.region,
    side: constraint.side,
    title: regionText(constraint),
    type: TYPE_LABELS[constraint.type],
    typeId: constraint.type,
    severity: constraint.severity,
    diagnosis: clientDiagnosis(constraint),
    clientNote: constraint.clientNote,
    reportNote: state === 'pending' ? constraint.reportNote : undefined,
    state,
    at,
    declinedNote: constraint.declined?.note,
    change: constraint.clientChange ? (constraint.clientChange.resolved ? 'better' : 'worse') : undefined,
    triggers: state === 'pending' ? constraint.triggers : undefined,
  }) as ClientConstraintView;
}

/**
 * Bildirimden sonraki metin (§2.4): şiddetli ya da bu hafta başlayan yeni sakatlıkta bölgeyi zorlayan hareketleri
 * yapmaması ve gerekirse görünmesi söylenir; öteki durumlarda dikkatli olması.
 */
export function afterReportText(input: Pick<ReportInput, 'severity' | 'type' | 'since'>): string {
  const serious = input.severity === 'severe' || (input.type === 'injury' && input.since === 'week');
  return serious
    ? "Antrenörüne iletildi. Antrenörün bakana kadar bu bölgeyi zorlayan hareketleri yapma; ağrı günlük hayatını etkiliyorsa bir sağlık profesyoneline görün."
    : "Antrenörüne iletildi. Antrenörün bakana kadar zorlayan hareketlerde dikkatli ol; ağrı yaparsa 'Hareketi geç' ya da 'Değiştir'i kullan.";
}

/** Bildirim sheet'inin iki kademeli güvenlik metni (§2.4; Finucane 2020, Stiell 1992, Stiell 1995; seçim [sentez]). */
export const REPORT_SAFETY = {
  urgent: 'İdrar ya da dışkılamada yeni değişiklik, kasıkta uyuşma ya da yeni güç kaybı varsa beklemeden acil servise başvur.',
  other:
    'Geceleri uyandıran ağrı, düşme ya da darbeden sonra üstüne basamama, hızla şişen ya da kilitlenen eklem varsa antrenmandan önce bir sağlık profesyoneline görün.',
} as const;

/** Kauda ekina seçilince ve Dikkat maddesinde (yoklamanın "Bugün yük yok" diliyle aynı). */
export const EMERGENCY_TEXT = 'Acil: danışanı bugün acil servise yönlendir.';

/* --- PT'nin kartları için özet --- */

/** Kısıtlar sayfası ve Genel'deki özet sayıları. */
export function constraintCounts(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): {
  active: number;
  pending: number;
  changes: number;
  awaiting: number;
  /** Danışanın PT'nin bakmadığı "şiddetli"si (onaylıda kötüleşme ya da şiddetli bildirim). */
  severe: number;
} {
  const list = constraintsOf(record);
  return {
    active: list.filter(isActive).length,
    pending: list.filter(isPendingReport).length,
    changes: list.filter((item) => isActive(item) && item.clientChange).length,
    awaiting: list.filter(awaitsOpinion).length,
    severe: list.filter(severeUnreviewed).length,
  };
}

/** Kırmızı bayrakta adım: yönlendirme bekliyor, görüş bekliyor, görüş alındı; bayrak yoksa null. */
export function redFlagStep(constraint: Constraint): 'refer' | 'opinion' | 'cleared' | null {
  if (!isRedFlag(constraint)) return null;
  if (constraint.clearance) return 'cleared';
  return constraint.referredAt ? 'opinion' : 'refer';
}
