'use client';

import { X } from '@phosphor-icons/react';
import { GroupedSelect } from '@/components/labeled-select';
import { Button } from '@/components/ui/button';
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

      <GroupedSelect id="constraint" value="" groups={groups()} empty="Kısıt ekle" onChange={add} />
    </div>
  );
}
