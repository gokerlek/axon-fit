import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Bandaids, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { EditButton } from '@/components/edit-button';
import { SectionHeader } from '@/components/section-header';
import { ChangeLog } from '@/components/program/change-log';
import { DayPlan } from '@/components/program/day-plan';
import { PhaseLoad } from '@/components/program/phase-load';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadCareInput } from '@/lib/client-care';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { programConflicts } from '@/lib/constraint-filter';
import { listExercises } from '@/lib/exercises';
import { formatDate, formatNumber, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { exerciseSetWeights } from '@/lib/muscles';
import { programLine } from '@/lib/own-program-text';
import { isOwnProgramId, ownSummaryOf } from '@/lib/own-programs';
import { readOwnProgramOf } from '@/lib/own-programs-store';
import { missingExerciseDays, nextDayId, phaseMuscleLoad } from '@/lib/program-plan';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { templateSummary } from '@/lib/template-plan';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Danışanın programı' };

/**
 * Danışanın paylaştığı kendi programı (`docs/design/kendi-program.md` §4): PT program sayfasının evresiz hâli —
 * günler (`DayPlan`), planlanan kas yükü ve değişiklikler (etiketler PT'ye göre, §7.3). Tek eylem [Düzenle]; öneri,
 * evre geçişi ve silme yok. Paylaşılmamış dosyanın içeriği gösterilmez. Kısıtlarla çelişen satırlar program
 * sayfasındaki gibi en üstte (`kisit-tarama.md` §3.3; yalnız kısıtların onayı sürdükçe).
 */
export default async function OwnProgramViewPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  await requirePt();
  const { id, pid } = await params;
  if (!CLIENT_ID_PATTERN.test(id) || !isOwnProgramId(pid)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);

  const [read, exercises, config] = await Promise.all([readOwnProgramOf(id, pid), listExercises(), readAppConfig()]);
  if (read.status === 'missing') notFound();
  const back = <EditorBackLink href={`/dashboard/clients/${id}/program`} label="Program" />;

  if (read.status === 'invalid' || !read.program.shared) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {back}
          <SectionHeader title="Danışanın programı" />
        </div>
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{read.status === 'invalid' ? 'Program okunamadı' : 'Danışan bu programın paylaşımını kapattı.'}</AlertTitle>
          <AlertDescription>
            {read.status === 'invalid' ? 'Dosyası beklenen biçimde değil; danışan silebilir.' : 'Yeniden paylaşırsa burada görünür.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const program = read.program;
  const { timeZone } = config;
  const phase = program.phases[0];
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const nextId = nextDayId(program);
  const load = phase ? phaseMuscleLoad(phase, byId, exerciseSetWeights) : null;
  const missingRows = missingExerciseDays(program.phases, new Set(byId.keys())).reduce((sum, item) => sum + item.rowIds.length, 0);
  const description = [programLine(ownSummaryOf(program)), `${formatDate(program.createdAt, timeZone)} tarihinde oluşturuldu`].join(' · ');
  const careInput = await loadCareInput(loaded.client, todayIn(timeZone));
  const conflicts = careInput ? programConflicts(program, byId, careInput) : [];
  const editHref = `/dashboard/clients/${id}/program/own/${pid}/edit`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {back}
        <SectionHeader title={program.name} description={description} actions={<EditButton href={editHref} />} />
      </div>

      {conflicts.length > 0 ? (
        <Alert>
          <Bandaids weight="fill" />
          <AlertTitle>Kısıtlarla çelişen {formatNumber(conflicts.length)} hareket</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{conflicts.map((conflict) => `${conflict.dayName} · ${conflict.title} (${conflict.message})`).join(' · ')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={editHref} />}>
                Programı düzenle
              </Button>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${id}/constraints`} />}>
                Kısıtlar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {missingRows > 0 ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{missingRows} hareket kütüphanede bulunamadı</AlertTitle>
          <AlertDescription>Silinmiş bir egzersize bağlı; danışanın ekranında görünmez.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Günler</CardTitle>
          <CardDescription>Günler sırayla döner (A → B → C); sıradaki gün işaretli.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {phase?.days.map((day) => {
              const summary = templateSummary({ blocks: day.blocks }, byId);
              const isNext = day.id === nextId;
              return (
                <li key={day.id} className={cn('flex flex-col gap-3 rounded-lg border p-3', isNext && 'bg-primary/5 ring-2 ring-primary-text')}>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium break-words">{day.name}</span>
                      {isNext ? <Badge>Sıradaki</Badge> : null}
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
                    </span>
                    {day.copiedFrom ? <span className="text-xs text-muted-foreground">Senin programından kopya: &apos;{day.copiedFrom.dayName}&apos;</span> : null}
                  </div>
                  <DayPlan blocks={day.blocks} exercises={byId} missing="show" />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {phase && load ? (
        <Card>
          <CardHeader>
            <CardTitle>Kas yükü</CardTitle>
            <CardDescription>Programın planlanan kas yükü.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhaseLoad
              cycle={load.cycle}
              weekly={load.weekly}
              factor={load.factor}
              daysPerWeek={phase.daysPerWeek}
              dayCount={phase.days.length}
              label="Programın kas yükü"
              done={null}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Değişiklikler</CardTitle>
          <CardDescription>Danışanın ve senin kayıtların, antrenmandan yazılanlar ve paylaşım.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeLog entries={program.log} timeZone={timeZone} initial={20} viewer="pt" />
        </CardContent>
      </Card>
    </div>
  );
}
