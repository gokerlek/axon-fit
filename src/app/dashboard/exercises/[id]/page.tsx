import { notFound } from 'next/navigation';
import { ExerciseMuscleMap } from '@/components/muscle-map/exercise-muscle-map';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { VideoEmbed } from '@/components/video-embed';
import { getExercise, listExercises } from '@/lib/exercises';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { DEVICE_KIND_LABELS, DEVICE_KINDS, loadSpecFor } from '@/lib/device-loads';
import { describeGrip } from '@/lib/grips';
import { alternativeForDevice } from '@/lib/alternatives';
import Link from 'next/link';
import { PATTERN_LABELS } from '@/lib/alternatives';
import { formatKg } from '@/lib/format';
import { exerciseAlternatives, familyOf, summarizeMuscles } from '@/lib/muscles';
import { describeRule, progressionOf, PROGRESSION_LABELS } from '@/lib/progression';
import { CATEGORY_LABELS, EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import { AlternativesCard, type AlternativeRow, type DeviceSwap } from './alternatives-card';
import { MedicalCard } from './medical-card';
import { EditButton } from '@/components/edit-button';

const TRACKING_LABELS = {
  weight_reps: 'Ağırlık + tekrar',
  bodyweight_reps: 'Vücut ağırlığı (tekrar)',
  duration: 'Süre',
} as const;

/** Egzersiz detayı — kendi sayfası (modal değil, SPEC §6). */
export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [all, devices, pool] = await Promise.all([listExercises(), listDevices(), listAttachments()]);
  const exercise = await getExercise(id, all);
  if (!exercise) notFound();
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const device = exercise.deviceId ? deviceById.get(exercise.deviceId) : undefined;
  const attachment = exercise.attachmentId ? pool.find((item) => item.id === exercise.attachmentId) : undefined;

  const alternatives: AlternativeRow[] = exerciseAlternatives(exercise, all).map(({ exercise: other, pinned, samePattern }) => ({
    id: other.id,
    title: other.title,
    equipment: other.equipment,
    // Grup: cihazı varsa cihazın adı ("Dambıl seti", "Chest press makinesi"), yoksa ekipman.
    device: other.deviceId ? (deviceById.get(other.deviceId)?.name ?? null) : null,
    muscles: summarizeMuscles(other.primaryMuscles).join(', '),
    pattern: samePattern && other.pattern ? PATTERN_LABELS[other.pattern] : null,
    pinned,
  }));

  const rule = progressionOf(exercise);
  // Cihaz değişirse hangi egzersize geçilir (şablonda satırın cihazı değiştirilince aynısı olur).
  const swaps: DeviceSwap[] = DEVICE_KINDS.flatMap((kind) =>
    devices
      .filter((item) => item.kind === kind && item.id !== exercise.deviceId)
      .map((item) => {
        const match = alternativeForDevice(exercise, item.id, all, familyOf);
        return {
          deviceId: item.id,
          deviceName: item.name,
          kindLabel: DEVICE_KIND_LABELS[kind],
          exercise: match && match.id !== exercise.id ? { id: match.id, title: match.title } : null,
        };
      }),
  );

  const summary: [string, React.ReactNode][] = [
    ['Hedef kaslar', summarizeMuscles(exercise.primaryMuscles).join(', ')],
    ...(exercise.secondaryMuscles.length > 0
      ? ([['Yardımcı kaslar', summarizeMuscles(exercise.secondaryMuscles).join(', ')]] as [string, React.ReactNode][])
      : []),
    ...(exercise.stabilizerMuscles.length > 0
      ? ([['Dengeleyici kaslar', summarizeMuscles(exercise.stabilizerMuscles).join(', ')]] as [string, React.ReactNode][])
      : []),
    ['Ekipman', EQUIPMENT_LABELS[exercise.equipment]],
    ...(device
      ? ([
          [
            'Cihaz',
            <Link key="cihaz" href={`/dashboard/devices/${device.id}`} className="underline underline-offset-4">
              {device.name}
            </Link>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(attachment
      ? ([
          [
            'Aparat',
            <Link key="aparat" href={`/dashboard/attachments/${attachment.id}`} className="underline underline-offset-4">
              {attachment.name}
            </Link>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(describeGrip(exercise.grip, exercise.gripWidth)
      ? ([['Tutuş', describeGrip(exercise.grip, exercise.gripWidth)]] as [string, React.ReactNode][])
      : []),
    ...(exercise.pattern ? ([['Hareket kalıbı', PATTERN_LABELS[exercise.pattern]]] as [string, React.ReactNode][]) : []),
    ['Tür', CATEGORY_LABELS[exercise.category]],
    ['Kayıt', TRACKING_LABELS[exercise.trackingType]],
    ...(exercise.trackingType === 'weight_reps' && !(device && loadSpecFor(exercise, device).loadsKg)
      ? ([['Ağırlık adımı / taban', `${formatKg(exercise.loadStepKg)} / ${formatKg(exercise.minLoadKg)}`]] as [string, React.ReactNode][])
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
        actions={<EditButton href={`/dashboard/exercises/${exercise.id}/edit`} />}
      />

      {/* Solda hareketin kendisi (görsel), sağda bilgisi; ilişki listesi altta tam genişlikte. */}
      <div className="grid gap-6 lg:grid-cols-2">
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
              <p className="mt-3 text-muted-foreground">{describeRule(rule, loadSpecFor(exercise, device))}</p>
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

          <MedicalCard exercise={exercise} />
        </div>
      </div>

      <AlternativesCard exerciseId={exercise.id} rows={alternatives} swaps={swaps} />
    </div>
  );
}
