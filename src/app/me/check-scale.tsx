'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Yoklamanın cevap düğmeleri (tasarım §2.2, §2.9) — antrenman başındaki sheet ve Bugün'ün antrenman
 * sonrası kartı ortak. Telefon: düğmeler en az 44 px, aralarında 8 px; seçili olan basılı (`aria-pressed`,
 * renk tek başına bilgi taşımaz: seçimin adı altta yazılır). Yeniden dokunmak seçimi kaldırır.
 */

/**
 * Sayı ölçeği: hazır oluşluk 1–5 (tek satır, 5 sütun), ağrı ve CR-10 0–10 (iki satır, 6 sütun: 375 px'te
 * 11 düğme tek satıra 44 px'le sığmaz). Uçların adı altta; seçilince seçimin adı (`describe`).
 */
export function ScaleField({
  id,
  label,
  hint,
  values,
  value,
  onChange,
  describe,
  ends,
  columns,
}: {
  id: string;
  label: string;
  hint?: string;
  values: readonly number[];
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Değerin adı: "4 · İyi"; düğmenin erişilebilir adı ve seçimin yankısı. */
  describe: (value: number) => string;
  /** Soldaki ve sağdaki ucun adı. */
  ends?: readonly [string, string];
  columns: 5 | 6;
}) {
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p id={`${id}-label`} className="text-[0.9375rem] font-medium">
          {label}
        </p>
        {hint ? <p className="text-[0.8125rem] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn('grid gap-2', columns === 5 ? 'grid-cols-5' : 'grid-cols-6')}>
        {values.map((item) => (
          <Button
            key={item}
            variant={value === item ? 'default' : 'secondary'}
            aria-pressed={value === item}
            aria-label={describe(item)}
            className="h-11 px-0 text-base font-semibold tabular-nums"
            onClick={() => onChange(value === item ? undefined : item)}>
            {item}
          </Button>
        ))}
      </div>
      <div className="flex min-h-5 items-start justify-between gap-3 text-[0.8125rem] text-muted-foreground">
        {value !== undefined ? (
          <span className="font-medium text-foreground">{describe(value)}</span>
        ) : ends ? (
          <>
            <span>{ends[0]}</span>
            <span className="text-right">{ends[1]}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Seçenek listesi: uzun adlar ("İdrar ya da dışkılamada değişiklik") tam genişlikte, alt alta; kısa ikili yan yana. */
export function ChoiceField<T extends string>({
  id,
  label,
  hint,
  choices,
  value,
  onChange,
  inline = false,
}: {
  id: string;
  label: string;
  hint?: string;
  choices: readonly (readonly [T, string])[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  /** İki kısa seçenek yan yana ("Evet, geçti" · "Hayır"). */
  inline?: boolean;
}) {
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p id={`${id}-label`} className="text-[0.9375rem] font-medium">
          {label}
        </p>
        {hint ? <p className="text-[0.8125rem] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn('grid gap-2', inline ? 'grid-cols-2' : 'grid-cols-1')}>
        {choices.map(([key, text]) => (
          <Button
            key={key}
            variant={value === key ? 'default' : 'secondary'}
            aria-pressed={value === key}
            className={cn('h-auto min-h-11 py-2 text-[0.9375rem] font-normal whitespace-normal', inline ? 'justify-center' : 'justify-start text-left')}
            onClick={() => onChange(value === key ? undefined : key)}>
            {text}
          </Button>
        ))}
      </div>
    </div>
  );
}
