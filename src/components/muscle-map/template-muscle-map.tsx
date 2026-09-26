'use client';

import { formatNumber } from '@/lib/format';
import { BODY_MUSCLES, summarizeMuscles, type BodyMuscle, type MuscleIntensity } from '@/lib/muscles';
import { MUSCLE_LABELS, type Muscle } from '@/lib/schemas/exercise';
import { loadIntensity } from '@/lib/template-plan';
import { MuscleMap } from './muscle-map';

/** Açıklama listesinde varsayılan olarak en çok bu kadar kas; gerisi "+n kas daha". */
const LEGEND_LIMIT = 12;

/**
 * Şablon kas haritası: kas başına kesirli set toplamı (hedef 1, yardımcı 0,5,
 * dengeleyici 0,25). Ton şablonun en çok çalışan kasına göredir (boş kastan hedef rengine sürekli
 * açıklık rampası; en çok çalışan kas boş kastan ≥3:1). `full` altında
 * kas ve set listesi verir (`legendLimit` kasa kadar; antrenman özeti ilk 5'i); `compact` (liste kartı)
 * yalnız haritadır.
 */
export function TemplateMuscleMap({
  load,
  variant = 'full',
  bodyClassName,
  label,
  legendLimit = LEGEND_LIMIT,
}: {
  load: Partial<Record<Muscle, number>>;
  variant?: 'full' | 'compact';
  bodyClassName?: string;
  label?: string;
  legendLimit?: number;
}) {
  const intensity = loadIntensity(load as Record<string, number>) as MuscleIntensity;
  const worked = BODY_MUSCLES.filter((muscle) => (load[muscle] ?? 0) > 0).sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0));
  const shown = worked.slice(0, legendLimit);
  const cardio = load.cardio ?? 0;
  const mapLabel =
    label ??
    (worked.length > 0 ? `Şablonun kas yükü: ${summarizeMuscles(worked.slice(0, 6)).join(', ')}` : 'Şablonda sayılan kas yükü yok');

  // Ön ve arka yan yana. `full`: solda gövdeler, sağda liste; telefonda alt alta.
  return (
    <div className={variant === 'full' ? 'flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8' : 'flex flex-col items-center'}>
      <MuscleMap
        layout="split"
        tone="load"
        intensity={intensity}
        describe={(muscle: BodyMuscle) => `${MUSCLE_LABELS[muscle]} · ${formatNumber(load[muscle] ?? 0)} set`}
        bodyClassName={bodyClassName}
        label={mapLabel}
        className="shrink-0"
      />
      {variant === 'full' && (shown.length > 0 || cardio > 0) ? (
        <div className="flex w-full min-w-0 flex-col gap-2 text-sm">
          <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((muscle) => (
              <div key={muscle} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-muted-foreground">{MUSCLE_LABELS[muscle]}</dt>
                <dd className="tabular-nums">{formatNumber(load[muscle] ?? 0)}</dd>
              </div>
            ))}
            {cardio > 0 ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">Kardiyo</dt>
                <dd className="tabular-nums">{formatNumber(cardio)} set</dd>
              </div>
            ) : null}
          </dl>
          {worked.length > shown.length ? (
            <p className="text-muted-foreground">+{worked.length - shown.length} kas daha</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
