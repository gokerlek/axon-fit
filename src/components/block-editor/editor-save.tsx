'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DURATION, EASE, tween } from '@/lib/motion';
import { floatingSaveShown } from './editor-signals';

/**
 * Düzenleyicinin Kaydet'i (tasarım §6, PT kararları 15 ve 17): sayfa formun kaydetme durumunu verir
 * (`EditorSaveProvider`), düğmeyi `BlockEditor` "Hareketler" başlığında [Seç]'in yanında çizer.
 * Formun altında satır ve "Vazgeç" yok (geri dönüş sayfanın "‹" bağlantısında). Karar 17: kaydedilmemiş
 * değişiklik varken başlıktaki Kaydet ekran dışındaysa sağ altta yüzen bir kopyası çıkar
 * (`FloatingSaveButton`; telefonda dock'un üstünde, masaüstünde sayfanın köşesinde).
 */
export type EditorSaveState = {
  /** Kaydedilmemiş değişiklik var. */
  dirty: boolean;
  /** Kaydediliyor (ya da kaydedildi, sayfa değişiyor). */
  pending: boolean;
  /** Oluşturma sayfası: düğme hep görünür ("Şablonu oluştur"). */
  creating: boolean;
  /** "Şablonu kaydet", "Programı kaydet", "Şablonu oluştur", "Programı oluştur". */
  submitLabel: string;
};

/** Başlıktaki Kaydet ile yüzen kopyasının ortak hâli. */
type SaveDock = {
  /** Başlıktaki Kaydet'in kabı (görünürlüğü izlenir); çizili değilse `null`. */
  header: HTMLElement | null;
  setHeader: (element: HTMLElement | null) => void;
  /** Yüzen kopya görünüyor: ekran dışındaki başlık Kaydet'i klavyeden ve ekran okuyucudan çekilir. */
  floating: boolean;
  setFloating: (shown: boolean) => void;
};

const EditorSaveContext = createContext<EditorSaveState | null>(null);
const SaveDockContext = createContext<SaveDock | null>(null);

export function EditorSaveProvider({ value, children }: { value: EditorSaveState; children: React.ReactNode }) {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [floating, setFloating] = useState(false);
  const dock = useMemo<SaveDock>(() => ({ header, setHeader, floating, setFloating }), [header, floating]);
  return (
    <EditorSaveContext.Provider value={value}>
      <SaveDockContext.Provider value={dock}>{children}</SaveDockContext.Provider>
    </EditorSaveContext.Provider>
  );
}

/** Kaydedilecek bir şey var (oluşturma sayfasında hep). */
function saveVisible(save: EditorSaveState | null): save is EditorSaveState {
  return save !== null && (save.creating || save.dirty || save.pending);
}

function saveLabel(save: EditorSaveState): string {
  return save.pending ? (save.creating ? 'Oluşturuluyor…' : 'Kaydediliyor…') : save.submitLabel;
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
 * görünür: değişiklik olunca hafifçe büyüyerek belirir, kaydedince söner. Kaydederken
 * "Kaydediliyor…". Sayfa durum vermediyse hiç çizilmez. Yüzen kopyası görünürken (başlık ekran
 * dışında) `inert`: klavye ve ekran okuyucu tek Kaydet bulur.
 */
export function SaveButton() {
  const save = useContext(EditorSaveContext);
  const dock = useContext(SaveDockContext);
  return (
    <AnimatePresence initial={false}>
      {saveVisible(save) ? (
        <motion.span
          key="save"
          ref={dock?.setHeader}
          inert={dock?.floating || undefined}
          className="inline-flex"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, transition: tween(DURATION.fast) }}
          exit={{ opacity: 0, scale: 0.9, transition: tween(DURATION.instant, EASE.exit) }}>
          <Button type="submit" size="sm" disabled={save.pending} className="touch:h-11" onClick={(event) => revealFirstError(event.currentTarget.form)}>
            {save.pending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
            {saveLabel(save)}
          </Button>
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** Dock'un kapladığı alt pay (dock 64 px + altındaki 12 px, biraz da nefes): orada kalan düğme görünmez sayılır. */
const DOCK_MARGIN = '0px 0px -96px 0px';

/** Öğe (tamamen) ekranın görünen yerinde değil mi; öğe yoksa `false`. */
function useOffscreen(element: HTMLElement | null): boolean {
  const [seen, setSeen] = useState<{ element: HTMLElement | null; offscreen: boolean }>({ element: null, offscreen: false });
  useLayoutEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setSeen({ element, offscreen: entry ? !entry.isIntersecting : false }),
      { rootMargin: DOCK_MARGIN, threshold: 1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return element !== null && seen.element === element && seen.offscreen;
}

/** Odak öğenin içinde mi (başlıktaki Kaydet odaktayken yüzen çıkmaz; `inert` odağı düşürürdü). */
function useContainsFocus(element: HTMLElement | null): boolean {
  const [focused, setFocused] = useState<{ element: HTMLElement | null; inside: boolean }>({ element: null, inside: false });
  useEffect(() => {
    if (!element) return;
    const update = () => setFocused({ element, inside: element.contains(document.activeElement) });
    element.addEventListener('focusin', update);
    element.addEventListener('focusout', update);
    return () => {
      element.removeEventListener('focusin', update);
      element.removeEventListener('focusout', update);
    };
  }, [element]);
  return element !== null && focused.element === element && focused.inside;
}

/**
 * Yüzen Kaydet (PT kararı 17; tasarım kararı 15'in istisnası): her genişlikte, kaydedilecek bir şey
 * varken ve başlıktaki Kaydet ekranın görünen yerinde değilken sağ altta durur: telefonda dock'un
 * üstünde, masaüstünde sayfanın köşesinde (evre süresi ya da gün adı değişince de, çünkü aynı Kaydet
 * bütün formu kaydeder). Başlıktakiyle aynı metin ve durum; 44 px. Sürüklerken dock gibi çekilir
 * (`data-reorder-hide`). Telefonda görünürken toast'lar üstüne çıkar (`--editor-save-space`). Formun
 * içinde durur (formun submit düğmesi); seçim modunda başlıkta Kaydet olmadığı için çıkmaz. Karar
 * `floatingSaveShown`'da.
 */
export function FloatingSaveButton() {
  const save = useContext(EditorSaveContext);
  const dock = useContext(SaveDockContext);
  const header = dock?.header ?? null;
  const headerOffscreen = useOffscreen(header);
  const headerFocused = useContainsFocus(header);
  const shown = floatingSaveShown({ saveable: saveVisible(save), headerMounted: header !== null, headerOffscreen, headerFocused });
  const setFloating = dock?.setFloating;

  useEffect(() => {
    setFloating?.(shown);
  }, [shown, setFloating]);

  useEffect(() => {
    if (!shown) return;
    const style = document.documentElement.style;
    style.setProperty('--editor-save-space', '3.25rem');
    return () => {
      style.removeProperty('--editor-save-space');
    };
  }, [shown]);

  return (
    // Kap sabit ve boş kalabilir; sürüklerken çekilen o (motion'un satır içi saydamlığı CSS'i ezmesin).
    <div
      data-reorder-hide
      className="pointer-events-none fixed right-6 bottom-6 z-30 touch:right-4 touch:bottom-(--dock-clearance)">
      <AnimatePresence initial={false}>
        {shown && save ? (
          <motion.div
            key="floating-save"
            className="pointer-events-auto"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: tween(DURATION.fast) }}
            exit={{ opacity: 0, y: 8, transition: tween(DURATION.instant, EASE.exit) }}>
            <Button
              type="submit"
              disabled={save.pending}
              className="h-11 rounded-full px-4 shadow-lg"
              onClick={(event) => revealFirstError(event.currentTarget.form)}>
              {save.pending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              {saveLabel(save)}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
