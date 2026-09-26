'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CaretDown, CaretRight, Check, Drop, LockSimple } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DURATION, tween, WORKOUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { clockText } from '@/lib/workout-session';

/** Sayacın ekrandaki hâli (saniyede bir değişir). */
export type RestView = {
  state: 'running' | 'warn' | 'ended';
  /** Kalan (tam saniye, yukarı yuvarlanmış) ya da bitişten beri geçen. */
  seconds: number;
  /** Alarm hâlâ yineleyecek: "dokununca alarm susar". */
  alarmPending: boolean;
};

const RADIUS = 96;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * 208 px'lik halka (tasarım §2.5): `endsAt`'ten kare kare, doğrusal. Rakam 56 px, son 10 sn'de ana renk;
 * bitince "Hazırsın" ve bir kez nabız. Hareket azaltmada halka yok, saniyede bir sayı.
 */
function RestRing({ endsAt, total, view }: { endsAt: number; total: number; view: RestView }) {
  const arc = useRef<SVGCircleElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const draw = () => {
      const remaining = endsAt - Date.now();
      const fraction = remaining > 0 ? Math.min(1, remaining / Math.max(1, total * 1000)) : 0;
      arc.current?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - fraction)));
      if (remaining > 0) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [endsAt, total, reduced]);

  const ended = view.state === 'ended';
  return (
    <motion.div
      role="timer"
      aria-label="Kalan dinlenme"
      animate={{ scale: ended ? [1, 1.06, 1] : 1 }}
      transition={tween(DURATION.slow)}
      className="relative shrink-0"
      style={{ width: WORKOUT.restRingPx, height: WORKOUT.restRingPx }}>
      <svg viewBox="0 0 208 208" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="104" cy="104" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
        {reduced ? null : (
          <circle
            ref={arc}
            cx="104"
            cy="104"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            className={cn('transition-[stroke] duration-160', ended ? 'stroke-primary-strong' : 'stroke-primary')}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
        <span
          className={cn(
            'font-heading leading-none font-semibold tabular-nums transition-colors duration-160',
            ended ? 'text-[2.125rem] text-primary' : 'text-[3.5rem]',
            view.state === 'warn' && 'text-primary',
          )}>
          {ended ? 'Hazırsın' : clockText(view.seconds)}
        </span>
        <span className="max-w-[9.5rem] text-[0.8125rem] text-muted-foreground">
          {ended ? (view.alarmPending ? 'dokununca alarm susar' : '') : view.state === 'warn' ? 'az kaldı' : 'kalan'}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * Dinlenme paneli (tasarım §2.5): set tablosu dinlenmede görünmez; hareket kartı üstte tek satıra iner.
 * Yerleşim çift dokunuşa göre: "Set bitti"nin yerinde düğme olmayan "Sıradaki" satırı durur, "Atla"
 * sağ üstte. Dinlenme bitince "Sıradaki" satırı "Sonraki sete geç" düğmesine döner (kilitle).
 */
export function RestPanel({
  endsAt,
  total,
  view,
  summary,
  saved,
  lockWarning,
  water,
  undoWater,
  next,
  onSkip,
  onMinimize,
  onAdjust,
  onWater,
  onUndoWater,
  onEditSaved,
  onTouch,
}: {
  endsAt: number;
  total: number;
  view: RestView;
  /** Kartın tek satırı: "Goblet Squat · 2/3 set" (hareket bittiyse ✓); setin hareketi bilinmiyorsa yok. */
  summary: { title: string; done: number; planned: number; finished: boolean } | null;
  saved: { text: string; setId: string } | null;
  lockWarning: boolean;
  water: number;
  /** "+1 · Geri al" hapı görünüyor. */
  undoWater: boolean;
  next: string | null;
  onSkip: () => void;
  onMinimize: () => void;
  onAdjust: (seconds: number) => void;
  onWater: () => void;
  onUndoWater: () => void;
  onEditSaved: (setId: string) => void;
  /** Panele her dokunuş yinelenen alarmı susturur. */
  onTouch: () => void;
}) {
  const ended = view.state === 'ended';
  return (
    <div onPointerDownCapture={onTouch} className="flex h-full flex-col overflow-y-auto overscroll-contain px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {summary ? (
        <p className="-mx-4 flex min-h-11 shrink-0 items-center gap-2 border-b px-4 text-sm text-muted-foreground tabular-nums">
          {summary.finished ? (
            <span className="inline-flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary [&_svg]:size-3.5">
              <Check weight="bold" />
            </span>
          ) : null}
          <span className="min-w-0 truncate">
            <span className="font-semibold text-foreground">{summary.title}</span> · {summary.done}/{summary.planned} set
            {summary.finished ? ' · bitti' : ''}
          </span>
        </p>
      ) : null}

      <div className="flex min-h-12 shrink-0 items-center gap-1">
        <h2 id="rest-title" tabIndex={-1} className="flex-1 font-heading text-lg font-semibold outline-none">
          Dinlenme
        </h2>
        <Button variant="ghost" className="h-11 px-2 text-muted-foreground" onClick={onMinimize}>
          <CaretDown data-icon="inline-start" />
          Küçült
        </Button>
        <Button variant="ghost" className="-mr-2 h-11 px-3" onClick={onSkip} aria-label="Dinlenmeyi atla">
          Atla
          <CaretRight data-icon="inline-end" />
        </Button>
      </div>

      {saved ? (
        <div className="flex min-h-11 shrink-0 items-center gap-2 text-sm tabular-nums">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary [&_svg]:size-3.5">
            <Check weight="bold" />
          </span>
          <span className="min-w-0 flex-1 truncate">{saved.text}</span>
          <Button variant="ghost" className="-mr-2 h-11 px-3" onClick={() => onEditSaved(saved.setId)}>
            Düzelt
          </Button>
        </div>
      ) : null}

      {lockWarning ? (
        <Alert className="my-1 shrink-0">
          <LockSimple />
          <AlertDescription>Ekranı kilitleme; kilitlenirse dinlenme bitişi çalmayabilir.</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-2.5 mb-1.5 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center justify-items-center">
        <Button variant="secondary" className="size-14 flex-col gap-0 rounded-full text-base leading-none tabular-nums" onClick={() => onAdjust(-15)} aria-label="Dinlenmeyi 15 saniye kısalt">
          −15
          <span className="text-[0.6875rem] font-medium text-muted-foreground">sn</span>
        </Button>
        <RestRing endsAt={endsAt} total={total} view={view} />
        <Button variant="secondary" className="size-14 flex-col gap-0 rounded-full text-base leading-none tabular-nums" onClick={() => onAdjust(15)} aria-label="Dinlenmeyi 15 saniye uzat">
          +15
          <span className="text-[0.6875rem] font-medium text-muted-foreground">sn</span>
        </Button>
      </div>
      <p className="min-h-5.5 shrink-0 text-center text-[0.9375rem] font-medium text-primary tabular-nums">
        {ended ? `Dinlenme ${clockText(view.seconds)} önce bitti` : ''}
      </p>

      <div className="relative mt-1 shrink-0">
        <Button variant="secondary" className="h-14 w-full gap-2.5 text-base" onClick={onWater}>
          <Drop className="size-5 text-primary" />
          <span>
            Su içtim ·{' '}
            <motion.b key={water} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={tween(DURATION.fast)} className="inline-block font-semibold tabular-nums">
              {water}
            </motion.b>
          </span>
        </Button>
        <AnimatePresence>
          {undoWater ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={tween(DURATION.fast)}
              className="absolute top-1/2 right-2 -translate-y-1/2">
              <Button variant="outline" className="h-10 px-3 text-[0.8125rem]" onClick={onUndoWater}>
                +1 · Geri al
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mt-auto flex min-h-14 shrink-0 items-center justify-center pt-2">
        {ended ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={onSkip}>
            Sonraki sete geç
          </Button>
        ) : next ? (
          <p className="px-2 text-center text-[0.9375rem] text-balance text-muted-foreground tabular-nums">
            <span className="mr-1 font-semibold text-foreground">Sıradaki:</span>
            {/* Satır parçaların arasında kırılır, içinde değil ("10–12" bölünmez). */}
            {next.split(' · ').map((part, index) => (
              <span key={index}>
                {index > 0 ? ' · ' : null}
                <span className="whitespace-nowrap">{part}</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Küçültülmüş dinlenme: 48 px şerit, tablo ve giriş paneli geri gelir; "Set bitti" dinlenmeyi bitirir. */
export function RestStrip({ view, onExpand, onSkip }: { view: RestView; onExpand: () => void; onSkip: () => void }) {
  const ended = view.state === 'ended';
  return (
    <div className="flex h-12 items-center gap-1 border-t bg-primary/10 pr-1 pl-4 tabular-nums">
      <span className="flex-1 text-sm text-muted-foreground">Dinlenme</span>
      <b className={cn('min-w-14 text-lg font-semibold', view.state !== 'running' && 'text-primary')}>
        {ended ? `+${clockText(view.seconds)}` : clockText(view.seconds)}
      </b>
      <Button variant="ghost" className="h-11 px-3" onClick={onExpand}>
        Büyüt
      </Button>
      <Button variant="ghost" className="h-11 px-3 text-muted-foreground" onClick={onSkip}>
        Atla
      </Button>
    </div>
  );
}
