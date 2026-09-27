import type { Metadata } from 'next';
import Link from 'next/link';
import { CaretRight, Notebook, Plus } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { activeProgramId, ptEdits } from '@/lib/own-program-index';
import { lastDateByProgram, programLine, ptUpdatedSince } from '@/lib/own-program-text';
import { OWN_PROGRAM_LIMITS, PT_PROGRAM_NAME } from '@/lib/own-programs';
import { readOwnOverview } from '@/lib/own-programs-store';
import { currentPhaseOf, nextDayId } from '@/lib/program-plan';
import { effectiveSchedule } from '@/lib/training-days';
import { ClientHeader } from '../../client-header';
import { DeleteOwnProgram, PtEditBadge } from './program-actions';

export const metadata: Metadata = { title: 'Programlar' };

/**
 * Programlar sekmesi (`docs/design/kendi-program.md` §2.1): antrenörünün programı ve danışanın kendi programları
 * (en çok 5, oluşturulma sırasıyla; seçim değişince liste zıplamaz). Kartların bütün satırları index'ten (program
 * başına okuma yok); "son: 22 Eyl" seans index'inden. "Bugün'ün programı" rozeti tek kartta. Okunamayan dosya
 * adıyla (ya da kimliğiyle) listelenir ve silinebilir. Sayfa yetkiyi kendisi denetler (`currentClient`).
 */
export default async function ProgramsPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  const overview = await readOwnOverview(client.id).catch(() => null);

  if (!overview) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title="Programlar" />
        <Alert>
          <AlertTitle>Programların şu an açılamıyor</AlertTitle>
          <AlertDescription>Biraz sonra yeniden dene.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const { state, pt, sessions } = overview;
  const active = activeProgramId(state.index);
  const last = lastDateByProgram(sessions);
  const items = state.index.items;
  const count = items.length + state.unreadable.length;
  const full = count >= OWN_PROGRAM_LIMITS.programs;
  const edited = new Map(ptEdits(state.index, new Date()).map((item) => [item.id, item.at]));

  const ptProgram = pt?.program ?? null;
  const ptPhase = ptProgram ? currentPhaseOf(ptProgram)?.phase : undefined;
  const ptNext = ptProgram && ptPhase ? ptPhase.days.find((day) => day.id === nextDayId(ptProgram)) : undefined;

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title="Programlar" />

      <section className="flex flex-col gap-2" aria-labelledby="pt-program">
        <h2 id="pt-program" className="text-sm font-medium text-muted-foreground">
          {PT_PROGRAM_NAME}
        </h2>
        {pt === null ? (
          <Card size="sm">
            <CardHeader>
              <CardDescription>Antrenörün henüz program hazırlamadı.</CardDescription>
            </CardHeader>
          </Card>
        ) : !ptProgram || !ptPhase ? (
          <Card size="sm">
            <CardHeader>
              <CardDescription>Antrenörünün programı şu an açılamıyor.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Item variant="outline" className="touch:min-h-11" render={<Link href="/me/programlar/antrenor" />}>
            <ItemContent className="min-w-0">
              <ItemTitle>{PT_PROGRAM_NAME}</ItemTitle>
              <div className="flex flex-wrap gap-1.5">
                {active === null ? <Badge>Bugün&apos;ün programı</Badge> : null}
                {ptUpdatedSince(ptProgram, state.index.active) ? <Badge variant="secondary">Güncellendi</Badge> : null}
              </div>
              <ItemDescription className="tabular-nums">
                {programLine({ days: ptPhase.days.length, weekdays: effectiveSchedule(ptProgram).weekdays, daysPerWeek: ptPhase.daysPerWeek }, last.get('pt'))}
              </ItemDescription>
              {ptNext ? <ItemDescription>Sıradaki: {ptNext.name}</ItemDescription> : null}
            </ItemContent>
            <ItemActions>
              <CaretRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="own-programs">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="own-programs" className="text-sm font-medium text-muted-foreground">
            Kendi programların
          </h2>
          {count > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {count} / {OWN_PROGRAM_LIMITS.programs}
            </span>
          ) : null}
        </div>

        {count === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Notebook weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Kendi programın yok</EmptyTitle>
              <EmptyDescription>Evde ya da tatilde çalışmak için kendi programını kur; antrenörünün programından gün kopyalayabilirsin.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button className="h-11" nativeButton={false} render={<Link href="/me/programlar/yeni" />}>
                <Plus data-icon="inline-start" />
                Yeni program
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Item variant="outline" className="touch:min-h-11" render={<Link href={`/me/programlar/${item.id}`} />}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="w-full break-words">{item.name}</ItemTitle>
                      {active === item.id || item.shared || edited.has(item.id) ? (
                        <div className="flex flex-wrap gap-1.5">
                          {active === item.id ? <Badge>Bugün&apos;ün programı</Badge> : null}
                          {item.shared ? <Badge variant="secondary">Paylaşıldı</Badge> : null}
                          <PtEditBadge clientId={client.id} programId={item.id} editedAt={edited.get(item.id)} />
                        </div>
                      ) : null}
                      <ItemDescription className="tabular-nums">{programLine(item, last.get(item.id))}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <CaretRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Item>
                </li>
              ))}
              {state.unreadable.map((item) => (
                <li key={item.id}>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="break-words">{item.name ?? 'Adı okunamayan program'}</CardTitle>
                      <CardDescription>Bu program şu an açılamıyor. Silebilir ya da antrenörüne haber verebilirsin.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <DeleteOwnProgram clientId={client.id} programId={item.id} name={item.name ?? 'Bu program'} active={active === item.id} shared={false} />
                    </CardFooter>
                  </Card>
                </li>
              ))}
            </ul>
            {full ? (
              <div className="flex flex-col gap-1">
                <Button variant="outline" className="h-11 w-full border-dashed" disabled>
                  <Plus data-icon="inline-start" />
                  Yeni program
                </Button>
                <p className="text-sm text-muted-foreground">En fazla {OWN_PROGRAM_LIMITS.programs} program; yenisi için birini sil.</p>
              </div>
            ) : (
              <Button variant="outline" className="h-11 w-full border-dashed" nativeButton={false} render={<Link href="/me/programlar/yeni" />}>
                <Plus data-icon="inline-start" />
                Yeni program
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
