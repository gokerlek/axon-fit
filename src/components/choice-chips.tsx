'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/**
 * Çip seçimi (kısıt formu, danışanın bildirim sheet'i, tarama girişi): `ToggleGroup` üzerinde tek ya da çoklu
 * seçim. Tekli seçimde basılı çipe yeniden dokunmak seçimi kaldırır (`undefined`). Dokunma hedefi 44 px.
 */
export function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  disabled,
  invalid,
  className,
  itemClassName,
}: {
  value: T | undefined;
  options: readonly { value: T; label: React.ReactNode; description?: string }[];
  onChange: (value: T | undefined) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <ToggleGroup
      variant="outline"
      spacing={1}
      disabled={disabled}
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label })}
      aria-invalid={invalid || undefined}
      value={value ? [value] : []}
      onValueChange={(next) => onChange((next[0] as T | undefined) ?? undefined)}
      className={cn('flex w-full flex-wrap', className)}>
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} title={option.description} className={cn('h-11 px-3 text-sm touch:h-11', itemClassName)}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function MultiChips<T extends string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  disabled,
  className,
  itemClassName,
}: {
  value: readonly T[];
  options: readonly { value: T; label: React.ReactNode; description?: string }[];
  onChange: (value: T[]) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <ToggleGroup
      multiple
      variant="outline"
      spacing={1}
      disabled={disabled}
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label })}
      value={[...value]}
      onValueChange={(next) => onChange(options.map((option) => option.value).filter((item) => next.includes(item)))}
      className={cn('flex w-full flex-wrap', className)}>
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} title={option.description} className={cn('h-11 px-3 text-sm touch:h-11', itemClassName)}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
