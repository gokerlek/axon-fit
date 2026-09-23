import { Barbell, Play } from '@phosphor-icons/react/dist/ssr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { listExercises } from '@/lib/exercises';
import type { Client } from '@/lib/schemas/client';
import { BLOCK_KIND_LABELS, describeBlock, formatRest, formatTarget, rowLabels, templateSummary } from '@/lib/template-plan';
import { readTemplateFile } from '@/lib/templates';

/**
 * Danışanın bugünkü antrenmanı: PT'nin atadığı şablon, yapılış sırasıyla. Antrenman
 * ekranı (set kaydı) Faz 4'ün sonraki adımında; şimdilik plan gösterilir.
 */
export async function ProgramCard({ program }: { program: Client['program'] }) {
  if (!program) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bugünün antrenmanı</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Barbell weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Henüz program yok</EmptyTitle>
              <EmptyDescription>Antrenörün program atadığında bugünün antrenmanı burada görünecek.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const [file, exercises] = await Promise.all([readTemplateFile(program.templateId).catch(() => null), listExercises()]);
  if (!file?.template) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bugünün antrenmanı</CardTitle>
          <CardDescription>Programın şu an açılamıyor. Antrenörüne haber ver.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const template = file.template;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const summary = templateSummary(template, byId);
  const labels = rowLabels(template);

  return (
    <Card>
      <CardHeader>
        <CardDescription>Bugünün antrenmanı</CardDescription>
        <CardTitle className="text-xl">{template.name}</CardTitle>
        <CardDescription>
          <span className="tabular-nums">{summary.rows}</span> hareket · <span className="tabular-nums">{summary.workingSets}</span>{' '}
          set · ≈ <span className="tabular-nums">{summary.minutes}</span> dk
          {template.description ? <span className="mt-1 block">{template.description}</span> : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {template.blocks.map((block) => (
            <li key={block.id} className={block.kind === 'single' ? '' : 'flex flex-col gap-2 rounded-lg border p-3'}>
              {block.kind !== 'single' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{BLOCK_KIND_LABELS[block.kind]}</Badge>
                  <span className="text-xs text-muted-foreground">{describeBlock(block)}</span>
                </div>
              ) : null}
              {block.rows.map((row) => {
                const exercise = byId.get(row.exerciseId);
                if (!exercise) return null;
                const target = formatTarget(row.target, exercise.trackingType);
                const work =
                  block.kind === 'single'
                    ? `${block.sets} × ${target}${block.restSeconds > 0 ? ` · ${formatRest(block.restSeconds)} dinlenme` : ''}`
                    : target;
                return (
                  <div key={row.id} className="flex items-baseline gap-3">
                    <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{labels.get(row.id)}</span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium">{exercise.title}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">{work}</span>
                      {row.note ? <span className="text-xs italic text-muted-foreground">{row.note}</span> : null}
                    </div>
                  </div>
                );
              })}
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        <Button size="lg" className="h-12 w-full" disabled>
          <Play data-icon="inline-start" weight="fill" />
          Antrenmana başla
        </Button>
        <p className="text-center text-xs text-muted-foreground">Set kaydı yakında burada.</p>
      </CardFooter>
    </Card>
  );
}
