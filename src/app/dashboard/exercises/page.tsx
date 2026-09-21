import Link from 'next/link';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { ExerciseList } from './exercise-list';
import styles from './exercises.module.css';

/** Egzersiz kütüphanesi: hazır liste + PT'nin kendi egzersizleri. */
export default async function ExercisesPage() {
  await requirePt();
  const exercises = await listExercises();

  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <Link href="/dashboard" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          ← Panel
        </Link>
        <ExerciseList initial={exercises} />
      </div>
    </main>
  );
}
