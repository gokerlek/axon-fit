import { listExercises } from '@/lib/exercises';
import { ExerciseList } from './exercise-list';

/** Egzersiz kütüphanesi: hazır liste + PT'nin kendi egzersizleri. Kabuk yetkiyi zaten denetler. */
export default async function ExercisesPage() {
  const exercises = await listExercises();
  return <ExerciseList initial={exercises} />;
}
