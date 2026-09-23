'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getInput, setInput, useField, useFieldArray } from '@formisch/react';
import { Plus } from '@phosphor-icons/react';
import { Reorder } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldError } from '@/components/ui/field';
import { formatNumber } from '@/lib/format';
import type { TemplateInput } from '@/lib/schemas/template';
import { appendExercise, canAdd, reorderBlocks, replaceExercise, type EditorDevice, type IdSource, type PickerExercise } from '@/lib/template-edit';
import { rowLabels, templateSummary, type TemplateBlock } from '@/lib/template-plan';
import { BlockItem, EditorContext, blockField, rowTitle, type BlocksFormStore, type BlocksPath, type Editor } from './block-items';
import { ExercisePicker, type ReplaceTarget } from './exercise-picker';

const DEFAULT_DESCRIPTION = 'Sürükleyerek sırala; arka arkaya yapılacakları grupla (süperset, devre, kompleks).';

/** Tailwind `lg` kırılımı: kütüphane yanda mı (masaüstü) yoksa listenin altında mı (telefon). */
function isWide(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches;
}

function focusLibrary(scroll: boolean) {
  if (scroll) document.getElementById('kutuphane')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('kutuphane-ara')?.focus({ preventScroll: scroll });
}

/** Ebeveynin kas yükü gibi hesapları için bloklar (abone olur). */
export function useBlocks(form: BlocksFormStore, path: BlocksPath): TemplateBlock[] {
  const field = useField(form, { path: blockField(path) });
  return (field.input ?? []) as unknown as TemplateBlock[];
}

/**
 * Hareket düzenleyici: formdaki bir blok dizisini (şablonun blokları ya da program
 * gününün blokları) düzenler — liste, sürükle-bırak, gruplar ve kütüphane paneli.
 *
 * Yaprak alanlar (set, dinlenme, hedef, kural, cihaz, not) alan olarak bağlanır; yapısal
 * işlemler (ekleme, sıralama, gruplama…) `template-edit.ts`'teki saf fonksiyonlarla
 * hesaplanıp dizinin yoluna tek seferde yazılır. Kimlikleri `newIds` üretir (programda
 * bütün programın kimliklerini bilir).
 *
 * Sayfada tek düzenleyici olabilir: `kutuphane`, `kutuphane-ara`, `sira-ipucu`, `row-*`
 * ve `handle-*` DOM kimlikleri geneldir.
 */
export function BlockEditor({
  form,
  path,
  exercises,
  devices,
  newIds,
  noteHint,
  libraryDescription,
  title = 'Hareketler',
  description = DEFAULT_DESCRIPTION,
  notice,
  listLabel = 'Şablondaki hareketler',
}: {
  form: BlocksFormStore;
  path: BlocksPath;
  exercises: PickerExercise[];
  devices: EditorDevice[];
  newIds: (blocks: readonly TemplateBlock[]) => IdSource;
  noteHint: string;
  libraryDescription: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Listenin üstünde (ör. silinmiş cihaz uyarısı). */
  notice?: React.ReactNode;
  /** Ekran okuyucu için listenin adı. */
  listLabel?: string;
}) {
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const deviceById = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices]);
  const blocks = useBlocks(form, path);
  const blocksArray = useFieldArray(form, { path: blockField(path) });

  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  /** Formdaki güncel bloklar (olay anında; sürüklemede ardışık çağrılar birbirini ezmesin). */
  const current = useCallback(() => (getInput(form, { path: blockField(path) }) ?? []) as unknown as TemplateBlock[], [form, path]);

  const write = useCallback(
    (next: TemplateBlock[]) => setInput(form, { path: blockField(path), input: next as TemplateInput['blocks'] }),
    [form, path],
  );

  const update = useCallback<Editor['update']>(
    (change, options) => {
      const before = current();
      const next = change(before);
      if (next === before) return;
      write(next);
      if (options?.highlight) setHighlight(options.highlight);
      if (options?.announce) setAnnouncement(options.announce);
    },
    [current, write],
  );

  const undoToast = useRef<string | number | null>(null);

  const updateWithUndo = useCallback<Editor['updateWithUndo']>(
    (change, message) => {
      const before = current();
      const next = change(before);
      if (next === before) return;
      write(next);
      // Geri al yalnız bu işlemden sonra başka değişiklik yoksa geçerli; yoksa sonraki düzenlemeler silinirdi.
      const after = JSON.stringify(current());
      setAnnouncement(message);
      if (undoToast.current !== null) toast.dismiss(undoToast.current);
      undoToast.current = toast(message, {
        action: {
          label: 'Geri al',
          onClick: () => {
            if (JSON.stringify(current()) !== after) {
              toast.error('Sonrasında başka değişiklik yapıldı; geri alınamadı.');
              return;
            }
            write(before);
          },
        },
        duration: 8000,
      });
    },
    [current, write],
  );

  const startReplace = useCallback((rowId: string) => {
    setReplacingId(rowId);
    // Telefonda kütüphane listenin altında: oraya kaydır; masaüstünde yanda duruyor.
    requestAnimationFrame(() => focusLibrary(!isWide()));
  }, []);

  const toggleExpanded = useCallback(
    (rowId: string) =>
      setExpanded((open) => {
        const next = new Set(open);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      }),
    [],
  );

  const labels = useMemo(() => rowLabels({ blocks }), [blocks]);
  const summary = useMemo(() => templateSummary({ blocks }, exerciseById), [blocks, exerciseById]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of blocks.flatMap((block) => block.rows)) counts.set(row.exerciseId, (counts.get(row.exerciseId) ?? 0) + 1);
    return counts;
  }, [blocks]);

  const replacingRow = replacingId ? blocks.flatMap((block) => block.rows).find((row) => row.id === replacingId) : undefined;
  const replacing: ReplaceTarget | null = replacingRow
    ? {
        rowId: replacingRow.id,
        label: labels.get(replacingRow.id) ?? '',
        title: rowTitle(replacingRow, exerciseById),
        exerciseId: replacingRow.exerciseId,
      }
    : null;

  const pick = (exercise: PickerExercise) => {
    if (replacing) {
      const rowId = replacing.rowId;
      update((before) => replaceExercise(before, rowId, exercise, exerciseById.get(replacing.exerciseId)), {
        highlight: rowId,
        announce: `${replacing.label} · ${exercise.title} seçildi`,
      });
      setReplacingId(null);
      return;
    }
    const before = current();
    const next = appendExercise(before, exercise, newIds(before));
    const rowId = next.at(-1)?.rows[0]?.id;
    if (next.length === before.length || !rowId) return;
    update(() => next, { highlight: rowId, announce: `${exercise.title} eklendi (${next.length}. sıra)` });
    if (isWide()) {
      requestAnimationFrame(() => document.getElementById(`row-${rowId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    } else {
      toast.success(`${exercise.title} eklendi`, { duration: 1500 });
    }
  };

  const editor: Editor = {
    form,
    path,
    newIds,
    noteHint,
    blocks,
    update,
    updateWithUndo,
    exercises: exerciseById,
    exerciseList: exercises,
    devices: deviceById,
    deviceList: devices,
    labels,
    expanded,
    toggleExpanded,
    highlight,
    startReplace,
  };

  return (
    <EditorContext.Provider value={editor}>
      <p id="sira-ipucu" className="sr-only">
        Sürükle ya da yukarı/aşağı ok tuşlarıyla taşı
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
            {blocks.length > 0 ? (
              <CardAction className="text-sm tabular-nums text-muted-foreground">
                {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {notice}

            {blocks.length > 0 ? (
              <Reorder.Group
                as="ol"
                axis="y"
                values={blocks.map((block) => block.id)}
                onReorder={(ids: string[]) => update((before) => reorderBlocks(before, ids))}
                className="flex flex-col gap-3"
                aria-label={listLabel}>
                {blocks.map((block, blockIndex) => (
                  <BlockItem key={block.id} block={block} blockIndex={blockIndex} />
                ))}
              </Reorder.Group>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>Henüz hareket yok</EmptyTitle>
                  <EmptyDescription>
                    <span className="hidden lg:inline">Sağdaki kütüphaneden ekle.</span>
                    <span className="lg:hidden">Aşağıdaki kütüphaneden ekle.</span>
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <FieldError>{blocksArray.errors?.[0]}</FieldError>
          </CardContent>
          <CardFooter className="lg:hidden">
            <Button type="button" variant="outline" onClick={() => focusLibrary(true)}>
              <Plus data-icon="inline-start" />
              Hareket ekle
            </Button>
          </CardFooter>
        </Card>

        <Card id="kutuphane" className="scroll-mt-4 lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Kütüphane</CardTitle>
            <CardDescription>{libraryDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExercisePicker
              exercises={exercises}
              devices={deviceById}
              usage={usage}
              replacing={replacing}
              disabled={!canAdd(blocks)}
              onPick={pick}
              onCancelReplace={() => setReplacingId(null)}
            />
          </CardContent>
        </Card>
      </div>
    </EditorContext.Provider>
  );
}
