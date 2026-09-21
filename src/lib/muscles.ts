import { MUSCLES, type Exercise, type Muscle } from '@/lib/schemas/exercise';

/**
 * Kas grubu yardımcıları — kas haritası ve kas süzgeci ortak kullanır.
 * Sunucuda da çalışır (bileşen içermez).
 */

/** Haritada yeri olan gruplar. Kardiyo bir kas değil, haritanın dışında ayrı bir düğmedir. */
export type BodyMuscle = Exclude<Muscle, 'cardio'>;

export const BODY_MUSCLES = MUSCLES.filter((item): item is BodyMuscle => item !== 'cardio');

export function isBodyMuscle(muscle: Muscle): muscle is BodyMuscle {
  return muscle !== 'cardio';
}

/** Haritada yoğunluk: 0 hiç, 1 tam. */
export type MuscleIntensity = Partial<Record<BodyMuscle, number>>;

/** Yardımcı kasların haritadaki yoğunluğu (birincil kas 1). */
export const SECONDARY_INTENSITY = 0.45;

type Worked = Pick<Exercise, 'targetMuscle' | 'secondaryMuscles'>;

/** Bir egzersizin çalıştırdığı kaslar: hedef kas tam, yardımcılar yarım. */
export function exerciseIntensity(exercise: Worked): MuscleIntensity {
  const intensity: MuscleIntensity = {};
  for (const muscle of exercise.secondaryMuscles) {
    if (isBodyMuscle(muscle)) intensity[muscle] = SECONDARY_INTENSITY;
  }
  if (isBodyMuscle(exercise.targetMuscle)) intensity[exercise.targetMuscle] = 1;
  return intensity;
}

/** Egzersiz bu kası (hedef ya da yardımcı olarak) çalıştırıyor mu? */
export function works(exercise: Worked, muscle: Muscle): boolean {
  return exercise.targetMuscle === muscle || exercise.secondaryMuscles.includes(muscle);
}

/** Her kası çalıştıran egzersiz sayısı (hedef ya da yardımcı). Süzgeçteki sayıyla aynı kural. */
export function countByMuscle(exercises: readonly Worked[]): Record<Muscle, number> {
  const counts = Object.fromEntries(MUSCLES.map((item) => [item, 0])) as Record<Muscle, number>;
  for (const exercise of exercises) {
    for (const muscle of new Set([exercise.targetMuscle, ...exercise.secondaryMuscles])) counts[muscle] += 1;
  }
  return counts;
}

/** Adres satırındaki `?muscle=chest,back` değerini okur; bilinmeyenleri ve tekrarları atar. */
export function parseMuscles(value: string | null | undefined): Muscle[] {
  if (!value) return [];
  const known = new Set<string>(MUSCLES);
  return [...new Set(value.split(','))].filter((item): item is Muscle => known.has(item));
}
