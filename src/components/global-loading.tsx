'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { navigationHref } from '@/lib/navigation';

/** Kısa isteklerde çubuğun yanıp sönmesini engelleyen eşik. */
const DELAY_MS = 200;
/** Sayfa geçişinde çubuk daha erken görünür: dokunuşa hemen tepki. */
const NAVIGATION_DELAY_MS = 100;
/** Geçiş bir nedenle tamamlanmazsa (aynı adrese yönlenme, iptal) çubuk sonsuza dek kalmasın. */
const NAVIGATION_TIMEOUT_MS = 12_000;

/**
 * Sayfa geçişini izler: uygulamanın başka bir sayfasına giden bağlantıya tıklanınca başlar, adres
 * (yol ya da sorgu) değişince biter. Next `Link` geçişi bir geçiş (transition) içinde yapar ve eski
 * sayfa yenisi gelene kadar yerinde durur; bu arada ekranda tepki olsun diye.
 *
 * Tıklama belgede en önce (pencerede, yakalama aşamasında) görülür, karar bağlantının kendisinde
 * verilir: o ana kadar varsayılanı engellenmişse (kaydedilmemiş değişiklik koruması belgenin yakalama
 * aşamasında engeller ve "Kal / Kaydetmeden çık" sorar) geçiş başlamamıştır. Next `Link`'in kendi
 * `preventDefault`'u bundan sonra, React'in belgedeki dinleyicisinde çalışır.
 */
function NavigationWatcher({ onChange }: { onChange: (navigating: boolean) => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    onChange(false);
  }, [pathname, search, onChange]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      onChange(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => onChange(false), NAVIGATION_TIMEOUT_MS);
    };
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor) return;
      const href = navigationHref({
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        button: event.button,
        modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        location: window.location.href,
      });
      if (href === null) return;
      const decide = (at: MouseEvent) => {
        if (at === event && !at.defaultPrevented) start();
      };
      anchor.addEventListener('click', decide, { once: true });
      // Olay bağlantıya hiç ulaşmazsa (yayılım durduruldu) dinleyici kalmasın.
      setTimeout(() => anchor.removeEventListener('click', decide), 0);
    };
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      clearTimeout(timeout);
    };
  }, [onChange]);

  return null;
}

/**
 * Uygulama genelinde yükleniyor göstergesi — shadcn Progress, belirsiz durumda (`value={null}`).
 *
 * Ekranlar kendi yükleniyor durumlarını düğmelerde göstermeye devam eder. Bu çubuk arka planda
 * süren her isteği (GitHub yazmaları yarım saniye civarı sürüyor) ve sayfa geçişini tek yerden
 * bildirir. Geçişte yeni sayfanın iskeleti (`loading.tsx`) gelince çubuk çekilir.
 */
export function GlobalLoading() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [navigating, setNavigating] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy && !navigating) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), navigating ? NAVIGATION_DELAY_MS : DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy, navigating]);

  return (
    <>
      <Suspense fallback={null}>
        <NavigationWatcher onChange={setNavigating} />
      </Suspense>
      {visible ? (
        <Progress
          value={null}
          aria-label={navigating ? 'Sayfa yükleniyor' : 'Yükleniyor'}
          className="fixed inset-x-0 top-0 z-50 [&_[data-slot=progress-indicator]]:w-full [&_[data-slot=progress-indicator]]:animate-pulse [&_[data-slot=progress-track]]:h-0.5 [&_[data-slot=progress-track]]:rounded-none"
        />
      ) : null}
    </>
  );
}
