import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardText, Plus } from '@phosphor-icons/react/dist/ssr';
import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { listExercises } from '@/lib/exercises';
import { formatNumber } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { BODY_MUSCLES, exerciseSetWeights, summarizeMuscles } from '@/lib/muscles';
import { templateMuscleLoad, templateSummary } from '@/lib/template-plan';
import { listTemplates } from '@/lib/templates';
import { TrainingTabs } from '../training-tabs';

export const metadata: Metadata = { title: 'Şablonlar' };

/**
 * Şablonlar: danışana program kurarken başlangıç olan antrenmanlar (programa kopyalanır). Kartta şablonun kas haritası, adı ve
 * özeti; ayrıntı ve düzenleme kendi sayfalarında (SPEC §6).
 */
export default async function TemplatesPage() {
  await requirePt();
  const [templates, exercises] = await Promise.all([listTemplates(), listExercises()]);
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  return (
    <div className="flex flex-col gap-6">
      <TrainingTabs />
      <PageHeader
        title="Şablonlar"
        description={
          <>
            <span className="tabular-nums">{templates.length}</span> şablon
          </>
        }
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/templates/new" />}>
            <Plus data-icon="inline-start" weight="fill" />
            Yeni şablon
          </Button>
        }
      />

      {templates.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardText weight="fill" />
            </EmptyMedia>
            <EmptyTitle>Henüz şablon yok</EmptyTitle>
            <EmptyDescription>
              Şablon bir antrenmanın sırasıdır: hareketler, setler, hedefler ve dinlenme. Danışana program kurarken
              kopyalanır; şablonu sonradan değiştirmek programları değiştirmez.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/dashboard/templates/new" />}>
              <Plus data-icon="inline-start" weight="fill" />
              İlk şablonu oluştur
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((file) => {
            if (!file.template) {
              return (
                <li key={file.id}>
                  <Link
                    href={`/dashboard/templates/${file.id}/edit`}
                    className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Card size="sm" className="h-full bg-destructive/5 ring-destructive/40 transition-colors hover:bg-destructive/10">
                      <CardHeader>
                        <CardTitle>{file.name ?? file.id}</CardTitle>
                        <CardDescription className="break-words">Dosya okunamadı: {file.problem}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              );
            }

            const template = file.template;
            const { load, missingRowIds } = templateMuscleLoad(template, byId, exerciseSetWeights);
            const summary = templateSummary(template, byId);
            const top = BODY_MUSCLES.filter((muscle) => (load[muscle] ?? 0) > 0)
              .sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0))
              .slice(0, 3);
            return (
              <li key={template.id}>
                {/* Uzatılmış bağlantı: başlıktaki bağlantı kartın tamamını kaplar (after:inset-0). */}
                <Card size="sm" className="relative h-full transition-colors hover:bg-muted/40">
                  <div className="mx-(--card-spacing) rounded-lg bg-muted/40 py-3">
                    <TemplateMuscleMap variant="compact" bodyClassName="h-80" load={load} />
                  </div>
                  <CardHeader>
                    <CardTitle>
                      <Link
                        href={`/dashboard/templates/${template.id}`}
                        className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
                        {template.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {template.description || summarizeMuscles(top).join(', ') || 'Sayılan kas yükü yok'}
                    </CardDescription>
                    {missingRowIds.length > 0 || template.sharedWithClients ? (
                      <CardAction className="flex flex-col items-end gap-1">
                        {missingRowIds.length > 0 ? <Badge variant="destructive">eksik hareket</Badge> : null}
                        {/* Danışanlar kendi programlarına kopyalayabilir (kendi-program.md §3.8). */}
                        {template.sharedWithClients ? <Badge variant="secondary">Danışanlara açık</Badge> : null}
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardFooter className="mt-auto text-xs text-muted-foreground tabular-nums">
                    {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
