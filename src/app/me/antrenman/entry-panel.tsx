'use client';

import { motion } from 'motion/react';
import { ArrowRight, CaretRight, Check, FlagCheckered, Play, Stop, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { formatKg, formatNumber } from '@/lib/format';
import { gridOf } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { cn } from '@/lib/utils';
import type { WorkoutRow } from '@/lib/workout-plan';
import { clockText, targetText, type NextSet, type OverloadState } from '@/lib/workout-session';
import type { SetTimerTick } from '@/lib/workout-timer';

/** Süreli harekette stepper adımı (sn). */
const SECONDS_STEP = 5;

/** Devrede istasyon geçişi: panelin üst kenarında incelen çubuk (tam dinlenme değil). */
export type TransitionView = { endsAt: number; total: number };

/** Sayılan süreli set: saniyede bir değişen hâli. */
export type TimerView = Pick<SetTimerTick, 'seconds' | 'toMin' | 'fraction' | 'phase'>;

function TransitionBar({ transition, now }: { transition: TransitionView; now: number }) {
  const remaining = Math.max(0, transition.endsAt - now);
  const fraction = Math.min(1, remaining / Math.max(1, transition.total * 1000));
  return (
    <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/15" aria-hidden>
      <motion.div
        className="h-full origin-left bg-primary"
        initial={{ scaleX: fraction }}
        animate={{ scaleX: 0, transition: { duration: remaining / 1000, ease: 'linear' } }}
      />
    </div>
  );
}

/** Sayılan süreli set: büyük saniye, alt sınıra geri sayım ve çubuk (stepper'ın yerinde). */
function TimerBox({ view, target }: { view: TimerView; target: NextSet['target'] }) {
  const reached = view.phase !== 'below';
  return (
    <div role="timer" aria-live="off" className="relative flex h-14 items-center gap-3 overflow-hidden rounded-lg border border-input px-4 dark:bg-input/30">
      <span className="flex items-baseline gap-1.5">
        <span className="font-heading text-[2rem] leading-none font-semibold text-primary tabular-nums">{formatNumber(view.seconds)}</span>
        <span className="text-sm text-muted-foreground">sn</span>
      </span>
      <span className="ml-auto text-right text-sm text-muted-foreground tabular-nums">
        {reached ? (view.phase === 'above' && !target.amrap ? 'Hedefin üstündesin' : 'Hedefe ulaştın') : `Hedefe ${formatNumber(view.toMin)} sn`}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-primary/15" aria-hidden>
        <span className="block h-full origin-left bg-primary transition-transform duration-160" style={{ transform: `scaleX(${view.fraction})` }} />
      </span>
    </div>
  );
}

/**
 * Alt giriş paneli (tasarım §2.4), yapışkan: başparmak bölgesinde. Üst satırda "Set 2/3 · Hedef 8–10"
 * (AMRAP'ta rozet ve "En az 8, yapabildiğin kadar"), altında 56 px'lik stepper'lar (ağırlık cihazın
 * ızgarasıyla bir sonraki/önceki ayar; tekrar ya da saniye), en altta tek dokunuşluk "Set bitti"
 * (grupta turun sıradaki üyesi varsa "Set bitti → B"). Kaydedilince düğme panel değişene kadar
 * "Kaydedildi" der ve değerler donar. Dokunuş kilidi paneli saran kapta (`WorkoutScreen`).
 *
 * - Süreli set: "Başlat ▶" sayacı kurar (saniye kronometreyle sayılır, alt sınırda tek bip), "Bitir ■"
 *   geçen süreyi yazar; elle stepper ve "Set bitti" de var.
 * - Aşırı yük (hareket başına bir kez): ağırlık planın çok üstündeyse uyarı ve "Onayla · Set bitti";
 *   "Düzelt" önerilen ağırlığa döner. Engellemez.
 * - Devrede istasyon geçişi panelin üst kenarında ince çubuk olarak sayar.
 * - "Hareketi geç ›" üst satırın sağında (§2.6): başparmak erişiminde, başlıktaki "Değiştir"den uzakta;
 *   tek dokunuş, hareket sona alınır.
 */
export function EntryPanel({
  row,
  next,
  frozen,
  overload,
  nextLetter,
  transition,
  timer,
  now,
  onChange,
  onResetKg,
  onDone,
  onStartTimer,
  onStopTimer,
  onCancelTimer,
  onSkip,
  onFinish,
}: {
  row: WorkoutRow | null;
  /** Gösterilen set: sıradaki ya da (kaydedilirken) az önce kaydedilen. */
  next: NextSet | null;
  /** Az önce kaydedildi: panel değişene kadar değerler donar, düğme "Kaydedildi" der. */
  frozen: boolean;
  overload: OverloadState;
  /** Grupta turun sıradaki üyesi: "Set bitti → B". */
  nextLetter: string | null;
  transition: TransitionView | null;
  /** Süreli setin sayacı çalışıyorsa hâli. */
  timer: TimerView | null;
  now: number;
  onChange: (values: { kg?: number | undefined; value?: number | undefined }) => void;
  onResetKg: () => void;
  onDone: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onCancelTimer: () => void;
  /** "Hareketi geç ›": şu anki hareket (grupta bütün grup) sona alınır. */
  onSkip: () => void;
  onFinish: () => void;
}) {
  if (!next || !row) {
    return (
      <div className="flex flex-col gap-2 pt-2">
        <p className="flex min-h-11 items-center text-sm font-medium">Hareketler bitti</p>
        <Button size="lg" className="h-14 w-full text-base" onClick={onFinish}>
          <FlagCheckered data-icon="inline-start" />
          Antrenmanı bitir
        </Button>
      </div>
    );
  }

  const weighted = row.trackingType === 'weight_reps';
  const duration = row.trackingType === 'duration';
  const grid = weighted ? gridOf(row.spec) : null;
  const { kg, value } = next;
  const running = duration && timer !== null && !frozen;
  const ask = overload === 'ask' && !frozen;
  const inTransition = transition !== null && transition.endsAt > now && !frozen;

  const doneButton = (
    <Button
      id="set-done"
      size="lg"
      aria-disabled={frozen || undefined}
      aria-label={!frozen && !ask && nextLetter ? `Set bitti, sıradaki ${nextLetter}` : undefined}
      onClick={frozen ? undefined : onDone}
      className={cn(
        'h-14 w-full text-base transition-transform duration-100 active:scale-[0.97] motion-reduce:active:scale-100',
        frozen && 'bg-primary/70 hover:bg-primary/70',
      )}>
      {frozen ? (
        <>
          <Check data-icon="inline-start" weight="bold" />
          Kaydedildi
        </>
      ) : ask ? (
        <>
          Onayla · Set bitti
          <Check data-icon="inline-end" weight="bold" />
        </>
      ) : nextLetter ? (
        <>
          Set bitti
          <ArrowRight data-icon="inline-end" weight="bold" />
          {nextLetter}
        </>
      ) : (
        <>
          Set bitti
          <Check data-icon="inline-end" weight="bold" />
        </>
      )}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      {inTransition && transition ? <TransitionBar key={transition.endsAt} transition={transition} now={now} /> : null}
      <div className="flex min-h-11 items-center gap-1.5 text-sm font-medium tabular-nums">
        <span className="shrink-0">
          Set {next.position + 1}/{next.total}
        </span>
        {next.target.amrap ? <Badge className="shrink-0 bg-primary/15 text-primary">AMRAP</Badge> : null}
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{targetText(next.target, row.trackingType)}</span>
        {inTransition && transition ? (
          <span className="shrink-0 text-[0.8125rem] text-primary">Geçiş {clockText(Math.ceil((transition.endsAt - now) / 1000))}</span>
        ) : running ? (
          <Button variant="ghost" className="-mr-2 h-11 shrink-0 px-3 text-muted-foreground" onClick={onCancelTimer}>
            Vazgeç
          </Button>
        ) : !frozen ? (
          <Button variant="ghost" className="-mr-2 h-11 shrink-0 gap-0.5 px-2.5 text-primary hover:text-primary" onClick={onSkip}>
            Hareketi geç
            <CaretRight data-icon="inline-end" weight="bold" />
          </Button>
        ) : null}
      </div>
      {weighted ? (
        <Stepper
          size="xl"
          value={kg ?? null}
          onValueChange={(changed) => {
            if (changed !== null && Number.isFinite(changed)) onChange({ kg: Math.min(SESSION_LIMITS.kg, Math.max(0, changed)) });
          }}
          min={0}
          max={SESSION_LIMITS.kg}
          step={grid ? 0.5 : 1}
          stepFn={grid ? (current, direction) => (direction === 1 ? grid.up(current ?? grid.min, 1) : grid.below(current ?? grid.min, current ?? grid.min)) : undefined}
          inputMode="decimal"
          unit="kg"
          invalid={ask}
          aria-label={`Ağırlık, ${row.title}`}
          decrementLabel="Ağırlığı azalt"
          incrementLabel="Ağırlığı artır"
        />
      ) : null}
      {running && timer ? (
        <TimerBox view={timer} target={next.target} />
      ) : (
        <Stepper
          size="xl"
          value={value}
          onValueChange={(changed) => {
            if (changed !== null && Number.isFinite(changed)) onChange({ value: Math.min(duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps, Math.max(0, Math.round(changed))) });
          }}
          min={0}
          max={duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps}
          step={duration ? SECONDS_STEP : 1}
          unit={duration ? 'sn' : 'tekrar'}
          aria-label={duration ? `Süre, ${row.title}` : next.target.amrap ? `Yaptığın tekrar, ${row.title}` : `Tekrar, ${row.title}`}
          decrementLabel={duration ? 'Süreyi azalt' : 'Tekrarı azalt'}
          incrementLabel={duration ? 'Süreyi artır' : 'Tekrarı artır'}
        />
      )}
      {ask ? (
        <div role="alert" className="flex min-h-11 items-center gap-2 text-sm text-destructive-text">
          <WarningCircle weight="fill" className="size-4.5 shrink-0" />
          <span className="min-w-0 flex-1">
            Hedefin çok üzerindesin · plan {formatKg(next.plannedKg)}
          </span>
          <Button variant="ghost" className="-mr-2 h-11 shrink-0 px-3" onClick={onResetKg}>
            Düzelt
          </Button>
        </div>
      ) : null}
      {duration && !frozen ? (
        running ? (
          <Button id="set-done" size="lg" className="h-14 w-full text-base" onClick={onStopTimer}>
            <Stop data-icon="inline-start" weight="fill" />
            Bitir
          </Button>
        ) : (
          <div className="grid grid-cols-[1fr_1.6fr] gap-2">
            <Button variant="secondary" size="lg" className="h-14 text-base" onClick={onStartTimer}>
              <Play data-icon="inline-start" weight="fill" />
              Başlat
            </Button>
            {doneButton}
          </div>
        )
      ) : (
        doneButton
      )}
    </div>
  );
}
