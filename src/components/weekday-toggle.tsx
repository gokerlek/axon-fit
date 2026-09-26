'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { normalizeWeekdays, WEEKDAY_NAMES, WEEKDAY_SHORT, WEEKDAYS, type Weekday } from '@/lib/training-days';

/**
 * Haftanın yedi günü, çoklu seçim (tasarım §2.11): PT'nin program düzenleyicisinde ve danışanın
 * "Günlerini değiştir" sheet'inde aynı parça. Her gün 44 px (375 px'te yedisi yan yana sığar); basılı
 * gün dolu ve halkalı (`toggle.tsx`), ekran okuyucu günün tam adını duyar. Değer pazartesiden sıralı.
 */
export function WeekdayToggle({
  value,
  onChange,
  label,
  id,
  disabled,
  invalid,
  className,
}: {
  value: readonly number[];
  onChange: (weekdays: Weekday[]) => void;
  /** Grubun erişilebilir adı (görünen etiket yoksa). */
  label?: string;
  /** Görünen etiketin `id`'si (`aria-labelledby`). */
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      multiple
      variant="outline"
      spacing={1}
      disabled={disabled}
      {...(id ? { 'aria-labelledby': id } : { 'aria-label': label ?? 'Antrenman günleri' })}
      aria-invalid={invalid || undefined}
      value={normalizeWeekdays(value).map(String)}
      onValueChange={(next) => onChange(normalizeWeekdays(next.map(Number)))}
      className={cn('grid w-full grid-cols-7', className)}>
      {WEEKDAYS.map((day) => (
        <ToggleGroupItem key={day} value={String(day)} aria-label={WEEKDAY_NAMES[day]} className="h-11 min-w-0 px-0 text-sm">
          {WEEKDAY_SHORT[day]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
