import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ListChecks, Plus, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { EditButton } from '@/components/edit-button';
import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
import { PageHeader } from '@/components/page-header';
import { ChangeLog } from '@/components/program/change-log';
import { DayPlan } from '@/components/program/day-plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { formatDate, formatNumber } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { exerciseSetWeights } from '@/lib/muscles';
import {
  countDays,
  currentPhaseOf,
  missingExerciseDays,
  nextDayId,
  phaseStatus,
  phaseStatusLabel,
  sourceNames,
} from '@/lib/program-plan';
import { readProgramFile } from '@/lib/programs';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { templateMuscleLoad, templateSummary } from '@/lib/template-plan';
import { templateChoices } from '@/lib/templates';
import { cn } from '@/lib/utils';
import { InvalidProgramAlert } from './invalid-program-alert';
import { PhaseTransition } from './phase-transition';

/**
 * Danışanın programı — yalnız gösterim; tek eylem "Düzenle" (SPEC §6). İstisna: şu anki
 * evrenin süresi dolunca sonraki evreye geçiş önerisi burada onaylanır (SPEC §7.4).
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

  const [file, exercises, config, templates] = await Promise.all([
    readProgramFile(id),
    listExercises(),
    readAppConfig(),
    templateChoices().catch(() => []),
  ]);
  const detailHref = `/dashboard/clients/${id}`;
  const crumbs = [{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: client.name, href: detailHref }, { label: 'Program' }];
  const editHref = `${detailHref}/program/edit`;

  if (!file) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader crumbs={crumbs} title="Program" />
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
      </div>
    );
  }

  if (!file.program) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader crumbs={crumbs} title="Program" actions={<EditButton href={editHref} />} />
        <InvalidProgramAlert problem={file.problem} />
      </div>
    );
  }

  const program = file.program;
  const { timeZone } = config;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const templateIds = new Set(templates.map((template) => template.id));
  const current = currentPhaseOf(program);
  const status = phaseStatus(program, new Date());
  const nextId = nextDayId(program);
  const nextDay = current?.phase.days.find((day) => day.id === nextId);
  const missingRows = missingExerciseDays(program.phases, new Set(byId.keys())).reduce((sum, item) => sum + item.rowIds.length, 0);
  const sources = sourceNames(program.phases);
  const load = current ? templateMuscleLoad({ blocks: current.phase.days.flatMap((day) => day.blocks) }, byId, exerciseSetWeights).load : {};
  const nextPhase = status.kind === 'due' ? program.phases.find((phase) => phase.id === status.nextPhaseId) : undefined;
  const weeksText = (weeks: number | undefined) => (weeks === undefined ? 'süresiz' : `${weeks} hafta`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={crumbs}
        title="Program"
        description={`${program.phases.length} evre · ${countDays(program.phases)} gün · ${formatDate(program.createdAt, timeZone)} tarihinde oluşturuldu`}
        actions={<EditButton href={editHref} />}
      />

      {status.kind === 'due' && current && nextPhase ? (
        <PhaseTransition
          clientId={id}
          phaseName={current.phase.name}
          description={`${status.weeks} hafta planlanmıştı; ${formatDate(program.current.startedAt, timeZone)} tarihinde başladı. Sıradaki evre: '${nextPhase.name}'.`}
          next={{ id: nextPhase.id, name: nextPhase.name }}
          revision={program.revision}
        />
      ) : null}

      {status.kind === 'ended' && current ? (
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
            Silinmiş bir egzersize bağlı; danışanın ekranında görünmez. Programı düzenleyip değiştir ya da kaldır.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Şu anki evre: {current?.phase.name}</CardTitle>
            <CardDescription>{phaseStatusLabel(status)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {status.kind !== 'open' ? (
              <Progress value={Math.min(status.week / status.weeks, 1) * 100}>
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
                  <TableCell className="text-muted-foreground">Sıradaki gün</TableCell>
                  <TableCell>{nextDay?.name ?? '—'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="flex flex-col gap-2">
              <TemplateMuscleMap variant="full" bodyClassName="h-56" load={load} label="Şu anki evrenin kas yükü" />
              <p className="text-center text-xs text-muted-foreground">Bir tur: bütün günler birer kez; kas başına çalışma seti.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
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
                      {weeksText(phase.weeks)} · {phase.days.map((day) => day.name).join(', ')}
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Günler</CardTitle>
          <CardDescription>Şu anki evrenin günleri sırayla döner (A → B → C); sıradaki gün işaretli.</CardDescription>
        </CardHeader>
        <CardContent>
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
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {phase.days.map((day) => {
                    const summary = templateSummary({ blocks: day.blocks }, byId);
                    const isNext = phase.id === current?.phase.id && day.id === nextId;
                    const source = day.source;
                    return (
                      <li key={day.id} className={cn('flex flex-col gap-3 rounded-lg border p-3', isNext && 'bg-primary/5 ring-2 ring-primary/50')}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{day.name}</span>
                            {isNext ? <Badge>Sıradaki</Badge> : null}
                          </div>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈{' '}
                            {formatNumber(summary.minutes)} dk
                          </span>
                          {source ? (
                            <span className="text-xs text-muted-foreground">
                              {templateIds.has(source.templateId) ? (
                                <Link href={`/dashboard/templates/${source.templateId}`} className="underline underline-offset-4">
                                  &apos;{source.templateName}&apos; şablonundan
                                </Link>
                              ) : (
                                <>&apos;{source.templateName}&apos; şablonundan (şablon silinmiş)</>
                              )}
                            </span>
                          ) : null}
                        </div>
                        <DayPlan blocks={day.blocks} exercises={byId} missing="show" />
                      </li>
                    );
                  })}
                </ul>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card id="gecmis" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Program geçmişi</CardTitle>
          <CardDescription>Her kayıtta otomatik yazılır; tamamı danışanın repo&apos;sunun git geçmişinde.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeLog entries={program.log} timeZone={timeZone} initial={20} />
        </CardContent>
      </Card>
    </div>
  );
}
