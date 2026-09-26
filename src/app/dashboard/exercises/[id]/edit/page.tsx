import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { getExercise, listExercises } from '@/lib/exercises';
import { exerciseAlternatives, summarizeMuscles } from '@/lib/muscles';
import { EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import { ExerciseActions } from '../exercise-actions';
import { ExerciseForm } from '../../exercise-form';
import { TOUCH_TARGETS } from '../../touch-targets';
import { requirePt } from '@/lib/guards';

// Başlık (`generateMetadata`) ve sayfa aynı isteği paylaşır: liste bir kez okunur.
const loadAll = cache(() => listExercises());
const loadExercise = cache(async (id: string) => getExercise(id, await loadAll()));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const exercise = await loadExercise((await params).id);
  return { title: exercise ? `Düzenle: ${exercise.title}` : 'Egzersiz bulunamadı' };
}

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const [all, devices, attachments] = await Promise.all([loadAll(), listDevices(), listAttachments()]);
  const exercise = await loadExercise(id);
  if (!exercise) notFound();

  const { source: _source, overridesLibrary: _override, ...editable } = exercise;
  // Sabitlenebilecek muadiller detaydakiyle aynı sırada gelir (önerinin sırası).
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  // Detayda ilk 8 öneri görünür; burada seçim havuzu geniş tutulur.
  const alternativeOptions = exerciseAlternatives(exercise, all, 20).map(({ exercise: other }) => ({
    id: other.id,
    title: other.title,
    detail: [
      other.deviceId ? (deviceById.get(other.deviceId)?.name ?? EQUIPMENT_LABELS[other.equipment]) : EQUIPMENT_LABELS[other.equipment],
      summarizeMuscles(other.primaryMuscles).join(', '),
    ].join(' · '),
  }));

  return (
    <div className={`flex flex-col gap-6 ${TOUCH_TARGETS}`}>
      <PageHeader
        crumbs={[
          { label: 'Egzersizler', href: '/dashboard/exercises' },
          { label: exercise.title, href: `/dashboard/exercises/${id}` },
          { label: 'Düzenle' },
        ]}
        title="Egzersizi düzenle"
        actions={
          <ExerciseActions
            id={id}
            title={exercise.title}
            source={exercise.source}
            overridesLibrary={exercise.overridesLibrary}
          />
        }
        description={
          exercise.source === 'library'
            ? 'Hazır kütüphaneden bir egzersiz: kaydettiğinde yalnız senin kurulumunda geçerli bir sürüm oluşur. İstediğin zaman varsayılana dönebilirsin.'
            : undefined
        }
      />
      <ExerciseForm
            editing={editable}
            devices={devices}
            attachments={attachments}
            alternativeOptions={alternativeOptions}
      />
    </div>
  );
}
