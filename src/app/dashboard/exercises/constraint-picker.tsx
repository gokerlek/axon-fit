'use client';

import { X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CONDITION_REGIONS,
  CONDITIONS,
  conditionInfo,
  conditionLabel,
  parseCondition,
  type ClientCondition,
  type ConditionId,
  type ConditionQualifier,
  type ConditionRegion,
} from '@/lib/conditions';

/**
 * Kısıt seçici: "bu danışanda şu var" deyip listeyi ona göre görmek için.
 *
 * Danışan modülü gelene kadar seçim adres satırında durur (`?limit=…`); danışan
 * kaydı geldiğinde aynı bileşen onun kısıtlarıyla beslenir.
 */

const REGION_LABELS: Record<ConditionRegion, string> = {
  spine: 'Omurga',
  neck: 'Boyun',
  shoulder: 'Omuz',
  elbow: 'Dirsek',
  wrist: 'El bileği',
  hip: 'Kalça',
  knee: 'Diz',
  ankle: 'Ayak bileği',
  systemic: 'Genel',
};

const QUALIFIER_LABELS: Record<ConditionQualifier, string> = {
  acute: 'akut',
  reactive: 'reaktif',
  severe: 'şiddetli',
  stable: 'sakin dönem',
  controlled: 'kontrollü',
  uncontrolled: 'kontrolsüz',
  postop: 'ameliyat sonrası',
};

/** Adres satırındaki değer → kısıt listesi (bilinmeyen kimlik düşer). */
export function parseConstraints(value: string | null): ClientCondition[] {
  if (!value) return [];
  const seen = new Set<string>();
  return value
    .split(',')
    .flatMap((item) => {
      const parsed = parseCondition(item.trim());
      if (!parsed) return [];
      const key = `${parsed.id}:${parsed.qualifier ?? ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [parsed];
    })
    .slice(0, 12);
}

export function formatConstraints(list: readonly ClientCondition[]): string {
  return list.map((item) => (item.qualifier ? `${item.id}:${item.qualifier}` : item.id)).join(',');
}

/** Kısıt seçenekleri: her kimlik + (varsa) şiddet/faz varyantı, bölgeye göre gruplu. */
function groups() {
  return CONDITION_REGIONS.map((region) => ({
    label: REGION_LABELS[region],
    options: (Object.keys(CONDITIONS) as ConditionId[])
      .filter((id) => conditionInfo(id).region === region)
      .flatMap((id) => {
        const info = conditionInfo(id);
        return [
          { value: id, label: info.label },
          ...(info.qualifiers ?? []).map((qualifier) => ({
            value: `${id}:${qualifier}`,
            label: `${info.label} (${QUALIFIER_LABELS[qualifier]})`,
          })),
        ];
      }),
  })).filter((group) => group.options.length > 0);
}

/**
 * Kısıt ekleme seçicisi: her seçim bir kısıt ekler, seçici hep boş kalır. Yer tutucu seçenek
 * değildir (listede işaretli "Kısıt ekle" satırı çıkmaz); görünür etiket yoksa `label` adı olur.
 */
export function ConditionSelect({
  id,
  placeholder,
  label,
  onSelect,
}: {
  id: string;
  placeholder: string;
  /** Görünür etiketi olmayan seçicinin erişilebilir adı. */
  label?: string;
  onSelect: (value: string) => void;
}) {
  const options = groups();
  const items = options.flatMap((group) => group.options);
  return (
    <Select items={items} value={null} onValueChange={(next) => next && onSelect(next as string)}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((group) => (
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

export function ConstraintPicker({
  value,
  onChange,
}: {
  value: ClientCondition[];
  onChange: (next: ClientCondition[]) => void;
}) {
  const add = (raw: string) => {
    const parsed = parseCondition(raw);
    if (!parsed || value.length >= 12) return;
    if (value.some((item) => item.id === parsed.id && item.qualifier === parsed.qualifier)) return;
    onChange([...value, parsed]);
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Seçili kısıtlar">
          {value.map((condition) => {
            const key = `${condition.id}:${condition.qualifier ?? ''}`;
            return (
              <Button
                key={key}
                variant="secondary"
                size="xs"
                aria-label={`${conditionLabel(condition)} kısıtını kaldır`}
                onClick={() => onChange(value.filter((item) => `${item.id}:${item.qualifier ?? ''}` !== key))}>
                {conditionLabel(condition)}
                <X data-icon="inline-end" />
              </Button>
            );
          })}
        </div>
      ) : null}

      <ConditionSelect id="constraint" placeholder="Kısıt ekle" label="Kısıt ekle" onSelect={add} />
    </div>
  );
}
