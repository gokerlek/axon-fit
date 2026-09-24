'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCircle, LinkSimple, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * Düzenleyicinin form sonu (tasarım §6): şablon ve program günü düzenleyicisinde aynı.
 * Sayfanın formuna aittir (`<Form>`'un son çocuğu); Kaydet formun submit düğmesidir.
 *
 * - Normalde diğer formlardaki gibi düz bir satır: [Vazgeç] [Kaydet]. Yapışkan değil (PT kararı
 *   12); "+ Hareket ekle" listenin altındadır.
 * - Seçim modunda (`BlockEditor` bu bağlam üzerinden verir) yüzen seçim çubuğu: dock'un üstünde
 *   (`--dock-clearance`), sürüklerken ve dokunmatikte klavye açıkken çekilir.
 */

/** Seçim modunun çubuğu: durum satırı (pasif düğmenin nedeni dahil) ve toplu işlemler. */
export type SelectionBarState = {
  count: number;
  /** Durum satırı (ör. "2 seçili · süperset olur"); pasif düğmenin nedeni burada yazar. */
  status: string;
  canGroup: boolean;
  canRemove: boolean;
  onGroup: () => void;
  onRemove: () => void;
  onCancel: () => void;
};

/** Düzenleyicinin çubuğa verdiği: (seçim modunda) seçim çubuğu. */
export type EditorBarRegistration = {
  selection: SelectionBarState | null;
};

type BarControl = {
  register: (registration: EditorBarRegistration | null) => void;
};

const BarControlContext = createContext<BarControl | null>(null);
const BarStateContext = createContext<EditorBarRegistration | null>(null);

/** Formun çevresinde: düzenleyici kaydolur, çubuk okur. */
export function EditorBarProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = useState<EditorBarRegistration | null>(null);
  const control = useMemo<BarControl>(() => ({ register: setRegistration }), []);
  return (
    <BarControlContext.Provider value={control}>
      <BarStateContext.Provider value={registration}>{children}</BarStateContext.Provider>
    </BarControlContext.Provider>
  );
}

/**
 * Düzenleyici çubuğa kaydolur (her çizimde güncel hâl; düzenleyici çubuğun hâline abone
 * olmaz, döngü olmaz), ayrılınca kaydı siler.
 */
export function useEditorBar(registration: EditorBarRegistration): void {
  const control = useContext(BarControlContext);
  // Boyamadan önce: çubuk kartlarla aynı karede güncellenir (seçim sayısı gecikmesin).
  useLayoutEffect(() => {
    control?.register(registration);
  });
  // Kayıt silme de yerleşim evresinde: gün değişince eski düzenleyicinin temizliği (mutasyon
  // evresi) yenisinin kaydından önce koşar; pasif temizlik yeni kaydı sonradan silerdi.
  useLayoutEffect(() => () => control?.register(null), [control]);
}

const TYPING_TYPES = new Set(['text', 'search', 'email', 'number', 'tel', 'url', 'password']);

/** Dokunmatikte bir metin ya da sayı alanı odakta mı (ekran klavyesi açık; seçim çubuğu çekilir). */
function useSoftKeyboard(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => {
      const element = document.activeElement;
      const typing =
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLInputElement && TYPING_TYPES.has(element.type)) ||
        (element instanceof HTMLElement && element.isContentEditable);
      setOpen(coarse.matches && typing);
    };
    // Odak kutudan kutuya geçerken çubuk titremesin: odak yerleştikten sonra bakılır.
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 0);
    };
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, []);
  return open;
}

/**
 * Geçersiz gönderimde ilk hataya kaydırır. Formisch ilk hatalı alana odaklanır, ama kapalı
 * karttaki (çizilmemiş) alanın öğesi yoktur: o zaman kartın yüzü (`data-invalid`) ya da
 * formun sonundaki hata uyarısı (`data-form-error`) görünür yapılır.
 */
function revealFirstError(form: HTMLFormElement | null) {
  if (!form) return;
  window.setTimeout(() => {
    const first = form.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid]:not([data-slot=field]), [data-form-error]');
    if (!first) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    if (!form.contains(document.activeElement) || document.activeElement === document.body) first.focus({ preventScroll: true });
  }, 120);
}

const BAR_BUTTON = 'h-11 md:h-9 touch:h-11';

function SelectionBar({ selection }: { selection: SelectionBarState }) {
  const act = (enabled: boolean, run: () => void) => () => {
    if (enabled) run();
  };
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div className="flex items-center gap-2 md:contents">
        <p role="status" aria-live="polite" className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground md:pl-2">
          {selection.status}
        </p>
        <Button type="button" variant="ghost" className={BAR_BUTTON} onClick={selection.onCancel}>
          Vazgeç
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button
          type="button"
          aria-disabled={!selection.canGroup || undefined}
          className={cn(BAR_BUTTON, 'aria-disabled:cursor-default aria-disabled:opacity-50')}
          onClick={act(selection.canGroup, selection.onGroup)}>
          <LinkSimple data-icon="inline-start" />
          Grupla ({selection.count})
        </Button>
        <Button
          type="button"
          variant="destructive"
          aria-disabled={!selection.canRemove || undefined}
          className={cn(BAR_BUTTON, 'aria-disabled:cursor-default aria-disabled:opacity-50')}
          onClick={act(selection.canRemove, selection.onRemove)}>
          <Trash data-icon="inline-start" />
          Sil
        </Button>
      </div>
    </div>
  );
}

/**
 * Form sonu. Normalde [Vazgeç] · [Kaydet]; seçim modunda yüzen seçim çubuğu. Kaydet: değişiklik
 * varsa "Kaydet", yoksa (düzenlemede) "Kaydedildi" ve pasif, kaydederken "Kaydediliyor…";
 * oluşturma sayfasında hep etkin ("Şablonu oluştur").
 */
export function EditorBar({
  cancelHref,
  submitLabel = 'Kaydet',
  creating = false,
  dirty,
  pending,
}: {
  cancelHref: string;
  /** Oluşturma sayfasında "Şablonu oluştur" / "Programı oluştur". */
  submitLabel?: string;
  creating?: boolean;
  dirty: boolean;
  pending: boolean;
}) {
  const state = useContext(BarStateContext);
  const keyboard = useSoftKeyboard();
  const selection = state?.selection ?? null;
  const saved = !creating && !dirty && !pending;

  if (selection) {
    return (
      <div
        data-slot="editor-bar"
        data-reorder-hide
        data-keyboard={keyboard || undefined}
        className={cn(
          'sticky bottom-(--dock-clearance) z-20 rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-xl supports-backdrop-filter:bg-background/85',
          'data-keyboard:pointer-events-none data-keyboard:invisible',
        )}>
        <SelectionBar selection={selection} />
      </div>
    );
  }

  return (
    <div data-slot="editor-footer" className="flex justify-end gap-2 border-t pt-4">
      <Button variant="outline" nativeButton={false} render={<Link href={cancelHref} />}>
        Vazgeç
      </Button>
      <Button type="submit" disabled={pending || saved} onClick={(event) => revealFirstError(event.currentTarget.form)}>
        {pending ? <Spinner data-icon="inline-start" /> : saved ? <CheckCircle data-icon="inline-start" /> : <Check data-icon="inline-start" />}
        {pending ? (creating ? 'Oluşturuluyor…' : 'Kaydediliyor…') : saved ? 'Kaydedildi' : submitLabel}
      </Button>
    </div>
  );
}
