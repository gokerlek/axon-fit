/**
 * Muadil (alternatif) hareket önerisi — alet doluysa, yoksa ya da danışan için uygun
 * değilse yerine ne yapılır.
 *
 * Muadiller elle listelenmez, hesaplanır:
 * - Aday, kaynakla en az bir hedef kası (ya da kas ailesini: üç kanat parçası "Kanat")
 *   paylaşmalı; kardiyo hareketi kardiyo hareketiyle eşleşir.
 * - Güç hareketleri (bileşik, izolasyon, kondisyon) ile ısınma/soğuma birbirine önerilmez.
 * - Sıra: aynı hareket kalıbı önce; sonra aynı hedef kas (tam parça), aynı kas ailesi,
 *   bütün kas yükünün örtüşmesi ve aynı tutuş.
 * PT'nin sabitledikleri her zaman en başta gelir.
 *
 * Saf fonksiyonlar; yol takma adıyla çalışma zamanı içe aktarması yapmaz (testler
 * Node'un kendi test aracıyla çalışır). Kas aileleri çağırandan gelir.
 */

/** Hareket kalıbı: muadilleri sıralamanın ilk ölçütü. */
export const MOVEMENT_PATTERNS = [
  'horizontal_push',
  'vertical_push',
  'chest_fly',
  'horizontal_pull',
  'vertical_pull',
  'lateral_raise',
  'rear_delt',
  'shrug',
  'squat',
  'hinge',
  'lunge',
  'hip_extension',
  'hip_abduction',
  'hip_adduction',
  'knee_extension',
  'knee_flexion',
  'calf_raise',
  'elbow_flexion',
  'elbow_extension',
  'carry',
  'core_flexion',
  'core_stability',
  'core_rotation',
  'cardio',
  'mobility',
  'other',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  horizontal_push: 'Yatay itiş',
  vertical_push: 'Dikey itiş',
  chest_fly: 'Göğüs açma',
  horizontal_pull: 'Yatay çekiş',
  vertical_pull: 'Dikey çekiş',
  lateral_raise: 'Omuz kaldırma',
  rear_delt: 'Arka omuz açma',
  shrug: 'Trapez kaldırma',
  squat: 'Squat',
  hinge: 'Kalça menteşesi',
  lunge: 'Tek bacak',
  hip_extension: 'Kalça itişi',
  hip_abduction: 'Kalça açma',
  hip_adduction: 'Kalça kapama',
  knee_extension: 'Diz açma',
  knee_flexion: 'Diz bükme',
  calf_raise: 'Baldır kaldırma',
  elbow_flexion: 'Dirsek bükme',
  elbow_extension: 'Dirsek açma',
  carry: 'Taşıma',
  core_flexion: 'Karın bükme',
  core_stability: 'Karın sabitleme',
  core_rotation: 'Gövde döndürme',
  cardio: 'Kardiyo',
  mobility: 'Mobilite ve esneme',
  other: 'Diğer',
};

/** Hesap için gereken alanlar (egzersiz şemasının alt kümesi). */
export type AlternativeCandidate = {
  id: string;
  title: string;
  category: string;
  equipment: string;
  /** Hareketin yapıldığı cihaz. */
  deviceId?: string;
  pattern?: MovementPattern;
  /** Tutuş (pronasyon/supinasyon/nötr…): aynı tutuş sıralamada küçük bir artı. */
  grip?: string;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  stabilizerMuscles?: readonly string[];
  /** PT'nin elle sabitlediği muadiller (egzersiz kimlikleri). */
  alternatives?: readonly string[];
};

export type Alternative<T> = {
  exercise: T;
  /** PT sabitledi. */
  pinned: boolean;
  /** Aynı hareket kalıbında. */
  samePattern: boolean;
  score: number;
};

/** Kesirli set ağırlıkları (hedef 1, yardımcı 0,5, dengeleyici 0,25) — `muscles.ts` ile aynı. */
const WEIGHT = { primary: 1, secondary: 0.5, stabilizer: 0.25 } as const;

const MOBILITY_CATEGORIES = new Set(['warmup', 'cooldown']);

function load(exercise: AlternativeCandidate): Map<string, number> {
  const weights = new Map<string, number>();
  for (const muscle of exercise.stabilizerMuscles ?? []) weights.set(muscle, WEIGHT.stabilizer);
  for (const muscle of exercise.secondaryMuscles) weights.set(muscle, WEIGHT.secondary);
  for (const muscle of exercise.primaryMuscles) weights.set(muscle, WEIGHT.primary);
  return weights;
}

/** İki kas yükü vektörünün benzerliği (kosinüs), 0–1. */
function similarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [muscle, weight] of a) {
    normA += weight * weight;
    dot += weight * (b.get(muscle) ?? 0);
  }
  for (const weight of b.values()) normB += weight * weight;
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** İki kümenin örtüşmesi (Jaccard), 0–1. */
function overlapOf(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const family of a) if (b.has(family)) shared++;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

/**
 * Muadilleri sıralar. `familyOf` bir kası ailesine çevirir (üst kanat → kanat);
 * ailesi olmayan kas kendisidir.
 */
export function rankAlternatives<T extends AlternativeCandidate>(
  source: T,
  candidates: readonly T[],
  familyOf: (muscle: string) => string,
  { limit = 8 }: { limit?: number } = {},
): Alternative<T>[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const pinnedIds = (source.alternatives ?? []).filter((id) => id !== source.id && byId.has(id));
  const pinned: Alternative<T>[] = pinnedIds.map((id) => {
    const exercise = byId.get(id) as T;
    return { exercise, pinned: true, samePattern: Boolean(source.pattern) && exercise.pattern === source.pattern, score: Infinity };
  });

  const sourcePrimary = new Set(source.primaryMuscles);
  const sourceFamilies = new Set(source.primaryMuscles.map(familyOf));
  const sourceLoad = load(source);
  const sourceIsMobility = MOBILITY_CATEGORIES.has(source.category);

  const computed: Alternative<T>[] = [];
  for (const candidate of candidates) {
    if (candidate.id === source.id || pinnedIds.includes(candidate.id)) continue;
    if (MOBILITY_CATEGORIES.has(candidate.category) !== sourceIsMobility) continue;

    const familyOverlap = overlapOf(sourceFamilies, new Set(candidate.primaryMuscles.map(familyOf)));
    if (familyOverlap === 0) continue;
    const exactOverlap = overlapOf(sourcePrimary, new Set(candidate.primaryMuscles));

    const samePattern = Boolean(source.pattern) && candidate.pattern === source.pattern;
    const sameGrip = Boolean(source.grip) && candidate.grip === source.grip;
    const score =
      (samePattern ? 2 : 0) +
      exactOverlap +
      0.5 * familyOverlap +
      0.5 * similarity(sourceLoad, load(candidate)) +
      (sameGrip ? 0.25 : 0);
    computed.push({ exercise: candidate, pinned: false, samePattern, score });
  }

  computed.sort((a, b) => b.score - a.score || a.exercise.title.localeCompare(b.exercise.title, 'tr'));
  return [...pinned, ...computed.slice(0, Math.max(0, limit - pinned.length))];
}

/**
 * Muadilleri ekipmana göre gruplar; gruplar en iyi muadillerinin sırasıyla gelir.
 * Ekipmansız (vücut ağırlığı) grup, varsa, her zaman en başta: alet yokken ilk bakılan yer.
 */
export function groupByEquipment<T extends AlternativeCandidate>(alternatives: readonly Alternative<T>[]): [string, Alternative<T>[]][] {
  const groups = new Map<string, Alternative<T>[]>();
  for (const alternative of alternatives) {
    const key = alternative.exercise.equipment;
    groups.set(key, [...(groups.get(key) ?? []), alternative]);
  }
  return [...groups].sort(([a], [b]) => Number(b === 'bodyweight') - Number(a === 'bodyweight'));
}

/**
 * Cihaz değişince hangi egzersiz yapılır: kaynağın bu cihazla yapılan en iyi muadili.
 * Kaynak zaten o cihazdaysa kendisi; uygun muadil yoksa `null`. Şablonda satırın
 * cihazı değiştirilince egzersiz buna göre değişir.
 */
export function alternativeForDevice<T extends AlternativeCandidate>(
  source: T,
  deviceId: string,
  candidates: readonly T[],
  familyOf: (muscle: string) => string,
): T | null {
  if (source.deviceId === deviceId) return source;
  const onDevice = candidates.filter((candidate) => candidate.deviceId === deviceId);
  // PT'nin sabitledikleri de bu cihazdaysa önce onlar.
  const best = rankAlternatives(source, [source, ...onDevice], familyOf, { limit: 1 })[0];
  return best?.exercise ?? null;
}
