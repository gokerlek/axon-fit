'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { sheetStatus } from '@/lib/edit-messages';
import { DRAG } from '@/lib/motion';
import type { EditorDevice, PickerExercise } from '@/lib/template-edit';
import { ExercisePicker } from './exercise-picker';

/**
 * Sheet'in kipi: sona ekleme ya da bir grubun sonuna ekleme ("+ Gruba hareket ekle";
 * başlık açılıştaki adıyla: "Süperset 2'ye ekle").
 */
export type PickerState = { kind: 'add' } | { kind: 'addToGroup'; blockId: string; title: string };

type SheetProps = {
  /** Açık kip; `null` kapalı. */
  state: PickerState | null;
  onClose: () => void;
  exercises: readonly PickerExercise[];
  devices: ReadonlyMap<string, EditorDevice>;
  usage: ReadonlyMap<string, number>;
  title: string;
  description: string;
  /** Eklenemiyorsa nedeni ("Grup dolu (8)", "Şablon dolu…"): liste pasif, durum satırında yazar. */
  blocked: string | null;
  /** Eklemeden önceki durum satırı ("Eklenirse devre olur"). */
  hint: string;
  /** Dokunulan egzersizi ekler; durum satırının yeni cümlesi, eklenemezse `null`. */
  onPick: (exercise: PickerExercise) => string | null;
  /** Kapanınca odaklanılacak öğe (açan düğme). */
  finalFocus: () => HTMLElement | null;
  /** Kapanış animasyonu bitince. */
  onClosed: () => void;
};

/**
 * Hareket kütüphanesi sheet'i (SPEC §6): ≥sm sağdan, telefonda tam ekran. Dokunulan hareket
 * sona (ya da grubun sonuna) eklenir ve sheet açık kalır (durum satırında kısa onay). Esc,
 * dışarıya dokunma, Kapat ve "Bitti" kapatır; odak açan düğmeye döner. Editörde "Değiştir"
 * yok (sil + ekle); ExercisePicker'ın değiştirme kipi antrenmandaki "Muadil" için kalır.
 */
export function ExerciseSheet(props: SheetProps) {
  const { state, onClose, onClosed, finalFocus } = props;
  const wide = useMediaQuery('(min-width: 40rem)');
  const coarse = useMediaQuery('(pointer: coarse)');
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Kapanış animasyonu sürerken içerik son açık hâlden okunur (titremesin).
  const [last, setLast] = useState<PickerState | null>(null);
  if (state && last !== state) setLast(state);
  const shownState = state ?? last;

  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()} onOpenChangeComplete={(open) => !open && onClosed()}>
      <SheetContent
        ref={popupRef}
        side={wide ? 'right' : 'bottom'}
        // Dokunmatikte arama kutusuna odaklanılmaz (klavye açılmasın); popup odak alır.
        initialFocus={(type) => (coarse || type === 'touch' ? popupRef.current : searchRef.current)}
        finalFocus={() => finalFocus() ?? true}
        className="gap-0 p-0 data-[side=bottom]:top-0 data-[side=bottom]:h-dvh data-[side=bottom]:border-t-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {shownState ? <SheetBody key={shownState.kind === 'add' ? 'add' : shownState.blockId} {...props} searchRef={searchRef} /> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Sheet'in içi: her açılışta sıfırdan (arama, süzgeç ve onay durumu). */
function SheetBody({
  searchRef,
  exercises,
  devices,
  usage,
  title,
  description,
  blocked,
  hint,
  onPick,
}: SheetProps & { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const [status, setStatus] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    if (!justAdded) return;
    const timer = window.setTimeout(() => setJustAdded(null), DRAG.highlightMs);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  const pick = (exercise: PickerExercise) => {
    const message = onPick(exercise);
    if (message === null) return;
    setStatus(message);
    setJustAdded(exercise.id);
  };

  return (
    <>
      <SheetHeader className="border-b pr-14">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <ExercisePicker
        className="min-h-0 flex-1"
        exercises={exercises}
        devices={devices}
        usage={usage}
        mode="add"
        suggestFor={null}
        disabled={blocked !== null}
        justAdded={justAdded}
        searchRef={searchRef}
        onPick={pick}
      />
      <SheetFooter className="flex-row items-center gap-3 border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p role="status" aria-live="polite" className="min-w-0 flex-1 text-sm text-muted-foreground">
          {sheetStatus(blocked, status, hint)}
        </p>
        <SheetClose render={<Button type="button" className="touch:h-11" />}>Bitti</SheetClose>
      </SheetFooter>
    </>
  );
}
