'use client';

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls, useMotionValue, useReducedMotion } from 'motion/react';
import { DRAG, DURATION, INSTANT, tween } from '@/lib/motion';
import { moveKey, type ReorderTarget } from '@/lib/reorder';
import { cn } from '@/lib/utils';

/**
 * Sıralanan liste (SPEC §6): şablon ve program günü düzenleyicisi, danışanın antrenman ekranı.
 *
 * - Sürükleme yalnız tutamaktan (`ReorderHandle`, kartın numara rozeti) başlar; kartın geri
 *   kalanı sayfayı normal kaydırır. Ekran kenarında sayfa kendiliğinden kayar (motion'ın
 *   `Reorder.Item`'ı yapar; bunun için listenin atalarında `overflow` kaydırıcısı olmamalı).
 * - Klavye: tutamak odaktayken Alt+↑/↓, Alt+Home/End. Odak taşınan öğede kalır, yeni sıra
 *   kibarca duyurulur.
 * - Yerleşim animasyonu yalnız sıralama sürerken (ve bırakıştan sonra kısa süre) açıktır:
 *   set tablosu gibi açılıp kapanan içerik kardeşleri anında iter, kaydırmaz.
 *
 * İç içe kullanılabilir (grubun içindeki satırlar): tutamak ve kart en yakın öğeyi okur.
 */

export type SortableListProps = {
  /** Anahtarlar, çizim sırasıyla (çocuk <SortableItem value> sırası aynı olmalı). */
  values: readonly string[];
  /** Yeni sıra: sürüklerken canlı (her yer değişiminde) ve klavyeyle taşımada bir kez. */
  onReorder: (keys: readonly string[]) => void;
  /** Tutamağın adı ve duyuru metni için (ör. "Goblet Squat", "Süperset (Bench Press, Cable Row)"). */
  getLabel: (key: string) => string;
  /** Varsayılan: `${label} ${position}. sıraya taşındı`. */
  announce?: (label: string, position: number, count: number) => string;
  as?: 'ol' | 'ul';
  /** Sıralama kapalı: tutamaklar düz rozet olur. */
  disabled?: boolean;
  onDragStart?: (key: string) => void;
  onDragEnd?: (key: string, moved: boolean) => void;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
};

export type SortableListContext = {
  hintId: string;
  /** Tutamaklar sürüklenebilir mi (kapalı değil ve en az iki öğe). */
  sortable: boolean;
  /** Sıralama sürüyor (sürükleme, klavyeyle taşıma ya da hemen sonrası): yerleşim animasyonu açık. */
  reordering: boolean;
  labelOf: (key: string) => string;
  positionOf: (key: string) => number;
  move: (key: string, target: ReorderTarget) => void;
  registerHandle: (key: string, element: HTMLElement) => () => void;
  dragStarted: (key: string) => void;
  dragEnded: (key: string) => void;
};

export type SortableItemContext = {
  value: string;
  lifted: boolean;
  /** Dokunmada sürükleme etkin: tutamak `touchmove`'u engeller (sayfa kaymaz). */
  touchActiveRef: React.RefObject<boolean>;
  start: (event: PointerEvent) => void;
  lift: () => void;
  release: () => void;
};

const ListContext = createContext<SortableListContext | null>(null);
const ItemContext = createContext<SortableItemContext | null>(null);

function defaultAnnounce(label: string, position: number): string {
  return `${label} ${position}. sıraya taşındı`;
}

export function useSortableList(): SortableListContext {
  const list = useContext(ListContext);
  if (!list) throw new Error('SortableList içinde kullanılmalı.');
  return list;
}

/** En yakın sıralanan öğe (tutamak ve kart için). */
export function useSortableItem(): SortableItemContext {
  const item = useContext(ItemContext);
  if (!item) throw new Error('SortableItem içinde kullanılmalı.');
  return item;
}

export function useOptionalSortableItem(): SortableItemContext | null {
  return useContext(ItemContext);
}

export function SortableList({
  values,
  onReorder,
  getLabel,
  announce = defaultAnnounce,
  as = 'ol',
  disabled = false,
  onDragStart,
  onDragEnd,
  className,
  'aria-label': ariaLabel,
  children,
}: SortableListProps) {
  const parent = useContext(ListContext);
  const hintId = useId();
  const [message, setMessage] = useState('');
  const [ownReordering, setOwnReordering] = useState(false);
  const reordering = ownReordering || Boolean(parent?.reordering);
  const sortable = !disabled && values.length > 1;

  // Olay anında güncel değerler (sürüklemede ardışık çağrılar eski sırayı görmesin).
  const latest = useRef({ values, onReorder, getLabel, announce, onDragStart, onDragEnd });
  useLayoutEffect(() => {
    latest.current = { values, onReorder, getLabel, announce, onDragStart, onDragEnd };
  });

  const handles = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  const drag = useRef<{ from: number; hadFocus: boolean } | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const ownsFlag = useRef(false);
  const lastMessage = useRef('');

  const say = useCallback((text: string) => {
    // Aynı metin art arda gelirse ekran okuyucu yeniden okusun diye sonuna boşluk eklenir.
    const next = text === lastMessage.current ? `${text} ` : text;
    lastMessage.current = next;
    setMessage(next);
  }, []);

  const settleLater = useCallback((ms: number) => {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setOwnReordering(false), ms);
  }, []);

  const move = useCallback(
    (key: string, target: ReorderTarget) => {
      const { values: current, getLabel: labelOf, onReorder: commit, announce: text } = latest.current;
      const next = moveKey(current, key, target);
      const label = labelOf(key);
      if (next === current) {
        say(target === 'up' || target === 'top' ? `${label} zaten ilk sırada` : `${label} zaten son sırada`);
        return;
      }
      setOwnReordering(true);
      settleLater(DURATION.base + 80);
      pendingFocus.current = key;
      commit(next);
      say(text(label, next.indexOf(key) + 1, next.length));
    },
    [say, settleLater],
  );

  const registerHandle = useCallback((key: string, element: HTMLElement) => {
    handles.current.set(key, element);
    return () => {
      if (handles.current.get(key) === element) handles.current.delete(key);
    };
  }, []);

  const dragStarted = useCallback((key: string) => {
    window.clearTimeout(settleTimer.current);
    setOwnReordering(true);
    const handle = handles.current.get(key);
    drag.current = { from: latest.current.values.indexOf(key), hadFocus: handle !== undefined && document.activeElement === handle };
    document.documentElement.dataset.reordering = '';
    ownsFlag.current = true;
    latest.current.onDragStart?.(key);
  }, []);

  const dragEnded = useCallback(
    (key: string) => {
      const { values: current, getLabel: labelOf, announce: text, onDragEnd: ended } = latest.current;
      const to = current.indexOf(key);
      const moved = to !== -1 && drag.current !== null && to !== drag.current.from;
      if (moved) say(text(labelOf(key), to + 1, current.length));
      delete document.documentElement.dataset.reordering;
      ownsFlag.current = false;
      settleLater(DURATION.slow);
      // Sıra değişince React düğümü taşır ve odak düşer: tutamağa geri verilir.
      const handle = handles.current.get(key);
      if (drag.current?.hadFocus && handle && document.activeElement === document.body) handle.focus({ preventScroll: true });
      drag.current = null;
      ended?.(key, moved);
    },
    [say, settleLater],
  );

  // Klavyeyle taşımadan sonra: odak taşınan tutamakta kalır ve görünür olur.
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    const handle = handles.current.get(key);
    if (!handle) return;
    if (document.activeElement !== handle) handle.focus({ preventScroll: true });
    handle.scrollIntoView({ block: 'nearest' });
  });

  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current);
      if (ownsFlag.current) delete document.documentElement.dataset.reordering;
    },
    [],
  );

  const context = useMemo<SortableListContext>(
    () => ({
      hintId,
      sortable,
      reordering,
      labelOf: (key) => getLabel(key),
      positionOf: (key) => values.indexOf(key) + 1,
      move,
      registerHandle,
      dragStarted,
      dragEnded,
    }),
    [hintId, sortable, reordering, getLabel, values, move, registerHandle, dragStarted, dragEnded],
  );

  return (
    <>
      <span id={hintId} hidden>
        Numarayı sürükle (dokunmatikte basılı tut) ya da Alt + yukarı/aşağı ok tuşlarıyla taşı; Alt + Home/End başa ya da sona taşır.
      </span>
      <p data-slot="sortable-live" className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <ListContext.Provider value={context}>
        <Reorder.Group
          as={as}
          axis="y"
          values={values as string[]}
          onReorder={(keys: string[]) => latest.current.onReorder(keys)}
          className={className}
          aria-label={ariaLabel}>
          {children}
        </Reorder.Group>
      </ListContext.Provider>
    </>
  );
}

/** Listenin bir öğesi: kenarlığı ve zemini yok, görünen kart içindedir (`ExerciseCard`). */
export function SortableItem({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const list = useSortableList();
  const controls = useDragControls();
  const y = useMotionValue(0);
  const reduced = useReducedMotion() ?? false;
  const [lifted, setLifted] = useState(false);
  const touchActiveRef = useRef(false);

  const item = useMemo<SortableItemContext>(
    () => ({
      value,
      lifted,
      touchActiveRef,
      start: (event) => controls.start(event, { snapToCursor: false }),
      lift: () => setLifted(true),
      release: () => {
        touchActiveRef.current = false;
        setLifted(false);
      },
    }),
    [value, lifted, controls],
  );

  return (
    <ItemContext.Provider value={item}>
      <Reorder.Item
        value={value}
        as="li"
        dragListener={false}
        dragControls={controls}
        layout="position"
        style={{ y }}
        dragMomentum={false}
        dragTransition={DRAG.settle}
        data-lifted={lifted || undefined}
        animate={{ scale: lifted && !reduced ? DRAG.liftScale : 1 }}
        transition={{ scale: tween(DURATION.fast), layout: list.reordering ? tween(DURATION.base) : INSTANT }}
        onDragStart={() => {
          setLifted(true);
          list.dragStarted(value);
        }}
        onDragEnd={() => {
          if (reduced) y.jump(0);
          item.release();
          list.dragEnded(value);
        }}
        className={cn('relative', className)}>
        {children}
      </Reorder.Item>
    </ItemContext.Provider>
  );
}
