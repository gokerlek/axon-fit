import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import type { DeviceWithSource } from '@/lib/devices';
import type { ExerciseWithSource } from '@/lib/exercises';
import { PROGRESSION_LABELS, RIR_LABELS } from '@/lib/progression';
import { EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import type { Template } from '@/lib/schemas/template';
import { formatSets } from '@/lib/set-plan';
import {
  BLOCK_KIND_LABELS,
  describeBlock,
  formatRest,
  groupSkipNote,
  roundsOf,
  rowLabels,
  type TemplateBlock,
  type TemplateRow,
} from '@/lib/template-plan';

type Lookups = {
  exercises: ReadonlyMap<string, ExerciseWithSource>;
  devices: ReadonlyMap<string, DeviceWithSource>;
};

/**
 * Şablonun hareketleri, antrenmanın yapılış sırasıyla (detay sayfası, yalnız gösterim).
 * Her blok ızgarada bir hücre; grup tek hücrede, satırları "2a", "2b" diye.
 */
export function TemplateSequence({ template, exercises, devices }: { template: Template } & Lookups) {
  const labels = rowLabels(template);
  const titleOf = (row: TemplateRow) => exercises.get(row.exerciseId)?.title ?? 'Silinmiş egzersiz';
  return (
    <ol className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {template.blocks.map((block, index) => (
        <li key={block.id}>
          {block.kind === 'single' ? (
            block.rows.map((row) => (
              <RowItem key={row.id} row={row} block={block} label={labels.get(row.id) ?? String(index + 1)} exercises={exercises} devices={devices} />
            ))
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-col gap-1">
                <Badge variant="secondary">
                  {index + 1} · {BLOCK_KIND_LABELS[block.kind]}
                </Badge>
                <p className="text-xs text-muted-foreground">{describeBlock({ ...block, sets: roundsOf(block) })}</p>
                {groupSkipNote(block, titleOf) ? <p className="text-xs text-muted-foreground">{groupSkipNote(block, titleOf)}</p> : null}
              </div>
              {block.rows.map((row) => (
                <RowItem key={row.id} row={row} block={block} label={labels.get(row.id) ?? ''} exercises={exercises} devices={devices} />
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function RowItem({ row, block, label, exercises, devices }: { row: TemplateRow; block: TemplateBlock; label: string } & Lookups) {
  const exercise = exercises.get(row.exerciseId);
  const media = (
    <ItemMedia className="w-7 justify-center self-start font-medium tabular-nums text-muted-foreground">{label}</ItemMedia>
  );

  if (!exercise) {
    return (
      <Item variant="outline" size="sm" className="border-destructive/50 bg-destructive/5">
        {media}
        <ItemContent className="min-w-0">
          <ItemTitle className="text-destructive">Silinmiş egzersiz</ItemTitle>
          <span className="truncate font-mono text-xs text-muted-foreground">{row.exerciseId}</span>
          <span className="text-xs text-muted-foreground">Kütüphanede yok; şablonu düzenleyip değiştir.</span>
        </ItemContent>
      </Item>
    );
  }

  const sets = formatSets(row.sets, exercise.trackingType);
  const work =
    block.kind === 'single'
      ? `${sets} · ${block.restSeconds > 0 ? `${formatRest(block.restSeconds)} dinlenme` : 'setler arası dinlenme yok'}`
      : sets;
  const overridden = row.deviceId ? devices.get(row.deviceId) : undefined;
  const own = exercise.deviceId ? devices.get(exercise.deviceId) : undefined;

  return (
    <Item variant="outline" size="sm">
      {media}
      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="w-full">
          <Link href={`/dashboard/exercises/${exercise.id}`} className="truncate underline-offset-4 hover:underline">
            {exercise.title}
          </Link>
        </ItemTitle>
        <span className="text-sm tabular-nums">{work}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {row.deviceId ? (
            overridden ? (
              <>
                {overridden.name}
                <Badge variant="outline">şablonda değişti</Badge>
              </>
            ) : (
              <span className="italic">Silinmiş cihaz; egzersizin cihazı kullanılır{own ? ` (${own.name})` : ''}</span>
            )
          ) : (
            (own?.name ?? EQUIPMENT_LABELS[exercise.equipment])
          )}
        </span>
        {row.rule ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {PROGRESSION_LABELS[row.rule.scheme]} · {RIR_LABELS[row.rule.targetRir] ?? `${row.rule.targetRir} tekrar yedekte`}
            <Badge variant="outline">kural değişti</Badge>
          </span>
        ) : null}
        {row.note ? <span className="text-xs italic text-muted-foreground">{row.note}</span> : null}
      </ItemContent>
    </Item>
  );
}
