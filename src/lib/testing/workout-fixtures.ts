import * as v from 'valibot';
import { programSchema, type Program } from '../schemas/program.ts';
import type { SessionDoc } from '../schemas/session.ts';
import { buildWorkoutDay, type WorkoutDay, type WorkoutDevice, type WorkoutExercise } from '../workout-plan.ts';
import { programFile } from './session-fixtures.ts';

/**
 * Antrenman ekranı testlerinin kalıpları — YALNIZ testler için. Egzersizler kütüphanedekilerin sade
 * hâli: Bench Press (halter, 2,5 kg adım, 20 kg bar), Goblet Squat (dambıl seti), Plank (süreli).
 */

export const BENCH: WorkoutExercise = {
  id: 'bench-press',
  title: 'Bench Press',
  category: 'compound',
  trackingType: 'weight_reps',
  equipment: 'barbell',
  primaryMuscles: ['chest_lower'],
  secondaryMuscles: ['triceps_long'],
  loadStepKg: 2.5,
  minLoadKg: 20,
};

export const GOBLET: WorkoutExercise = {
  id: 'goblet-squat',
  title: 'Goblet Squat',
  category: 'compound',
  trackingType: 'weight_reps',
  equipment: 'dumbbell',
  deviceId: 'dambil-seti',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['glutes'],
  loadStepKg: 2,
  minLoadKg: 0,
};

export const PLANK: WorkoutExercise = {
  id: 'plank',
  title: 'Plank',
  category: 'isolation',
  trackingType: 'duration',
  equipment: 'bodyweight',
  primaryMuscles: ['abs_upper'],
  secondaryMuscles: [],
  loadStepKg: 0,
  minLoadKg: 0,
};

export const DUMBBELLS: WorkoutDevice = { id: 'dambil-seti', kind: 'dumbbell', weightsKg: [4, 6, 8, 10, 12, 14, 16, 18, 20] };

export const EXERCISES = new Map([BENCH, GOBLET, PLANK].map((exercise) => [exercise.id, exercise]));
export const DEVICES = new Map([[DUMBBELLS.id, DUMBBELLS]]);

/** Ayrıştırılmış program (`programFile` + istenen değişiklik). */
export function parsedProgram(raw: Record<string, unknown> = programFile()): Program {
  return v.parse(programSchema, raw);
}

/** Gün planı: varsayılan program (Gün A: Bench 3 set + Bench 2 set), geçmişsiz. */
export function workoutDay(options: { raw?: Record<string, unknown>; dayId?: string; history?: SessionDoc[] } = {}): WorkoutDay {
  const day = buildWorkoutDay({
    program: parsedProgram(options.raw),
    dayId: options.dayId ?? null,
    exercises: EXERCISES,
    devices: DEVICES,
    history: options.history ?? [],
  });
  if (!day) throw new Error('Gün kurulamadı.');
  return day;
}
