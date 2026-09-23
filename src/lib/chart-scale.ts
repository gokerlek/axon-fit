/**
 * Grafik ekseni için "yuvarlak" ölçek: 68,9–71,4 kg → 68, 69, 70, 71, 72 (70,85 gibi etiket yok).
 * Saf; grafik bileşeni kullanır.
 *
 * `minSpan`: eksenin en az kapsayacağı aralık. Ölçüm hatası bilinen ölçümde bunu vermek,
 * hata payı içindeki bir oynamanın (kalça 100 → 99 cm) grafikte uçurum gibi görünmesini önler.
 */
export function niceScale(
  min: number,
  max: number,
  { minSpan = 0, targetTicks = 4, nonNegative = true }: { minSpan?: number; targetTicks?: number; nonNegative?: boolean } = {},
): { domain: [number, number]; ticks: number[] } {
  let low = Math.min(min, max);
  let high = Math.max(min, max);
  if (high - low < minSpan) {
    const middle = (low + high) / 2;
    low = middle - minSpan / 2;
    high = middle + minSpan / 2;
  }
  if (high === low) {
    // Tek değer: çevresinde küçük bir aralık aç.
    const pad = Math.abs(low) * 0.05 || 1;
    low -= pad;
    high += pad;
  }
  if (nonNegative && low < 0 && min >= 0) {
    high -= low;
    low = 0;
  }

  const rough = (high - low) / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;

  const round = (value: number) => Math.round(value * 1e9) / 1e9;
  const start = round(Math.floor(round(low / step)) * step);
  const end = round(Math.ceil(round(high / step)) * step);
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(round(value));
  return { domain: [start, end], ticks };
}
