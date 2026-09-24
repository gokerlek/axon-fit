'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useDraggable, useDroppable, type DraggableSyntheticListeners } from '@dnd-kit/core';
import { CardGrabber } from '@/components/exercise-card';
import { sameDestination } from '@/lib/drop-target';
import type { CombineOutcome, MoveDestination } from '@/lib/template-edit';
import { cn } from '@/lib/utils';
import { useDragView, type DragView } from './drag-store';

/**
 * Sürükle-bırak düğümleri: kart (tek hareket), grubun kabı, grubun yüzü ve üyesi. dnd-kit'e
 * bağlanan ince sarmalayıcılardır; içerik (`children`) aynı kaldıkça sürüklerken yeniden
 * çizilmez. Tutamak çizgisi sarmalayıcının bağlamından aktivatör ref'ini ve dinleyicilerini
 * alır. Aynı kimlik dnd-kit'te bir kez sürüklenen, bir kez hedef olarak kaydolur.
 */

/** Bırakma hedefinin türü (çarpışma algılaması ölçerken okur). */
export type DropKind = 'single' | 'face' | 'member';
export type DropData = { kind: DropKind; blockId: string };

type Handle = {
  /** Aktivatör düğümü (dnd-kit `setActivatorNodeRef`). */
  activator: (element: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  dragging: boolean;
  disabled: boolean;
};

const HandleContext = createContext<Handle | null>(null);

/** En yakın sürüklenen düğümün tutamak çizgisi. */
export function Grabber({ tone }: { tone?: 'default' | 'group' }) {
  const handle = useContext(HandleContext);
  if (!handle || handle.disabled) return <CardGrabber tone={tone} inactive />;
  const { activator, dragging, listeners } = handle;
  return <CardGrabber tone={tone} ref={activator} dragging={dragging} {...listeners} />;
}

const selectArmed = (id: string) => (view: DragView) => (view.armed?.targetId === id ? view.armed.outcome : null);

/** Bu öğe orta bandında beklenmiş hedef mi (sonucu; değilse `null`). */
function useArmed(id: string): CombineOutcome | null {
  const select = useMemo(() => selectArmed(id), [id]);
  return useDragView(select);
}

type ShellProps = React.ComponentProps<'div'> & { ref: (element: HTMLElement | null) => void };

type NodeProps = Omit<React.ComponentProps<'div'>, 'id'> & {
  /** Öğe kimliği (tek harekette ve üyede satırın, grupta bloğun). */
  itemId: string;
  /** Kartın DOM kimliği. */
  domId?: string;
  disabled?: boolean;
  /** Kabuk öğesi (ör. `ExerciseCard`); `className` ve `data-*` ona gider. */
  render: (props: ShellProps) => React.ReactNode;
};

/** Sürüklenen düğüm: dnd-kit'e bağlanır, tutamak bağlamını verir, yer tutucu olur (`data-dragging`). */
function useDragSource(itemId: string, disabled: boolean) {
  const { setNodeRef, setActivatorNodeRef, listeners, isDragging } = useDraggable({ id: itemId, disabled });
  const handle = useMemo<Handle>(
    () => ({ activator: setActivatorNodeRef, listeners, dragging: isDragging, disabled }),
    [setActivatorNodeRef, listeners, isDragging, disabled],
  );
  return { setNodeRef, handle, isDragging };
}

/** Bırakma hedefi: çarpışma algılaması düğümü ve türünü okur; beklenmiş hedefte halka (`data-armed`). */
function useDropTarget(itemId: string, data: DropData, disabled: boolean) {
  const { setNodeRef } = useDroppable({ id: itemId, data, disabled });
  const outcome = useArmed(itemId);
  const armed = outcome === 'superset' || outcome === 'becomes_circuit' || outcome === 'join';
  return { setNodeRef, armed: armed || undefined };
}

/** Tek hareket ya da grup üyesi: hem sürüklenir hem hedeftir. */
export function DragItem({ itemId, drop, disabled = false, domId, render, children, ...props }: NodeProps & { drop: DropData }) {
  const source = useDragSource(itemId, disabled);
  const data = useMemo<DropData>(() => ({ kind: drop.kind, blockId: drop.blockId }), [drop.kind, drop.blockId]);
  const target = useDropTarget(itemId, data, disabled);
  const { setNodeRef: setDragRef } = source;
  const { setNodeRef: setDropRef } = target;
  const ref = useCallback(
    (element: HTMLElement | null) => {
      setDragRef(element);
      setDropRef(element);
    },
    [setDragRef, setDropRef],
  );
  const shell = render({
    ...props,
    ref,
    id: domId,
    'data-dragging': source.isDragging || undefined,
    'data-armed': target.armed,
    children,
  } as ShellProps);
  return <HandleContext.Provider value={source.handle}>{shell}</HandleContext.Provider>;
}

/** Grubun kabı: bütün grup sürüklenir (hedef değil; hedef grubun yüzü ve üyeleri). */
export function DragGroup({ itemId, disabled = false, domId, render, children, ...props }: NodeProps) {
  const source = useDragSource(itemId, disabled);
  const shell = render({ ...props, ref: source.setNodeRef, id: domId, 'data-dragging': source.isDragging || undefined, children } as ShellProps);
  return <HandleContext.Provider value={source.handle}>{shell}</HandleContext.Provider>;
}

/** Grubun yüzü (çizgisi ve açıkken ayarlarıyla): üstüne bırakılınca gruba katılır. */
export function DropFace({ itemId, disabled = false, render, children, ...props }: Omit<NodeProps, 'domId'>) {
  const data = useMemo<DropData>(() => ({ kind: 'face', blockId: itemId }), [itemId]);
  const target = useDropTarget(itemId, data, disabled);
  return render({ ...props, ref: target.setNodeRef, 'data-armed': target.armed, children } as ShellProps);
}

const OUTCOME_LABELS: Record<Exclude<CombineOutcome, 'not_allowed'>, string> = {
  superset: 'Süperset yap',
  becomes_circuit: 'Ekle · devre olur',
  join: 'Gruba ekle',
  full: 'Grup dolu (8)',
};

/** Orta bandında beklenen hedefte ⧉'nin yerine çıkan sonuç hapı ("Süperset yap"…). */
export function DropPill({ itemId }: { itemId: string }) {
  const outcome = useArmed(itemId);
  if (!outcome || outcome === 'not_allowed') return null;
  const full = outcome === 'full';
  return (
    <span
      data-slot="drop-pill"
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 right-3 z-20 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        full ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
      )}>
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}

function destinationKey(destination: MoveDestination): string {
  return destination.at === 'top' ? `top:${destination.index}` : `group:${destination.blockId}:${destination.index}`;
}

/**
 * Ekleme çizgisi (2 px, başta 8 px nokta): bu boşluk bırakma yeriyse görünür. Üst düzeyde
 * kartlar arası 12 px'lik aralığın ortasında, grup içinde üyeleri ayıran çizginin üstünde,
 * 12 px içeriden.
 */
export function DropLine({ destination, edge }: { destination: MoveDestination; edge: 'before' | 'after' }) {
  const key = destinationKey(destination);
  const select = useMemo(
    () => (view: DragView) => sameDestination(view.line, destination),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boşluk anahtarıyla aynıdır
    [key],
  );
  const visible = useDragView(select);
  if (!visible) return null;
  const inGroup = destination.at === 'group';
  return (
    <span
      aria-hidden
      data-slot="drop-line"
      className={cn(
        'pointer-events-none absolute z-30 h-0.5 rounded-full bg-primary',
        'before:absolute before:top-1/2 before:-left-1 before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-primary',
        inGroup ? 'inset-x-3' : 'inset-x-0',
        edge === 'before' ? (inGroup ? '-top-px' : '-top-[7px]') : inGroup ? '-bottom-px' : '-bottom-[7px]',
      )}
    />
  );
}
