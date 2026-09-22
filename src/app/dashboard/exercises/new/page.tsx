import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { ExerciseForm } from '../exercise-form';

export default async function NewExercisePage() {
  const [devices, attachments] = await Promise.all([listDevices(), listAttachments()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Egzersizler', href: '/dashboard/exercises' }, { label: 'Yeni egzersiz' }]}
        title="Yeni egzersiz"
        description="Kendi egzersizlerin repo'nda ayrı durur; hazır kütüphane güncellense de silinmez."
      />
      <Card>
        <CardContent>
          <ExerciseForm editing={null} devices={devices} attachments={attachments} />
        </CardContent>
      </Card>
    </div>
  );
}
