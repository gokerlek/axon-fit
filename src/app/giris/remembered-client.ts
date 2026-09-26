'use client';

import { useSyncExternalStore } from 'react';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';

/**
 * "Hangi danışanım" — telefonda saklanan tek şey (SPEC §5): yalnız kimlik, yetki değil. Şifreyle
 * giriş sayfası (`/giris`) kimliği adreste bulamazsa buradan okur; danışan kimlik yazmaz. Kare kodla
 * girince, şifreyle girince ve `/me` her açıldığında yazılır; çıkış SİLMEZ. Depo her erişimde
 * try/catch içinde: gizli pencerede kimlik yalnız adresten gelir.
 */
const KEY = 'pulsecoach.client-id';

export function readRememberedClient(): string | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value && CLIENT_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberClient(id: string): void {
  try {
    if (window.localStorage.getItem(KEY) !== id) window.localStorage.setItem(KEY, id);
  } catch {
    // Depo kapalı: kimlik yalnız adresten gelir.
  }
}

const noSubscription = () => () => {};

/** Saklanan kimlik; sunucuda ve ilk çizimde `undefined` (henüz bilinmiyor), sonra kimlik ya da null. */
export function useRememberedClient(): string | null | undefined {
  return useSyncExternalStore(noSubscription, readRememberedClient, () => undefined);
}
