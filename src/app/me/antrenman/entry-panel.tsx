'use client';

import { Check, FlagCheckered } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { gridOf } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { cn } from '@/lib/utils';
import type { WorkoutRow } from '@/lib/workout-plan';
import { targetText, type NextSet } from '@/lib/workout-session';

/** Süreli harekette stepper adımı (sn). */
const SECONDS_STEP = 5;

/**
 * Alt giriş paneli (tasarım §2.4), yapışkan: başparmak bölgesinde. Üst satırda "Set 2/3 · Hedef 8–10",
 * altında 56 px'lik iki stepper (ağırlık cihazın ızgarasıyla bir sonraki/önceki ayar; tekrar ya da
 * saniye), en altta tek dokunuşluk "Set bitti". Kaydedilince düğme panel değişene kadar "Kaydedildi"
 * der ve değerler donar. Dokunuş kilidi paneli saran kapta (`WorkoutScreen`).
 */
export function EntryPanel({
  row,
  next,
  frozen,
  onChange,
  onDone,
  onFinish,
}: {
  row: WorkoutRow | null;
  /** Gösterilen set: sıradaki ya da (kaydedilirken) az önce kaydedilen. */
  next: NextSet | null;
  /** Az önce kaydedildi: panel değişene kadar değerler donar, düğme "Kaydedildi" der. */
  frozen: boolean;
  onChange: (values: { kg?: number | undefined; value?: number | undefined }) => void;
  onDone: () => void;
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

  return (
    <div className="flex flex-col gap-2">
      <p className="flex min-h-11 items-center gap-1.5 text-sm font-medium tabular-nums">
        <span>
          Set {next.position + 1}/{next.total}
        </span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="min-w-0 truncate text-muted-foreground">{targetText(next.target, row.trackingType)}</span>
      </p>
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
          aria-label={`Ağırlık, ${row.title}`}
          decrementLabel="Ağırlığı azalt"
          incrementLabel="Ağırlığı artır"
        />
      ) : null}
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
        aria-label={duration ? `Süre, ${row.title}` : `Tekrar, ${row.title}`}
        decrementLabel={duration ? 'Süreyi azalt' : 'Tekrarı azalt'}
        incrementLabel={duration ? 'Süreyi artır' : 'Tekrarı artır'}
      />
      <Button
        id="set-done"
        size="lg"
        aria-disabled={frozen || undefined}
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
        ) : (
          <>
            Set bitti
            <Check data-icon="inline-end" weight="bold" />
          </>
        )}
      </Button>
    </div>
  );
}
