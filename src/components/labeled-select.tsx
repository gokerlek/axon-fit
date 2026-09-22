'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';

type Option = { value: string; label: string };

/** Açılır liste: Base UI `items` ile seçili değerin Türkçe etiketini gösterir. */
export function LabeledSelect<T extends string>({
  id,
  value,
  labels,
  onChange,
  placeholder,
}: {
  id: string;
  value: T | undefined;
  labels: Record<T, string>;
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const items: Option[] = Object.entries(labels).map(([key, label]) => ({ value: key, label: label as string }));
  return (
    <Select items={items} value={value ?? null} onValueChange={(next) => next && onChange(next as T)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Gruplu açılır liste (ör. cihazlar türüne göre). Boş değer `''` ile seçilebilir. */
export function GroupedSelect({
  id,
  value,
  groups,
  onChange,
  empty,
}: {
  id: string;
  value: string | undefined;
  groups: { label: string; options: Option[] }[];
  onChange: (value: string) => void;
  /** Boş seçeneğin etiketi (ör. "Cihazsız"); verilmezse boş seçilemez. */
  empty?: string;
}) {
  const items: Option[] = [...(empty ? [{ value: '', label: empty }] : []), ...groups.flatMap((group) => group.options)];
  return (
    <Select items={items} value={value ?? ''} onValueChange={(next) => onChange(next ?? '')}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {empty ? <SelectItem value="">{empty}</SelectItem> : null}
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
