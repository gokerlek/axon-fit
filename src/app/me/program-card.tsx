import Link from 'next/link';
import { Barbell, Play, Plus } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { withClientTargets } from '@/lib/client-targets';
import { listExercises } from '@/lib/exercises';
import { formatDayShort, todayIn } from '@/lib/format';
import { activeItem, shownProgram } from '@/lib/own-program-index';
import { lastDateByProgram, ptUpdatedSince } from '@/lib/own-program-text';
import { PT_PROGRAM_NAME } from '@/lib/own-programs';
import { readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { currentPhaseOf, frequencyLabel, nextDayId, phaseStatus } from '@/lib/program-plan';
import { templateSummary } from '@/lib/template-plan';
import { programStamp, type PlanOwner, type PlanProgram } from '@/lib/workout-plan';
import { ClientDayPlan } from './client-day-plan';
import { NewPtProgramBanner, ProgramChip, PtEditLine, type ProgramChoice } from './program-choice';
import { WeekBadge } from './today-workout';
import { DayStatus, OtherDayButton, WeekStrip, WorkoutFreshness } from './training-week';

function Unavailable({ children, top }: { children?: React.ReactNode; top?: React.ReactNode }) {
  return (
    <>
      {top}
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
 * Danışanın sıradaki antrenmanı: gösterilen programın (evreliyse şu anki evrenin) sıradaki
 * günü, yapılış sırasıyla ve setler danışanın dilinde (`ClientDayPlan`); altında diğer günler
 * dönüş sırasıyla. Evresiz programda evreden söz edilmez; haftada kaç gün belirtildiyse yazılır,
 * sağ üstte "Bu hafta x/y" (`WeekBadge`, istemcide). Antrenman günleri (tasarım §2.11): üst satır
 * "Bugün antrenman günün · Gün B" ya da "Dinlenme günü · sıradaki antrenman Çarşamba (Gün B)", 7 günlük
 * şerit ve "Günlerini değiştir"; dinlenme gününde de başlatılabilir. "Antrenmana başla" tek dokunuştur:
 * antrenman ekranını açar (plan Bugün açılınca telefona alınmıştır, ağ beklenmez); telefondaki plan
 * programın bu sürümüne ait değilse atılır (`WorkoutFreshness`). "Başka gün seç" (§2.3) altında.
 * `children` ana kartın hemen altına (Bugün'ün su kartı). `clientId` oturumdan doğrulanmış kayıttan
 * gelir (`currentClient`).
 *
 * Kendi programlar (`docs/design/kendi-program.md` §2.6): gösterilen program adresteki (`programParam`, "Yalnız
 * bugün") ya da kalıcı seçim (`shownProgram`, sunucunun `planSource`'uyla aynı kural); en az bir kendi program
 * varken kartın başında program çipi. Kalıcı seçim kendi programken PT'nin programı o arada kaydedildiyse
 * "Antrenörün yeni bir program hazırladı"; PT paylaşılmış Bugün programını düzenlediyse satırı. Hiç program yoksa
 * boş kartın altında [Kendi programını kur].
 */
export async function ProgramCard({ clientId, programParam = null, timeZone, children }: { clientId: string; programParam?: string | null; timeZone: string; children?: React.ReactNode }) {
  const [overview, exercises] = await Promise.all([readOwnOverview(clientId).catch(() => null), listExercises()]);
  if (!overview) return <Unavailable>{children}</Unavailable>;

  const { state, pt, sessions } = overview;
  const index = state.index;
  const choice = shownProgram(index, state.unreadable, programParam);
  const ptProgram = pt?.program ?? null;
  let program: PlanProgram | null = ptProgram;
  let owner: PlanOwner = null;
  let problem = 'broken' in choice && choice.broken ? `${choice.broken.name ?? 'Seçtiğin program'} şu an açılamıyor.` : null;
  if (choice.shown) {
    const cached = state.programs.get(choice.shown);
    const read = cached ? { status: 'ok' as const, program: cached } : await readOwnProgramOf(clientId, choice.shown);
    if (read.status === 'ok') {
      program = read.program;
      owner = { programId: choice.shown, name: read.program.name };
    } else {
      problem = `${index.items.find((item) => item.id === choice.shown)?.name ?? 'Programın'} şu an açılamıyor.`;
    }
  }

  // Program seçimi (§2.6): yalnız en az bir kendi program varken.
  const last = lastDateByProgram(sessions);
  const choices: ProgramChoice[] = [
    ...(ptProgram ? [{ id: null, name: PT_PROGRAM_NAME, ...(last.get('pt') ? { lastDate: last.get('pt') } : {}) }] : []),
    ...index.items.map((item) => ({ id: item.id, name: item.name, ...(last.get(item.id) ? { lastDate: last.get(item.id) } : {}) })),
  ];
  const shown = owner?.programId ?? null;
  // Seçilen kendi program okunamadıysa PT'nin programı gösterilir ama bu tek seferlik seçim sayılmaz.
  const oneOff = choice.oneOff && (choice.shown === null || owner !== null);
  const chip =
    index.items.length > 0 ? <ProgramChip clientId={clientId} choices={choices} active={activeItem(index)?.id ?? null} shown={shown} oneOff={oneOff} /> : null;
  const edited = activeItem(index);
  const top = (
    <>
      {ptProgram && ptUpdatedSince(ptProgram, index.active) ? <NewPtProgramBanner clientId={clientId} version={ptProgram.updatedAt} /> : null}
      {edited?.ptEditedAt ? (
        <PtEditLine
          clientId={clientId}
          programId={edited.id}
          name={edited.name}
          editedAt={edited.ptEditedAt}
          dateText={formatDayShort(todayIn(timeZone, new Date(edited.ptEditedAt)))}
        />
      ) : null}
      {problem ? (
        <Alert>
          <AlertDescription>{problem} Antrenörünün programı gösteriliyor.</AlertDescription>
        </Alert>
      ) : null}
    </>
  );

  if (!owner && pt === null) {
    return (
      <>
        {top}
        <Card>
          <CardHeader>
            <CardTitle>Bugünün antrenmanı</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {chip}
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Barbell weight="fill" />
                </EmptyMedia>
                <EmptyTitle>Henüz program yok</EmptyTitle>
                <EmptyDescription>Antrenörün programını hazırladığında sıradaki antrenmanın burada görünecek.</EmptyDescription>
              </EmptyHeader>
              {index.items.length === 0 ? (
                <EmptyContent>
                  <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/me/programlar/yeni" />}>
                    <Plus data-icon="inline-start" />
                    Kendi programını kur
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          </CardContent>
        </Card>
        {children}
      </>
    );
  }
  if (!program) return <Unavailable top={top}>{children}</Unavailable>;

  const phase = currentPhaseOf(program)?.phase;
  const dayId = nextDayId(program);
  const dayIndex = phase?.days.findIndex((item) => item.id === dayId) ?? -1;
  const day = phase?.days[dayIndex];
  if (!phase || !day) return <Unavailable top={top}>{children}</Unavailable>;

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  // Danışanın kendi tekrar hedefleri (bitişte "Evet, güncelle", tasarım §6.2) günün satırlarında; kendi programda yok.
  const blocks = owner ? day.blocks : withClientTargets(day.blocks, program.clientTargets);
  const summary = templateSummary({ blocks }, byId);
  const status = phaseStatus(program, new Date());
  const frequency = frequencyLabel(phase.daysPerWeek);
  const phased = !owner && ptProgram?.phased === true;
  const context = phased
    ? [
        phase.name,
        phase.weeks !== undefined ? `${Math.min(status.week, phase.weeks)}. hafta / ${phase.weeks}` : null,
        frequency?.toLocaleLowerCase('tr') ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : frequency;
  // Tek seferlik seçimde antrenman o programla açılır.
  const programQuery = oneOff ? `?program=${encodeURIComponent(shown ?? 'pt')}` : '';
  // Dönüş sırası: sıradaki günün arkasından başlayıp başa sarar.
  const following = [...phase.days.slice(dayIndex + 1), ...phase.days.slice(0, dayIndex)];

  return (
    <>
      {top}
      <WorkoutFreshness clientId={clientId} stamp={programStamp(program, owner?.programId ?? null)} />
      <Card>
        <CardHeader>
          {chip ? <div className="col-span-full flex min-w-0 pb-1">{chip}</div> : null}
          <CardDescription>
            <DayStatus clientId={clientId} dayName={day.name} />
          </CardDescription>
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
        <CardContent className="flex flex-col gap-4">
          <WeekStrip clientId={clientId} />
          {summary.rows > 0 ? (
            <ClientDayPlan blocks={blocks} exercises={byId} />
          ) : (
            <p className="text-sm text-muted-foreground">Bu günün hareketleri şu an açılamıyor. Antrenörüne haber ver.</p>
          )}
        </CardContent>
        {summary.rows > 0 ? (
          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href={`/me/antrenman${programQuery}`} />}>
              <Play data-icon="inline-start" weight="fill" />
              Antrenmana başla
            </Button>
            <OtherDayButton clientId={clientId} />
          </CardFooter>
        ) : null}
      </Card>
      {children}

      {following.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sonraki günler</CardTitle>
            <CardDescription>{phased ? 'Bu evrede günler sırayla döner.' : 'Günler sırayla döner.'}</CardDescription>
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
