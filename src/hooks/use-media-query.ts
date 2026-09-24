'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * CSS medya sorgusu eşleşiyor mu (canlı). Sunucuda ve ilk hidrasyonda `false`; yalnız
 * istemcide açılan içerikte (ör. sheet) kullanılırsa uyuşmazlık olmaz.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
