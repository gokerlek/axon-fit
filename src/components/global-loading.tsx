'use client';

import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/** Kısa isteklerde çubuğun yanıp sönmesini engelleyen eşik. */
const DELAY_MS = 200;

/**
 * Uygulama genelinde yükleniyor göstergesi.
 *
 * Ekranlar kendi yükleniyor durumlarını düğmelerde göstermeye devam eder (dokunulan
 * şeyin tepki vermesi için). Bu çubuk, arka planda süren her isteği tek yerden bildirir:
 * GitHub yazmaları yarım saniye civarı sürdüğü için kullanıcı "takıldı mı" diye düşünmesin.
 */
export function GlobalLoading() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Yükleniyor"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20">
      <div className="h-full w-2/5 animate-[loading-bar_1.1s_ease-out_infinite] bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
    </div>
  );
}
