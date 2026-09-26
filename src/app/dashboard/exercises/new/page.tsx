import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { ExerciseForm } from '../exercise-form';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Yeni egzersiz' };

export default async function NewExercisePage() {
  await requirePt();
  const [devices, attachments] = await Promise.all([listDevices(), listAttachments()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Egzersizler', href: '/dashboard/exercises' }, { label: 'Yeni egzersiz' }]}
        title="Yeni egzersiz"
        description="Kendi egzersizlerin repo'nda ayrı durur; hazır kütüphane güncellense de silinmez."
      />
      <ExerciseForm editing={null} devices={devices} attachments={attachments} />
    </div>
  );
}
