'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PersonSimpleTaiChi, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { EditorCare } from '@/lib/constraint-filter';
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
  /** Programda danışanın kısıtları (`kisit-tarama.md` §3.2); şablonda yok. */
  care?: EditorCare | null;
  /** "Yine de ekle" izni kaydedildi. */
  onAllowed?: (exerciseId: string) => void;
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

/**
 * Sheet'in üst satırları (tasarım `kisit-tarama.md` §3.2, §4.6): danışanın kısıtları, bakılmamış "şiddetli"si, karar
 * bekleyen bildirimi ve taramanın açık ağrısı; kısıt onayı yoksa yalnız durum (veri değil).
 */
function CareLines({ care }: { care: EditorCare }) {
  const severe = care.severe ?? [];
  const pain = care.screeningPain ?? [];
  if (care.unavailable && pain.length === 0) return <p className="text-sm text-muted-foreground">{care.unavailable}</p>;
  if (care.summary.length === 0 && care.pending.length === 0 && pain.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {care.unavailable ? <p className="text-muted-foreground">{care.unavailable}</p> : null}
      {severe.length > 0 ? (
        <p className="flex items-start gap-1.5">
          <WarningCircle weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            <span className="sr-only">Acil: </span>
            Danışan şiddetli dedi: {severe.join(' · ')} · sen bakana kadar bölgeyi çalıştıran hareketler dikkat alıyor
          </span>
        </p>
      ) : null}
      {care.summary.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>Kısıtlar: {care.summary.join(' · ')}</span>
          <Link href={`/dashboard/clients/${care.clientId}/constraints`} className="text-muted-foreground underline-offset-4 hover:underline">
            Kısıtlar ›
          </Link>
        </p>
      ) : null}
      {care.pending.length > 0 ? (
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-primary-text" />
          Danışan bildirdi: {care.pending.join(' · ')} · karar bekliyor
        </p>
      ) : null}
      {pain.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
          <span className="flex items-start gap-1.5">
            <PersonSimpleTaiChi weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-text" />
            Taramada ağrı: {pain.join(' · ')} · kalıbındaki hareketler dikkat alıyor, yasak değil
          </span>
          <Link href={`/dashboard/clients/${care.clientId}/screening`} className="underline-offset-4 hover:underline">
            Tarama ›
          </Link>
        </p>
      ) : null}
    </div>
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
  care = null,
  onAllowed,
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
        {care ? <CareLines care={care} /> : null}
      </SheetHeader>
      <ExercisePicker
        care={care}
        {...(onAllowed ? { onAllowed } : {})}
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
