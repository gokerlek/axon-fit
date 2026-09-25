'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getInput, setInput, useField, useFieldArray } from '@formisch/react';
import { CheckSquare, LinkSimple, Plus, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { SwipeGroup } from '@/components/swipe/swipe-row';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldError } from '@/components/ui/field';
import { showUndoToast } from '@/components/undo-toast';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isJoining } from '@/lib/drop-target';
import {
  addToGroupHint,
  addToGroupTitle,
  addedToGroupMessage,
  bulkMessage,
  combineMessage,
  edgeMessage,
  groupedMessage,
  moveMessage,
  selectedRowCount,
  selectionStatus,
} from '@/lib/edit-messages';
import { formatNumber } from '@/lib/format';
import { DRAG } from '@/lib/motion';
import type { TemplateInput } from '@/lib/schemas/template';
import {
  addToGroup,
  addToGroupOutcome,
  appendExercise,
  canAdd,
  combineInto,
  combineOutcome,
  dissolveGroup,
  groupBlocks,
  groupCheck,
  moveItem,
  removeBlock,
  removeBlocks,
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
import { SaveButton } from './editor-save';
import { ExerciseSheet, type PickerState } from './exercise-sheet';

/** Açıklama (SPEC §6, tasarım §2): dokunmatikte ve masaüstünde ayrı. */
const DEFAULT_DESCRIPTION = (
  <>
    <span className="hidden touch:inline">
      Karta dokun: düzenle. Üstteki çizgiden sürükle: sırala; bir kartın ortasına bırak: grupla. Sola kaydır: sil.
    </span>
    <span className="touch:hidden">
      Karta tıkla: düzenle. Üstteki çizgiden sürükle: sırala; bir kartın ortasına bırak: grupla. Kartı sola çek: sil. Alt + ok
      tuşları taşır.
    </span>
  </>
);

const SHEET_FULL_MESSAGE = 'Şablon dolu: en fazla 40 hareket ve 30 blok olur.';

/**
 * Kaydırma ipucu (ilk kullanımda bir kez, dokunmatikte): ilk kart 40 px sola "göz kırpar";
 * reduced-motion'da bunun yerine ipucu satırı çıkar. Sayfa açıkken sabit kalır (modül
 * düzeyinde); görüldüğü localStorage'a yazılır (erişilemezse ipucu hiç çıkmaz).
 */
const SWIPE_HINT_KEY = 'pulsecoach.editor.swipe-hint';
let swipeHintCache: 'nudge' | 'text' | null | undefined;

function readSwipeHint(): 'nudge' | 'text' | null {
  if (swipeHintCache !== undefined) return swipeHintCache;
  swipeHintCache = null;
  // Kaydırma yalnız dokunmatikte: fareyle gelen cihazda ipucu harcanmaz.
  if (!window.matchMedia('(pointer: coarse)').matches) return swipeHintCache;
  try {
    if (window.localStorage.getItem(SWIPE_HINT_KEY) === '1') return swipeHintCache;
    window.localStorage.setItem(SWIPE_HINT_KEY, '1');
  } catch {
    return swipeHintCache;
  }
  swipeHintCache = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'text' : 'nudge';
  return swipeHintCache;
}

/** Göz kırpma oynadı: bu sayfa açıkken başka düzenleyicide tekrarlanmaz. */
function spendSwipeHint() {
  if (swipeHintCache === 'nudge') swipeHintCache = null;
}

const noSubscription = () => () => {};

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

/** Toplu silmeden sonra odak: silinenlerden sonraki kart, yoksa önceki; liste boşaldıysa `null`. */
function neighbourAfterRemoval(blocks: readonly TemplateBlock[], removed: ReadonlySet<string>): string | null {
  const indexes = blocks.flatMap((block, index) => (removed.has(block.id) ? [index] : []));
  const last = indexes.at(-1) ?? -1;
  const next = blocks.slice(last + 1).find((block) => !removed.has(block.id));
  const previous = blocks
    .slice(0, last)
    .filter((block) => !removed.has(block.id))
    .at(-1);
  const target = next ?? previous;
  return target ? blockItemId(target) : null;
}

/**
 * Hareket düzenleyici: formdaki bir blok dizisini (şablonun blokları ya da program
 * gününün blokları) düzenler. Tek kart tasarımı: kapalı kartlar; dokununca açılır (lg
 * altında aynı anda tek kart). Kartın üstündeki çizgiden sürükleyerek sıralanır, bir
 * kartın ortasına bırakıp gruplanır; klavyede yüz odaktayken Alt + ok, Delete. Yüz sola
 * kaydırılınca silinir (parmak, kalem, fare); kopyalama yok. "Seç" ile seçim
 * moduna geçilir: seçili kartlar toplu gruplanır ya da silinir. Bütün işlemler "Hareketler"
 * başlığında: normalde [Seç] [Kaydet] (Kaydet yalnız değişiklik varken; `SaveButton`), seçim
 * modunda [Tümünü seç] [Grupla] [Sil] [Vazgeç]. "+ Hareket ekle" listenin altındadır.
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
  addLabel = 'Hareket ekle',
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
  /** Alt çubuktaki "+ Hareket ekle"nin erişilebilir adı (programda "Hareket ekle: Gün A"). */
  addLabel?: string;
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
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [nudged, setNudged] = useState(false);

  const listRef = useRef<HTMLOListElement>(null);
  /** Sheet'i açan düğme (kapanınca odak döner). */
  const returnFocus = useRef<HTMLElement | null>(null);
  /** Seçim modunda Shift+tık aralığının başı (son dokunulan kart). */
  const anchor = useRef<string | null>(null);
  const selectButtonRef = useRef<HTMLButtonElement>(null);
  /** Sheet açıkken eklenen son satır ve bekleyen duyuru: sheet kapanınca vurgulanır/duyurulur. */
  const lastAdded = useRef<string | null>(null);
  const pendingAnnouncement = useRef<string | null>(null);
  const emptyAddRef = useRef<HTMLButtonElement>(null);
  /** Listenin altındaki "+ Hareket ekle" (odak dönüşleri: sheet kapanınca, öğe silinince). */
  const listAddRef = useRef<HTMLButtonElement>(null);
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
        // Öğe gittiyse listenin altındaki (liste boşaldıysa boş durumdaki) "Hareket ekle".
        const target = face ?? listAddRef.current ?? emptyAddRef.current;
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

  /** Geri alınabilir güncelleme: aynı anda tek "Geri al" bildirimi (8 sn), yenisi öncekini kapatır. */
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
      showUndoToast(message, () => {
        if (JSON.stringify(current()) !== after) {
          toast.error('Sonrasında başka değişiklik yapıldı; geri alınamadı.');
          return;
        }
        write(before);
        announce('Geri alındı');
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

  // ─── Seçim modu (tasarım §5) ─────────────────────────────────────────────────────────

  /** Liste boşalınca (ör. başka yerden geri alma) seçim modu kendiliğinden biter. */
  const selectingNow = selecting && blocks.length > 0;
  /** Seçili bloklar: silinenler ayıklanır (bloklar her değiştiğinde). */
  const selected = useMemo<ReadonlySet<string>>(
    () => new Set(blocks.filter((block) => selection.has(block.id)).map((block) => block.id)),
    [blocks, selection],
  );
  const coarse = useMediaQuery('(pointer: coarse)');
  const check = groupCheck(blocks, selected);
  const allSelected = selected.size === blocks.length;

  const enterSelection = () => {
    setOpen(new Set());
    setSelection(new Set());
    anchor.current = null;
    setSelecting(true);
    announce('Seçim modu: gruplamak ya da silmek istediklerini seç');
    const first = blocks[0];
    if (first) focusFace(blockItemId(first));
  };

  /** Seçim modundan çıkar. `returnFocus`: Vazgeç ve Esc'te odak [Seç]'e döner (işlem sonrası odak işlemin). */
  const leaveSelection = useCallback(
    (options?: { announce?: boolean; returnFocus?: boolean }) => {
      setSelecting(false);
      setSelection(new Set());
      anchor.current = null;
      if (options?.announce) announce('Seçim modundan çıkıldı');
      if (options?.returnFocus) requestAnimationFrame(() => requestAnimationFrame(() => selectButtonRef.current?.focus()));
    },
    [announce],
  );

  const toggleSelect = useCallback<Editor['toggleSelect']>(
    (blockId, range) => {
      const ids = current().map((block) => block.id);
      const from = range && anchor.current ? ids.indexOf(anchor.current) : -1;
      const to = ids.indexOf(blockId);
      if (to === -1) return;
      anchor.current = blockId;
      // Güncel seçimden (art arda iki dokunuş bir çizimde birleşmesin).
      setSelection((now) => {
        const next = new Set(now);
        if (from !== -1 && from !== to) {
          for (const id of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(id);
        } else if (next.has(blockId)) {
          next.delete(blockId);
        } else {
          next.add(blockId);
        }
        return next;
      });
    },
    [current],
  );

  const selectAll = () => setSelection(new Set(current().map((block) => block.id)));

  /** Seçimin olay anındaki hâli (liste sırasıyla, silinenler yok). */
  const pickedNow = () => {
    const before = current();
    return { before, ids: new Set(before.filter((block) => selection.has(block.id)).map((block) => block.id)) };
  };

  const groupSelected = () => {
    const { before, ids } = pickedNow();
    const kind = groupCheck(before, ids);
    const first = before.find((block) => ids.has(block.id));
    if ((kind !== 'superset' && kind !== 'circuit') || !first) return;
    leaveSelection();
    // Grup ilk seçilen kartın yerinde ve kimliğiyle kurulur: vurgu ve odak onda.
    updateWithUndo((now) => groupBlocks(now, ids), groupedMessage(before, ids, kind, titleOf), { highlight: first.id, focus: first.id });
  };

  const removeSelected = () => {
    const { before, ids } = pickedNow();
    if (ids.size === 0) return;
    leaveSelection();
    updateWithUndo((now) => removeBlocks(now, ids), bulkMessage(selectedRowCount(before, ids), 'removed'), {
      focus: neighbourAfterRemoval(before, ids) ?? '',
    });
  };

  // Esc seçim modundan çıkar (odak başlıktaki düğmelerde de olabilir).
  useEffect(() => {
    if (!selectingNow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || sheetOpen.current) return;
      event.preventDefault();
      leaveSelection({ announce: true, returnFocus: true });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectingNow, leaveSelection]);

  /** Liste odaktayken: Ctrl/⌘+A tümünü seçer, Delete "Sil" gibi çalışır (Space/Enter yüzün kendisi). */
  const onListKeyDown = (event: React.KeyboardEvent<HTMLOListElement>) => {
    if (!selectingNow) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('en') === 'a') {
      event.preventDefault();
      selectAll();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.size > 0) {
      event.preventDefault();
      removeSelected();
    }
  };

  const status = selectionStatus(selected.size, check, coarse ? 'touch' : 'mouse');
  const canGroup = check === 'superset' || check === 'circuit';

  // ─── Ekleme sheet'i: sona ya da grubun sonuna ────────────────────────────────────────

  const openAddToGroup = useCallback<Editor['openAddToGroup']>(
    (blockId, event) => {
      const now = current();
      const blockIndex = now.findIndex((block) => block.id === blockId);
      const block = now[blockIndex];
      if (!block || block.kind === 'single') return;
      returnFocus.current = event.currentTarget;
      lastAdded.current = null;
      setPicker({ kind: 'addToGroup', blockId, title: addToGroupTitle(block.kind, blockIndex) });
    },
    [current],
  );

  /** Dokunulan egzersizi ekler (vurgu ve duyuru sheet kapanınca); durum satırının cümlesi, eklenemezse `null`. */
  const pick = (exercise: PickerExercise): string | null => {
    const before = current();
    if (picker?.kind === 'addToGroup') {
      const group = before.find((block) => block.id === picker.blockId);
      const next = addToGroup(before, picker.blockId, exercise, newIds(before));
      const joined = next.find((block) => block.id === picker.blockId);
      const rowId = joined?.rows.at(-1)?.id;
      if (next === before || !group || !joined || !rowId) return null;
      update(() => next);
      lastAdded.current = rowId;
      const message = addedToGroupMessage(exercise.title, group.kind, joined.kind);
      announce(message);
      return message;
    }
    const next = appendExercise(before, exercise, newIds(before));
    const rowId = next.at(-1)?.rows[0]?.id;
    if (next.length === before.length || !rowId) return null;
    update(() => next);
    lastAdded.current = rowId;
    return `${exercise.title} eklendi (${next.length}. sıra)`;
  };

  const sheet = (() => {
    if (picker?.kind === 'addToGroup') {
      const { blocked, hint } = addToGroupHint(addToGroupOutcome(blocks, picker.blockId));
      return { title: picker.title, description: 'Ada ya da kasa göre ara; dokununca grubun sonuna eklenir.', blocked, hint };
    }
    return { title: 'Hareket ekle', description: libraryDescription, blocked: canAdd(blocks) ? null : SHEET_FULL_MESSAGE, hint: '' };
  })();

  // Açan düğme gitmişse (boş durumdaki düğme ilk eklemeden sonra kalkar) listenin altındaki "+ Hareket ekle".
  const sheetFinalFocus = () => (returnFocus.current?.isConnected ? returnFocus.current : listAddRef.current);

  const sheetClosed = () => {
    if (lastAdded.current) setHighlight(lastAdded.current);
    lastAdded.current = null;
    const pending = pendingAnnouncement.current;
    pendingAnnouncement.current = null;
    if (pending) announce(pending);
  };

  // ─── Kaydırma ipucu ──────────────────────────────────────────────────────────────────

  const hint = useSyncExternalStore(noSubscription, () => (blocks.length > 0 && picker === null ? readSwipeHint() : null), () => null);
  const firstBlock = blocks[0];
  const nudgeId = hint === 'nudge' && !nudged && firstBlock ? blockItemId(firstBlock) : null;
  const onNudged = useCallback(() => {
    spendSwipeHint();
    setNudged(true);
  }, []);

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
    selecting: selectingNow,
    selected,
    toggleSelect,
    openAddToGroup,
    nudgeId,
    onNudged,
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
          {selectingNow ? (
            <>
              {/* Seçim modu: işlemler başlıkta (altta çubuk yok); durum satırı pasif düğmenin nedenini yazar. */}
              <div className="col-span-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="touch:h-11"
                  onClick={() => (allSelected ? setSelection(new Set()) : selectAll())}>
                  {allSelected ? 'Seçimi kaldır' : 'Tümünü seç'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  aria-disabled={!canGroup || undefined}
                  className="touch:h-11 aria-disabled:cursor-default aria-disabled:opacity-50"
                  onClick={() => (canGroup ? groupSelected() : undefined)}>
                  <LinkSimple data-icon="inline-start" />
                  Grupla ({selected.size})
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-disabled={selected.size === 0 || undefined}
                  className="touch:h-11 aria-disabled:cursor-default aria-disabled:opacity-50"
                  onClick={() => (selected.size > 0 ? removeSelected() : undefined)}>
                  <Trash data-icon="inline-start" />
                  Sil
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="touch:h-11"
                  onClick={() => leaveSelection({ announce: true, returnFocus: true })}>
                  Vazgeç
                </Button>
              </div>
              <p role="status" aria-live="polite" className="col-span-2 text-sm text-muted-foreground">
                {status}
              </p>
            </>
          ) : (
            <>
              <CardAction className="row-span-1 flex items-center gap-2 self-center">
                {blocks.length >= 2 ? (
                  <Button ref={selectButtonRef} type="button" variant="outline" size="sm" className="touch:h-11" onClick={enterSelection}>
                    <CheckSquare data-icon="inline-start" />
                    Seç
                  </Button>
                ) : null}
                <SaveButton />
              </CardAction>
              <CardDescription className="col-span-2">{description}</CardDescription>
            </>
          )}
          {hint === 'text' && !selectingNow ? (
            <p className="col-span-2 text-sm text-muted-foreground">İpucu: kartı sola kaydır → sil</p>
          ) : null}
          {blocks.length > 0 ? (
            <p className="col-span-2 text-sm tabular-nums text-muted-foreground">
              {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3 max-sm:px-0">
          {notice}

          {blocks.length > 0 ? (
            <SwipeGroup>
              <EditorDnd listRef={listRef} preview={(itemId) => <ItemPreview itemId={itemId} />}>
                {/* İlk kartın üstünde 20 px (12 + 8): tutamağın 16 px taşan dokunma alanı üstteki içeriğe binmez. */}
                <ol
                  ref={listRef}
                  aria-label={listLabel}
                  className="flex flex-col gap-3 pt-2"
                  onKeyDown={onListKeyDown}>
                  {blocks.map((block, blockIndex) => (
                    <BlockItem key={block.id} block={block} blockIndex={blockIndex} count={blocks.length} />
                  ))}
                </ol>
              </EditorDnd>
              {selectingNow ? null : (
                <Button
                  ref={listAddRef}
                  type="button"
                  variant="outline"
                  aria-haspopup="dialog"
                  aria-label={addLabel === 'Hareket ekle' ? undefined : addLabel}
                  data-reorder-hide
                  className="h-11 w-full border-dashed text-muted-foreground hover:text-foreground"
                  onClick={openAdd}>
                  <Plus data-icon="inline-start" />
                  Hareket ekle
                </Button>
              )}
            </SwipeGroup>
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
        title={sheet.title}
        description={sheet.description}
        blocked={sheet.blocked}
        hint={sheet.hint}
        onPick={pick}
        finalFocus={sheetFinalFocus}
        onClosed={sheetClosed}
      />
    </EditorContext.Provider>
  );
}
