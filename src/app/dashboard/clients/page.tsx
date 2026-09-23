import Link from 'next/link';
import { Plus, UserCircle, UsersThree, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { listClients, readInvite } from '@/lib/clients';
import { healthConsentState } from '@/lib/client-status';
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES } from '@/lib/schemas/client';
import { AccessBadge, accessOf } from './invite-state';
import { HEALTH_STATE_LABELS } from './health-state';
import { requirePt } from '@/lib/guards';
import { templateChoices } from '@/lib/templates';

/**
 * Danışanlar: uygulama repo'sundaki kimlik listesi + her danışanın kendi repo'sundaki
 * kaydı. Durumuna göre gruplu; arşivdekiler en altta.
 */
export default async function ClientsPage() {
  await requirePt();
  const [clients, templates] = await Promise.all([listClients(), templateChoices().catch(() => [])]);
  const templateNames = new Map(templates.map((template) => [template.id, template.name]));
  const invites = new Map(
    await Promise.all(
      clients.map(async (entry) => [entry.id, await readInvite(entry.id).catch(() => null)] as const),
    ),
  );
  const now = new Date();
  const active = clients.filter((entry) => entry.status === 'active').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Danışanlar"
        description={
          <>
            <span className="tabular-nums">{clients.length}</span> danışan · <span className="tabular-nums">{active}</span>{' '}
            aktif. Her danışanın verisi kendi özel repo'sunda.
          </>
        }
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/clients/new" />}>
            <Plus data-icon="inline-start" weight="fill" />
            Yeni danışan
          </Button>
        }
      />

      {clients.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersThree weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Henüz danışan yok</EmptyTitle>
              <EmptyDescription>
                Danışan eklediğinde hesabında ona özel, gizli bir repo açılır; sonra kare kodla davet edersin.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/dashboard/clients/new" />}>
                <Plus data-icon="inline-start" weight="fill" />
                İlk danışanı ekle
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : null}

      {CLIENT_STATUSES.map((status) => {
        const group = clients.filter((entry) => entry.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} className="flex flex-col gap-3" aria-label={CLIENT_STATUS_LABELS[status]}>
            <h2 className="text-sm font-medium text-muted-foreground">{CLIENT_STATUS_LABELS[status]}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((entry) => {
                const invite = invites.get(entry.id)?.invite ?? null;
                const health = entry.ok ? healthConsentState(entry.client) : null;
                return (
                  <li key={entry.id}>
                    <Link
                      href={`/dashboard/clients/${entry.id}`}
                      className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            {entry.ok ? (
                              <UserCircle className="size-5 shrink-0 text-muted-foreground" weight="fill" />
                            ) : (
                              <WarningCircle className="size-5 shrink-0 text-destructive" weight="fill" />
                            )}
                            <span className="truncate">{entry.ok ? entry.client.name : entry.id}</span>
                          </CardTitle>
                          <CardDescription>
                            {entry.ok ? (entry.client.note ?? 'Not yok') : entry.problem}
                          </CardDescription>
                          {entry.ok && health && health !== 'off' ? (
                            <CardAction>
                              <Badge variant="secondary">{HEALTH_STATE_LABELS[health]}</Badge>
                            </CardAction>
                          ) : null}
                        </CardHeader>
                        <CardFooter className="flex flex-wrap gap-2">
                          {entry.ok ? <AccessBadge state={accessOf(entry.client, invite, now)} /> : null}
                          {entry.ok && entry.client.program ? (
                            <Badge variant="outline">
                              {templateNames.get(entry.client.program.templateId) ?? 'Silinmiş şablon'}
                            </Badge>
                          ) : null}
                        </CardFooter>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
