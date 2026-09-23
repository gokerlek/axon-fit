import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { ExerciseList } from './exercise-list';
import { requirePt } from '@/lib/guards';

/** Egzersiz kütüphanesi: hazır liste + PT'nin kendi egzersizleri. Kabuk yetkiyi zaten denetler. */
export default async function ExercisesPage() {
  await requirePt();
  const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
  const deviceNames = Object.fromEntries(devices.map((device) => [device.id, device.name]));
  return <ExerciseList initial={exercises} deviceNames={deviceNames} />;
}
