'use client';

import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { leaveHref } from '@/lib/unsaved-changes';

export type UnsavedChangesGuardHandle = {
  /** Çıkış artık istenen bir şey (ör. "Sayfayı yenile"): uyarı ve bağlantı tutma kapanır. */
  release: () => void;
};

/** Etkin korumalar: bağlantı olmayan çıkışlar (Çıkış yap) da sorsun. */
const askers = new Set<(proceed: () => void) => void>();

/** Kaydedilmemiş değişiklik varsa önce sorar; yoksa hemen çalıştırır. */
export function confirmLeave(proceed: () => void): void {
  const ask = askers.values().next().value;
  if (ask) ask(proceed);
  else proceed();
}

/**
 * Kaydedilmemiş değişiklik varken sayfadan çıkışı tutar (tasarım PT kararı 16); şablon ve
 * program düzenleyicisi ortak.
 *
 * - Yenileme, sekme kapanması, başka siteye gitme: tarayıcının kendi uyarısı (`beforeunload`).
 * - Sayfadaki her bağlantı (dock, danışan sekmeleri, sayfa yolu, "‹ Program", bağlantı olarak
 *   çizilen düğmeler, kullanıcı menüsü): tıklamanın varsayılanı belgede, yakalama aşamasında
 *   (her şeyden önce) engellenir ve sorulur. Next `Link` `defaultPrevented` olan tıklamada
 *   gezinmez. Hangi tıklamanın sayfadan çıkardığına `leaveHref` karar verir.
 * - Bağlantı olmayan çıkışlar (kullanıcı menüsündeki "Çıkış yap"): `confirmLeave` aynı pencereyi açar.
 * - Tarayıcının geri/ileri tuşu (popstate) güvenilir biçimde durdurulamaz: o zaman değişiklikler
 *   yerel taslakta kalır ve düzenleyiciye dönünce sunulur (`block-editor/editor-draft.tsx`).
 */
export function UnsavedChangesGuard({
  active,
  description,
  onLeave,
  ref,
}: {
  /** Kaydedilmemiş değişiklik var ve kaydedilmiyor. */
  active: boolean;
  description: string;
  /** "Kaydetmeden çık": gitmeden hemen önce (bu oturumun taslağını atar). */
  onLeave: () => void;
  ref?: React.Ref<UnsavedChangesGuardHandle>;
}) {
  const router = useRouter();
  const [href, setHref] = useState<string | null>(null);
  const [action, setAction] = useState<(() => void) | null>(null);
  const released = useRef(false);
  const stay = useRef<HTMLButtonElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      release: () => {
        released.current = true;
      },
    }),
    [],
  );

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!released.current) event.preventDefault();
    };
    const intercept = (event: MouseEvent) => {
      if (released.current || event.defaultPrevented) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor) return;
      const next = leaveHref({
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        button: event.button,
        modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        location: window.location.href,
      });
      if (next === null) return;
      // Yalnız varsayılan engellenir: menü kapanır, sekme ve dock kendi tıklamasını görür, gezinmez.
      event.preventDefault();
      setHref(next);
    };
    const ask = (proceed: () => void) => setAction(() => proceed);
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', intercept, true);
    askers.add(ask);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', intercept, true);
      askers.delete(ask);
    };
  }, [active]);

  const leave = () => {
    if (href === null && action === null) return;
    released.current = true;
    onLeave();
    setHref(null);
    setAction(null);
    if (href !== null) router.push(href);
    else action?.();
  };

  return (
    <AlertDialog
      open={href !== null || action !== null}
      onOpenChange={(open) => {
        if (!open) {
          setHref(null);
          setAction(null);
        }
      }}>
      <AlertDialogContent initialFocus={stay}>
        <AlertDialogHeader>
          <AlertDialogTitle>Kaydedilmemiş değişiklikler var</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={stay}>Kal</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={leave}>
            Kaydetmeden çık
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
