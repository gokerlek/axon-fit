/**
 * Renk yardımcıları — sunucu ve istemci ortak (saf fonksiyonlar).
 *
 * PT kendi ana rengini seçebildiği için üzerindeki yazının rengi sabit olamaz:
 * açık renkte koyu, koyu renkte açık yazı gerekir. Karar WCAG bağıl parlaklığıyla verilir.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Ana rengin üzerine yazılacak yazı rengi: hangisi daha okunaklıysa. */
export function readableOn(hex: string): string {
  const dark = '#0a0a0a';
  const light = '#fafafa';
  return contrastRatio(hex, dark) >= contrastRatio(hex, light) ? dark : light;
}
