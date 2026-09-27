import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Lightning, ListChecks, Plus, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { EditButton } from '@/components/edit-button';
import { SectionHeader } from '@/components/section-header';
import { ChangeLog } from '@/components/program/change-log';
import { DayPlan } from '@/components/program/day-plan';
import { PhaseLoad, type DoneLoad } from '@/components/program/phase-load';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { clientTargetNotes } from '@/lib/client-targets';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { formatDate, formatDayShort, formatNumber, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { exerciseSetWeights } from '@/lib/muscles';
import {
  countDays,
  currentPhaseOf,
  frequencyLabel,
  missingExerciseDays,
  nextDayId,
  phaseMuscleLoad,
  phaseProgress,
  phaseStatus,
  phaseStatusLabel,
  sourceNames,
  type ProgramPhase,
} from '@/lib/program-plan';
import { deloadHints, loadComparison, thisWeekLoad } from '@/lib/program-insights';
import { readProgramFile } from '@/lib/programs';
import { weekLabel } from '@/lib/progress-text';
import { isFaded, pendingProposals, PROPOSAL_KIND_LABELS } from '@/lib/proposals';
import { readProposals } from '@/lib/proposals-store';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { readIndex } from '@/lib/session-files-core';
import { sessionRepo } from '@/lib/session-files';
import { templateSummary } from '@/lib/template-plan';
import { templateChoices } from '@/lib/templates';
import { effectiveSchedule, weekdaysText } from '@/lib/training-days';
import { cn } from '@/lib/utils';
import { readOwnState } from '@/lib/own-program-files';
import { InvalidProgramAlert } from './invalid-program-alert';
import { OwnActiveAlert, SharedProgramsCard } from './own-programs-card';
import { PhaseTransition } from './phase-transition';
import { ProposalsCard, type ProposalView } from './proposals-card';
import { ResetDaysButton } from './weekday-field';

export const metadata: Metadata = { title: 'Program' };

/**
 * Danışanın programı — yalnız gösterim; tek eylem "Düzenle" (SPEC §6). İstisnalar: şu anki
 * evrenin süresi dolunca sonraki evreye geçiş önerisi burada onaylanır (SPEC §7.4); danışan antrenman
 * günlerini değiştirdiyse "Danışan değiştirdi" ve [PT'nin günlerine dön] (tasarım §2.11); en üstte
 * "Danışandan öneriler (n)" [Uygula] [Reddet] (tasarım §6.4); danışanın tekrar hedefi olan satırda
 * "Danışan güncelledi" rozeti (§6.2). Kas yükünde planlanan haftalığın yanında bu hafta yapılan (SPEC §7.4);
 * İleri aşamadaki harekette hafifletme ipucu (tasarım §5.3, `deloadHintDue`).
 * Evresiz programda evreden söz edilmez: "Döngü" kartı (sıradaki gün, sıklık, planlanan
 * haftalık yük) ve sırayla dönen günler.
 * Danışan kendi programıyla çalışıyorsa en üstte bilgi satırı; paylaştığı programlar en altta
 * (`docs/design/kendi-program.md` §4).
 */
export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  // Kaydı okunamayan danışan: sorunu detay sayfası anlatır.
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  const { client } = loaded;

  const [file, exercises, config, templates, proposals, sessions, own] = await Promise.all([
    readProgramFile(id),
    listExercises(),
    readAppConfig(),
    templateChoices().catch(() => []),
    // Öneriler okunamasa da program görünür.
    readProposals(id).catch(() => null),
    // Antrenmanlar (bu haftanın yükü, hafifletme ipucu) okunamasa da program görünür.
    readIndex(sessionRepo(id)).catch(() => null),
    // Danışanın kendi programları (index): okunamasa da program görünür.
    readOwnState(sessionRepo(id)).catch(() => null),
  ]);
  const ownIndex = own?.index ?? null;
  const detailHref = `/dashboard/clients/${id}`;
  const editHref = `${detailHref}/program/edit`;

  if (!file) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Program" />
        <OwnActiveAlert clientId={id} index={ownIndex} timeZone={config.timeZone} />
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListChecks weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Henüz program yok</EmptyTitle>
              <EmptyDescription>
                Bir şablondan başlayıp bu danışana göre düzenleyebilir ya da boş başlayabilirsin.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href={`${detailHref}/program/new`} />}>
                <Plus data-icon="inline-start" weight="fill" />
                Program oluştur
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
        <SharedProgramsCard clientId={id} index={ownIndex} sessions={sessions?.index ?? null} timeZone={config.timeZone} />
      </div>
    );
  }

  if (!file.program) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Program" actions={<EditButton href={editHref} />} />
        <OwnActiveAlert clientId={id} index={ownIndex} timeZone={config.timeZone} />
        <InvalidProgramAlert problem={file.problem} />
        <SharedProgramsCard clientId={id} index={ownIndex} sessions={sessions?.index ?? null} timeZone={config.timeZone} />
      </div>
    );
  }

  const program = file.program;
  const { timeZone } = config;
  const phased = program.phased;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const templateIds = new Set(templates.map((template) => template.id));
  const current = currentPhaseOf(program);
  const now = new Date();
  const status = phaseStatus(program, now);
  const progress = phaseProgress(program, now);
  const nextId = nextDayId(program);
  const nextDay = current?.phase.days.find((day) => day.id === nextId);
  const missingRows = missingExerciseDays(program.phases, new Set(byId.keys())).reduce((sum, item) => sum + item.rowIds.length, 0);
  const sources = sourceNames(program.phases);
  const load = current ? phaseMuscleLoad(current.phase, byId, exerciseSetWeights) : null;
  const nextPhase = status.kind === 'due' ? program.phases.find((phase) => phase.id === status.nextPhaseId) : undefined;
  const weeksText = (weeks: number | undefined) => (weeks === undefined ? 'süresiz' : `${weeks} hafta`);
  const perWeek = (daysPerWeek: number | undefined) => frequencyLabel(daysPerWeek)?.toLocaleLowerCase('tr') ?? null;
  const frequency = frequencyLabel(current?.phase.daysPerWeek);
  const created = `${formatDate(program.createdAt, timeZone)} tarihinde oluşturuldu`;
  const description = phased
    ? `${program.phases.length} evre · ${countDays(program.phases)} gün · ${created}`
    : [`${countDays(program.phases)} gün`, perWeek(current?.phase.daysPerWeek), created].filter(Boolean).join(' · ');
  // Bu hafta yapılan (İlerleme sekmesiyle aynı hesap), planlanan haftalığın yanında.
  const week = sessions ? thisWeekLoad({ index: sessions.index, today: todayIn(timeZone, now), exercises: byId, setWeightsOf: exerciseSetWeights }) : null;
  const done: DoneLoad | null = week
    ? {
        load: week.muscles,
        sessions: week.sessions,
        sets: week.sets,
        range: weekLabel(week.weekStart, week.weekEnd),
        versus: load?.weekly ? loadComparison(load.weekly, week.muscles) : null,
      }
    : null;
  const phaseLoad =
    current && load ? (
      <PhaseLoad
        cycle={load.cycle}
        weekly={load.weekly}
        factor={load.factor}
        daysPerWeek={current.phase.daysPerWeek}
        dayCount={current.phase.days.length}
        label={phased ? 'Şu anki evrenin kas yükü' : 'Programın kas yükü'}
        done={done}
      />
    ) : null;
  // İleri aşamadaki hareketlerde hafifletme ipucu (tasarım §5.3): şu anki evrenin hareketleri.
  const hints =
    sessions && current
      ? deloadHints({
          exerciseIds: current.phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId))),
          index: sessions.index,
          now,
          experience: client.training?.experience,
        })
      : [];
  const nextSummary = nextDay ? templateSummary({ blocks: nextDay.blocks }, byId) : null;
  // Danışanın geçerli tekrar hedefleri (§6.2): satırda "Danışan güncelledi · hedef 10–14 · 26 Eyl".
  const targetNotes = Object.fromEntries(
    Object.entries(clientTargetNotes(program.phases, program.clientTargets, (exerciseId) => byId.get(exerciseId)?.trackingType ?? 'weight_reps')).map(
      ([rowId, note]) => [rowId, `${note.text} · ${formatDayShort(todayIn(timeZone, new Date(note.at)))}`],
    ),
  );
  // Danışandan öneriler (§6.4): bekleyenler, en yeni üstte; gün adı programdan.
  const dayNames = new Map(program.phases.flatMap((phase) => phase.days.map((day) => [day.id, day.name] as const)));
  const proposalViews: ProposalView[] = proposals
    ? pendingProposals(proposals.file).map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        text: item.text,
        ...(item.why ? { why: item.why } : {}),
        meta: [dayNames.get(item.dayId), formatDate(item.at, timeZone)].filter(Boolean).join(' · '),
        kindLabel: PROPOSAL_KIND_LABELS[item.kind],
        faded: isFaded(item, now),
      }))
    : [];
  // Antrenman günleri (§2.11): geçerli olanlar; danışan değiştirdiyse rozet ve PT'nin günlerine dönüş.
  const days = effectiveSchedule(program);
  const daysRow = (
    <TableRow>
      <TableCell className="text-muted-foreground">Antrenman günleri</TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{weekdaysText(days.weekdays) || 'Seçilmedi'}</span>
          {days.client ? <Badge variant="secondary">Danışan değiştirdi</Badge> : null}
          {days.client ? <ResetDaysButton clientId={id} className="-my-1" /> : null}
        </div>
        {days.client ? (
          <span className="text-xs text-muted-foreground">
            {days.pt.length > 0 ? `Programdaki günler: ${weekdaysText(days.pt)}` : 'Programda gün seçilmemişti.'}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );

  const dayCards = (phase: ProgramPhase) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {phase.days.map((day) => {
        const summary = templateSummary({ blocks: day.blocks }, byId);
        const isNext = phase.id === current?.phase.id && day.id === nextId;
        const source = day.source;
        return (
          <li key={day.id} className={cn('flex flex-col gap-3 rounded-lg border p-3', isNext && 'bg-primary/5 ring-2 ring-primary-text')}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{day.name}</span>
                {isNext ? <Badge>Sıradaki</Badge> : null}
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
              </span>
              {source ? (
                <span className="text-xs text-muted-foreground">
                  {templateIds.has(source.templateId) ? (
                    <Link
                      href={`/dashboard/templates/${source.templateId}`}
                      className="underline underline-offset-4 touch:inline-flex touch:min-h-11 touch:items-center">
                      &apos;{source.templateName}&apos; şablonundan
                    </Link>
                  ) : (
                    <>&apos;{source.templateName}&apos; şablonundan (şablon silinmiş)</>
                  )}
                </span>
              ) : null}
            </div>
            <DayPlan blocks={day.blocks} exercises={byId} missing="show" rowNotes={targetNotes} />
          </li>
        );
      })}
    </ul>
  );

  /*
   * Sıra telefonda işe göre (DOM sırası): sıradaki gün ve hareketleri → bütün günler → evre ya da
   * döngü özeti → evreler → kas yükü → geçmiş. Masaüstünde iki sütun: sıradaki gün evre özetinin
   * yanında, günler tam genişlikte, kas yükü evrelerin yanında (`lg:order-*`).
   */
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Program" description={description} actions={<EditButton href={editHref} />} />
      <OwnActiveAlert clientId={id} index={ownIndex} timeZone={timeZone} />

      {proposalViews.length > 0 ? <ProposalsCard clientId={id} items={proposalViews} /> : null}
      {proposals?.broken ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>Danışanın önerileri okunamadı</AlertTitle>
          <AlertDescription>proposals.json bozuk görünüyor; danışanın yeni önerileri o düzelene kadar kaydedilmez.</AlertDescription>
        </Alert>
      ) : null}

      {hints.length > 0 ? (
        <Alert>
          <Lightning weight="fill" />
          <AlertTitle>Hafifletme haftası planlanabilir</AlertTitle>
          <AlertDescription>
            <p>
              İleri aşamadaki hareketlerde 4–6 haftada bir hafifletme önerilir (ortalama 5,6 hafta). Öneri motoru takvime göre
              kendiliğinden hafifletmez; karar programda verilir.
            </p>
            <ul className="list-disc pl-5">
              {hints.map((hint) => (
                <li key={hint.exerciseId}>
                  {byId.get(hint.exerciseId)?.title ?? hint.exerciseId}:{' '}
                  {hint.since === 'deload' ? `son hafifletmeden bu yana ${hint.weeks} hafta` : `${hint.weeks} haftadır hafifletme yok`}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {phased && status.kind === 'due' && current && nextPhase ? (
        <PhaseTransition
          clientId={id}
          phaseName={current.phase.name}
          description={`${status.weeks} hafta planlanmıştı; ${formatDate(program.current.startedAt, timeZone)} tarihinde başladı. Sıradaki evre: '${nextPhase.name}'.`}
          next={{ id: nextPhase.id, name: nextPhase.name }}
          revision={program.revision}
          createdAt={program.createdAt}
        />
      ) : null}

      {phased && status.kind === 'ended' && current ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>&apos;{current.phase.name}&apos; evresinin süresi doldu</AlertTitle>
          <AlertDescription>
            Sonrasında evre yok. Devam edecekse programı düzenleyip yeni evre ekleyebilir ya da süreyi uzatabilirsin.
          </AlertDescription>
        </Alert>
      ) : null}

      {missingRows > 0 ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{missingRows} hareket kütüphanede bulunamadı</AlertTitle>
          <AlertDescription>
            Silinmiş bir egzersize bağlı; danışanın ekranında görünmez. Programı düzenleyip kaldır, yerine yenisini ekle.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {nextDay && nextSummary ? (
          <Card className="lg:order-1">
            <CardHeader>
              <CardTitle>Sıradaki gün: {nextDay.name}</CardTitle>
              <CardDescription className="tabular-nums">
                {[
                  phased ? current?.phase.name : null,
                  `${formatNumber(nextSummary.rows)} hareket · ${formatNumber(nextSummary.workingSets)} set · ≈ ${formatNumber(nextSummary.minutes)} dk`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DayPlan blocks={nextDay.blocks} exercises={byId} missing="show" rowNotes={targetNotes} />
            </CardContent>
          </Card>
        ) : null}

        <Card className="lg:order-3 lg:col-span-2">
          <CardHeader>
            <CardTitle>Günler</CardTitle>
            <CardDescription>
              {phased
                ? 'Şu anki evrenin günleri sırayla döner (A → B → C); sıradaki gün işaretli.'
                : 'Günler sırayla döner (A → B → C); sıradaki gün işaretli.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {phased ? (
              <Tabs defaultValue={program.current.phaseId}>
                <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                  {program.phases.map((phase, index) => (
                    <TabsTrigger key={phase.id} value={phase.id} className="flex-none">
                      {index + 1}. {phase.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {program.phases.map((phase) => (
                  <TabsContent key={phase.id} value={phase.id} className="pt-3">
                    {dayCards(phase)}
                  </TabsContent>
                ))}
              </Tabs>
            ) : current ? (
              dayCards(current.phase)
            ) : null}
          </CardContent>
        </Card>

        {phased ? (
          <Card className="lg:order-2">
            <CardHeader>
              <CardTitle>Şu anki evre: {current?.phase.name}</CardTitle>
              <CardDescription>{phaseStatusLabel(status)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {status.kind !== 'open' && progress !== null ? (
                <Progress value={progress * 100}>
                  <ProgressLabel>
                    Hafta {Math.min(status.week, status.weeks)} / {status.weeks}
                  </ProgressLabel>
                </Progress>
              ) : null}
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-32 text-muted-foreground">Başladı</TableCell>
                    <TableCell>{formatDate(program.current.startedAt, timeZone)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Bitiyor</TableCell>
                    <TableCell>{status.kind === 'open' ? 'Süresiz' : formatDate(status.endsAt, timeZone)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Sıklık</TableCell>
                    <TableCell>{frequency ?? 'Belirtilmedi'}</TableCell>
                  </TableRow>
                  {daysRow}
                  <TableRow>
                    <TableCell className="text-muted-foreground">Sıradaki gün</TableCell>
                    <TableCell>{nextDay?.name ?? '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:order-2">
            <CardHeader>
              <CardTitle>Döngü</CardTitle>
              <CardDescription>Günler sırayla döner; danışan sıradaki günü görür.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-36 text-muted-foreground">Sıradaki gün</TableCell>
                    <TableCell>{nextDay?.name ?? '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Sıklık</TableCell>
                    <TableCell>{frequency ?? 'Belirtilmedi'}</TableCell>
                  </TableRow>
                  {daysRow}
                  <TableRow>
                    <TableCell className="text-muted-foreground">Son antrenman</TableCell>
                    <TableCell>
                      {program.rotation.lastCompletedAt ? formatDate(program.rotation.lastCompletedAt, timeZone) : 'Henüz yok'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Başladı</TableCell>
                    <TableCell>{formatDate(program.current.startedAt, timeZone)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {sources.length > 0 ? (
                <p className="text-sm text-muted-foreground">Kaynak şablonlar: {sources.join(', ')}</p>
              ) : null}
            </CardContent>
          </Card>
        )}

        {phased ? (
          <Card className="lg:order-4">
            <CardHeader>
              <CardTitle>Evreler</CardTitle>
              <CardDescription>Evre geçişini sen onaylarsın; süre dolunca burada önerilir.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ol className="flex flex-col gap-3">
                {program.phases.map((phase, index) => {
                  const position = current ? index - current.index : 0;
                  return (
                    <li key={phase.id} className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {index + 1}. {phase.name}
                        </span>
                        {position === 0 ? (
                          <Badge variant="secondary">Şu an</Badge>
                        ) : (
                          <Badge variant="outline">{position < 0 ? 'Önceki' : 'Sırada'}</Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {[weeksText(phase.weeks), perWeek(phase.daysPerWeek), phase.days.map((day) => day.name).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {sources.length > 0 ? (
                <p className="text-sm text-muted-foreground">Kaynak şablonlar: {sources.join(', ')}</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {phaseLoad ? (
          <Card className={cn('lg:order-5', !phased && 'lg:col-span-2')}>
            <CardHeader>
              <CardTitle>Kas yükü</CardTitle>
              <CardDescription>
                {phased ? 'Şu anki evrenin planlanan kas yükü' : 'Programın planlanan kas yükü'}
                {done ? ' ve bu hafta yapılan.' : '.'}
              </CardDescription>
            </CardHeader>
            <CardContent>{phaseLoad}</CardContent>
          </Card>
        ) : null}

        <Card id="gecmis" className="scroll-mt-4 lg:order-6 lg:col-span-2">
          <CardHeader>
            <CardTitle>Program geçmişi</CardTitle>
            <CardDescription>Her kaydettiğinde ve danışan programını güncellediğinde (günleri, kilo ve tekrar hedefi) ne değiştiği buraya yazılır.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangeLog entries={program.log} timeZone={timeZone} initial={20} />
          </CardContent>
        </Card>
      </div>

      <SharedProgramsCard clientId={id} index={ownIndex} sessions={sessions?.index ?? null} timeZone={timeZone} />
    </div>
  );
}
