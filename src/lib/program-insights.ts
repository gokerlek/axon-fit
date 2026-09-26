import { exposureOf } from './exposure.ts';
import { mondayOf } from './program-plan.ts';
import { addDays, weeklyViews, type WeekView } from './progress.ts';
import { deloadHintDue } from './recommend.ts';
import type { TrainingExperience } from './schemas/client.ts';
import type { SessionIndex } from './schemas/session.ts';
import type { PlanExercise } from './template-plan.ts';

/**
 * PT'nin Program sekmesinde plan ile yapılanın yan yana okunması (SPEC §7.4 "gerçekleşen", tasarım §5.3) — saf.
 *
 * - **Bu haftanın kas yükü:** bitmiş antrenmanların çalışma setleri, İlerleme sekmesiyle aynı hesap
 *   (`weeklyViews` → `muscleLoadOf`: hedef 1, yardımcı 0,5, dengeleyici 0,25; ısınma ve soğuma hareketleri
 *   sayılmaz). Hafta pazartesi başlar, günü antrenmanın başlangıç günüdür.
 * - **Plan ve yapılan:** planlanan haftalık yük (`phaseMuscleLoad`) ile bu hafta yapılan, kas başına.
 * - **Hafifletme ipucu (İleri aşama):** hareketin son hafifletmesinden (yoksa ilk seansından) bu yana 4 hafta
 *   geçti (`deloadHintDue`; Bell 2024: ortalama 5,6 ± 2,3 hafta). Motor takvime göre kendiliğinden hafifletmez;
 *   periyodizasyon PT'nin kararıdır.
 */

/** Bu haftanın gerçekleşen yükü; hiç bitmiş antrenman yoksa sıfır hafta. */
export function thisWeekLoad<E extends PlanExercise>(input: {
  index: Pick<SessionIndex, 'items'>;
  today: string;
  exercises: ReadonlyMap<string, E>;
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>;
}): WeekView {
  const [week] = weeklyViews({ rows: input.index.items, today: input.today, exercises: input.exercises, setWeightsOf: input.setWeightsOf, weeks: 1 });
  const weekStart = mondayOf(input.today);
  return week ?? { weekStart, weekEnd: addDays(weekStart, 6), sessions: 0, days: 0, volumeKg: 0, sets: 0, muscles: {} };
}

export type LoadRow = { muscle: string; planned: number; done: number };

/**
 * Kas başına planlanan haftalık ve bu hafta yapılan set: planı çok olandan aza, sonra yapılana göre. Kardiyo
 * haritada çizilmediği için listede yok; planda olmayıp yapılan kas da listelenir (muadil, eklenen hareket).
 */
export function loadComparison(planned: Readonly<Record<string, number>>, done: Readonly<Record<string, number>>): LoadRow[] {
  const muscles = new Set([...Object.keys(planned), ...Object.keys(done)].filter((muscle) => muscle !== 'cardio'));
  return [...muscles]
    .map((muscle) => ({ muscle, planned: planned[muscle] ?? 0, done: done[muscle] ?? 0 }))
    .filter((row) => row.planned > 0 || row.done > 0)
    .sort((a, b) => b.planned - a.planned || b.done - a.done || a.muscle.localeCompare(b.muscle));
}

export type DeloadHint = {
  exerciseId: string;
  /** Son hafifletmeden (yoksa ilk seanstan) bu yana tam hafta. */
  weeks: number;
  /** Sayımın başı: son hafifletme ya da (hiç yoksa) hareketin ilk seansı. */
  since: 'deload' | 'start';
};

/** Programdaki hareketlerden hafifletme ipucu zamanı gelenler (her hareket bir kez), en uzun süredir olan önce. */
export function deloadHints(input: {
  exerciseIds: Iterable<string>;
  index: Pick<SessionIndex, 'items'>;
  now: Date;
  experience?: TrainingExperience | undefined;
}): DeloadHint[] {
  const hints: DeloadHint[] = [];
  for (const exerciseId of new Set(input.exerciseIds)) {
    const exposure = exposureOf(exerciseId, input.index, input.now, { experience: input.experience });
    if (!deloadHintDue(exposure, input.now)) continue;
    const from = exposure.lastDeloadAt ?? exposure.firstAt;
    if (!from) continue;
    const weeks = Math.floor((input.now.getTime() - Date.parse(from)) / (7 * 86_400_000));
    hints.push({ exerciseId, weeks, since: exposure.lastDeloadAt ? 'deload' : 'start' });
  }
  return hints.sort((a, b) => b.weeks - a.weeks || a.exerciseId.localeCompare(b.exerciseId));
}
