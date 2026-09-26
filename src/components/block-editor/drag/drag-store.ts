'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { sameDestination } from '@/lib/drop-target';
import type { CombineOutcome, MoveDestination } from '@/lib/template-edit';

/**
 * Sürüklemenin görünen hâli: ekleme çizgisi, 250 ms beklenmiş hedef (hap ve halka),
 * sürüklenen öğe. Kartlar bunu seçiciyle okur: yalnız değişen kart yeniden çizilir (sürüklerken
 * bütün liste çizilmez).
 */
export type DragView = {
  /** Sürüklenen öğe (tek harekette ve üyede satırın, grupta bloğun kimliği). */
  activeId: string | null;
  /** Bırakınca taşınacak boşluk. */
  line: MoveDestination | null;
  /** Orta bandında beklenmiş hedef ve sonucu (`full` soluk hap, birleştirmez). */
  armed: { targetId: string; outcome: CombineOutcome } | null;
};

export const IDLE: DragView = { activeId: null, line: null, armed: null };

export type DragStore = {
  get: () => DragView;
  set: (view: DragView) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createDragStore(): DragStore {
  let view = IDLE;
  const listeners = new Set<() => void>();
  return {
    get: () => view,
    set: (next) => {
      if (
        next.activeId === view.activeId &&
        sameDestination(next.line, view.line) &&
        next.armed?.targetId === view.armed?.targetId &&
        next.armed?.outcome === view.armed?.outcome
      ) {
        return;
      }
      view = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const DragStoreContext = createContext<DragStore | null>(null);

const SERVER = () => IDLE;
const NOOP_STORE: DragStore = { get: () => IDLE, set: () => {}, subscribe: () => () => {} };

/** Sürüklemenin görünen hâlinden bir değer; seçici ilkel değer dönmeli (yoksa her değişimde çizilir). */
export function useDragView<T>(select: (view: DragView) => T): T {
  const store = useContext(DragStoreContext) ?? NOOP_STORE;
  const getSnapshot = useCallback(() => select(store.get()), [store, select]);
  const getServerSnapshot = useCallback(() => select(SERVER()), [select]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}

const selectDragging = (view: DragView) => view.activeId !== null;
const selectArmed = (view: DragView) => view.armed;

/** Orta bandında beklenmiş hedef ve sonucu (sürüklenen kartın üstündeki etiket için); değişmedikçe aynı nesne. */
export function useArmedTarget(): DragView['armed'] {
  return useDragView(selectArmed);
}

/** Sürükleme sürüyor mu (kaydırma o sırada kapalı). Yalnız başlangıçta ve bitişte değişir. */
export function useDragging(): boolean {
  return useDragView(selectDragging);
}
