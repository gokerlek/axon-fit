import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowSquareOut, Barbell, ListChecks, Plus, QrCode } from '@phosphor-icons/react/dist/ssr';
import { EditButton } from '@/components/edit-button';
import { SectionHeader } from '@/components/section-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { loadClient, readInvite } from '@/lib/clients';
import { healthConsentState } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { serverEnv } from '@/lib/env';
import { listExercises, type ExerciseWithSource } from '@/lib/exercises';
import { formatDate, formatNumber } from '@/lib/format';
import { clientRepoName } from '@/lib/github/client';
import { currentPhaseOf, nextDayId, phaseStatus, phaseStatusLabel } from '@/lib/program-plan';
import { readProgramFile, type ProgramFile } from '@/lib/programs';
import { CLIENT_ID_PATTERN, CLIENT_STATUS_LABELS, HEALTH_FIELD_INFO } from '@/lib/schemas/client';
import { templateSummary } from '@/lib/template-plan';
import { HEALTH_STATE_DETAILS, HEALTH_STATE_LABELS } from '../health-state';
import { AccessBadge, accessDetail, accessOf } from '../invite-state';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { MeasurementsCard } from './measurements-card';

/**
 * Programın özeti: şu anki evre, günleri (sıradaki işaretli), son değişiklik. Program
 * yoksa "Program oluştur"; okunamıyorsa sorunu. `undefined`: GitHub'dan okunamadı.
 */
function ProgramCard({
  clientId,
  file,
  exercises,
  timeZone,
}: {
  clientId: string;
  file: ProgramFile | null | undefined;
  exercises: ReadonlyMap<string, ExerciseWithSource>;
  timeZone: string;
}) {
  const href = `/dashboard/clients/${clientId}/program`;
  const openButton = (
    <CardFooter>
      <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
        <ListChecks data-icon="inline-start" weight="fill" />
        Programı aç
      </Button>
    </CardFooter>
  );

  if (file === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Program</CardTitle>
          <CardDescription>Program şu an okunamadı. Sayfayı yenile.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (file === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Program</CardTitle>
          <CardDescription>
            Henüz program yok. Bir şablondan başlayıp bu danışana göre düzenleyebilir ya da boş başlayabilirsin.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button nativeButton={false} render={<Link href={`${href}/new`} />}>
            <Plus data-icon="inline-start" weight="fill" />
            Program oluştur
          </Button>
        </CardFooter>
      </Card>
    );
  }
  if (!file.program) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Program</CardTitle>
          <CardDescription className="text-destructive">program.json okunamadı: {file.problem}</CardDescription>
        </CardHeader>
        {openButton}
      </Card>
    );
  }

  const program = file.program;
  const current = currentPhaseOf(program);
  const status = phaseStatus(program, new Date());
  const next = nextDayId(program);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Program</CardTitle>
        <CardDescription>
          {current?.phase.name} · {phaseStatusLabel(status)}
        </CardDescription>
        {status.kind === 'due' ? (
          <CardAction>
            <Badge variant="outline">Evre süresi doldu</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Şu anki evrenin günleri">
          {current?.phase.days.map((day) => {
            const summary = templateSummary({ blocks: day.blocks }, exercises);
            const isNext = day.id === next;
            return (
              <li key={day.id}>
                <Item variant="outline" size="sm" className={isNext ? 'bg-primary/5 ring-2 ring-primary/50' : undefined}>
                  <ItemContent>
                    <ItemTitle>{day.name}</ItemTitle>
                    <ItemDescription className="tabular-nums">
                      {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈{' '}
                      {formatNumber(summary.minutes)} dk
                    </ItemDescription>
                  </ItemContent>
                  {isNext ? (
                    <ItemActions>
                      <Badge>Sıradaki</Badge>
                    </ItemActions>
                  ) : null}
                </Item>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">Son değişiklik: {formatDate(program.updatedAt, timeZone)}</p>
      </CardContent>
      {openButton}
    </Card>
  );
}

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
        <SectionHeader
          title="Genel"
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
  const [invite, programFile, exercises, measurements] = await Promise.all([
    readInvite(id),
    // undefined: GitHub'dan okunamadı; sayfa yine açılır.
    readProgramFile(id).catch(() => undefined),
    listExercises(),
    loadMeasurements(client).catch(() => undefined),
  ]);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const repo = clientRepoName(id);
  const access = accessOf(client, invite?.invite ?? null);
  const health = healthConsentState(client);
  const consent = client.consents.health;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Genel"
        description="Profil, giriş, sağlık modülü ve özetler. Ayrıntılar kendi sekmelerinde."
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
              <CardDescription>{accessDetail(client, invite?.invite ?? null, config.timeZone)}</CardDescription>
              <div>
                <AccessBadge state={access} />
              </div>
            </CardHeader>
            {client.status !== 'archived' ? (
              <CardFooter>
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${id}/invite`} />}>
                  <QrCode data-icon="inline-start" weight="fill" />
                  {access === 'joined' ? 'Yeni cihaz için kod' : access === 'none' ? 'Davet et' : 'Davet ekranı'}
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

          <MeasurementsCard clientId={id} view={measurements} />
        </div>
      </div>

      <ProgramCard clientId={id} file={programFile} exercises={exerciseById} timeZone={config.timeZone} />

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
