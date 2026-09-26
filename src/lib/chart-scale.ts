/**
 * Grafik ekseni için "yuvarlak" ölçek: 68,9–71,4 kg → 68, 69, 70, 71, 72 (70,85 gibi etiket yok).
 * Adımlar 1, 2 ve 5'in onlu katları: 81 / 81,5 / 82 olur, 81 / 81,25 / 81,5 olmaz (2,5'lik adım
 * iki ondalıklı etiket üretiyordu). Saf; grafik bileşeni kullanır.
 *
 * `minSpan`: eksenin en az kapsayacağı aralık. Ölçüm hatası bilinen ölçümde bunu vermek,
 * hata payı içindeki bir oynamanın (kalça 100 → 99 cm) grafikte uçurum gibi görünmesini önler.
 *
 * `nonNegative`: eksen sıfırın altına inmez. Verilmezse `min`e bakılır; ölçeğe veri dışı değerler
 * de giriyorsa (tahmin bandı) çağıran veri minimumuna göre verir: bant eksiye inse de eksen inmez.
 */
export function niceScale(
  min: number,
  max: number,
  { minSpan = 0, targetTicks = 4, nonNegative = min >= 0 }: { minSpan?: number; targetTicks?: number; nonNegative?: boolean } = {},
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
  if (nonNegative && low < 0) {
    high -= low;
    low = 0;
  }

  const rough = (high - low) / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;

  const round = (value: number) => Math.round(value * 1e9) / 1e9;
  const start = round(Math.floor(round(low / step)) * step);
  const end = round(Math.ceil(round(high / step)) * step);
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(round(value));
  return { domain: [start, end], ticks };
}

/**
 * Tarih ekseninin etiketleri: ölçüm günleri, çoksa eşit aralıkla seyreltilmiş (ilk ve son ölçüm kalır);
 * tahmin varsa son tahmin günü ayrıca eklenir ve ölçüm günlerinden birinin yerini almaz (altı ölçümlü
 * grafikte tahmin ucu yüzünden bir ölçüm gününün etiketi düşüyordu). Birbirine çok yakın etiketleri
 * grafik kütüphanesi piksel genişliğine göre kendisi gizler.
 */
export function dateTicks(times: readonly number[], { extra, max = 8 }: { extra?: number; max?: number } = {}): number[] {
  const unique = [...new Set(times)].sort((a, b) => a - b);
  const kept =
    unique.length <= max
      ? unique
      : Array.from({ length: max }, (_, index) => unique[Math.round((index * (unique.length - 1)) / (max - 1))]!);
  return extra === undefined || kept.includes(extra) ? kept : [...kept, extra].sort((a, b) => a - b);
}
