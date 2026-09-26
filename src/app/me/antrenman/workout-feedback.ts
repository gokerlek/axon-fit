'use client';

import { useEffect, useState } from 'react';

/**
 * Antrenman ekranının ses, titreşim ve ekranı açık tutma işleri (tasarım §3) — tarayıcıya bağlı.
 * - Bipler Web Audio'yla; bağlam ilk "Set bitti" dokunuşunda açılır (iOS sesi ancak kullanıcı
 *   dokunuşuyla başlatır). Ses yoksa görsel ve metin yeter: her uyarı ekranda da yazılır.
 * - Titreşim yalnız Android'de (`navigator.vibrate`); iOS Safari'de yok, bilgi tek başına ona bağlı değil.
 * - Screen Wake Lock (iOS Safari 16.4+): antrenman boyunca ekran kararmaz; sekme arkaya gidince düşer,
 *   dönünce yeniden istenir. Yoksa ya da iOS'taysa ilk dinlenmede kilit uyarısı (`needsLockWarning`).
 */

type AudioContextClass = typeof AudioContext;

let audio: AudioContext | null = null;

/** Dokunuşun içinde çağrılır: ses bağlamı açılır ya da uykudan kalkar. */
export function unlockAudio(): void {
  try {
    const Context = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext) as AudioContextClass | undefined;
    if (!Context) return;
    audio ??= new Context();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** `times` kısa bip (120 ms, aralarında 200 ms). */
export function beep(times = 1, frequency = 880): void {
  const context = audio;
  if (!context) return;
  try {
    const start = context.currentTime + 0.02;
    for (let index = 0; index < times; index++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const at = start + index * 0.2;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      oscillator.start(at);
      oscillator.stop(at + 0.13);
    }
  } catch {
    // Ses çalınamadıysa ekrandaki metin yeter.
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // iOS'ta yok.
  }
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Ekranı açık tutar; tutulduğu sürece true. Destek yoksa ya da reddedilirse false (sessizce). */
export function useWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setHeld(true);
        sentinel.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
  return held;
}
