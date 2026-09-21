import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ExerciseForm } from '../exercise-form';

export default function NewExercisePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Egzersizler', href: '/dashboard/exercises' }, { label: 'Yeni egzersiz' }]}
        title="Yeni egzersiz"
        description="Kendi egzersizlerin repo'nda ayrı durur; hazır kütüphane güncellense de silinmez."
      />
      <Card>
        <CardContent>
          <ExerciseForm editing={null} />
        </CardContent>
      </Card>
    </div>
  );
}
