'use client';

import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import styles from './global-loading.module.css';

/** Kısa isteklerde çubuğun yanıp sönmesini engelleyen eşik. */
const GECIKME_MS = 200;

/**
 * Uygulama genelinde yükleniyor göstergesi.
 *
 * Ekranlar kendi yükleniyor durumlarını düğmelerde göstermeye devam eder (dokunulan
 * şeyin tepki vermesi için). Bu çubuk, arka planda süren her isteği tek yerden bildirir:
 * GitHub yazmaları yarım saniye civarı sürdüğü için kullanıcı "takıldı mı" diye düşünmesin.
 */
export function GlobalLoading() {
  const mesgul = useIsFetching() + useIsMutating() > 0;
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    if (!mesgul) {
      setGorunur(false);
      return;
    }
    const zamanlayici = setTimeout(() => setGorunur(true), GECIKME_MS);
    return () => clearTimeout(zamanlayici);
  }, [mesgul]);

  if (!gorunur) return null;

  return <div className={styles.bar} role="status" aria-label="Yükleniyor" />;
}
