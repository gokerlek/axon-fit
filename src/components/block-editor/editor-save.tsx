'use client';

import { createContext, useContext } from 'react';
import { Check } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Düzenleyicinin Kaydet'i (tasarım §6, PT kararı 15): sayfa formun kaydetme durumunu verir
 * (`EditorSaveProvider`), düğmeyi `BlockEditor` "Hareketler" başlığında [Seç]'in yanında çizer.
 * Formun altında satır, yüzen çubuk ve "Vazgeç" yok (geri dönüş sayfanın "‹" bağlantısında).
 */
export type EditorSaveState = {
  /** Kaydedilmemiş değişiklik var. */
  dirty: boolean;
  /** Kaydediliyor (ya da kaydedildi, sayfa değişiyor). */
  pending: boolean;
  /** Oluşturma sayfası: düğme hep görünür ("Şablonu oluştur"). */
  creating: boolean;
  /** "Kaydet", "Şablonu oluştur", "Programı oluştur". */
  submitLabel: string;
};

const EditorSaveContext = createContext<EditorSaveState | null>(null);

export function EditorSaveProvider({ value, children }: { value: EditorSaveState; children: React.ReactNode }) {
  return <EditorSaveContext.Provider value={value}>{children}</EditorSaveContext.Provider>;
}

/**
 * Geçersiz gönderimde ilk hataya kaydırır. Formisch ilk hatalı alana odaklanır, ama kapalı
 * karttaki (çizilmemiş) alanın öğesi yoktur: o zaman kartın yüzü (`data-invalid`) ya da
 * formdaki hata uyarısı (`data-form-error`) görünür yapılır.
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

/**
 * Formun submit düğmesi. Yalnız kaydedilecek değişiklik varken (oluşturma sayfasında hep)
 * görünür; kaydederken "Kaydediliyor…". Sayfa durum vermediyse hiç çizilmez.
 */
export function SaveButton() {
  const save = useContext(EditorSaveContext);
  if (!save || !(save.creating || save.dirty || save.pending)) return null;
  return (
    <Button type="submit" size="sm" disabled={save.pending} className="touch:h-11" onClick={(event) => revealFirstError(event.currentTarget.form)}>
      {save.pending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
      {save.pending ? (save.creating ? 'Oluşturuluyor…' : 'Kaydediliyor…') : save.submitLabel}
    </Button>
  );
}
