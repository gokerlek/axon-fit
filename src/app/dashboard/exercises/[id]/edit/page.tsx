import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { getExercise, listExercises } from '@/lib/exercises';
import { exerciseAlternatives, summarizeMuscles } from '@/lib/muscles';
import { EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import { ExerciseForm } from '../../exercise-form';

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [all, devices, attachments] = await Promise.all([listExercises(), listDevices(), listAttachments()]);
  const exercise = await getExercise(id, all);
  if (!exercise) notFound();

  const { source: _source, overridesLibrary: _override, ...editable } = exercise;
  // Sabitlenebilecek muadiller detaydakiyle aynı sırada gelir (önerinin sırası).
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const alternativeOptions = exerciseAlternatives(exercise, all).map(({ exercise: other }) => ({
    id: other.id,
    title: other.title,
    detail: [
      other.deviceId ? (deviceById.get(other.deviceId)?.name ?? EQUIPMENT_LABELS[other.equipment]) : EQUIPMENT_LABELS[other.equipment],
      summarizeMuscles(other.primaryMuscles).join(', '),
    ].join(' · '),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Egzersizler', href: '/dashboard/exercises' },
          { label: exercise.title, href: `/dashboard/exercises/${id}` },
          { label: 'Düzenle' },
        ]}
        title="Egzersizi düzenle"
        description={
          exercise.source === 'library'
            ? 'Hazır kütüphaneden bir egzersiz: kaydettiğinde yalnız senin kurulumunda geçerli bir sürüm oluşur. İstediğin zaman varsayılana dönebilirsin.'
            : undefined
        }
      />
      <Card>
        <CardContent>
          <ExerciseForm
            editing={editable}
            devices={devices}
            attachments={attachments}
            alternativeOptions={alternativeOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
