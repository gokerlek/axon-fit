import { progressionOf, type ProgressionRule, type ProgressionScheme, type TrackingType } from './progression.ts';
import type { Category } from '@/lib/schemas/exercise';

/**
 * Antrenman şablonu — okuma tarafı (SPEC §7.4).
 *
 * Şablon sıralı bloklardan oluşur; blok tek hareket ya da gruptur (süperset, devre,
 * kompleks). Her hareket bir satırdır ve kalıcı kimliği vardır: antrenman kayıtları
 * satıra `şablon kimliği + satır kimliği` ile bağlanır. Set sayısı ve dinlenme
 * bloktadır; grupta `sets` tur sayısıdır (her hareket turda bir set yapar).
 * Isınma setleri saklanmaz, antrenmanda `warmupSets` ile hesaplanır.
 *
 * Saf fonksiyonlar; yol takma adıyla çalışma zamanı içe aktarması yapmaz (testler
 * Node'un kendi test aracıyla çalışır). Kas payları (`exerciseSetWeights`) çağırandan gelir.
 */

export const TEMPLATE_ID_PATTERN = /^t_[a-z0-9]{8}$/;
export const BLOCK_ID_PATTERN = /^b_[a-z0-9]{6}$/;
export const ROW_ID_PATTERN = /^r_[a-z0-9]{6}$/;

export const BLOCK_KINDS = ['single', 'superset', 'circuit', 'complex'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  single: 'Tek hareket',
  superset: 'Süperset',
  circuit: 'Devre',
  complex: 'Kompleks',
};

export const BLOCK_KIND_HINTS: Record<Exclude<BlockKind, 'single'>, string> = {
  superset: 'İki hareket arka arkaya; dinlenme turun sonunda.',
  circuit: 'İstasyonlar arasında kısa geçiş; dinlenme turun sonunda.',
  complex: 'Aynı ağırlıkla ara vermeden; dinlenme turun sonunda.',
};

/** Blok türüne göre hareket sayısı. */
export const BLOCK_ROWS: Record<BlockKind, { min: number; max: number }> = {
  single: { min: 1, max: 1 },
  superset: { min: 2, max: 2 },
  circuit: { min: 3, max: 8 },
  complex: { min: 2, max: 6 },
};

export const TEMPLATE_LIMITS = {
  name: 60,
  description: 300,
  blocks: 30,
  rows: 40,
  sets: 10,
  restSeconds: 600,
  transitionSeconds: 120,
  note: 200,
  repsMax: 100,
  secondsMax: 3600,
} as const;

/** Yeni tek hareketin çalışma seti, türüne göre. */
export const DEFAULT_SETS: Record<Category, number> = {
  compound: 3,
  isolation: 3,
  conditioning: 3,
  warmup: 1,
  cooldown: 1,
};

/** Yeni tek hareketin setler arası dinlenmesi (sn), türüne göre. */
export const DEFAULT_REST_SECONDS: Record<Category, number> = {
  compound: 120,
  isolation: 60,
  conditioning: 60,
  warmup: 30,
  cooldown: 30,
};

/** Yeni grubun tur sonu dinlenmesi (sn). */
export const DEFAULT_GROUP_REST_SECONDS = { superset: 90, circuit: 120, complex: 120 } as const;
/** Devrede istasyonlar arası geçiş (sn). */
export const DEFAULT_TRANSITION_SECONDS = 15;
/** Süre tahmininde bir tekrarın süresi (sn). */
export const SECONDS_PER_REP = 3;
/** Egzersiz yoksa (silinmiş) kullanılan dinlenme. */
export const FALLBACK_REST_SECONDS = 90;

// Yapısal tipler: Valibot şemasının çıktısı (`schemas/template.ts`) bunlarla aynı şekildedir.
export type TemplateTarget = { min: number; max: number };
export type RuleOverride = { scheme: ProgressionScheme; targetRir: number };
export type TemplateRow = {
  id: string;
  exerciseId: string;
  /** Tekrar aralığı; süreli harekette saniye. */
  target: TemplateTarget;
  /** Egzersizin kuralının yerine: ilerleme türü ve yedekte tekrar. */
  rule?: RuleOverride;
  /** Aynı hareket başka cihazda. Yoksa egzersizin kendi cihazı. */
  deviceId?: string;
  note?: string;
};
export type TemplateBlock = {
  id: string;
  kind: BlockKind;
  /** Tek harekette çalışma seti; grupta tur. */
  sets: number;
  /** Tek harekette setler arası; grupta tur sonu dinlenme. */
  restSeconds: number;
  /** Yalnız devre: istasyonlar arası geçiş. */
  transitionSeconds?: number;
  rows: TemplateRow[];
};
export type TemplateBody = { blocks: readonly TemplateBlock[] };

/** Hesap için gereken egzersiz alanları (egzersiz şemasının alt kümesi). */
export type PlanExercise = {
  id: string;
  title: string;
  category: Category;
  trackingType: TrackingType;
  equipment: string;
  deviceId?: string;
  progression?: ProgressionRule;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  stabilizerMuscles?: readonly string[];
};

/** Antrenman ekranının set sırası: hangi satır, kaçıncı tur, ardından ne kadar dinlenme. */
export type SetSlot = { blockId: string; rowId: string; round: number; restAfterSeconds: number };

const SHAPE_MESSAGES: Record<BlockKind, string> = {
  single: 'Tek hareketlik blokta bir hareket olur.',
  superset: 'Süperset iki hareketten oluşur.',
  circuit: 'Devre 3 ile 8 hareket arasında olur.',
  complex: 'Kompleks 2 ile 6 hareket arasında olur.',
};

/** Blok türü hareket sayısına uymuyorsa sebebi; uyuyorsa `null`. */
export function blockShapeProblem(kind: BlockKind, rowCount: number): string | null {
  const { min, max } = BLOCK_ROWS[kind];
  return rowCount >= min && rowCount <= max ? null : SHAPE_MESSAGES[kind];
}

/**
 * Hareket sayısı değişince türün uyarlanması: tür yeni sayıya uyuyorsa kalır, uymuyorsa
 * en yakın tür (üçüncü hareket eklenen süperset devre olur, tek hareket kalan grup tekleşir).
 */
export function settleKind(kind: BlockKind, rowCount: number): BlockKind {
  if (rowCount <= 1) return 'single';
  if (rowCount === 2) return kind === 'superset' || kind === 'complex' ? kind : 'superset';
  if (rowCount <= BLOCK_ROWS.complex.max) return kind === 'circuit' || kind === 'complex' ? kind : 'circuit';
  return 'circuit';
}

/** Bu hareket sayısında seçilebilecek türler. */
export function kindOptions(rowCount: number): BlockKind[] {
  const options = BLOCK_KINDS.filter((kind) => blockShapeProblem(kind, rowCount) === null);
  return options.length > 0 ? options : [settleKind('single', rowCount)];
}

export function countRows(blocks: readonly TemplateBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.rows.length, 0);
}

/** Birden çok kez geçen blok ve satır kimlikleri (temiz şablonda boş). */
export function duplicateIds(blocks: readonly TemplateBlock[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)])) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

type RuleSource = Pick<PlanExercise, 'category' | 'trackingType' | 'progression'>;

/** Yeni satırın hedefi: egzersizin kuralındaki aralık. */
export function defaultTarget(exercise: RuleSource): TemplateTarget {
  const rule = progressionOf(exercise);
  return { min: rule.targetMin, max: rule.targetMax };
}

/**
 * Satırın geçerli ilerleme kuralı: tür ve yedekte tekrar satırdan (değiştirildiyse) ya da
 * egzersizden, hedef aralığı her zaman satırdan. `nextSession()`'a doğrudan verilir.
 */
export function ruleFor(row: Pick<TemplateRow, 'rule' | 'target'>, exercise: RuleSource): ProgressionRule {
  const base = progressionOf(exercise);
  return {
    scheme: row.rule?.scheme ?? base.scheme,
    targetRir: row.rule?.targetRir ?? base.targetRir,
    targetMin: row.target.min,
    targetMax: row.target.max,
  };
}

/** Satırın cihazı: şablonda değiştirildiyse o, yoksa egzersizin kendi cihazı. */
export function effectiveDeviceId(row: Pick<TemplateRow, 'deviceId'>, exercise?: Pick<PlanExercise, 'deviceId'>): string | undefined {
  return row.deviceId ?? exercise?.deviceId;
}

/**
 * Antrenmandaki set sırası. Tek harekette setler arka arkaya; grupta her tur, satırlar
 * sırayla (süperset ve komplekste aralarında dinlenme yok, devrede istasyon geçişi),
 * dinlenme turun sonunda. Şablonun son setinden sonra dinlenme yok.
 */
export function setSlots(template: TemplateBody): SetSlot[] {
  const slots: SetSlot[] = [];
  for (const block of template.blocks) {
    const between = block.kind === 'circuit' ? (block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS) : 0;
    for (let round = 0; round < block.sets; round++) {
      block.rows.forEach((row, index) => {
        const last = index === block.rows.length - 1;
        slots.push({ blockId: block.id, rowId: row.id, round, restAfterSeconds: last ? block.restSeconds : between });
      });
    }
  }
  const final = slots.at(-1);
  if (final) final.restAfterSeconds = 0;
  return slots;
}

const NO_LOAD_CATEGORIES = new Set<Category>(['warmup', 'cooldown']);

function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Şablon kas haritası: kas başına kesirli set toplamı (hedef 1 · yardımcı 0,5 ·
 * dengeleyici 0,25; aynı kas birden çok harekette varsa toplanır). Isınma ve soğuma
 * türündeki hareketler sayılmaz; kütüphanede olmayan egzersizin satırı `missingRowIds`'e
 * düşer. `cardio` anahtarı korunur (harita onu çizmez, açıklama yazar).
 */
export function templateMuscleLoad<E extends PlanExercise>(
  template: TemplateBody,
  exercises: ReadonlyMap<string, E>,
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>,
): { load: Record<string, number>; missingRowIds: string[] } {
  const load: Record<string, number> = {};
  const missingRowIds: string[] = [];
  for (const block of template.blocks) {
    for (const row of block.rows) {
      const exercise = exercises.get(row.exerciseId);
      if (!exercise) {
        missingRowIds.push(row.id);
        continue;
      }
      if (NO_LOAD_CATEGORIES.has(exercise.category)) continue;
      for (const [muscle, weight] of Object.entries(setWeightsOf(exercise))) {
        if (weight) load[muscle] = (load[muscle] ?? 0) + block.sets * weight;
      }
    }
  }
  for (const muscle of Object.keys(load)) load[muscle] = clean(load[muscle] ?? 0);
  return { load, missingRowIds };
}

/** Haritanın tonu: şablonun en çok çalışan kası 1; sıfırlar ve kardiyo dışarıda. */
export function loadIntensity(load: Readonly<Record<string, number>>): Record<string, number> {
  const body = Object.entries(load).filter(([muscle, value]) => muscle !== 'cardio' && value > 0);
  const max = Math.max(0, ...body.map(([, value]) => value));
  if (max <= 0) return {};
  return Object.fromEntries(body.map(([muscle, value]) => [muscle, clean(value / max)]));
}

/**
 * Tahmini süre (dk, 5'e yuvarlanır): her set hedefin ortası kadar sürer (tekrarda
 * tekrar başına 3 sn, süreli harekette saniye) + ardındaki dinlenme. Isınma setleri
 * hariç. Kütüphanede olmayan egzersiz tekrarlı sayılır.
 */
export function estimateMinutes(template: TemplateBody, exercises: ReadonlyMap<string, Pick<PlanExercise, 'trackingType'>>): number {
  const rows = new Map(template.blocks.flatMap((block) => block.rows.map((row) => [row.id, row] as const)));
  const slots = setSlots(template);
  if (slots.length === 0) return 0;
  let seconds = 0;
  for (const slot of slots) {
    const row = rows.get(slot.rowId);
    if (!row) continue;
    const middle = (row.target.min + row.target.max) / 2;
    const isDuration = exercises.get(row.exerciseId)?.trackingType === 'duration';
    seconds += (isDuration ? middle : middle * SECONDS_PER_REP) + slot.restAfterSeconds;
  }
  return Math.ceil(seconds / 300) * 5;
}

/**
 * Isınma için "kas grubunun ilk hareketi" olan satırlar (`warmupSets({ isFirstForMuscle })`).
 * Şablon sırasıyla: hedef kaslarından (kardiyo hariç) en az biri daha önceki bir satırda
 * hedef olmadıysa satır ilktir. Gruptaki satırlar sırasıyla sayılır; ısınma/soğuma
 * hareketleri ve kütüphanede olmayan egzersizler hesaba girmez.
 */
export function firstForMuscleRowIds(template: TemplateBody, exercises: ReadonlyMap<string, PlanExercise>): Set<string> {
  const seen = new Set<string>();
  const first = new Set<string>();
  for (const block of template.blocks) {
    for (const row of block.rows) {
      const exercise = exercises.get(row.exerciseId);
      if (!exercise || NO_LOAD_CATEGORIES.has(exercise.category)) continue;
      const primary = exercise.primaryMuscles.filter((muscle) => muscle !== 'cardio');
      if (primary.some((muscle) => !seen.has(muscle))) first.add(row.id);
      for (const muscle of primary) seen.add(muscle);
    }
  }
  return first;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Satır etiketleri: bloklar 1'den numaralanır, gruptaki satırlar harf alır ("2a", "2b"). */
export function rowLabels(template: TemplateBody): Map<string, string> {
  const labels = new Map<string, string>();
  template.blocks.forEach((block, index) => {
    const number = String(index + 1);
    if (block.kind === 'single' && block.rows.length === 1) {
      const row = block.rows[0];
      if (row) labels.set(row.id, number);
      return;
    }
    block.rows.forEach((row, rowIndex) => labels.set(row.id, `${number}${LETTERS[rowIndex] ?? rowIndex + 1}`));
  });
  return labels;
}

export type TemplateSummary = {
  /** Kütüphanede olan hareketler (silinmiş egzersizin satırı sayılmaz). */
  rows: number;
  /** Çalışma setleri: satır başına bloğun set/tur sayısı, bütün türler. */
  workingSets: number;
  groups: { superset: number; circuit: number; complex: number };
  missingRowIds: string[];
  /** Kullanılan cihazlar, şablon sırasıyla (satırdaki değişiklik egzersizin cihazına üstün). */
  deviceIds: string[];
  minutes: number;
};

/** Liste kartı ve detaydaki özet: hareket, set, grup, cihaz ve tahmini süre. */
export function templateSummary(template: TemplateBody, exercises: ReadonlyMap<string, PlanExercise>): TemplateSummary {
  const groups = { superset: 0, circuit: 0, complex: 0 };
  const missingRowIds: string[] = [];
  const deviceIds: string[] = [];
  let rows = 0;
  let workingSets = 0;
  for (const block of template.blocks) {
    if (block.kind !== 'single') groups[block.kind] += 1;
    for (const row of block.rows) {
      const exercise = exercises.get(row.exerciseId);
      if (!exercise) {
        missingRowIds.push(row.id);
        continue;
      }
      rows += 1;
      workingSets += block.sets;
      const deviceId = effectiveDeviceId(row, exercise);
      if (deviceId && !deviceIds.includes(deviceId)) deviceIds.push(deviceId);
    }
  }
  // Silinmiş egzersiz sayılara girmez; süre de onsuz tahmin edilir.
  const missing = new Set(missingRowIds);
  const counted = missing.size
    ? {
        blocks: template.blocks
          .map((block) => ({ ...block, rows: block.rows.filter((row) => !missing.has(row.id)) }))
          .filter((block) => block.rows.length > 0),
      }
    : template;
  return { rows, workingSets, groups, missingRowIds, deviceIds, minutes: estimateMinutes(counted, exercises) };
}

function count(value: number): string {
  return value.toLocaleString('tr-TR');
}

/** "8–12 tekrar", "5 tekrar", "30–60 sn". */
export function formatTarget(target: TemplateTarget, trackingType: TrackingType): string {
  const unit = trackingType === 'duration' ? 'sn' : 'tekrar';
  return target.min === target.max ? `${count(target.min)} ${unit}` : `${count(target.min)}–${count(target.max)} ${unit}`;
}

/** "Ara yok", "45 sn", "1 dk", "1 dk 30 sn". */
export function formatRest(seconds: number): string {
  if (seconds <= 0) return 'Ara yok';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} sn`;
  return rest === 0 ? `${minutes} dk` : `${minutes} dk ${rest} sn`;
}

function restPhrase(seconds: number, where: string): string {
  return seconds > 0 ? `${where}${formatRest(seconds)} dinlenme` : `${where}dinlenme yok`;
}

/** Bloğun tek satırlık anlatımı (detayda grup başlığı, düzenleyicide ipucu). */
export function describeBlock(block: Pick<TemplateBlock, 'kind' | 'sets' | 'restSeconds' | 'transitionSeconds'>): string {
  const rounds = `${count(block.sets)} tur`;
  switch (block.kind) {
    case 'single':
      return `${count(block.sets)} set · ${restPhrase(block.restSeconds, '')}`;
    case 'superset':
      return `${rounds} · ${restPhrase(block.restSeconds, 'tur sonunda ')}`;
    case 'circuit': {
      const transition = block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
      const between = transition > 0 ? `istasyon arası ${formatRest(transition)}` : 'istasyon arası ara yok';
      return `${rounds} · ${between} · ${restPhrase(block.restSeconds, 'tur sonunda ')}`;
    }
    case 'complex':
      return `${rounds} · ara vermeden, aynı ağırlıkla · ${restPhrase(block.restSeconds, 'tur sonunda ')}`;
  }
}

const REPS_TRACKING = new Set<TrackingType>(['weight_reps', 'bodyweight_reps']);

/**
 * Kayıttan önce sunucuda: kütüphaneye ve cihazlara göre denetim ve sadeleştirme.
 * Hata anahtarları Formisch yollarıdır (`blocks.0.rows.1.deviceId`).
 * - Kütüphanede olmayan egzersiz ya da cihaz reddedilir; tekrarda hedef en fazla 100.
 * - Egzersizin kuralıyla aynı olan kural değişikliği ve egzersizin kendi cihazı yazılmaz.
 * - Not kırpılır, boşsa yazılmaz; istasyon geçişi yalnız devrede durur (yoksa 15 sn).
 */
export function normalizeTemplate(
  body: TemplateBody,
  ctx: { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> },
): { blocks: TemplateBlock[]; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const blocks = body.blocks.map((block, i): TemplateBlock => {
    const rows = block.rows.map((row, j): TemplateRow => {
      const at = `blocks.${i}.rows.${j}`;
      const exercise = ctx.exercises.get(row.exerciseId);
      if (!exercise) errors[`${at}.exerciseId`] = 'Bu egzersiz kütüphanede yok; değiştir ya da kaldır.';
      if (exercise && REPS_TRACKING.has(exercise.trackingType) && row.target.max > TEMPLATE_LIMITS.repsMax) {
        errors[`${at}.target.max`] = `Tekrar hedefi en fazla ${TEMPLATE_LIMITS.repsMax}.`;
      }
      let deviceId = row.deviceId;
      if (deviceId !== undefined && !ctx.deviceIds.has(deviceId)) errors[`${at}.deviceId`] = 'Bu cihaz artık yok.';
      if (exercise && deviceId === exercise.deviceId) deviceId = undefined;

      let rule = row.rule;
      if (rule && exercise) {
        const base = progressionOf(exercise);
        if (rule.scheme === base.scheme && rule.targetRir === base.targetRir) rule = undefined;
      }
      const note = row.note?.trim();
      return {
        id: row.id,
        exerciseId: row.exerciseId,
        target: { min: row.target.min, max: row.target.max },
        ...(rule ? { rule: { scheme: rule.scheme, targetRir: rule.targetRir } } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(note ? { note } : {}),
      };
    });
    return {
      id: block.id,
      kind: block.kind,
      sets: block.sets,
      restSeconds: block.restSeconds,
      ...(block.kind === 'circuit' ? { transitionSeconds: block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS } : {}),
      rows,
    };
  });
  return { blocks, errors };
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** 252 = 36 × 7: bu değerin altındaki baytlar alfabeye eşit dağılır. */
const UNBIASED_LIMIT = 252;
const MAX_ATTEMPTS = 20;

/**
 * Rastgele kimlik (`t_k3m9x2qa`, `r_q2m8xk`): a-z ve 0-9, eşit dağılımlı. Alınmış
 * kimliklerle çakışırsa yeniden dener; 20 denemede bulamazsa hata fırlatır.
 */
export function randomId(
  prefix: 't' | 'b' | 'r',
  length: number,
  taken: ReadonlySet<string>,
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let body = '';
    while (body.length < length) {
      for (const byte of random(length * 2)) {
        if (byte < UNBIASED_LIMIT && body.length < length) body += ALPHABET[byte % ALPHABET.length];
      }
    }
    const id = `${prefix}_${body}`;
    if (!taken.has(id)) return id;
  }
  throw new Error('Benzersiz kimlik üretilemedi.');
}
