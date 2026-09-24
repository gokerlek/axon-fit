/**
 * Hareket token'ları (SPEC §6). Süreler ms; motion/react saniye ister (`tween`).
 * CSS'te aynı değerler yalnız `duration-100 / -160 / -220 / -300` sınıflarıyla yazılır.
 *
 * - instant (100): basma anı (rozet rengi).
 * - fast (160): kalkma ölçeği, "Eklendi" işareti, chevron, halka ve gölge, kenar öğelerinin çekilmesi, sheet çıkışı.
 * - base (220): sıralamada kardeşlerin kayması, klavyeyle taşıma, sheet girişi.
 * - slow (300): bırakınca yerleşim animasyonunun açık kaldığı süre, vurgunun sönmesi.
 */
export const DURATION = { instant: 100, fast: 160, base: 220, slow: 300 } as const;

export const EASE = {
  enter: [0.215, 0.61, 0.355, 1], // easeOutCubic: girişler, yerleşim
  exit: [0.55, 0.055, 0.675, 0.19], // easeInCubic: çıkışlar
} as const;

export const DRAG = {
  liftScale: 1.03, // reduced-motion'da 1
  touchDelay: 200, // ms: dokunmada tutamağa basılı tutma
  touchSlop: 8, // px: süre dolmadan bu kadar kayarsa kaydırmadır
  settle: { bounceStiffness: 600, bounceDamping: 45 }, // bırakınca ~180 ms'de yerine oturma
} as const;

/** motion/react geçişi: süre ms verilir. */
export function tween(ms: number, ease: readonly [number, number, number, number] = EASE.enter) {
  return { type: 'tween' as const, duration: ms / 1000, ease };
}

/** Anında (animasyonsuz) geçiş. */
export const INSTANT = { duration: 0 } as const;
