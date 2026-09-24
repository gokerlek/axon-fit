'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { EditorDevice, PickerExercise } from '@/lib/template-edit';
import { ExercisePicker, type ReplaceTarget } from './exercise-picker';

/** Sheet'in kipi: sona ekleme ya da bir satırın hareketini değiştirme. */
export type PickerState = { kind: 'add' } | { kind: 'replace'; rowId: string };

type SheetProps = {
  /** Açık kip; `null` kapalı. */
  state: PickerState | null;
  onClose: () => void;
  exercises: readonly PickerExercise[];
  devices: ReadonlyMap<string, EditorDevice>;
  usage: ReadonlyMap<string, number>;
  canAdd: boolean;
  replacing: ReplaceTarget | null;
  addDescription: string;
  /** Egzersizi sona ekler: eklenen satırın sırası; eklenemezse `null`. */
  onAdd: (exercise: PickerExercise) => number | null;
  onReplace: (exercise: PickerExercise) => void;
  /** Kapanınca odaklanılacak öğe (açan düğme ya da satırın menüsü). */
  finalFocus: () => HTMLElement | null;
  /** Kapanış animasyonu bitince. */
  onClosed: () => void;
};

const FULL_MESSAGE = 'Şablon dolu: en fazla 40 hareket ve 30 blok olur.';

/**
 * Hareket kütüphanesi sheet'i (SPEC §6): ≥sm sağdan, telefonda tam ekran. Ekleme kipinde
 * dokunulan hareket sona eklenir ve sheet açık kalır (kısa onayla); değiştirme kipinde seçim
 * satırın hareketini değiştirir ve sheet kapanır. Esc, dışarıya dokunma, Kapat ve "Bitti"
 * kapatır; odak açan düğmeye döner.
 */
export function ExerciseSheet(props: SheetProps) {
  const { state, onClose, onClosed, finalFocus } = props;
  const wide = useMediaQuery('(min-width: 40rem)');
  const coarse = useMediaQuery('(pointer: coarse)');
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Kapanış animasyonu sürerken başlık ve kip son açık hâlden okunur (titremesin).
  const [last, setLast] = useState<{ state: PickerState; replacing: ReplaceTarget | null } | null>(null);
  if (state && (last?.state !== state || last.replacing !== props.replacing)) setLast({ state, replacing: props.replacing });
  const shownState = state ?? last?.state ?? null;
  const replacing = state ? props.replacing : (last?.replacing ?? null);

  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()} onOpenChangeComplete={(open) => !open && onClosed()}>
      <SheetContent
        ref={popupRef}
        side={wide ? 'right' : 'bottom'}
        // Dokunmatikte arama kutusuna odaklanılmaz (klavye açılmasın); popup odak alır.
        initialFocus={(type) => (coarse || type === 'touch' ? popupRef.current : searchRef.current)}
        finalFocus={() => finalFocus() ?? true}
        className="gap-0 p-0 data-[side=bottom]:top-0 data-[side=bottom]:h-dvh data-[side=bottom]:border-t-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {shownState ? <SheetBody {...props} mode={shownState.kind} replacing={replacing} searchRef={searchRef} /> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Sheet'in içi: her açılışta sıfırdan (arama, süzgeç ve onay durumu). */
function SheetBody({
  mode,
  replacing,
  searchRef,
  exercises,
  devices,
  usage,
  canAdd,
  addDescription,
  onAdd,
  onReplace,
}: SheetProps & { mode: 'add' | 'replace'; searchRef: React.RefObject<HTMLInputElement | null> }) {
  const [status, setStatus] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const add = mode === 'add';

  useEffect(() => {
    if (!justAdded) return;
    const timer = window.setTimeout(() => setJustAdded(null), 1200);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  const pick = (exercise: PickerExercise) => {
    if (!add) {
      onReplace(exercise);
      return;
    }
    const position = onAdd(exercise);
    if (position === null) {
      setStatus(FULL_MESSAGE);
      return;
    }
    setStatus(`${exercise.title} eklendi (${position}. sıra)`);
    setJustAdded(exercise.id);
  };

  return (
    <>
      <SheetHeader className="border-b pr-14">
        <SheetTitle>{add ? 'Hareket ekle' : 'Hareketi değiştir'}</SheetTitle>
        <SheetDescription>
          {add ? addDescription : replacing ? `${replacing.label} · ${replacing.title} yerine seçiyorsun.` : null}
        </SheetDescription>
      </SheetHeader>
      <ExercisePicker
        className="min-h-0 flex-1"
        exercises={exercises}
        devices={devices}
        usage={usage}
        mode={mode}
        suggestFor={replacing?.exerciseId ?? null}
        disabled={!canAdd}
        justAdded={justAdded}
        searchRef={searchRef}
        onPick={pick}
      />
      <SheetFooter className="flex-row items-center gap-3 border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {add && !canAdd ? FULL_MESSAGE : status}
        </p>
        <SheetClose render={<Button type="button" variant={add ? 'default' : 'outline'} className="touch:h-11" />}>
          {add ? 'Bitti' : 'Vazgeç'}
        </SheetClose>
      </SheetFooter>
    </>
  );
}
