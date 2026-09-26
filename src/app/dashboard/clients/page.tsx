import type { Metadata } from 'next';
import Link from 'next/link';
import { CaretRight, Plus, UserCircle, UsersThree, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { listClients, readInvite } from '@/lib/clients';
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES } from '@/lib/schemas/client';
import { requirePt } from '@/lib/guards';
import { clientsSummary, clientWork, type HealthWork } from './client-work';
import { AccessBadge, passwordOf } from './invite-state';
import { StatusDot } from './status-dot';

export const metadata: Metadata = { title: 'Danışanlar' };

const HEALTH_VARIANT: Record<HealthWork['tone'], 'outline' | 'secondary'> = { waiting: 'outline', info: 'secondary' };

/**
 * Danışanlar: durumuna göre gruplu (arşivdekiler en altta). Her satır detaya tek dokunuşla açılır ve
 * PT'nin işini gösterir: giriş durumu (davet yok / bekliyor / süresi doldu; katıldıysa şifre
 * belirledi mi) ve sağlık onayı bekliyorsa o (`clientWork`). Başlıkta bekleyenlerin sayısı.
 */
export default async function ClientsPage() {
  await requirePt();
  const clients = await listClients();
  const invites = new Map(
    await Promise.all(
      clients.map(async (entry) => [entry.id, await readInvite(entry.id).catch(() => null)] as const),
    ),
  );
  const now = new Date();
  const rows = clients.map((entry) => ({
    entry,
    work: entry.ok ? clientWork(entry.client, invites.get(entry.id)?.invite ?? null, now) : null,
  }));
  const summary = clientsSummary(rows.map(({ entry, work }) => ({ status: entry.status, work })));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Danışanlar"
        description={<span className="tabular-nums">{summary}.</span>}
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
                Danışanı ekle, sonra kare kodla davet et; programını ve ölçümlerini buradan yönetirsin.
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
        const group = rows.filter(({ entry }) => entry.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} className="flex flex-col gap-3" aria-label={CLIENT_STATUS_LABELS[status]}>
            <h2 className="text-sm font-medium text-muted-foreground">{CLIENT_STATUS_LABELS[status]}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map(({ entry, work }) => (
                <li key={entry.id}>
                  <Link
                    href={`/dashboard/clients/${entry.id}`}
                    className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Card size="sm" className="h-full min-h-11 transition-colors hover:bg-muted/40">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          {entry.ok ? (
                            <UserCircle className="size-5 shrink-0 text-muted-foreground" weight="fill" />
                          ) : (
                            <WarningCircle className="size-5 shrink-0 text-destructive" weight="fill" />
                          )}
                          <span className="truncate">{entry.ok ? entry.client.name : entry.id}</span>
                          <StatusDot status={entry.status} />
                        </CardTitle>
                        {!entry.ok ? (
                          <CardDescription>{entry.problem}</CardDescription>
                        ) : entry.client.note ? (
                          <CardDescription className="line-clamp-2">{entry.client.note}</CardDescription>
                        ) : null}
                        <CardAction>
                          <CaretRight aria-hidden className="size-4 text-muted-foreground" />
                        </CardAction>
                      </CardHeader>
                      {entry.ok && work ? (
                        <CardFooter className="flex flex-wrap gap-1.5">
                          <AccessBadge state={work.access} password={passwordOf(entry.client)} />
                          {work.healthWork ? (
                            <Badge variant={HEALTH_VARIANT[work.healthWork.tone]}>{work.healthWork.label}</Badge>
                          ) : null}
                        </CardFooter>
                      ) : null}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
