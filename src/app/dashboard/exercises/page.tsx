import type { Metadata } from 'next';
import { listDevices } from '@/lib/devices';
import { CUSTOM_EXERCISES_PATH, listExercises, readCustomExercises } from '@/lib/exercises';
import { ExerciseList } from './exercise-list';
import { UnreadableRecordsAlert } from '../unreadable-records-alert';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Egzersizler' };

/** Egzersiz kütüphanesi: hazır liste + PT'nin kendi egzersizleri. Kabuk yetkiyi zaten denetler. */
export default async function ExercisesPage() {
  await requirePt();
  const [file, devices] = await Promise.all([readCustomExercises(), listDevices()]);
  const exercises = await listExercises(file);
  const deviceNames = Object.fromEntries(devices.map((device) => [device.id, device.name]));
  return (
    <ExerciseList
      initial={exercises}
      deviceNames={deviceNames}
      notice={<UnreadableRecordsAlert count={file.invalid} path={CUSTOM_EXERCISES_PATH} />}
    />
  );
}
