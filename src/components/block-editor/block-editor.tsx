'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getInput, setInput, useField, useFieldArray } from '@formisch/react';
import { Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { SortableList } from '@/components/sortable/sortable-list';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldError } from '@/components/ui/field';
import { formatNumber } from '@/lib/format';
import type { TemplateInput } from '@/lib/schemas/template';
import { appendExercise, canAdd, reorderBlocks, replaceExercise, type EditorDevice, type IdSource, type PickerExercise } from '@/lib/template-edit';
import { rowLabels, templateSummary, type TemplateBlock } from '@/lib/template-plan';
import { BlockItem } from './block-items';
import { EditorContext, blockField, blockTitle, rowTitle, setInputId, type BlocksFormStore, type BlocksPath, type Editor } from './editor-context';
import type { ReplaceTarget } from './exercise-picker';
import { ExerciseSheet, type PickerState } from './exercise-sheet';

const DEFAULT_DESCRIPTION =
  'Numarayı basılı tutup sürükleyerek sırala; arka arkaya yapılacakları satırın menüsünden grupla (süperset, devre, kompleks).';

function toggled(open: ReadonlySet<string>, rowId: string): ReadonlySet<string> {
  const next = new Set(open);
  if (next.has(rowId)) next.delete(rowId);
  else next.add(rowId);
  return next;
}

/** Ebeveynin kas yükü gibi hesapları için bloklar (abone olur). */
export function useBlocks(form: BlocksFormStore, path: BlocksPath): TemplateBlock[] {
  const field = useField(form, { path: blockField(path) });
  return (field.input ?? []) as unknown as TemplateBlock[];
}

/**
 * Hareket düzenleyici: formdaki bir blok dizisini (şablonun blokları ya da program
 * gününün blokları) düzenler — tam genişlik liste, sürükle-bırakla sıralama, gruplar ve
 * kütüphane sheet'i ("Hareket ekle" kart başlığında ve listenin sonunda).
 *
 * Yaprak alanlar (dinlenme, setlerin hedefi, yüzdesi ve AMRAP'ı, kural, cihaz, not) alan
 * olarak bağlanır; yapısal işlemler (ekleme, sıralama, gruplama, set sayısı, tur, hazır
 * düzenler…) `template-edit.ts`'teki saf fonksiyonlarla hesaplanıp dizinin yoluna tek
 * seferde yazılır. Kimlikleri `newIds` üretir (programda
 * bütün programın kimliklerini bilir).
 *
 * Sayfada tek düzenleyici olabilir: `row-*`, `row-menu-*`, `sets-*` ve `set-*` DOM
 * kimlikleri geneldir.
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
  /** Kütüphane sheet'inin ekleme kipindeki açıklaması. */
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

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedSets, setExpandedSets] = useState<ReadonlySet<string>>(() => new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  /** Sheet'i açan düğme (kapanınca odak döner) ve listenin sonundaki "Hareket ekle". */
  const returnFocus = useRef<HTMLElement | null>(null);
  const endAddRef = useRef<HTMLButtonElement>(null);
  /** Kapanan sheet'in kipi (odak dönüşü kapanış anında okunur; `picker` o an boştur). */
  const lastPicker = useRef<PickerState | null>(null);
  /** Sheet açıkken eklenen son satır ve bekleyen duyuru: sheet kapanınca vurgulanır/duyurulur. */
  const lastAdded = useRef<string | null>(null);
  const pendingAnnouncement = useRef<string | null>(null);

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

  const openAdd = useCallback((event: React.MouseEvent<HTMLElement>) => {
    returnFocus.current = event.currentTarget;
    lastAdded.current = null;
    const next: PickerState = { kind: 'add' };
    lastPicker.current = next;
    setPicker(next);
  }, []);

  const startReplace = useCallback((rowId: string) => {
    // Menü kendi odak dönüşünü bitirsin; sheet bir kare sonra açılır.
    requestAnimationFrame(() => {
      const next: PickerState = { kind: 'replace', rowId };
      lastPicker.current = next;
      setPicker(next);
    });
  }, []);

  const toggleExpanded = useCallback((rowId: string) => setExpanded((open) => toggled(open, rowId)), []);
  const toggleSets = useCallback((rowId: string) => setExpandedSets((open) => toggled(open, rowId)), []);
  const openSets = useCallback((rowId: string) => setExpandedSets((open) => (open.has(rowId) ? open : new Set([...open, rowId]))), []);
  const focusSet = useCallback<Editor['focusSet']>((rowId, index, column) => {
    // Tablo açılıp yeniden çizildikten sonra.
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(setInputId(rowId, index, column))?.focus()));
  }, []);

  const labels = useMemo(() => rowLabels({ blocks }), [blocks]);
  const summary = useMemo(() => templateSummary({ blocks }, exerciseById), [blocks, exerciseById]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of blocks.flatMap((block) => block.rows)) counts.set(row.exerciseId, (counts.get(row.exerciseId) ?? 0) + 1);
    return counts;
  }, [blocks]);

  const replacingId = picker?.kind === 'replace' ? picker.rowId : null;
  const replacing = useMemo<ReplaceTarget | null>(() => {
    const row = replacingId ? blocks.flatMap((block) => block.rows).find((item) => item.id === replacingId) : undefined;
    return row ? { rowId: row.id, label: labels.get(row.id) ?? '', title: rowTitle(row, exerciseById), exerciseId: row.exerciseId } : null;
  }, [replacingId, blocks, labels, exerciseById]);

  const add = (exercise: PickerExercise): number | null => {
    const before = current();
    const next = appendExercise(before, exercise, newIds(before));
    const rowId = next.at(-1)?.rows[0]?.id;
    if (next.length === before.length || !rowId) return null;
    // Vurgu ve duyuru sheet kapanınca (sheet açıkken sayfa görünmez ve ekran okuyucuya kapalı).
    update(() => next);
    lastAdded.current = rowId;
    return next.length;
  };

  const replace = (exercise: PickerExercise) => {
    if (!replacing) return;
    const { rowId, label, exerciseId } = replacing;
    update((before) => replaceExercise(before, rowId, exercise, exerciseById.get(exerciseId)), { highlight: rowId });
    // Sheet açıkken sayfa ekran okuyucuya kapalı: duyuru sheet kapanınca yapılır.
    pendingAnnouncement.current = `${label} · ${exercise.title} seçildi`;
    setPicker(null);
  };

  const sheetFinalFocus = () => {
    const closed = lastPicker.current;
    if (closed?.kind === 'replace') return document.getElementById(`row-menu-${closed.rowId}`);
    // Boş durumdaki düğme ilk eklemeden sonra kalkar: odak listenin sonundakine döner.
    return returnFocus.current?.isConnected ? returnFocus.current : endAddRef.current;
  };

  const sheetClosed = () => {
    if (lastAdded.current) setHighlight(lastAdded.current);
    lastAdded.current = null;
    if (pendingAnnouncement.current) setAnnouncement(pendingAnnouncement.current);
    pendingAnnouncement.current = null;
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
    expandedSets,
    toggleSets,
    openSets,
    focusSet,
    highlight,
    startReplace,
  };

  return (
    <EditorContext.Provider value={editor}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <Card className="overflow-visible max-sm:[--card-spacing:--spacing(3)]">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {blocks.length > 0 ? (
            <CardAction className="row-span-1 self-center">
              <Button type="button" variant="outline" size="sm" className="touch:h-11" aria-haspopup="dialog" onClick={openAdd}>
                <Plus data-icon="inline-start" />
                Hareket ekle
              </Button>
            </CardAction>
          ) : null}
          <CardDescription className="col-span-2">{description}</CardDescription>
          {blocks.length > 0 ? (
            <p className="col-span-2 text-sm tabular-nums text-muted-foreground">
              {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {notice}

          {blocks.length > 0 ? (
            <>
              <SortableList
                values={blocks.map((block) => block.id)}
                onReorder={(ids) => update((before) => reorderBlocks(before, ids))}
                getLabel={(id) =>
                  blockTitle(
                    blocks.find((block) => block.id === id),
                    exerciseById,
                  )
                }
                aria-label={listLabel}
                className="flex flex-col gap-3">
                {blocks.map((block, blockIndex) => (
                  <BlockItem key={block.id} block={block} blockIndex={blockIndex} />
                ))}
              </SortableList>
              <Button
                ref={endAddRef}
                type="button"
                variant="outline"
                aria-haspopup="dialog"
                className="h-10 w-full border-dashed touch:h-11"
                onClick={openAdd}>
                <Plus data-icon="inline-start" />
                Hareket ekle
              </Button>
            </>
          ) : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>Henüz hareket yok</EmptyTitle>
                <EmptyDescription>Kütüphaneden ekle; sonra numarayı basılı tutup sürükleyerek sırala.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" className="touch:h-11" aria-haspopup="dialog" onClick={openAdd}>
                  <Plus data-icon="inline-start" />
                  Hareket ekle
                </Button>
              </EmptyContent>
            </Empty>
          )}
          <FieldError>{blocksArray.errors?.[0]}</FieldError>
        </CardContent>
      </Card>

      <ExerciseSheet
        state={picker}
        onClose={() => setPicker(null)}
        exercises={exercises}
        devices={deviceById}
        usage={usage}
        canAdd={canAdd(blocks)}
        replacing={replacing}
        addDescription={libraryDescription}
        onAdd={add}
        onReplace={replace}
        finalFocus={sheetFinalFocus}
        onClosed={sheetClosed}
      />
    </EditorContext.Provider>
  );
}
