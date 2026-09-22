import { rankAlternatives, type AlternativeCandidate } from '@/lib/alternatives';
import { MUSCLE_FAMILIES, MUSCLE_LABELS, MUSCLES, type Exercise, type Muscle } from '@/lib/schemas/exercise';

/**
 * Kas yardımcıları — kas haritası ve kas süzgeci ortak kullanır.
 * Sunucuda da çalışır (bileşen içermez).
 */

/** Haritada yeri olan kaslar. Kardiyo bir kas değil, haritanın dışında ayrı bir düğmedir. */
export type BodyMuscle = Exclude<Muscle, 'cardio'>;

export const BODY_MUSCLES = MUSCLES.filter((item): item is BodyMuscle => item !== 'cardio');

export function isBodyMuscle(muscle: Muscle): muscle is BodyMuscle {
  return muscle !== 'cardio';
}

/** Haritada yoğunluk: 0 hiç, 1 tam. */
export type MuscleIntensity = Partial<Record<BodyMuscle, number>>;

/** Kasın bir hareketteki payı. */
export const MUSCLE_ROLES = ['primary', 'secondary', 'stabilizer'] as const;
export type MuscleRole = (typeof MUSCLE_ROLES)[number];

export const ROLE_LABELS: Record<MuscleRole, string> = {
  primary: 'Hedef',
  secondary: 'Yardımcı',
  stabilizer: 'Dengeleyici',
};

/** Haritadaki tonu (0–1): hedef tam, yardımcı orta, dengeleyici açık. */
export const ROLE_INTENSITY: Record<MuscleRole, number> = { primary: 1, secondary: 0.45, stabilizer: 0.1 };

/**
 * Haftalık yükte bir setin kasa düşen payı ("kesirli set"): hedef 1, yardımcı 0,5,
 * dengeleyici 0,25. Şablon ve program haritası (Faz 4) bununla toplanır.
 */
export const ROLE_SET_WEIGHT: Record<MuscleRole, number> = { primary: 1, secondary: 0.5, stabilizer: 0.25 };

/** Geriye uyumluluk: yardımcı tonu. */
export const SECONDARY_INTENSITY = ROLE_INTENSITY.secondary;

type Worked = Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'> & { stabilizerMuscles?: readonly Muscle[] };

/** Kasın bu egzersizdeki payı; çalışmıyorsa `null`. */
export function roleOf(exercise: Worked, muscle: Muscle): MuscleRole | null {
  if (exercise.primaryMuscles.includes(muscle)) return 'primary';
  if (exercise.secondaryMuscles.includes(muscle)) return 'secondary';
  if (exercise.stabilizerMuscles?.includes(muscle)) return 'stabilizer';
  return null;
}

/** Bir egzersizin çalıştırdığı kaslar, haritadaki tonlarıyla. */
export function exerciseIntensity(exercise: Worked): MuscleIntensity {
  const intensity: MuscleIntensity = {};
  // Düşükten yükseğe: bir kas iki listede kalmışsa yüksek seviye kazanır.
  for (const role of ['stabilizer', 'secondary', 'primary'] as const) {
    const list = role === 'primary' ? exercise.primaryMuscles : role === 'secondary' ? exercise.secondaryMuscles : (exercise.stabilizerMuscles ?? []);
    for (const muscle of list) if (isBodyMuscle(muscle)) intensity[muscle] = ROLE_INTENSITY[role];
  }
  return intensity;
}

/** Bir setin kaslara düşen payı (kesirli set). Haftalık yük bunların toplamıdır. */
export function exerciseSetWeights(exercise: Worked): Partial<Record<Muscle, number>> {
  const weights: Partial<Record<Muscle, number>> = {};
  for (const muscle of MUSCLES) {
    const role = roleOf(exercise, muscle);
    if (role) weights[muscle] = ROLE_SET_WEIGHT[role];
  }
  return weights;
}

/**
 * Egzersiz bu kası hedef ya da yardımcı olarak çalıştırıyor mu? Süzgeç ve sayılar
 * dengeleyiciyi saymaz: "Karın" seçince bütün squat'lar gelmesin.
 */
export function works(exercise: Worked, muscle: Muscle): boolean {
  return exercise.primaryMuscles.includes(muscle) || exercise.secondaryMuscles.includes(muscle);
}

/**
 * Kas listesinin okunur özeti: bir kasın bütün parçaları varsa tek ad yazılır
 * ("Üst kanat, Orta kanat, Alt kanat" → "Kanat"). Sıra, listedeki ilk görünüşe göre.
 */
export function summarizeMuscles(muscles: readonly Muscle[]): string[] {
  const present = new Set(muscles);
  const labels: string[] = [];
  const done = new Set<Muscle>();
  for (const muscle of muscles) {
    if (done.has(muscle)) continue;
    const family = MUSCLE_FAMILIES.find((item) => item.muscles.includes(muscle));
    if (family && family.muscles.every((part) => present.has(part))) {
      labels.push(family.label);
      for (const part of family.muscles) done.add(part);
    } else {
      labels.push(MUSCLE_LABELS[muscle]);
      done.add(muscle);
    }
  }
  return labels;
}

/** Her kası çalıştıran egzersiz sayısı (hedef ya da yardımcı; dengeleyici sayılmaz). Süzgeçle aynı kural. */
export function countByMuscle(exercises: readonly Worked[]): Record<Muscle, number> {
  const counts = Object.fromEntries(MUSCLES.map((item) => [item, 0])) as Record<Muscle, number>;
  for (const exercise of exercises) {
    for (const muscle of new Set([...exercise.primaryMuscles, ...exercise.secondaryMuscles])) counts[muscle] += 1;
  }
  return counts;
}

/** Adres satırındaki `?muscle=chest,back` değerini okur; bilinmeyenleri ve tekrarları atar. */
export function parseMuscles(value: string | null | undefined): Muscle[] {
  if (!value) return [];
  const known = new Set<string>(MUSCLES);
  return [...new Set(value.split(','))].filter((item): item is Muscle => known.has(item));
}

const FAMILY_OF = new Map<string, string>(
  MUSCLE_FAMILIES.flatMap((family) => family.muscles.map((muscle) => [muscle, family.label] as const)),
);

/** Kasın ailesi (üst kanat → "Kanat"); ailesi olmayan kas kendisidir. */
export function familyOf(muscle: string): string {
  return FAMILY_OF.get(muscle) ?? muscle;
}

/** Bir egzersizin muadilleri: PT'nin sabitledikleri önce, sonra hesaplananlar (`alternatives.ts`). */
export function exerciseAlternatives<T extends AlternativeCandidate>(source: T, all: readonly T[], limit = 8) {
  return rankAlternatives(source, all, familyOf, { limit });
}
