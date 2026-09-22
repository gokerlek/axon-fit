import { notFound } from 'next/navigation';
import { ExerciseMuscleMap } from '@/components/muscle-map/exercise-muscle-map';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { VideoEmbed } from '@/components/video-embed';
import { getExercise, listExercises } from '@/lib/exercises';
import { PATTERN_LABELS } from '@/lib/alternatives';
import { formatKg } from '@/lib/format';
import { exerciseAlternatives, summarizeMuscles } from '@/lib/muscles';
import { describeRule, progressionOf, PROGRESSION_LABELS } from '@/lib/progression';
import { CATEGORY_LABELS, EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import { AlternativesCard, type AlternativeRow } from './alternatives-card';
import { ExerciseActions } from './exercise-actions';

const TRACKING_LABELS = {
  weight_reps: 'Ağırlık + tekrar',
  bodyweight_reps: 'Vücut ağırlığı (tekrar)',
  duration: 'Süre',
} as const;

/** Egzersiz detayı — kendi sayfası (modal değil, SPEC §6). */
export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const all = await listExercises();
  const exercise = await getExercise(id, all);
  if (!exercise) notFound();

  const alternatives: AlternativeRow[] = exerciseAlternatives(exercise, all).map(({ exercise: other, pinned, samePattern }) => ({
    id: other.id,
    title: other.title,
    equipment: other.equipment,
    muscles: summarizeMuscles(other.primaryMuscles).join(', '),
    pattern: samePattern && other.pattern ? PATTERN_LABELS[other.pattern] : null,
    pinned,
  }));

  const rule = progressionOf(exercise);
  const summary: [string, string][] = [
    ['Hedef kaslar', summarizeMuscles(exercise.primaryMuscles).join(', ')],
    ...(exercise.secondaryMuscles.length > 0
      ? ([['Yardımcı kaslar', summarizeMuscles(exercise.secondaryMuscles).join(', ')]] as [string, string][])
      : []),
    ...(exercise.stabilizerMuscles.length > 0
      ? ([['Dengeleyici kaslar', summarizeMuscles(exercise.stabilizerMuscles).join(', ')]] as [string, string][])
      : []),
    ['Ekipman', EQUIPMENT_LABELS[exercise.equipment]],
    ...(exercise.pattern ? ([['Hareket kalıbı', PATTERN_LABELS[exercise.pattern]]] as [string, string][]) : []),
    ['Tür', CATEGORY_LABELS[exercise.category]],
    ['Kayıt', TRACKING_LABELS[exercise.trackingType]],
    ...(exercise.trackingType === 'weight_reps'
      ? ([['Ağırlık adımı / taban', `${formatKg(exercise.loadStepKg)} / ${formatKg(exercise.minLoadKg)}`]] as [string, string][])
      : []),
    [
      'İlerleme',
      `${PROGRESSION_LABELS[rule.scheme]} · ${rule.targetMin}–${rule.targetMax} ${exercise.trackingType === 'duration' ? 'sn' : 'tekrar'}`,
    ],
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
            <CardContent className="text-sm">
              <Table>
                <TableBody>
                  {summary.map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell className="w-40 text-muted-foreground">{label}</TableCell>
                      <TableCell className="whitespace-normal tabular-nums">{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-muted-foreground">{describeRule(rule, exercise)}</p>
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

          <AlternativesCard exerciseId={exercise.id} rows={alternatives} />
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Çalışan kaslar</CardTitle>
              <CardDescription>
                {exercise.primaryMuscles.includes('cardio')
                  ? 'Kardiyo hareketi; haritada yalnız yardımcı kaslar görünür.'
                  : 'Hedef tam renk, yardımcı orta, dengeleyici açık ton.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExerciseMuscleMap
                primaryMuscles={exercise.primaryMuscles}
                secondaryMuscles={exercise.secondaryMuscles}
                stabilizerMuscles={exercise.stabilizerMuscles}
                bodyClassName="h-72"
              />
            </CardContent>
          </Card>

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
    </div>
  );
}
