'use client';

import { CheckCircle, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FlowItem } from '@/lib/workout-flow';

function titleOf(item: FlowItem): string {
  return item.members.map((member) => member.title).join(' + ');
}

/**
 * Bütün hareketler bitti (tasarım §2.7 a): bitirme sorusundaki "Devam et (set ya da hareket ekle)" buraya
 * döner. Yapılan her harekete "+ Set" (grupta "+ Tur": her üyeye bir set) ya da yeni hareket ("Hareket ekle",
 * kütüphane sheet'i). Fazladan set planın son setini tekrarlar ve `extra` yazılır: programı değiştirmez, iki
 * antrenman üst üste yapılırsa bitişte antrenöre set önerisi olur (§6.1). Bitirmek alttaki panelde.
 */
export function DonePanel({
  items,
  disabled,
  onAddSet,
  onAddExercise,
}: {
  /** Yapılan (geçilmemiş) birimler, yapılış sırasıyla. */
  items: readonly FlowItem[];
  disabled: boolean;
  onAddSet: (key: string) => void;
  onAddExercise: () => void;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CheckCircle weight="fill" className="mb-1 size-8 text-primary" aria-hidden />
        <CardTitle>Bütün hareketler bitti</CardTitle>
        <CardDescription>Bir harekete set eklemek ya da yeni hareket eklemek istersen buradan; bitirmek için alttaki düğme.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length > 0 ? (
          <ul className="flex flex-col">
            {items.map((item) => {
              const group = item.members.length > 1;
              const title = titleOf(item);
              return (
                <li key={item.key} className="flex min-h-13 items-center gap-2 border-t first:border-t-0">
                  <span className="flex min-w-0 flex-1 flex-col py-1.5">
                    <span className="truncate">{title}</span>
                    <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
                      {item.done}/{item.planned} set{item.kindLabel ? ` · ${item.kindLabel}` : ''}
                    </span>
                  </span>
                  <Button variant="outline" className="h-11 shrink-0 gap-1 px-3" disabled={disabled} aria-label={`${title}: ${group ? 'tur' : 'set'} ekle`} onClick={() => onAddSet(item.key)}>
                    <Plus data-icon="inline-start" weight="bold" />
                    {group ? 'Tur' : 'Set'}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <Button variant="outline" size="lg" className="h-12 w-full" disabled={disabled} onClick={onAddExercise}>
          <Plus data-icon="inline-start" weight="bold" />
          Hareket ekle
        </Button>
      </CardContent>
    </Card>
  );
}
