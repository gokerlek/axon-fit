import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { getExercise } from '@/lib/exercises';
import { ExerciseForm } from '../../exercise-form';

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [exercise, devices, attachments] = await Promise.all([getExercise(id), listDevices(), listAttachments()]);
  if (!exercise) notFound();

  const { source: _source, overridesLibrary: _override, ...editable } = exercise;

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
          <ExerciseForm editing={editable} devices={devices} attachments={attachments} />
        </CardContent>
      </Card>
    </div>
  );
}
