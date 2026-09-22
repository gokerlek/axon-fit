'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PushPin } from '@phosphor-icons/react';
import { GroupedSelect } from '@/components/labeled-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, type Equipment } from '@/lib/schemas/exercise';

/** Sunucuda hesaplanmış muadil satırı (kart yalnız gösterir ve sabitler). */
export type AlternativeRow = {
  id: string;
  title: string;
  equipment: Equipment;
  /** Hareketin yapıldığı cihazın adı; varsa grup bu olur. */
  device: string | null;
  /** Hedef kasların özeti ("Kanat", "Göğüs"…). */
  muscles: string;
  /** Aynı hareket kalıbıysa kalıbın adı. */
  pattern: string | null;
  pinned: boolean;
};

const GROUP_LABELS: Record<Equipment, string> = { ...EQUIPMENT_LABELS, bodyweight: 'Ekipmansız' };

/** Cihaz değişirse geçilecek egzersiz (sunucuda hesaplanır). */
export type DeviceSwap = {
  deviceId: string;
  deviceName: string;
  kindLabel: string;
  exercise: { id: string; title: string } | null;
};

/** Satırın grubu: cihazı varsa cihaz, yoksa ekipman; ekipmansızlar "Ekipmansız". */
function groupOf(row: AlternativeRow): string {
  return row.device ?? GROUP_LABELS[row.equipment];
}

/**
 * Muadiller: alet doluysa, yoksa ya da danışana uygun değilse yerine yapılabilecekler.
 * PT'nin sabitledikleri en üstte; diğerleri ekipmana göre gruplu (ekipmansız önce).
 */
export function AlternativesCard({
  exerciseId,
  rows,
  swaps,
}: {
  exerciseId: string;
  rows: AlternativeRow[];
  swaps: DeviceSwap[];
}) {
  const router = useRouter();
  const [swapDevice, setSwapDevice] = useState('');
  const swap = swaps.find((item) => item.deviceId === swapDevice);
  const swapGroups = [...new Set(swaps.map((item) => item.kindLabel))].map((label) => ({
    label,
    options: swaps.filter((item) => item.kindLabel === label).map((item) => ({ value: item.deviceId, label: item.deviceName })),
  }));
  const pinnedIds = rows.filter((row) => row.pinned).map((row) => row.id);

  const save = useServiceMutation({
    fn: (alternatives: string[]) =>
      fetchJson<{ alternatives: string[] }>(`/api/exercises/${exerciseId}/alternatives`, {
        method: 'PUT',
        body: JSON.stringify({ alternatives }),
      }),
    invalidate: [['exercises']],
    notify: { success: 'Muadiller güncellendi.' },
    onSuccess: () => router.refresh(),
  });

  const toggle = (id: string) =>
    save.mutate(pinnedIds.includes(id) ? pinnedIds.filter((item) => item !== id) : [...pinnedIds, id]);

  const pinned = rows.filter((row) => row.pinned);
  const groups = new Map<string, AlternativeRow[]>();
  for (const row of rows.filter((item) => !item.pinned)) {
    groups.set(groupOf(row), [...(groups.get(groupOf(row)) ?? []), row]);
  }
  // Ekipmansız hareketler önce: alet yokken ilk bakılan yer. Diğerleri en iyi önerinin sırasıyla.
  const isBodyweight = (items: AlternativeRow[]) => items.some((item) => item.equipment === 'bodyweight' && !item.device);
  const ordered = [...groups].sort(([, a], [, b]) => Number(isBodyweight(b)) - Number(isBodyweight(a)));
  const sections: [string, AlternativeRow[]][] = [
    ...(pinned.length > 0 ? ([['Senin seçtiklerin', pinned]] as [string, AlternativeRow[]][]) : []),
    ...ordered,
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Muadiller</CardTitle>
        <CardDescription>
          Alet doluysa ya da yoksa yerine yapılabilecekler. İğneyle sabitlediğin en üstte çıkar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {swaps.length > 0 ? (
          <Field>
            <FieldLabel htmlFor="swap-device">Cihaz değişirse</FieldLabel>
            <GroupedSelect id="swap-device" value={swapDevice} groups={swapGroups} empty="Cihaz seç" onChange={setSwapDevice} />
            {swap ? (
              <FieldDescription>
                {swap.exercise ? (
                  <>
                    {swap.deviceName} ile:{' '}
                    <Link href={`/dashboard/exercises/${swap.exercise.id}`} className="font-medium text-foreground underline underline-offset-4">
                      {swap.exercise.title}
                    </Link>
                  </>
                ) : (
                  `${swap.deviceName} ile aynı kasları çalıştıran bir egzersiz yok.`
                )}
              </FieldDescription>
            ) : (
              <FieldDescription>Şablonda satırın cihazı değişince egzersiz buna göre değişir.</FieldDescription>
            )}
          </Field>
        ) : null}
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aynı kasları çalıştıran başka hareket bulunamadı.</p>
        ) : (
          sections.map(([label, items]) => (
            <section key={label} className="flex flex-col gap-2" aria-label={label}>
              <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
              <ItemGroup className="gap-2">
                {items.map((row) => (
                  <Item key={row.id} variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle>
                        <Link href={`/dashboard/exercises/${row.id}`} className="hover:underline">
                          {row.title}
                        </Link>
                      </ItemTitle>
                      <ItemDescription>
                        {row.muscles}
                        {row.pinned ? ` · ${row.device ?? EQUIPMENT_LABELS[row.equipment]}` : ''}
                        {row.pattern ? ` · ${row.pattern}` : ''}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant={row.pinned ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        aria-pressed={row.pinned}
                        aria-label={row.pinned ? `${row.title} sabitlemesini kaldır` : `${row.title} muadil olarak sabitle`}
                        disabled={save.isPending}
                        onClick={() => toggle(row.id)}>
                        <PushPin weight={row.pinned ? 'fill' : 'regular'} />
                      </Button>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
