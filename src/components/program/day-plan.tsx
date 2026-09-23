import { Badge } from '@/components/ui/badge';
import {
  BLOCK_KIND_LABELS,
  describeBlock,
  formatRest,
  formatTarget,
  rowLabels,
  type PlanExercise,
  type TemplateBlock,
} from '@/lib/template-plan';
import { cn } from '@/lib/utils';

/**
 * Bir antrenman gününün (ya da şablonun) yapılış sırası: gruplar rozet ve anlatımla,
 * satırda etiket, hareket, "set × hedef" (tek harekette dinlenmeyle) ve not. Kancasız:
 * sunucu bileşenlerinde de çalışır.
 *
 * Kütüphanede olmayan egzersiz: `missing="show"` (PT) "Silinmiş egzersiz" olarak
 * kimliğiyle görünür; `missing="hide"` (danışan) satır hiç çizilmez.
 */
export function DayPlan({
  blocks,
  exercises,
  missing,
  className,
}: {
  blocks: readonly TemplateBlock[];
  exercises: ReadonlyMap<string, Pick<PlanExercise, 'title' | 'trackingType'>>;
  missing: 'show' | 'hide';
  className?: string;
}) {
  const labels = rowLabels({ blocks });
  return (
    <ol className={cn('flex flex-col gap-3', className)}>
      {blocks.map((block) => {
        const rows = missing === 'hide' ? block.rows.filter((row) => exercises.has(row.exerciseId)) : block.rows;
        if (rows.length === 0) return null;
        return (
          <li key={block.id} className={block.kind === 'single' ? '' : 'flex flex-col gap-2 rounded-lg border p-3'}>
            {block.kind !== 'single' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{BLOCK_KIND_LABELS[block.kind]}</Badge>
                <span className="text-xs text-muted-foreground">{describeBlock(block)}</span>
              </div>
            ) : null}
            {rows.map((row) => {
              const exercise = exercises.get(row.exerciseId);
              const target = formatTarget(row.target, exercise?.trackingType ?? 'weight_reps');
              const work =
                block.kind === 'single'
                  ? `${block.sets} × ${target}${block.restSeconds > 0 ? ` · ${formatRest(block.restSeconds)} dinlenme` : ''}`
                  : target;
              return (
                <div key={row.id} className="flex items-baseline gap-3">
                  <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{labels.get(row.id)}</span>
                  <div className="flex min-w-0 flex-col">
                    {exercise ? (
                      <span className="font-medium">{exercise.title}</span>
                    ) : (
                      <span className="font-medium text-destructive">
                        Silinmiş egzersiz <span className="font-mono text-xs font-normal text-muted-foreground">{row.exerciseId}</span>
                      </span>
                    )}
                    <span className="text-sm tabular-nums text-muted-foreground">{work}</span>
                    {row.note ? <span className="text-xs italic text-muted-foreground">{row.note}</span> : null}
                  </div>
                </div>
              );
            })}
          </li>
        );
      })}
    </ol>
  );
}
