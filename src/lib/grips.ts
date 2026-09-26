/**
 * Tutuş — aynı cihazda kasları değiştiren ayrıntı (pronasyon/supinasyon/nötr, genişlik).
 *
 * Kaslar belirgin değişiyorsa ayrı egzersiz açılır (ör. "Ters Tutuş Lat Pulldown");
 * bu alanlar küçük farkı taşır ve muadil sıralamasında aynı tutuşu öne alır.
 *
 * Saf veri; yol takma adıyla içe aktarma yok (testler Node'un test aracıyla çalışır).
 */

export const GRIPS = ['pronated', 'supinated', 'neutral', 'mixed'] as const;
export type Grip = (typeof GRIPS)[number];

/**
 * Parantez içi avucun yönü: bağlamdan bağımsız. "Ters/düz" harekete göre değişir
 * ("Ters Tutuş Lat Pulldown" supinasyondur), o yüzden kullanılmaz.
 */
export const GRIP_LABELS: Record<Grip, string> = {
  pronated: 'Pronasyon (avuç aşağı)',
  supinated: 'Supinasyon (avuç yukarı)',
  neutral: 'Nötr (avuçlar içe)',
  mixed: 'Karışık (bir avuç aşağı, biri yukarı)',
};

export const GRIP_WIDTHS = ['narrow', 'shoulder', 'wide'] as const;
export type GripWidth = (typeof GRIP_WIDTHS)[number];

export const GRIP_WIDTH_LABELS: Record<GripWidth, string> = {
  narrow: 'Dar',
  shoulder: 'Omuz genişliği',
  wide: 'Geniş',
};

/** Tutuşun okunur özeti: "Geniş pronasyon (avuç aşağı)". */
export function describeGrip(grip?: Grip, width?: GripWidth): string | null {
  if (!grip && !width) return null;
  if (!grip) return GRIP_WIDTH_LABELS[width as GripWidth];
  return width ? `${GRIP_WIDTH_LABELS[width]} ${GRIP_LABELS[grip].toLocaleLowerCase('tr')}` : GRIP_LABELS[grip];
}
