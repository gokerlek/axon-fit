'use client';

/**
 * Kaydırılan satır: Easy Dude'un `swipe-row.tsx` dosyasından kopyalandı (bağımlılık değil).
 *
 * Değişenler (tasarım §3, §9):
 * - Parmak, kalem ve farenin sol tuşuyla çalışır: motion'un kendi dinleyicisi kapalı
 *   (`dragListener=false`), kaydırmayı `useCardGesture` hakemi `dragControls` ile başlatır.
 * - Paneller `aria-hidden`; kapalıyken `inert`. Düğmeleri sekme sırasına girmez: hepsi
 *   başka yerdeki görünür düğmelerin kopyası. `role=button` sarmalayıcı yok (yüz zaten düğme).
 * - Reduced-motion'da panel anında oturur, silmede yüz kaymaz.
 * - Tam kaydırma eşiği geçilince bir kez titreşir, panel parmağa kadar uzar, ikon yüzün
 *   kenarını izler; parmak eşiğin altına dönerse iptal.
 * - Aynı anda tek panel açık (`SwipeGroup`); dışarı dokunmak ve Esc kapatır.
 * - Spinner ve ✓ durumları yok (işlemler anında; geri alma toast'ta). İkonlar Phosphor,
 *   renkler tema token'larından.
 * - Yüz tutamak çizgisiyle birlikte kayar; açık gövde bu bileşenin dışındadır. Çizgiye basış
 *   kaydırma değil sürüklemedir (hakem onu yok sayar).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type MotionValue, type PanInfo } from 'motion/react';
import { DURATION, EASE, INSTANT, SWIPE, tween } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** İşlemin rengi: olumlu (kopyala), nötr (çıkar, dağıt), yıkıcı (sil). */
export type SwipeTone = 'primary' | 'neutral' | 'destructive';

export type SwipeAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  /** Varsayılan: soldaki panelde olumlu, sağdakinde yıkıcı. */
  tone?: SwipeTone;
  /** Satırı siler: yüz dışarı çıkar, satırın yüksekliği 220 ms'de kapanır, sonra `onPress`. */
  removes?: boolean;
  /** Şu an yapılamaz (ör. şablon dolu): soluk; basınca `onPress` yine çağrılır (nedeni duyurur), tam kaydırma tetiklemez. */
  disabled?: boolean;
};

/** `start`: sağa kaydırınca soldan açılan panel; `end`: sola kaydırınca sağdan açılan. */
type Side = 'start' | 'end';

const TONES: Record<SwipeTone, string> = {
  primary: 'bg-primary text-primary-foreground',
  neutral: 'bg-muted-foreground text-background',
  destructive: 'bg-destructive text-background',
};

/** Tam kaydırmalı tarafta sürükleme sınırı yok sayılacak kadar uzak (px). */
const FREE = 4000;

function vibrate() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
}

// ─── Grup: aynı anda tek panel açık ────────────────────────────────────────────────────

type Group = {
  openId: string | null;
  open: (id: string, element: HTMLElement | null) => void;
  close: (id?: string) => void;
};

const SwipeGroupContext = createContext<Group | null>(null);

/** Aynı anda tek panel açık kalır; dışarı dokunmak (sürükleme tutamağı dahil) ve Esc kapatır. */
export function SwipeGroup({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openElement = useRef<HTMLElement | null>(null);

  const open = useCallback((id: string, element: HTMLElement | null) => {
    openElement.current = element;
    setOpenId(id);
  }, []);
  /** `id` verilirse yalnız o açıksa kapatır. */
  const close = useCallback((id?: string) => setOpenId((now) => (id === undefined || now === id ? null : now)), []);

  useEffect(() => {
    if (!openId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && openElement.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openId, close]);

  const value = useMemo<Group>(() => ({ openId, open, close }), [openId, open, close]);
  return <SwipeGroupContext.Provider value={value}>{children}</SwipeGroupContext.Provider>;
}

// ─── Hakem: dokunma, sayfa kaydırması ya da yatay kaydırma ─────────────────────────────

/**
 * Kart yüzündeki basışın hakemi (parmak, kalem ya da farenin sol tuşu): |dx| > 10 ve
 * |dx| > 1,5·|dy| olursa kaydırma başlar (`onSwipe`, basılan anın olayıyla: yüz parmağı
 * baştan izler); |dy| > 8 olursa dokunmatikte sayfa kayar (`touch-action: pan-y pinch-zoom`,
 * tarayıcının işi), farede hiçbir şey olmaz; 8 px'ten az hareket dokunmadır (yüzün kendi
 * click'i). Kaydırmadan sonra gelen click `consumeClick` ile yutulur. Sürükleme yalnız
 * tutamak çizgisinden başladığı için süre yarışı yok.
 */
export function useCardGesture({ enabled, onSwipe }: { enabled: boolean; onSwipe: (down: PointerEvent) => void }) {
  const track = useRef<{ id: number; x: number; y: number; down: PointerEvent } | null>(null);
  const swiped = useRef(false);

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      swiped.current = false;
      const onGrabber = event.target instanceof Element && event.target.closest('[data-slot=card-grabber]') !== null;
      track.current =
        enabled && !onGrabber && event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0)
          ? { id: event.pointerId, x: event.clientX, y: event.clientY, down: event.nativeEvent }
          : null;
    },
    onPointerMove: (event: React.PointerEvent) => {
      const start = track.current;
      if (!start || event.pointerId !== start.id) return;
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > SWIPE.startDistance && dx > SWIPE.directionRatio * dy) {
        track.current = null;
        swiped.current = true;
        onSwipe(start.down);
        return;
      }
      // Dikey: sayfa kayar (tarayıcı pointercancel gönderir).
      if (dy > SWIPE.scrollSlop) track.current = null;
    },
    onPointerUp: () => {
      track.current = null;
    },
    onPointerCancel: () => {
      track.current = null;
    },
  };

  /** Bu dokunuş kaydırma mıydı (öyleyse click yutulur). */
  const consumeClick = () => {
    const was = swiped.current;
    swiped.current = false;
    return was;
  };

  return { handlers, consumeClick };
}

// ─── Silmede satırın kapanması ─────────────────────────────────────────────────────────

/** Satırın yüksekliği 220 ms'de kapanır (liste aralığı da); iptal edilirse eski hâline döner. */
function collapse(element: HTMLElement): { finished: Promise<unknown>; cancel: () => void } {
  const height = element.offsetHeight;
  const parent = element.parentElement;
  const gap = parent ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
  // Aralık da kapansın: sonraki kardeşe olan boşluk (yoksa öncekine olan).
  const margin = element.nextElementSibling ? 'marginBottom' : 'marginTop';
  const previousOverflow = element.style.overflow;
  element.style.overflow = 'hidden';
  const animation = element.animate(
    [
      { height: `${height}px`, opacity: 1, [margin]: '0px' },
      { height: '0px', opacity: 0, [margin]: `${-gap}px` },
    ],
    { duration: DURATION.base, easing: `cubic-bezier(${EASE.exit.join(',')})`, fill: 'forwards' },
  );
  return {
    finished: animation.finished,
    cancel: () => {
      animation.cancel();
      element.style.overflow = previousOverflow;
    },
  };
}

// ─── Panel ─────────────────────────────────────────────────────────────────────────────

/** Tek işlemin içeriği sağa mı yaslanır: soldaki panelde eşik geçilince (yüzün kenarı), sağdakinde dururken (dış kenar). */
function toInner(side: Side, armed: boolean): boolean {
  return side === 'start' ? armed : !armed;
}

function Panel({
  side,
  actions,
  x,
  open,
  armed,
  onRun,
}: {
  side: Side;
  actions: readonly SwipeAction[];
  x: MotionValue<number>;
  open: boolean;
  armed: boolean;
  onRun: (action: SwipeAction) => void;
}) {
  const rest = actions.length * SWIPE.actionWidth;
  // Panel yüzün açtığı yeri doldurur: parmakla birlikte uzar.
  const width = useTransform(x, (value) => Math.max(rest, side === 'start' ? value : -value));
  const single = actions.length === 1;
  return (
    <motion.div
      aria-hidden
      inert={!open}
      data-slot="swipe-panel"
      className={cn('absolute inset-y-0 flex', side === 'start' ? 'left-0' : 'right-0')}
      style={{ width }}>
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          tabIndex={-1}
          onClick={() => onRun(action)}
          className={cn(
            'relative h-full min-w-18 flex-1 outline-none select-none',
            TONES[action.tone ?? (side === 'start' ? 'primary' : 'destructive')],
            action.disabled && 'opacity-50 saturate-50',
          )}>
          {/*
            İçerik 72 px'lik kutuda: dış kenarda durur; tek işlemli tarafta tam kaydırma eşiği
            geçilince yüzün kenarına geçer ve onu izler.
          */}
          <span
            className={cn(
              'absolute inset-y-0 flex flex-col items-center justify-center gap-1 text-[11px] leading-none font-semibold motion-safe:transition-[left] motion-safe:duration-160 [&_svg]:size-5',
              single ? cn('w-18', toInner(side, armed) ? 'left-[calc(100%-4.5rem)]' : 'left-0') : 'inset-x-0',
            )}>
            {action.icon}
            {action.label}
          </span>
        </button>
      ))}
    </motion.div>
  );
}

// ─── Satır ─────────────────────────────────────────────────────────────────────────────

/**
 * iOS tarzı iki yönlü kaydırma: sağa kaydırınca soldan `start` işlemleri (olumlu), sola
 * kaydırınca sağdan `end` işlemleri (sil, dağıt) açılır. Bir tarafta tek işlem varsa tam
 * kaydırma (satırın %45'i) onu tetikler; fırlatma (400 px/sn) paneli açar ama tetiklemez.
 * Panel açıkken yüze dokunmak kapatır (click yutulur).
 */
export function SwipeRow({
  id,
  start = [],
  end = [],
  fullStart: fullStartProp,
  fullEnd: fullEndProp,
  disabled = false,
  nudge = false,
  onNudged,
  className,
  children,
}: {
  /** Gruptaki kimlik (aynı anda tek panel). */
  id: string;
  start?: readonly SwipeAction[];
  end?: readonly SwipeAction[];
  /** Tam kaydırma o taraftaki işlemi tetikler mi; verilmezse tarafta tek işlem varken evet (Easy Dude kuralı). */
  fullStart?: boolean;
  fullEnd?: boolean;
  /** Sürükleme sürerken ve seçim modunda kapalı (açık panel de kapanır). */
  disabled?: boolean;
  /** İlk kullanımda bir kez: yüz 40 px sola kayıp geri gelir (reduced-motion'da çağıran ipucu yazar). */
  nudge?: boolean;
  onNudged?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const group = useContext(SwipeGroupContext);
  const reduced = useReducedMotion() ?? false;
  const controls = useDragControls();
  const x = useMotionValue(0);
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Side | null>(null);
  /** Paneller çizili ve yüz opak: kaydırma, açık panel, silme ya da göz kırpma sürüyor. */
  const [active, setActive] = useState(false);
  const [armed, setArmed] = useState<Side | null>(null);
  const armedRef = useRef<Side | null>(null);
  const busy = useRef(false);

  const startWidth = start.length * SWIPE.actionWidth;
  const endWidth = end.length * SWIPE.actionWidth;
  const fullStart = (fullStartProp ?? start.length === 1) && start.length === 1 && !start[0]?.disabled;
  const fullEnd = (fullEndProp ?? end.length === 1) && end.length === 1 && !end[0]?.disabled;
  const enabled = !disabled && (start.length > 0 || end.length > 0);
  const transition = reduced ? INSTANT : SWIPE.spring;

  const width = () => container.current?.clientWidth ?? 0;

  const arm = (next: Side | null) => {
    if (next === armedRef.current) return;
    armedRef.current = next;
    setArmed(next);
    if (next) vibrate();
  };

  const settle = (side: Side | null) => {
    setOpen(side);
    arm(null);
    if (side) {
      setActive(true);
      group?.open(id, container.current);
    } else {
      group?.close(id);
    }
    const target = side === 'end' ? -endWidth : side === 'start' ? startWidth : 0;
    void animate(x, target, transition).then(() => {
      if (x.get() === 0 && !busy.current) setActive(false);
    });
  };
  const latestSettle = useRef(settle);
  useEffect(() => {
    latestSettle.current = settle;
  });

  // Başka satırın paneli açılınca, dışarı dokununca ya da Esc'te kapanır.
  const groupOpenId = group?.openId ?? null;
  useEffect(() => {
    if (open && groupOpenId !== id) latestSettle.current(null);
  }, [groupOpenId, id, open]);

  // Kapatılınca (sürükleme başladı, seçim modu) açık panel ve süren kaydırma kapanır.
  useEffect(() => {
    if (!disabled) return;
    controls.cancel();
    if (open || armedRef.current || x.get() !== 0) latestSettle.current(null);
  }, [disabled, controls, open, x]);

  // İlk kullanımda bir kez göz kırpma: silme paneli 40 px görünüp kapanır.
  useEffect(() => {
    if (!nudge || reduced || end.length === 0) return;
    const timer = window.setTimeout(() => {
      setActive(true);
      void animate(x, [0, -SWIPE.nudge, 0], { duration: 0.9, times: [0, 0.35, 1], ease: 'easeInOut' }).then(() => {
        if (x.get() === 0 && !busy.current) setActive(false);
      });
      onNudged?.();
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bir kez, açılışta
  }, [nudge]);

  const run = (side: Side, action: SwipeAction) => {
    if (action.disabled) {
      action.onPress();
      settle(null);
      return;
    }
    const row = action.removes ? container.current?.closest<HTMLElement>('[data-swipe-collapse]') : null;
    if (!row || reduced) {
      action.onPress();
      settle(null);
      return;
    }
    // Sil: yüz çıkar, satır kapanır, sonra silinir (toast'ta "Geri al").
    busy.current = true;
    setActive(true);
    group?.close(id);
    const out = side === 'end' ? -width() : width();
    void animate(x, out, tween(DURATION.fast, EASE.exit)).then(() => {
      const closing = collapse(row);
      void closing.finished.then(() => {
        action.onPress();
        // Silinmediyse (ör. geri çevrildi) satır geri gelir.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            busy.current = false;
            if (!row.isConnected) return;
            closing.cancel();
            x.set(0);
            setOpen(null);
            setActive(false);
          }),
        );
      });
    });
  };

  const gesture = useCardGesture({
    enabled,
    onSwipe: (down) => {
      setActive(true);
      controls.start(down, { distanceThreshold: 0 });
    },
  });

  const onDrag = () => {
    const value = x.get();
    const threshold = width() * SWIPE.fullRatio;
    arm(value <= -threshold && fullEnd ? 'end' : value >= threshold && fullStart ? 'start' : null);
  };

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (busy.current) return;
    const value = x.get();
    const velocity = info.velocity.x;
    const side = armedRef.current;
    const action = side === 'end' ? end[0] : side === 'start' ? start[0] : undefined;
    if (side && action) return run(side, action);
    if (open === 'end') return settle(value > -endWidth / 2 || velocity > SWIPE.flingVelocity ? null : 'end');
    if (open === 'start') return settle(value < startWidth / 2 || velocity < -SWIPE.flingVelocity ? null : 'start');
    if (value < 0) return settle(endWidth > 0 && (value < -endWidth / 2 || velocity < -SWIPE.flingVelocity) ? 'end' : null);
    if (value > 0) return settle(startWidth > 0 && (value > startWidth / 2 || velocity > SWIPE.flingVelocity) ? 'start' : null);
    settle(null);
  };

  // Açıkken yalnız kapanış yönüne (ya da tam kaydırmaya) gidilir; karşı tarafa geçilmez.
  // Tam kaydırmalı tarafta sınır yok (yüz satırın dışına kadar gider, kap keser).
  const left = end.length === 0 ? 0 : fullEnd ? -FREE : -endWidth;
  const right = start.length === 0 ? 0 : fullStart ? FREE : startWidth;
  const constraints = open === 'end' ? { left, right: 0 } : open === 'start' ? { left: 0, right } : { left, right };

  return (
    <div ref={container} data-slot="swipe-row" data-swipe-open={open ?? undefined} className={cn('relative overflow-hidden', className)}>
      {active && start.length > 0 ? (
        <Panel side="start" actions={start} x={x} open={open === 'start'} armed={armed === 'start'} onRun={(action) => run('start', action)} />
      ) : null}
      {active && end.length > 0 ? (
        <Panel side="end" actions={end} x={x} open={open === 'end'} armed={armed === 'end'} onRun={(action) => run('end', action)} />
      ) : null}
      <motion.div
        drag={enabled ? 'x' : false}
        dragListener={false}
        dragControls={controls}
        dragConstraints={constraints}
        dragElastic={0.08}
        dragMomentum={false}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        {...gesture.handlers}
        onClickCapture={(event) => {
          // Kaydırmadan sonra gelen click ve açık paneldeyken yüze dokunmak: yalnız kapatır.
          if (gesture.consumeClick() || open) {
            event.preventDefault();
            event.stopPropagation();
            if (open) settle(null);
          }
        }}
        style={{ x, touchAction: 'pan-y pinch-zoom' }}
        // Kayarken yüz opak: arkadaki panel yalnız açılan yerde görünür.
        className={cn('relative', active && 'bg-(--face-bg)')}>
        {children}
      </motion.div>
    </div>
  );
}
