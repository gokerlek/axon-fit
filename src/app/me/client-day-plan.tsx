import { Badge } from '@/components/ui/badge';
import { clientSetText } from '@/lib/client-set-text';
import { BLOCK_KIND_LABELS, describeBlock, groupSkipNote, roundsOf, rowLabels, type PlanExercise, type TemplateBlock } from '@/lib/template-plan';

/**
 * Danışanın günü (`/me`, yalnız telefon): hareketler yapılış sırasıyla, setler cümleyle
 * (`clientSetText`: "3 set: 12, 10 tekrar ve son sette yapabildiğin kadar (en az 8) · ağırlık her
 * sette artar · 1 dk 30 sn dinlenme"). Gruplar rozet ve tur anlatımıyla. Kütüphanede olmayan
 * egzersizin satırı hiç çizilmez. PT'nin görünümü `components/program/day-plan.tsx`.
 */
export function ClientDayPlan({
  blocks,
  exercises,
}: {
  blocks: readonly TemplateBlock[];
  exercises: ReadonlyMap<string, Pick<PlanExercise, 'title' | 'trackingType'>>;
}) {
  const labels = rowLabels({ blocks });
  return (
    <ol className="flex flex-col gap-4">
      {blocks.map((block) => {
        const rows = block.rows.filter((row) => exercises.has(row.exerciseId));
        if (rows.length === 0) return null;
        const single = block.kind === 'single';
        const skip = single ? null : groupSkipNote({ ...block, rows }, (row) => exercises.get(row.exerciseId)?.title ?? '');
        return (
          <li key={block.id} className={single ? '' : 'flex flex-col gap-3 rounded-lg border p-3'}>
            {single ? null : (
              <div className="flex flex-col gap-1">
                <Badge variant="secondary">{BLOCK_KIND_LABELS[block.kind]}</Badge>
                <span className="text-sm text-muted-foreground">{describeBlock({ ...block, sets: roundsOf({ rows }) })}</span>
                {skip ? <span className="text-sm text-muted-foreground">{skip}</span> : null}
              </div>
            )}
            {rows.map((row) => {
              const exercise = exercises.get(row.exerciseId);
              if (!exercise) return null;
              return (
                <div key={row.id} className="flex items-baseline gap-3">
                  <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{labels.get(row.id)}</span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{exercise.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {clientSetText(row.sets, exercise.trackingType, single ? block.restSeconds : undefined)}
                    </span>
                    {row.note ? <span className="text-sm italic text-muted-foreground">{row.note}</span> : null}
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
