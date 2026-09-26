import Link from 'next/link';
import { Barbell, Play } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { listExercises } from '@/lib/exercises';
import { currentPhaseOf, frequencyLabel, nextDayId, phaseStatus } from '@/lib/program-plan';
import { readProgramFile } from '@/lib/programs';
import { templateSummary } from '@/lib/template-plan';
import { ClientDayPlan } from './client-day-plan';
import { WeekBadge } from './today-workout';

function Unavailable({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Bugünün antrenmanı</CardTitle>
          <CardDescription>Programın şu an açılamıyor. Antrenörüne haber ver.</CardDescription>
        </CardHeader>
      </Card>
      {children}
    </>
  );
}

/**
 * Danışanın sıradaki antrenmanı: kendi programında (evreliyse şu anki evrenin) sıradaki
 * günü, yapılış sırasıyla ve setler danışanın dilinde (`ClientDayPlan`); altında diğer günler
 * dönüş sırasıyla. Evresiz programda evreden söz edilmez; haftada kaç gün belirtildiyse yazılır,
 * sağ üstte "Bu hafta x/3" (`WeekBadge`, istemcide). "Antrenmana başla" tek dokunuştur: antrenman
 * ekranını açar (plan Bugün açılınca telefona alınmıştır, ağ beklenmez). `children` ana kartın hemen
 * altına (Bugün'ün su kartı). `clientId` oturumdan doğrulanmış kayıttan gelir (`currentClient`).
 */
export async function ProgramCard({ clientId, children }: { clientId: string; children?: React.ReactNode }) {
  const [file, exercises] = await Promise.all([readProgramFile(clientId).catch(() => undefined), listExercises()]);

  if (file === null) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Bugünün antrenmanı</CardTitle>
          </CardHeader>
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Barbell weight="fill" />
                </EmptyMedia>
                <EmptyTitle>Henüz program yok</EmptyTitle>
                <EmptyDescription>Antrenörün programını hazırladığında sıradaki antrenmanın burada görünecek.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
        {children}
      </>
    );
  }
  if (!file?.program) return <Unavailable>{children}</Unavailable>;

  const program = file.program;
  const phase = currentPhaseOf(program)?.phase;
  const dayId = nextDayId(program);
  const index = phase?.days.findIndex((item) => item.id === dayId) ?? -1;
  const day = phase?.days[index];
  if (!phase || !day) return <Unavailable>{children}</Unavailable>;

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const summary = templateSummary({ blocks: day.blocks }, byId);
  const status = phaseStatus(program, new Date());
  const frequency = frequencyLabel(phase.daysPerWeek);
  const context = program.phased
    ? [
        phase.name,
        phase.weeks !== undefined ? `${Math.min(status.week, phase.weeks)}. hafta / ${phase.weeks}` : null,
        frequency?.toLocaleLowerCase('tr') ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : frequency;
  // Dönüş sırası: sıradaki günün arkasından başlayıp başa sarar.
  const following = [...phase.days.slice(index + 1), ...phase.days.slice(0, index)];

  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Sıradaki antrenman</CardDescription>
          <CardAction>
            <WeekBadge clientId={clientId} />
          </CardAction>
          <CardTitle className="text-xl">{day.name}</CardTitle>
          <CardDescription>
            {context ? <span className="block">{context}</span> : null}
            <span className="tabular-nums">{summary.rows}</span> hareket ·{' '}
            <span className="tabular-nums">{summary.workingSets}</span> set · ≈{' '}
            <span className="tabular-nums">{summary.minutes}</span> dk
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.rows > 0 ? (
            <ClientDayPlan blocks={day.blocks} exercises={byId} />
          ) : (
            <p className="text-sm text-muted-foreground">Bu günün hareketleri şu an açılamıyor. Antrenörüne haber ver.</p>
          )}
        </CardContent>
        {summary.rows > 0 ? (
          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href="/me/antrenman" />}>
              <Play data-icon="inline-start" weight="fill" />
              Antrenmana başla
            </Button>
          </CardFooter>
        ) : null}
      </Card>
      {children}

      {following.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sonraki günler</CardTitle>
            <CardDescription>{program.phased ? 'Bu evrede günler sırayla döner.' : 'Günler sırayla döner.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {following.map((item) => {
                const itemSummary = templateSummary({ blocks: item.blocks }, byId);
                const titles = item.blocks.flatMap((block) =>
                  block.rows.flatMap((row) => {
                    const exercise = byId.get(row.exerciseId);
                    return exercise ? [exercise.title] : [];
                  }),
                );
                return (
                  <li key={item.id}>
                    <Item variant="outline">
                      <ItemContent>
                        <ItemTitle>{item.name}</ItemTitle>
                        <ItemDescription className="tabular-nums">
                          {itemSummary.rows} hareket · ≈ {itemSummary.minutes} dk
                        </ItemDescription>
                        {titles.length > 0 ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{titles.join(', ')}</p>
                        ) : null}
                      </ItemContent>
                    </Item>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
