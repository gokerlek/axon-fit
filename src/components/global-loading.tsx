'use client';

import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import styles from './global-loading.module.css';

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

  return <div className={styles.bar} role="status" aria-label="Yükleniyor" />;
}
