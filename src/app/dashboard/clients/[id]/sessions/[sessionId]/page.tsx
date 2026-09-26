import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Barbell, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { SectionHeader } from '@/components/section-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { loadClient } from '@/lib/clients';
import { canRecordHealth } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { formatNumber } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { readHealth } from '@/lib/health';
import { loadDetail } from '@/lib/history-store';
import { readLiveResponse } from '@/lib/live-store';
import { painSkippedRows, ptChangeLines, ptSessionDetail, type PtDetailExercise } from '@/lib/pt-sessions';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import type { Program } from '@/lib/schemas/program';
import { cn } from '@/lib/utils';
import { LiveSession } from '../../live-session';

export const metadata: Metadata = { title: 'Antrenman' };

/** Programdaki satırın hareketinin kütüphanedeki adı (muadilin yerini aldığı hareket). */
function rowTitleOf(program: Program | null, titles: ReadonlyMap<string, string>) {
  const rows = new Map(
    (program?.phases ?? []).flatMap((phase) => phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => [row.id, row.exerciseId] as const)))),
  );
  return (rowId: string) => {
    const exerciseId = rows.get(rowId);
    return exerciseId ? (titles.get(exerciseId) ?? null) : null;
  };
}

/**
 * Danışanın bir antrenmanı (SPEC §6, tasarım §8 satır 12) — yalnız okuma. Hareketler yapılış sırasıyla: setler
 * zorluklarıyla, ısınma ayrı satırda, plandan fazla ve aşırı yük setleri işaretli; geçilen hareketin nedeni,
 * muadil (hangi hareketin yerine), plan dışı eklenen, o günkü plan, ayar notu; bu antrenmanın program
 * değişiklikleri (programa yazılan, onay bekleyen, karara bağlanan). Ağrı ayrıntısı yalnız danışanın onayı
 * sürdükçe (`health.json`). Sürüyorsa canlı satır; silinmişse yalnız bunu söyler.
 */
export default async function SessionDetailPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  await requirePt();
  const { id, sessionId } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  const { client } = loaded;
  const back = { href: `/dashboard/clients/${id}/sessions`, label: 'Antrenmanlar' };

  const [config, detail] = await Promise.all([readAppConfig(), loadDetail(id, sessionId).catch(() => null)]);

  if (detail === null) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Antrenman" back={back} />
        <Card>
          <CardHeader>
            <CardTitle>Antrenman şu an açılamıyor</CardTitle>
            <CardDescription>Danışanın kayıt deposuna ulaşılamadı. Biraz sonra sayfayı yenile.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (detail.status === 'active') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Antrenman sürüyor" description="Bitince setleri ve program değişiklikleri burada görünür." back={back} />
        <LiveSession clientId={id} initial={await readLiveResponse(id)} />
      </div>
    );
  }

  if (detail.status !== 'ok') {
    const deleted = detail.status === 'deleted';
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Antrenman" back={back} />
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClockCounterClockwise weight="fill" />
                </EmptyMedia>
                <EmptyTitle>{deleted ? 'Bu antrenman silinmiş' : 'Antrenman bulunamadı'}</EmptyTitle>
                <EmptyDescription>
                  {deleted
                    ? 'Danışan bu kaydı sildi: uygulamada görünmez, veri deposunun geçmişinde kalır.'
                    : 'Adres yanlış olabilir ya da antrenman silinmiş olabilir.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { doc, changes, program } = detail.value;
  const [exercises, health] = await Promise.all([
    listExercises(),
    // Ağrı ayrıntısı yalnız onay sürdükçe; okunamazsa yazılmaz.
    canRecordHealth(client, 'check_in') ? readHealth(id).catch(() => null) : Promise.resolve(null),
  ]);
  const titles = new Map(exercises.map((exercise) => [exercise.id, exercise.title]));
  const view = ptSessionDetail(doc, {
    timeZone: config.timeZone,
    rowTitle: rowTitleOf(program, titles),
    painRows: health ? painSkippedRows(health.record.checkIns, doc.id) : new Set(),
  });
  const lines = ptChangeLines(changes);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={view.title}
        description={
          <span className="tabular-nums">
            {view.meta} · {formatNumber(view.water)} bardak su
          </span>
        }
        back={back}
      />

      {view.flags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Antrenmanın işaretleri">
          {view.flags.map((flag) => (
            <li key={flag}>
              <Badge variant="outline">{flag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {view.exercises.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Barbell weight="fill" />
                </EmptyMedia>
                <EmptyTitle>Kayıtlı set yok</EmptyTitle>
                <EmptyDescription>Bu antrenmanın setleri silinmiş.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 lg:items-start" aria-label="Hareketler">
          {view.exercises.map((exercise) => (
            <li key={exercise.entryId}>
              <ExerciseCard exercise={exercise} />
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Program değişiklikleri</CardTitle>
            <CardDescription>Bu antrenmanın bitişinde: danışanın programa yazdıkları ve onaya gönderdikleri.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {lines.map((line, position) => (
                <li key={`${line.text}-${position}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0">
                    {line.text}
                    {line.note ? <span className="text-muted-foreground"> · “{line.note}”</span> : null}
                  </span>
                  <Badge variant="secondary">{line.label}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ExerciseCard({ exercise }: { exercise: PtDetailExercise }) {
  const description = [exercise.note, ...exercise.notes].join(' · ');
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{exercise.title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {exercise.setupNote ? <CardDescription>Ayar notu: {exercise.setupNote}</CardDescription> : null}
      </CardHeader>
      {exercise.sets.length > 0 ? (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Set</TableHead>
                <TableHead>Yapılan</TableHead>
                <TableHead className="text-right">Zorluk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exercise.sets.map((set) => (
                <TableRow key={set.id} className={cn(set.warmup && 'text-muted-foreground')}>
                  <TableCell>{set.label}</TableCell>
                  <TableCell className="tabular-nums">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {set.text}
                      {set.extra ? <Badge variant="outline">fazladan</Badge> : null}
                      {set.overload ? <Badge variant="destructive">aşırı yük</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{set.effort ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      ) : null}
    </Card>
  );
}
