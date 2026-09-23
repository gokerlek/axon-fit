import { Barbell, Play } from '@phosphor-icons/react/dist/ssr';
import { DayPlan } from '@/components/program/day-plan';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { listExercises } from '@/lib/exercises';
import { currentPhaseOf, nextDayId, phaseStatus } from '@/lib/program-plan';
import { readProgramFile } from '@/lib/programs';
import { templateSummary } from '@/lib/template-plan';

function Unavailable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bugünün antrenmanı</CardTitle>
        <CardDescription>Programın şu an açılamıyor. Antrenörüne haber ver.</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * Danışanın sıradaki antrenmanı: kendi programında şu anki evrenin sıradaki günü,
 * yapılış sırasıyla; altında evrenin diğer günleri dönüş sırasıyla. Yalnız gösterim:
 * antrenman ekranı (set kaydı, başka gün seçme) sonraki adımda. `clientId` oturumdan
 * doğrulanmış kayıttan gelir (`currentClient`).
 */
export async function ProgramCard({ clientId }: { clientId: string }) {
  const [file, exercises] = await Promise.all([readProgramFile(clientId).catch(() => undefined), listExercises()]);

  if (file === null) {
    return (
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
    );
  }
  if (!file?.program) return <Unavailable />;

  const program = file.program;
  const phase = currentPhaseOf(program)?.phase;
  const dayId = nextDayId(program);
  const index = phase?.days.findIndex((item) => item.id === dayId) ?? -1;
  const day = phase?.days[index];
  if (!phase || !day) return <Unavailable />;

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const summary = templateSummary({ blocks: day.blocks }, byId);
  const status = phaseStatus(program, new Date());
  // Dönüş sırası: sıradaki günün arkasından başlayıp başa sarar.
  const following = [...phase.days.slice(index + 1), ...phase.days.slice(0, index)];

  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Sıradaki antrenman</CardDescription>
          <CardTitle className="text-xl">{day.name}</CardTitle>
          <CardDescription>
            <span className="block">
              {phase.name}
              {phase.weeks !== undefined ? ` · ${status.week}. hafta / ${phase.weeks}` : null}
            </span>
            <span className="tabular-nums">{summary.rows}</span> hareket ·{' '}
            <span className="tabular-nums">{summary.workingSets}</span> set · ≈{' '}
            <span className="tabular-nums">{summary.minutes}</span> dk
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.rows > 0 ? (
            <DayPlan blocks={day.blocks} exercises={byId} missing="hide" />
          ) : (
            <p className="text-sm text-muted-foreground">Bu günün hareketleri şu an açılamıyor. Antrenörüne haber ver.</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2">
          <Button size="lg" className="h-12 w-full" disabled>
            <Play data-icon="inline-start" weight="fill" />
            Antrenmana başla
          </Button>
          <p className="text-center text-xs text-muted-foreground">Set kaydı yakında burada.</p>
        </CardFooter>
      </Card>

      {following.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sonraki günler</CardTitle>
            <CardDescription>Bu evrede günler sırayla döner.</CardDescription>
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
