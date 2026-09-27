'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CopySimple, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { OWN_PROGRAM_LIMITS } from '@/lib/own-programs';

const BOTTOM = 'gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))]';

/**
 * Antrenörünün programında günün altındaki "Kendi programına kopyala" (`docs/design/kendi-program.md` §2.2): sheet
 * "Yeni programa" ya da var olan programlar (7 günü dolu olan pasif). Kopya anlık görüntüdür; var olan programa
 * kopyalamak o programın düzenleyicisini günü eklenmiş olarak açar (kaydetmek danışanın işi).
 */
export function CopyDaySheet({
  dayId,
  dayName,
  programs,
  canCreate,
}: {
  dayId: string;
  dayName: string;
  programs: { id: string; name: string; days: number }[];
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const query = `gunler=${encodeURIComponent(dayId)}`;
  return (
    <>
      <Button variant="ghost" className="-ml-2 h-11 px-2" onClick={() => setOpen(true)}>
        <CopySimple data-icon="inline-start" />
        Kendi programına kopyala
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className={BOTTOM}>
          <SheetHeader className="gap-1.5 pt-5">
            <SheetTitle className="text-lg font-semibold">{dayName} nereye kopyalansın?</SheetTitle>
            <SheetDescription>Kopya o anki hâliyle alınır; antrenörün günü sonra değiştirse de kopyan değişmez.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
            {canCreate ? (
              <Item variant="outline" className="touch:min-h-11" render={<Link href={`/me/programlar/yeni?${query}`} onClick={() => setOpen(false)} />}>
                <ItemMedia variant="icon">
                  <Plus />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Yeni programa</ItemTitle>
                </ItemContent>
              </Item>
            ) : (
              <p className="text-sm text-muted-foreground">En fazla {OWN_PROGRAM_LIMITS.programs} program; yenisi için birini sil.</p>
            )}
            {programs.map((program) => {
              const full = program.days >= OWN_PROGRAM_LIMITS.days;
              return full ? (
                <Item key={program.id} variant="outline" className="opacity-60" aria-disabled>
                  <ItemContent>
                    <ItemTitle className="break-words">{program.name}</ItemTitle>
                    <ItemDescription>{OWN_PROGRAM_LIMITS.days} gün dolu</ItemDescription>
                  </ItemContent>
                </Item>
              ) : (
                <Item
                  key={program.id}
                  variant="outline"
                  className="touch:min-h-11"
                  render={<Link href={`/me/programlar/${program.id}/duzenle?${query}`} onClick={() => setOpen(false)} />}>
                  <ItemContent>
                    <ItemTitle className="break-words">{program.name}</ItemTitle>
                    <ItemDescription className="tabular-nums">{program.days} gün</ItemDescription>
                  </ItemContent>
                </Item>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
