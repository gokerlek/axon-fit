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

/** Yardımcı kasların haritadaki yoğunluğu (birincil kas 1). */
export const SECONDARY_INTENSITY = 0.3;

type Worked = Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'>;

/** Bir egzersizin çalıştırdığı kaslar: hedef kaslar tam, yardımcılar açık ton. */
export function exerciseIntensity(exercise: Worked): MuscleIntensity {
  const intensity: MuscleIntensity = {};
  for (const muscle of exercise.secondaryMuscles) {
    if (isBodyMuscle(muscle)) intensity[muscle] = SECONDARY_INTENSITY;
  }
  for (const muscle of exercise.primaryMuscles) {
    if (isBodyMuscle(muscle)) intensity[muscle] = 1;
  }
  return intensity;
}

/** Egzersiz bu kası (hedef ya da yardımcı olarak) çalıştırıyor mu? */
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

/** Her kası çalıştıran egzersiz sayısı (hedef ya da yardımcı). Süzgeçteki sayıyla aynı kural. */
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
