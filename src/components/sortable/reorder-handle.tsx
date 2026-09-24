'use client';

import { useEffect, useRef, useState } from 'react';
import { DRAG } from '@/lib/motion';
import type { ReorderTarget } from '@/lib/reorder';
import { cn } from '@/lib/utils';
import { useSortableItem, useSortableList } from './sortable-list';

type Tone = 'neutral' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-foreground group-hover/handle:bg-foreground/10 group-data-[state=pressing]/handle:bg-foreground/15',
  // Vurgu (gruplar): zemin ve iç çizgi ana renkte, yazı her temada okunur kalsın diye ön plan renginde.
  accent:
    'bg-primary/15 text-foreground inset-ring-1 inset-ring-primary/50 group-hover/handle:bg-primary/25 group-data-[state=pressing]/handle:bg-primary/35',
};

/** Sıra rozeti (yalnız görsel, 36 px): sıralama kapalıyken tutamağın yerine çizilir. */
export function OrderBadge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      data-slot="order-badge"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums transition-colors duration-100',
        TONES[tone],
        className,
      )}>
      {children}
    </span>
  );
}

const KEY_TARGETS: Partial<Record<string, ReorderTarget>> = { ArrowUp: 'up', ArrowDown: 'down', Home: 'top', End: 'end' };

type Arm = { id: number; x: number; y: number; event: PointerEvent; timer: number };

/**
 * Tutamak: kartın numara ya da grup rozetinin kendisi (görsel 36 px, dokunma alanı 44 px,
 * yerleşimde 36 px). Ayrı kolon, şerit ya da tutma ikonu yoktur.
 *
 * - Fare ve kalem: basınca sürükleme hazırlanır, 3 px kayınca başlar (tıklama sürüklemez).
 * - Dokunma: ~200 ms basılı tutunca başlar. Süre dolmadan kayan parmak sayfayı kaydırır
 *   (`touch-action: pan-y`); başladıktan sonra `touchmove` engellenir, sayfa kaymaz.
 * - Klavye: Alt+↑/↓ bir sıra, Alt+Home/End uçlara.
 */
export function ReorderHandle({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  const list = useSortableList();
  const item = useSortableItem();
  const ref = useRef<HTMLButtonElement>(null);
  const arm = useRef<Arm | null>(null);
  const [pressing, setPressing] = useState(false);
  const { registerHandle, sortable } = list;
  const { value, touchActiveRef } = item;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return registerHandle(value, element);
  }, [registerHandle, value, sortable]);

  // Pasif olmayan dinleyici: dokunmada sürükleme başladıysa sayfa kaymasın. Dokunuştan önce
  // bağlanmış olmalı (iOS ancak öyle iptal edilebilir sayar).
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const block = (event: TouchEvent) => {
      if (touchActiveRef.current && event.cancelable) event.preventDefault();
    };
    element.addEventListener('touchmove', block, { passive: false });
    return () => element.removeEventListener('touchmove', block);
  }, [touchActiveRef, sortable]);

  useEffect(
    () => () => {
      if (arm.current) window.clearTimeout(arm.current.timer);
    },
    [],
  );

  if (!sortable) {
    return (
      <OrderBadge tone={tone} className={className}>
        {children}
      </OrderBadge>
    );
  }

  const disarm = () => {
    if (arm.current) window.clearTimeout(arm.current.timer);
    arm.current = null;
    setPressing(false);
  };

  const activate = () => {
    const armed = arm.current;
    if (!armed) return;
    arm.current = null;
    touchActiveRef.current = true;
    setPressing(false);
    item.lift();
    navigator.vibrate?.(10);
    item.start(armed.event);
    // Kıpırdamadan bırakılırsa motion sürüklemeyi hiç başlatmaz (onDragEnd gelmez): kart burada iner.
    const end = () => {
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      item.release();
    };
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  };

  const label = list.labelOf(value);

  return (
    <button
      ref={ref}
      type="button"
      data-slot="reorder-handle"
      data-state={item.lifted ? 'lifted' : pressing ? 'pressing' : undefined}
      aria-label={`Taşı: ${label}, ${list.positionOf(value)}. sıra`}
      aria-describedby={list.hintId}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End"
      className={cn(
        'group/handle -m-1 flex size-11 shrink-0 cursor-grab touch-pan-y items-center justify-center rounded-lg outline-none select-none [-webkit-touch-callout:none] active:cursor-grabbing',
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        if (event.pointerType !== 'touch') {
          item.start(event.nativeEvent);
          return;
        }
        disarm();
        arm.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          event: event.nativeEvent,
          timer: window.setTimeout(activate, DRAG.touchDelay),
        };
        setPressing(true);
      }}
      onPointerMove={(event) => {
        const armed = arm.current;
        if (!armed || armed.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - armed.x, event.clientY - armed.y) > DRAG.touchSlop) disarm();
        else armed.event = event.nativeEvent;
      }}
      onPointerUp={disarm}
      onPointerCancel={disarm}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const target = KEY_TARGETS[event.key];
        if (!target) return;
        event.preventDefault();
        list.move(value, target);
      }}>
      <OrderBadge
        tone={tone}
        className="group-focus-visible/handle:ring-3 group-focus-visible/handle:ring-ring/50 group-data-[state=lifted]/handle:bg-primary group-data-[state=lifted]/handle:text-primary-foreground">
        {children}
      </OrderBadge>
    </button>
  );
}
