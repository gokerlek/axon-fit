/**
 * Hareket token'ları (SPEC §6). Süreler ms; motion/react saniye ister (`tween`).
 * CSS'te aynı değerler yalnız `duration-100 / -160 / -220 / -300` sınıflarıyla yazılır.
 *
 * - instant (100): basma anı (tutamak çizgisinin rengi).
 * - fast (160): "Eklendi" işareti, chevron, halka ve gölge, kenar öğelerinin çekilmesi, sheet çıkışı.
 * - base (220): kartın açılması, sheet girişi.
 * - slow (300): vurgunun sönmesi.
 */
export const DURATION = { instant: 100, fast: 160, base: 220, slow: 300 } as const;

export const EASE = {
  enter: [0.215, 0.61, 0.355, 1], // easeOutCubic: girişler, yerleşim
  exit: [0.55, 0.055, 0.675, 0.19], // easeInCubic: çıkışlar
} as const;

/** Sürükle-bırak (düzenleyicinin üst çizgi tutamağı, dnd-kit). */
export const DRAG = {
  activationDistance: 4, // px: çizgiye basıp bu kadar kayınca sürükleme başlar (basılı tutma yok)
  combineHoldMs: 250, // ms: kartın orta bandında bu kadar bekleyince "üstüne bırak" devreye girer
  liftScale: 1.02, // sürüklenen overlay; reduced-motion'da 1
  autoScrollEdge: 80, // px: ekranın üst ve alt kenarında otomatik kaydırma bölgesi
  highlightMs: 1200, // ms: taşınan, eklenen ya da kopyalanan kartın vurgusu
  settle: { bounceStiffness: 600, bounceDamping: 45 }, // bırakınca ~180 ms'de yerine oturma
} as const;

/** Kaydırma (kart yüzünde sola sil; grup üyesinde sağa "Çıkar"). Parmak, kalem ve fare. */
export const SWIPE = {
  actionWidth: 72, // px: panelin bir işlem düğmesi
  fullRatio: 0.45, // tek işlemli tarafta tam kaydırma eşiği: satır genişliğinin bu oranı…
  fullMax: 220, // px: …ama en çok bu kadar (masaüstündeki geniş satırda yarım ekran çekilmez)
  exitMs: 240, // ms: silmede yüzün dışarı kayması (kırmızı satırı doldurur)
  collapseMs: 300, // ms: ardından satırın kapanması; alttaki kartlar yukarı kayar
  exitEase: [0.32, 0.72, 0, 1], // iOS tarzı: hızlı başlar, yumuşak durur
  flingVelocity: 400, // px/sn: hızlı fırlatma paneli açar, işlemi tetiklemez
  spring: { type: 'spring', stiffness: 500, damping: 40 }, // panelin açılıp kapanması
  startDistance: 10, // px: |dx| bunu ve 1,5·|dy|'yi aşınca kaydırma başlar
  directionRatio: 1.5,
  scrollSlop: 8, // px: |dy| bunu aşınca sayfa kayar; daha azı dokunmadır
  nudge: 40, // px: ilk kullanımda ilk kartın bir kez sola "göz kırpması"
} as const;

/** motion/react geçişi: süre ms verilir. */
export function tween(ms: number, ease: readonly [number, number, number, number] = EASE.enter) {
  return { type: 'tween' as const, duration: ms / 1000, ease };
}

/** Anında (animasyonsuz) geçiş. */
export const INSTANT = { duration: 0 } as const;
