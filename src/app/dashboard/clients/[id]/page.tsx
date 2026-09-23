import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowSquareOut, Barbell, QrCode } from '@phosphor-icons/react/dist/ssr';
import { EditButton } from '@/components/edit-button';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { loadClient, readInvite } from '@/lib/clients';
import { healthConsentState, inviteStatus } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { serverEnv } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { clientRepoName } from '@/lib/github/client';
import { CLIENT_ID_PATTERN, CLIENT_STATUS_LABELS, HEALTH_FIELD_INFO } from '@/lib/schemas/client';
import { HEALTH_STATE_DETAILS, HEALTH_STATE_LABELS } from '../health-state';
import { InviteBadge, inviteDetail } from '../invite-state';
import { requirePt } from '@/lib/guards';

/** Danışan detayı — yalnız gösterir; değiştirmek için "Düzenle" (SPEC §6). */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const [loaded, config] = await Promise.all([loadClient(id), readAppConfig()]);
  if (!loaded) notFound();

  // Listede var ama kaydı okunamıyor (repo dışarıdan silinmiş ya da kayıt bozuk).
  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: id }]}
          title={id}
          description="Kayıt okunamadı"
          actions={<EditButton href={`/dashboard/clients/${id}/edit`} />}
        />
        <Card>
          <CardHeader>
            <CardTitle>Kayıt okunamadı</CardTitle>
            <CardDescription>{loaded.problem} Kimliği listeden çıkarmak için düzenleme sayfasından sil.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { client } = loaded;
  const invite = await readInvite(id);
  const repo = clientRepoName(id);
  const status = inviteStatus(invite?.invite ?? null, new Date());
  const health = healthConsentState(client);
  const consent = client.consents.health;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: client.name }]}
        title={client.name}
        description={`${CLIENT_STATUS_LABELS[client.status]} · ${formatDate(client.createdAt, config.timeZone)} tarihinde eklendi`}
        actions={<EditButton href={`/dashboard/clients/${id}/edit`} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
            <CardDescription>Danışanın kaydı kendi özel repo'sunda durur.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">Durum</TableCell>
                  <TableCell>
                    <Badge variant={client.status === 'active' ? 'secondary' : 'outline'}>
                      {CLIENT_STATUS_LABELS[client.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Eklendi</TableCell>
                  <TableCell>{formatDate(client.createdAt, config.timeZone)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Repo</TableCell>
                  <TableCell className="font-mono text-xs">{repo}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="align-top text-muted-foreground">Not</TableCell>
                  <TableCell className="whitespace-pre-wrap">{client.note ?? '—'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<a href={`https://github.com/${serverEnv().owner}/${repo}`} target="_blank" rel="noreferrer" />}>
              <ArrowSquareOut data-icon="inline-start" weight="fill" />
              Repo'yu GitHub'da aç
            </Button>
          </CardFooter>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Giriş</CardTitle>
              <CardDescription>{inviteDetail(status, invite?.invite ?? null, config.timeZone)}</CardDescription>
              <div>
                <InviteBadge status={status} />
              </div>
            </CardHeader>
            {client.status !== 'archived' ? (
              <CardFooter>
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${id}/invite`} />}>
                  <QrCode data-icon="inline-start" weight="fill" />
                  {status === 'none' ? 'Davet et' : 'Davet ekranı'}
                </Button>
              </CardFooter>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sağlık modülü</CardTitle>
              <CardDescription>{HEALTH_STATE_DETAILS[health]}</CardDescription>
              <div>
                <Badge variant={health === 'granted' ? 'secondary' : 'outline'}>{HEALTH_STATE_LABELS[health]}</Badge>
              </div>
            </CardHeader>
            {client.modules.health.enabled ? (
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {client.modules.health.fields.map((field) => (
                    <li key={field} className="flex items-baseline justify-between gap-3">
                      <span>{HEALTH_FIELD_INFO[field].label}</span>
                      <span className="text-xs text-muted-foreground">
                        {consent?.granted && consent.fields.includes(field) ? 'onaylı' : 'onay yok'}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Antrenmanlar</CardTitle>
          <CardDescription>Danışanın tamamladığı seanslar, en yenisi üstte.</CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Barbell weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Henüz antrenman yok</EmptyTitle>
              <EmptyDescription>Antrenman ekranı gelince her set canlı olarak buraya yazılır.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  );
}
