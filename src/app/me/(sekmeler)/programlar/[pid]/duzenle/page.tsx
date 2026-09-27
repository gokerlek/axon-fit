import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OwnProgramForm } from '@/components/program/own-program-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { accusative } from '@/lib/turkish';
import { isOwnProgramId, OWN_PROGRAM_LIMITS } from '@/lib/own-programs';
import { ownEditorLibrary, readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { clientTemplates } from '@/lib/templates';
import { ClientHeader } from '../../../../client-header';

export const metadata: Metadata = { title: 'Programı düzenle' };

/**
 * Kendi programın düzenleyicisi (`docs/design/kendi-program.md` §2.5): `OwnProgramForm` danışan kipinde (sade
 * düzenleyici). `?gunler=d_…` antrenörünün programından "Kendi programına kopyala"dan gelir: günler eklenmiş açılır,
 * kaydetmek danışanın işi. Kimlik kalıba uymuyorsa ya da program yoksa 404; bozuk dosya düzenlenmez.
 */
export default async function EditOwnProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ pid: string }>;
  searchParams: Promise<{ gunler?: string | string[] }>;
}) {
  const [client, config, { pid }, query] = await Promise.all([currentClient(), readAppConfig(), params, searchParams]);
  if (!isOwnProgramId(pid)) notFound();
  const [read, overview, library, templates] = await Promise.all([
    readOwnProgramOf(client.id, pid),
    readOwnOverview(client.id).catch(() => null),
    ownEditorLibrary(client),
    clientTemplates().catch(() => []),
  ]);
  if (read.status === 'missing') notFound();
  const back = { href: `/me/programlar/${pid}`, label: read.status === 'ok' ? read.program.name : 'Program' };

  if (read.status === 'invalid' || !overview) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title="Programı düzenle" back={back} />
        <Alert>
          <AlertTitle>Bu program şu an açılamıyor</AlertTitle>
          <AlertDescription>Biraz sonra yeniden dene; sürerse antrenörüne haber ver.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const program = read.program;
  const ptProgram = overview.pt?.program ?? null;
  const ptDayIds = new Set(ptProgram?.phases.flatMap((phase) => phase.days.map((day) => day.id)) ?? []);
  const wanted = Array.isArray(query.gunler) ? query.gunler[0] : query.gunler;
  const addPtDayIds = (wanted ?? '')
    .split(',')
    .filter((id) => ptDayIds.has(id))
    .slice(0, OWN_PROGRAM_LIMITS.days);

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title={`${accusative(program.name)} düzenle`} back={back} />
      <OwnProgramForm
        mode="own"
        clientId={client.id}
        programId={pid}
        creating={false}
        initial={{ name: program.name, currentPhaseId: program.current.phaseId, phases: program.phases, weekdays: program.schedule?.weekdays ?? [] }}
        base={{ revision: program.revision, createdAt: program.createdAt }}
        exercises={library.exercises}
        devices={library.devices}
        ptProgram={ptProgram ? { phases: ptProgram.phases, clientTargets: ptProgram.clientTargets } : null}
        templates={templates}
        otherNames={overview.state.index.items.filter((item) => item.id !== pid).map((item) => item.name)}
        timeZone={config.timeZone}
        saveUrl={`/api/me/programs/${pid}`}
        doneHref="/me/programlar/{id}"
        {...(addPtDayIds.length > 0 ? { addPtDayIds } : {})}
      />
    </main>
  );
}
