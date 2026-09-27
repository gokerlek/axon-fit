import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle, PencilSimple } from '@phosphor-icons/react/dist/ssr';
import { ChangeLog } from '@/components/program/change-log';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { currentClient } from '@/lib/guards';
import { activeProgramId } from '@/lib/own-program-index';
import { lastDateByDay, programLine } from '@/lib/own-program-text';
import { isOwnProgramId, ownSummaryOf } from '@/lib/own-programs';
import { readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { nextDayId } from '@/lib/program-plan';
import { ClientHeader } from '../../../client-header';
import { DeleteOwnProgram, MakeActiveButton, MarkPtEditSeen, ShareSwitch } from '../program-actions';
import { ProgramDays } from '../program-days';

export const metadata: Metadata = { title: 'Kendi programın' };

/** Değişikliklerin ilk gösterilen kayıt sayısı (§2.3). */
const LOG_INITIAL = 5;

/**
 * Kendi programın (`docs/design/kendi-program.md` §2.3): günler salt okuma ("sıradaki", "son: 19 Eyl"), Düzenle,
 * Bugün'ün programı (rozet ya da tek dokunuşla seçim), antrenörle paylaşım, değişiklikler (etiketler görene göre,
 * §7.3) ve silme. Adresteki kimlik kalıba uymuyorsa ya da program yoksa 404. Açılınca PT'nin düzenlemesi görüldü
 * sayılır (rozet düşer).
 */
export default async function OwnProgramPage({ params }: { params: Promise<{ pid: string }> }) {
  const [client, config, { pid }] = await Promise.all([currentClient(), readAppConfig(), params]);
  if (!isOwnProgramId(pid)) notFound();
  const [read, overview, exercises] = await Promise.all([readOwnProgramOf(client.id, pid), readOwnOverview(client.id).catch(() => null), listExercises()]);
  const back = { href: '/me/programlar', label: 'Programlar' };
  if (read.status === 'missing') notFound();

  const active = activeProgramId(overview?.state.index) === pid;

  if (read.status === 'invalid') {
    const name = read.name ?? 'Adı okunamayan program';
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title={name} back={back} />
        <Alert>
          <AlertTitle>Bu program şu an açılamıyor</AlertTitle>
          <AlertDescription>Dosyası beklenen biçimde değil. Silebilir ya da antrenörüne haber verebilirsin.</AlertDescription>
        </Alert>
        <DeleteOwnProgram clientId={client.id} programId={pid} name={read.name ?? 'Bu program'} active={active} shared={false} />
      </main>
    );
  }

  const program = read.program;
  const phase = program.phases[0];
  const item = overview?.state.index.items.find((row) => row.id === pid);
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const lastByDay = overview ? lastDateByDay(overview.sessions) : new Map<string, string>();

  return (
    <main className="flex flex-col gap-6">
      <MarkPtEditSeen clientId={client.id} programId={pid} editedAt={item?.ptEditedAt} />
      <div className="flex flex-col gap-2">
        <ClientHeader client={client} appName={config.appName} title={program.name} back={back} />
        <p className="text-sm text-muted-foreground tabular-nums">{programLine(ownSummaryOf(program))}</p>
        {active ? (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CheckCircle weight="fill" className="size-4 text-primary-text" />
            Bugün&apos;ün programı
          </p>
        ) : (
          <MakeActiveButton programId={pid} name={program.name} className="h-11 self-start" />
        )}
      </div>

      {phase ? <ProgramDays days={phase.days} exercises={byId} nextId={nextDayId(program)} lastByDay={lastByDay} /> : null}

      <Button variant="outline" size="lg" className="h-11 w-full" nativeButton={false} render={<Link href={`/me/programlar/${pid}/duzenle`} />}>
        <PencilSimple data-icon="inline-start" />
        Düzenle
      </Button>

      <ShareSwitch programId={pid} name={program.name} shared={Boolean(program.shared)} />

      <Separator />

      <section className="flex flex-col gap-3" aria-labelledby="own-log">
        <h2 id="own-log" className="font-heading text-lg font-semibold">
          Değişiklikler
        </h2>
        <ChangeLog entries={program.log} timeZone={config.timeZone} initial={LOG_INITIAL} step={LOG_INITIAL} viewer="client" />
      </section>

      <DeleteOwnProgram clientId={client.id} programId={pid} name={program.name} active={active} shared={Boolean(program.shared)} />
    </main>
  );
}
