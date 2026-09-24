'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCircle, Copy, LinkSimple, Plus, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * Düzenleyicinin yapışkan alt çubuğu (tasarım §6): şablon ve program günü düzenleyicisinde
 * aynı. Sayfanın formuna aittir (`<Form>`'un son çocuğu); Kaydet formun submit düğmesidir.
 * "+ Hareket ekle" ve seçim modunun içeriğini `BlockEditor` bu bağlam üzerinden verir.
 *
 * - Telefonda (< md) dock bu sayfalarda gizli: çubuk ekranın altında, tam genişlik, güvenli
 *   alan payıyla. Bir metin ya da sayı alanı odaktayken (dokunmatikte klavye açık) çekilir.
 * - Masaüstünde içerik sütununun altında, dock'un üstünde (`--dock-clearance`).
 * - Sürüklerken çekilir (`data-reorder-hide`).
 */

/** Seçim modunun çubuğu: durum satırı (pasif düğmenin nedeni dahil) ve toplu işlemler. */
export type SelectionBarState = {
  count: number;
  /** Durum satırı (ör. "2 seçili · süperset olur"); pasif düğmenin nedeni burada yazar. */
  status: string;
  canGroup: boolean;
  canCopy: boolean;
  canRemove: boolean;
  onGroup: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onCancel: () => void;
};

/** Düzenleyicinin çubuğa verdiği: ekleme düğmesi ve (seçim modunda) seçim çubuğu. */
export type EditorBarRegistration = {
  /** "+ Hareket ekle" düğmesinin erişilebilir adı ("Hareket ekle: Gün A"). */
  addLabel: string;
  onAdd: (event: React.MouseEvent<HTMLElement>) => void;
  selection: SelectionBarState | null;
};

type BarControl = {
  register: (registration: EditorBarRegistration | null) => void;
  /** Çubuktaki "+ Hareket ekle" (odak dönüşleri: sheet kapanınca, liste boşalınca). */
  addButton: React.RefObject<HTMLButtonElement | null>;
};

const BarControlContext = createContext<BarControl | null>(null);
const BarStateContext = createContext<EditorBarRegistration | null>(null);

/** Formun çevresinde: düzenleyici kaydolur, çubuk okur. */
export function EditorBarProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = useState<EditorBarRegistration | null>(null);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const control = useMemo<BarControl>(() => ({ register: setRegistration, addButton }), []);
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
  useEffect(() => () => control?.register(null), [control]);
}

const NO_BUTTON = () => null;

/** Çubuktaki "+ Hareket ekle"yi olay anında veren sabit fonksiyon (çubuk yoksa hep `null`). */
export function useEditorBarAddButton(): () => HTMLButtonElement | null {
  const control = useContext(BarControlContext);
  return useMemo(() => (control ? () => control.addButton.current : NO_BUTTON), [control]);
}

const TYPING_TYPES = new Set(['text', 'search', 'email', 'number', 'tel', 'url', 'password']);

/** Dokunmatikte bir metin ya da sayı alanı odakta mı (ekran klavyesi açık). */
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
      <div className="grid grid-cols-3 gap-2 md:flex">
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
          variant="outline"
          aria-disabled={!selection.canCopy || undefined}
          className={cn(BAR_BUTTON, 'aria-disabled:cursor-default aria-disabled:opacity-50')}
          onClick={act(selection.canCopy, selection.onCopy)}>
          <Copy data-icon="inline-start" />
          Kopyala
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
 * Alt çubuk. Normalde [+ Hareket ekle] · [Vazgeç] (md ve üstü) · [Kaydet]; seçim modunda
 * seçim çubuğu. Kaydet: değişiklik varsa "Kaydet", yoksa (düzenlemede) "Kaydedildi" ve pasif,
 * kaydederken "Kaydediliyor…"; oluşturma sayfasında hep etkin ("Şablonu oluştur").
 */
export function EditorBar({
  cancelHref,
  submitLabel = 'Kaydet',
  creating = false,
  dirty,
  pending,
}: {
  /** Masaüstündeki "Vazgeç" (telefonda sayfa yolu yeter). */
  cancelHref: string;
  /** Oluşturma sayfasında "Şablonu oluştur" / "Programı oluştur". */
  submitLabel?: string;
  creating?: boolean;
  dirty: boolean;
  pending: boolean;
}) {
  const state = useContext(BarStateContext);
  const control = useContext(BarControlContext);
  const keyboard = useSoftKeyboard();
  const selection = state?.selection ?? null;
  const saved = !creating && !dirty && !pending;

  return (
    <div
      data-slot="editor-bar"
      data-reorder-hide
      data-keyboard={keyboard || undefined}
      className={cn(
        'sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl supports-backdrop-filter:bg-background/85',
        'md:bottom-(--dock-clearance) md:mx-0 md:rounded-2xl md:border md:p-2 md:shadow-xl',
        'data-keyboard:pointer-events-none data-keyboard:invisible',
      )}>
      {selection ? (
        <SelectionBar selection={selection} />
      ) : (
        <div className="flex items-center gap-2">
          {state ? (
            <Button
              ref={control?.addButton}
              type="button"
              variant="outline"
              aria-haspopup="dialog"
              aria-label={state.addLabel}
              className={cn(BAR_BUTTON, 'flex-1 md:flex-none')}
              onClick={state.onAdd}>
              <Plus data-icon="inline-start" />
              Hareket ekle
            </Button>
          ) : null}
          <span className="hidden flex-1 md:block" />
          <Button variant="outline" className="hidden h-9 md:inline-flex" nativeButton={false} render={<Link href={cancelHref} />}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            disabled={pending || saved}
            className={cn(BAR_BUTTON, 'flex-1 md:flex-none')}
            onClick={(event) => revealFirstError(event.currentTarget.form)}>
            {pending ? <Spinner data-icon="inline-start" /> : saved ? <CheckCircle data-icon="inline-start" /> : <Check data-icon="inline-start" />}
            {pending ? (creating ? 'Oluşturuluyor…' : 'Kaydediliyor…') : saved ? 'Kaydedildi' : submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
