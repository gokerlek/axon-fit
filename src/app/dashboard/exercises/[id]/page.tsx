import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { VideoEmbed } from '@/components/video-embed';
import { getExercise } from '@/lib/exercises';
import { formatKg } from '@/lib/format';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS } from '@/lib/schemas/exercise';
import { ExerciseActions } from './exercise-actions';

const TRACKING_LABELS = {
  weight_reps: 'Ağırlık + tekrar',
  bodyweight_reps: 'Vücut ağırlığı (tekrar)',
  duration: 'Süre',
} as const;

/** Egzersiz detayı — kendi sayfası (modal değil, SPEC §6). Kas haritası buraya gelecek. */
export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = await getExercise(id);
  if (!exercise) notFound();

  const summary: [string, string][] = [
    ['Hedef kas', MUSCLE_LABELS[exercise.targetMuscle]],
    ['Ekipman', EQUIPMENT_LABELS[exercise.equipment]],
    ['Tür', CATEGORY_LABELS[exercise.category]],
    ['Kayıt', TRACKING_LABELS[exercise.trackingType]],
    ...(exercise.trackingType === 'weight_reps'
      ? ([['Artış / taban', `${formatKg(exercise.loadIncrementKg)} / ${formatKg(exercise.minLoadKg)}`]] as [string, string][])
      : []),
  ];

  const origin =
    exercise.source === 'library' ? 'Hazır kütüphane' : exercise.overridesLibrary ? 'Senin sürümün' : 'Senin egzersizin';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Egzersizler', href: '/dashboard/exercises' }, { label: exercise.title }]}
        title={exercise.title}
        description={exercise.description || undefined}
        actions={
          <ExerciseActions
            id={exercise.id}
            title={exercise.title}
            source={exercise.source}
            overridesLibrary={exercise.overridesLibrary}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Özet</CardTitle>
              <CardDescription>{origin}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <Table>
                <TableBody>
                  {summary.map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell className="w-40 text-muted-foreground">{label}</TableCell>
                      <TableCell className="tabular-nums">{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {exercise.secondaryMuscles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {exercise.secondaryMuscles.map((muscle) => (
                    <Badge key={muscle} variant="outline">
                      {MUSCLE_LABELS[muscle]}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {exercise.cues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>İpuçları</CardTitle>
                <CardDescription>Harekete başlarken danışana hatırlatılır.</CardDescription>
              </CardHeader>
              <CardContent>
                <ItemGroup className="gap-2">
                  {exercise.cues.map((cue, index) => (
                    <Item key={cue} variant="muted" size="sm">
                      <ItemMedia variant="icon" className="tabular-nums text-muted-foreground">
                        {index + 1}
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="font-normal">{cue}</ItemTitle>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Video</CardTitle>
            <CardDescription>
              {exercise.video ? 'Hareketin doğru yapılışı.' : 'Bu egzersize henüz video bağlanmamış.'}
            </CardDescription>
          </CardHeader>
          {exercise.video ? (
            <CardContent>
              <VideoEmbed provider={exercise.video.provider} id={exercise.video.id} title={exercise.title} />
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
