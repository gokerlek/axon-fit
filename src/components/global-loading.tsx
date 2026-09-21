'use client';

import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';

/** Kısa isteklerde çubuğun yanıp sönmesini engelleyen eşik. */
const DELAY_MS = 200;

/**
 * Uygulama genelinde yükleniyor göstergesi — shadcn Progress, belirsiz durumda (`value={null}`).
 *
 * Ekranlar kendi yükleniyor durumlarını düğmelerde göstermeye devam eder. Bu çubuk arka planda
 * süren her isteği tek yerden bildirir: GitHub yazmaları yarım saniye civarı sürüyor.
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
    <Progress
      value={null}
      aria-label="Yükleniyor"
      className="fixed inset-x-0 top-0 z-50 [&_[data-slot=progress-indicator]]:w-full [&_[data-slot=progress-indicator]]:animate-pulse [&_[data-slot=progress-track]]:h-0.5 [&_[data-slot=progress-track]]:rounded-none"
    />
  );
}
