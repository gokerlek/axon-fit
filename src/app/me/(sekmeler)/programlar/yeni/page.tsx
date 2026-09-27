import type { Metadata } from 'next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { defaultOwnName, OWN_PROGRAM_LIMITS } from '@/lib/own-programs';
import { ownEditorLibrary, readOwnOverview } from '@/lib/own-programs-store';
import { clientTemplate, clientTemplates } from '@/lib/templates';
import { ClientHeader } from '../../../client-header';
import { NewProgramFlow } from './new-program-flow';

export const metadata: Metadata = { title: 'Yeni program' };

/**
 * Yeni kendi program (`docs/design/kendi-program.md` §2.4): ad ve başlangıç, sonra düzenleyici (tek adres, iki adım;
 * `NewProgramFlow`). `?gunler=d_…,d_…` antrenörünün programından seçili günlerle, `?sablon=t_…` şablonla açar;
 * şablon yalnız danışanlara açıksa (`clientTemplate`, §3.8), günler PT'nin programında varsa kullanılır.
 * 5 programda sayfa açılmaz, nedenini söyler.
 */
export default async function NewOwnProgramPage({ searchParams }: { searchParams: Promise<{ gunler?: string | string[]; sablon?: string | string[] }> }) {
  const [client, config, query] = await Promise.all([currentClient(), readAppConfig(), searchParams]);
  const back = { href: '/me/programlar', label: 'Programlar' };
  const overview = await readOwnOverview(client.id).catch(() => null);

  if (!overview) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title="Yeni program" back={back} />
        <Alert>
          <AlertTitle>Programların şu an açılamıyor</AlertTitle>
          <AlertDescription>Biraz sonra yeniden dene.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const { state, pt } = overview;
  if (state.index.items.length + state.unreadable.length >= OWN_PROGRAM_LIMITS.programs) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title="Yeni program" back={back} />
        <Alert>
          <AlertTitle>En fazla {OWN_PROGRAM_LIMITS.programs} program</AlertTitle>
          <AlertDescription>Yenisi için Programlar&apos;dan birini sil.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const ptProgram = pt?.program ?? null;
  const ptDayIds = new Set(ptProgram?.phases.flatMap((phase) => phase.days.map((day) => day.id)) ?? []);
  const wantedDays = (one(query.gunler) ?? '')
    .split(',')
    .filter((id) => ptDayIds.has(id))
    .slice(0, OWN_PROGRAM_LIMITS.days);
  const templateParam = one(query.sablon);

  const [library, templates, wantedTemplate] = await Promise.all([
    ownEditorLibrary(client),
    clientTemplates().catch(() => []),
    templateParam ? clientTemplate(templateParam).catch(() => null) : Promise.resolve(null),
  ]);
  const names = state.index.items.map((item) => item.name);

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title="Yeni program" back={back} />
      <NewProgramFlow
        form={{
          clientId: client.id,
          exercises: library.exercises,
          devices: library.devices,
          ptProgram: ptProgram ? { phases: ptProgram.phases, clientTargets: ptProgram.clientTargets } : null,
          templates,
          otherNames: names,
          timeZone: config.timeZone,
        }}
        defaultName={defaultOwnName(names)}
        otherNames={names}
        ptProgram={ptProgram ? { phases: ptProgram.phases, clientTargets: ptProgram.clientTargets } : null}
        ptCurrentPhaseId={ptProgram?.current.phaseId ?? null}
        templates={templates}
        initialStart={
          wantedTemplate
            ? { kind: 'template', templateId: wantedTemplate.id }
            : wantedDays.length > 0
              ? { kind: 'pt', dayIds: wantedDays }
              : { kind: 'blank' }
        }
        takenIds={[...state.index.items.map((item) => item.id), ...state.unreadable.map((item) => item.id)]}
      />
    </main>
  );
}
