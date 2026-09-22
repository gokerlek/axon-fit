'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PushPin } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, type Equipment } from '@/lib/schemas/exercise';

/** Sunucuda hesaplanmış muadil satırı (kart yalnız gösterir ve sabitler). */
export type AlternativeRow = {
  id: string;
  title: string;
  equipment: Equipment;
  /** Hedef kasların özeti ("Kanat", "Göğüs"…). */
  muscles: string;
  /** Aynı hareket kalıbıysa kalıbın adı. */
  pattern: string | null;
  pinned: boolean;
};

const GROUP_LABELS: Record<Equipment, string> = { ...EQUIPMENT_LABELS, bodyweight: 'Ekipmansız' };

/**
 * Muadiller: alet doluysa, yoksa ya da danışana uygun değilse yerine yapılabilecekler.
 * PT'nin sabitledikleri en üstte; diğerleri ekipmana göre gruplu (ekipmansız önce).
 */
export function AlternativesCard({ exerciseId, rows }: { exerciseId: string; rows: AlternativeRow[] }) {
  const router = useRouter();
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
  const groups = new Map<Equipment, AlternativeRow[]>();
  for (const row of rows.filter((item) => !item.pinned)) {
    groups.set(row.equipment, [...(groups.get(row.equipment) ?? []), row]);
  }
  // Ekipmansız grup önce: alet yokken ilk bakılan yer. Diğerleri en iyi önerinin sırasıyla.
  const ordered = [...groups].sort(([a], [b]) => Number(b === 'bodyweight') - Number(a === 'bodyweight'));
  const sections: [string, AlternativeRow[]][] = [
    ...(pinned.length > 0 ? ([['Senin seçtiklerin', pinned]] as [string, AlternativeRow[]][]) : []),
    ...ordered.map(([equipment, items]) => [GROUP_LABELS[equipment], items] as [string, AlternativeRow[]]),
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
                        {row.pinned ? ` · ${EQUIPMENT_LABELS[row.equipment]}` : ''}
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
