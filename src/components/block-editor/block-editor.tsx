'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getInput, setInput, useField, useFieldArray } from '@formisch/react';
import { Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldError } from '@/components/ui/field';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isJoining } from '@/lib/drop-target';
import { combineMessage, edgeMessage, moveMessage } from '@/lib/edit-messages';
import { formatNumber } from '@/lib/format';
import { DRAG } from '@/lib/motion';
import type { TemplateInput } from '@/lib/schemas/template';
import {
  appendExercise,
  canAdd,
  combineInto,
  combineOutcome,
  dissolveGroup,
  duplicateBlock,
  duplicateRow,
  moveItem,
  removeBlock,
  removeRow,
  stepDestination,
  ungroupRow,
  type EditorDevice,
  type IdSource,
  type PickerExercise,
} from '@/lib/template-edit';
import { TEMPLATE_LIMITS, rowLabels, templateSummary, type TemplateBlock } from '@/lib/template-plan';
import { BlockItem, FULL_MESSAGE, ItemPreview } from './block-items';
import { EditorDnd } from './drag/editor-dnd';
import {
  EditorContext,
  blockField,
  blockItemId,
  faceId,
  itemTitle,
  setInputId,
  type BlocksFormStore,
  type BlocksPath,
  type Editor,
  type ItemActions,
} from './editor-context';
import { ExerciseSheet, type PickerState } from './exercise-sheet';

/** Açıklama (SPEC §6, tasarım §2): dokunmatikte ve masaüstünde ayrı. */
const DEFAULT_DESCRIPTION = (
  <>
    <span className="hidden touch:inline">Karta dokun: düzenle. Üstteki çizgiden sürükle: sırala; bir kartın ortasına bırak: grupla.</span>
    <span className="touch:hidden">
      Karta tıkla: düzenle. Üstteki çizgiden sürükle: sırala; bir kartın ortasına bırak: grupla. Alt + ok tuşları taşır.
    </span>
  </>
);

function toggled(open: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Ebeveynin kas yükü gibi hesapları için bloklar (abone olur). */
export function useBlocks(form: BlocksFormStore, path: BlocksPath): TemplateBlock[] {
  const field = useField(form, { path: blockField(path) });
  return (field.input ?? []) as unknown as TemplateBlock[];
}

/** İşlemden sonra yeni çıkan kimlik (kopya): önce satırlar, yoksa blok. */
function addedId(before: readonly TemplateBlock[], after: readonly TemplateBlock[], wholeBlock: boolean): string | undefined {
  const blockIds = new Set(before.map((block) => block.id));
  if (wholeBlock) return after.find((block) => !blockIds.has(block.id))?.id;
  const rowIds = new Set(before.flatMap((block) => block.rows.map((row) => row.id)));
  return after.flatMap((block) => block.rows).find((row) => !rowIds.has(row.id))?.id;
}

/** Silinen öğeden sonra odak: sonraki kart, yoksa önceki; grupta sonraki üye, önceki üye ya da grubun yüzü. */
function neighbourOf(blocks: readonly TemplateBlock[], itemId: string): string | null {
  const index = blocks.findIndex((block) => blockItemId(block) === itemId);
  if (index >= 0) {
    const next = blocks[index + 1] ?? blocks[index - 1];
    return next ? blockItemId(next) : null;
  }
  const group = blocks.find((block) => block.kind !== 'single' && block.rows.some((row) => row.id === itemId));
  if (!group) return null;
  const rowIndex = group.rows.findIndex((row) => row.id === itemId);
  const other = group.rows[rowIndex + 1] ?? group.rows[rowIndex - 1];
  // Grupta tek üye kalırsa grup teke döner (grubun kimliğiyle); odak o satırın yüzüne.
  if (group.rows.length === 2 && other) return other.id;
  return other?.id ?? group.id;
}

/**
 * Hareket düzenleyici: formdaki bir blok dizisini (şablonun blokları ya da program
 * gününün blokları) düzenler. Tek kart tasarımı: kapalı kartlar; dokununca açılır (lg
 * altında aynı anda tek kart). Kartın üstündeki çizgiden sürükleyerek sıralanır, bir
 * kartın ortasına bırakıp gruplanır; klavyede yüz odaktayken Alt + ok, Delete.
 *
 * Yaprak alanlar (dinlenme, setlerin hedefi, yüzdesi ve AMRAP'ı, kural, cihaz, not) alan
 * olarak bağlanır; yapısal işlemler (ekleme, taşıma, gruplama, set sayısı, tur, hazır
 * düzenler…) `template-edit.ts`'teki saf fonksiyonlarla hesaplanıp dizinin yoluna tek
 * seferde yazılır. Kimlikleri `newIds` üretir (programda bütün programın kimliklerini bilir).
 *
 * Sayfada tek düzenleyici olabilir: `row-*`, `face-*`, `body-*`, `sets-*` ve `set-*` DOM
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
  /** Kütüphane sheet'inin açıklaması. */
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
  /** lg ve üstünde birden çok kart açık kalabilir. */
  const wide = useMediaQuery('(min-width: 64rem)');

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [setsOpen, setSetsOpenState] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [detailsOpen, setDetailsOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const listRef = useRef<HTMLOListElement>(null);
  /** Sheet'i açan düğme (kapanınca odak döner) ve listenin sonundaki "Hareket ekle". */
  const returnFocus = useRef<HTMLElement | null>(null);
  const endAddRef = useRef<HTMLButtonElement>(null);
  /** Sheet açıkken eklenen son satır ve bekleyen duyuru: sheet kapanınca vurgulanır/duyurulur. */
  const lastAdded = useRef<string | null>(null);
  const pendingAnnouncement = useRef<string | null>(null);
  const emptyAddRef = useRef<HTMLButtonElement>(null);
  const sheetOpen = useRef(false);
  const lastSaid = useRef('');

  useEffect(() => {
    sheetOpen.current = picker !== null;
  }, [picker]);

  useEffect(() => {
    if (!highlight) return;
    // Vurgulanan kart görünür olsun (kopya, bırakılan kart, sheet'ten eklenen).
    const card = document.getElementById(`row-${highlight}`) ?? document.getElementById(`group-${highlight}`);
    card?.scrollIntoView({ block: 'nearest' });
    const timer = window.setTimeout(() => setHighlight(null), DRAG.highlightMs);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  /** Canlı bölgeye kibarca: aynı cümle art arda gelirse yeniden okunsun diye sonuna boşluk. Sheet açıkken bekler. */
  const announce = useCallback((text: string) => {
    if (!text) return;
    if (sheetOpen.current) {
      pendingAnnouncement.current = text;
      return;
    }
    const next = text === lastSaid.current ? `${text} ` : text;
    lastSaid.current = next;
    setAnnouncement(next);
  }, []);

  /** Formdaki güncel bloklar (olay anında; ardışık çağrılar birbirini ezmesin). */
  const current = useCallback(() => (getInput(form, { path: blockField(path) }) ?? []) as unknown as TemplateBlock[], [form, path]);

  const write = useCallback(
    (next: TemplateBlock[]) => setInput(form, { path: blockField(path), input: next as TemplateInput['blocks'] }),
    [form, path],
  );

  /** Çizimden sonra öğenin yüzüne odaklanır (taşınan kart yeniden kurulmuş olabilir). */
  const focusFace = useCallback((itemId: string | null) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const face = itemId ? document.getElementById(faceId(itemId)) : null;
        // Liste boşaldıysa boş durumdaki "Hareket ekle".
        const target = face ?? endAddRef.current ?? emptyAddRef.current;
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'nearest' });
      }),
    );
  }, []);

  const update = useCallback<Editor['update']>(
    (change, options) => {
      const before = current();
      const next = change(before);
      if (next === before) return;
      write(next);
      if (options?.highlight) setHighlight(options.highlight);
      if (options?.announce) announce(options.announce);
    },
    [current, write, announce],
  );

  const undoToast = useRef<string | number | null>(null);

  const updateWithUndo = useCallback<Editor['updateWithUndo']>(
    (change, message, options) => {
      const before = current();
      const next = change(before);
      if (next === before) return;
      write(next);
      // Geri al yalnız bu işlemden sonra başka değişiklik yoksa geçerli; yoksa sonraki düzenlemeler silinirdi.
      const after = JSON.stringify(current());
      announce(message);
      if (options?.highlight) setHighlight(options.highlight);
      if (options?.focus !== undefined) focusFace(options.focus);
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
            announce('Geri alındı');
          },
        },
        duration: 8000,
      });
    },
    [current, write, announce, focusFace],
  );

  const openAdd = useCallback((event: React.MouseEvent<HTMLElement>) => {
    returnFocus.current = event.currentTarget;
    lastAdded.current = null;
    setPicker({ kind: 'add' });
  }, []);

  const toggleOpen = useCallback(
    (itemId: string) =>
      setOpen((now) => {
        if (wide) return toggled(now, itemId);
        return now.has(itemId) ? new Set() : new Set([itemId]);
      }),
    [wide],
  );
  const close = useCallback(
    (itemId: string) =>
      setOpen((now) => {
        if (!now.has(itemId)) return now;
        const next = new Set(now);
        next.delete(itemId);
        return next;
      }),
    [],
  );
  const closeAndFocus = useCallback(
    (itemId: string) => {
      close(itemId);
      document.getElementById(faceId(itemId))?.focus();
    },
    [close],
  );
  const setSetsOpen = useCallback((rowId: string, value: boolean) => setSetsOpenState((now) => new Map(now).set(rowId, value)), []);
  const toggleDetails = useCallback((rowId: string) => setDetailsOpen((now) => toggled(now, rowId)), []);
  const focusSet = useCallback<Editor['focusSet']>((rowId, index, column) => {
    // Bölüm açılıp yeniden çizildikten sonra.
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(setInputId(rowId, index, column))?.focus()));
  }, []);

  const titleOf = useCallback((exerciseId: string) => exerciseById.get(exerciseId)?.title ?? 'Silinmiş egzersiz', [exerciseById]);

  const actions = useMemo<ItemActions>(() => {
    const titleFor = (blocksNow: readonly TemplateBlock[], itemId: string) => itemTitle(blocksNow, itemId, exerciseById);
    const isGroup = (blocksNow: readonly TemplateBlock[], itemId: string) =>
      blocksNow.some((block) => block.id === itemId && block.kind !== 'single');
    const memberOf = (blocksNow: readonly TemplateBlock[], itemId: string) =>
      blocksNow.find((block) => block.kind !== 'single' && block.rows.some((row) => row.id === itemId));

    const ungroup = (rowId: string) => {
      const before = current();
      if (!memberOf(before, rowId)) return;
      if (before.length >= TEMPLATE_LIMITS.blocks) return announce(FULL_MESSAGE);
      const title = titleFor(before, rowId);
      updateWithUndo((now) => ungroupRow(now, rowId, exerciseById, newIds(now)), `${title} gruptan çıktı`, { focus: rowId, highlight: rowId });
      close(rowId);
    };

    const dissolve = (blockId: string) => {
      const before = current();
      const group = before.find((block) => block.id === blockId && block.kind !== 'single');
      if (!group) return;
      if (before.length - 1 + group.rows.length > TEMPLATE_LIMITS.blocks) return announce(FULL_MESSAGE);
      const title = titleFor(before, blockId);
      updateWithUndo((now) => dissolveGroup(now, blockId, exerciseById, newIds(now)), `${title} dağıtıldı`, {
        focus: group.rows[0]?.id,
      });
      close(blockId);
    };

    return {
      duplicate: (itemId) => {
        const before = current();
        const whole = isGroup(before, itemId);
        const next = whole ? duplicateBlock(before, itemId, newIds(before)) : duplicateRow(before, itemId, newIds(before), exerciseById);
        if (next === before) return announce(FULL_MESSAGE);
        const copy = addedId(before, next, whole);
        updateWithUndo(() => next, `${titleFor(before, itemId)} kopyalandı`, copy ? { highlight: copy } : undefined);
      },
      remove: (itemId) => {
        const before = current();
        const whole = before.some((block) => block.id === itemId);
        const next = whole ? removeBlock(before, itemId) : removeRow(before, itemId, exerciseById);
        if (next === before) return;
        updateWithUndo(() => next, `${titleFor(before, itemId)} silindi`, { focus: neighbourOf(before, itemId) ?? '' });
        close(itemId);
      },
      ungroup,
      dissolve,
      step: (itemId, target) => {
        const before = current();
        const destination = stepDestination(before, itemId, target);
        if (!destination) return announce(edgeMessage(before, itemId, target === 'up' || target === 'top', titleOf));
        const next = moveItem(before, itemId, destination, exerciseById, newIds(before));
        if (next === before) return;
        update(() => next, { announce: moveMessage(before, next, itemId, titleOf) });
        focusFace(itemId);
      },
      groupWithPrevious: (itemId) => {
        const before = current();
        const title = titleFor(before, itemId);
        if (isGroup(before, itemId)) return announce('Grup başka bir gruba eklenemez');
        if (memberOf(before, itemId)) return announce(`${title} zaten bir grupta; çıkarmak için Alt + sol ok`);
        const index = before.findIndex((block) => block.rows[0]?.id === itemId);
        const previous = before[index - 1];
        if (!previous) return announce(`${title} ilk sırada; öncesinde gruplanacak hareket yok`);
        const targetId = blockItemId(previous);
        const outcome = combineOutcome(before, itemId, targetId);
        if (outcome === 'full') return announce('Grup dolu (8)');
        if (!isJoining(outcome)) return;
        updateWithUndo(
          (now) => combineInto(now, itemId, targetId, exerciseById),
          combineMessage(before, itemId, targetId, outcome, titleOf),
          { focus: itemId, highlight: itemId },
        );
      },
      split: (itemId) => {
        const before = current();
        if (isGroup(before, itemId)) return dissolve(itemId);
        if (memberOf(before, itemId)) return ungroup(itemId);
        announce(`${titleFor(before, itemId)} bir grupta değil`);
      },
    };
  }, [current, exerciseById, newIds, announce, update, updateWithUndo, close, focusFace, titleOf]);

  const labels = useMemo(() => rowLabels({ blocks }), [blocks]);
  const summary = useMemo(() => templateSummary({ blocks }, exerciseById), [blocks, exerciseById]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of blocks.flatMap((block) => block.rows)) counts.set(row.exerciseId, (counts.get(row.exerciseId) ?? 0) + 1);
    return counts;
  }, [blocks]);

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

  // Boş durumdaki düğme ilk eklemeden sonra kalkar: odak listenin sonundakine döner.
  const sheetFinalFocus = () => (returnFocus.current?.isConnected ? returnFocus.current : endAddRef.current);

  const sheetClosed = () => {
    if (lastAdded.current) setHighlight(lastAdded.current);
    lastAdded.current = null;
    const pending = pendingAnnouncement.current;
    pendingAnnouncement.current = null;
    if (pending) announce(pending);
  };

  const editor: Editor = {
    form,
    path,
    newIds,
    noteHint,
    blocks,
    current,
    update,
    updateWithUndo,
    announce,
    exercises: exerciseById,
    exerciseList: exercises,
    devices: deviceById,
    deviceList: devices,
    labels,
    open,
    toggleOpen,
    close,
    closeAndFocus,
    setsOpen,
    setSetsOpen,
    detailsOpen,
    toggleDetails,
    focusSet,
    highlight,
    actions,
  };

  return (
    <EditorContext.Provider value={editor}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* Telefonda dış kartın çerçevesi kalkar: kartlar sayfa kenarından 16 px içeride, 343 px. */}
      <Card className="overflow-visible max-sm:rounded-none max-sm:bg-transparent max-sm:py-0 max-sm:ring-0">
        <CardHeader className="max-sm:px-0">
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
        <CardContent className="flex flex-col gap-3 max-sm:px-0">
          {notice}

          {blocks.length > 0 ? (
            <>
              <EditorDnd listRef={listRef} preview={(itemId) => <ItemPreview itemId={itemId} />}>
                {/* Üstte 16 px: ilk kartın tutamak alanı üstteki içeriğe binmez. */}
                <ol ref={listRef} aria-label={listLabel} className="flex flex-col gap-3 pt-2">
                  {blocks.map((block, blockIndex) => (
                    <BlockItem key={block.id} block={block} blockIndex={blockIndex} count={blocks.length} />
                  ))}
                </ol>
              </EditorDnd>
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
                <EmptyDescription>Kütüphaneden hareket ekle.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button ref={emptyAddRef} type="button" className="touch:h-11" aria-haspopup="dialog" onClick={openAdd}>
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
        addDescription={libraryDescription}
        onAdd={add}
        finalFocus={sheetFinalFocus}
        onClosed={sheetClosed}
      />
    </EditorContext.Provider>
  );
}
