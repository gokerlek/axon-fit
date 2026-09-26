/**
 * Eğilim, tahmin ve plato — ölçüm ve kuvvet grafiklerinin ortak hesabı.
 *
 * Eğim Theil–Sen ile bulunur (ikili eğimlerin ortancası): tek bir hatalı ölçüm çizgiyi
 * sürükleyemez. Tahmin dürüst sınırlarla yapılır — az veride hiç tahmin yok, ufuk
 * gözlenen sürenin yarısını ve 8 haftayı geçmez, bant belirsizliği gösterir.
 * Plato ve gerileme, pencere içindeki değişimin ölçüm hatası payıyla karşılaştırılmasıdır
 * (payı `measurements.ts`'teki eşiklerden gelir; eşiği olmayan ölçümde karar verilmez).
 *
 * Saf modül: tarihler "YYYY-AA-GG", hesap UTC gün sayısıyla.
 */

export type Point = { date: string; value: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function dateOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Güne gün ekler ("2026-09-27", −28 → "2026-08-30"). */
export function shiftDay(date: string, days: number): string {
  return dateOf(dayNumber(date) + days);
}

/** İki gün arasındaki gün sayısı (`to − from`). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Tarihe göre sıralı, aynı günün değerleri ortalanmış noktalar. */
export function normalizePoints(points: readonly Point[]): Point[] {
  const byDay = new Map<string, number[]>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    byDay.set(point.date, [...(byDay.get(point.date) ?? []), point.value]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, value: values.reduce((sum, value) => sum + value, 0) / values.length }));
}

/** Tarih aralığı süzgeci (iki uç dahil). */
export function withinRange(points: readonly Point[], from?: string, to?: string): Point[] {
  return points.filter((point) => (!from || point.date >= from) && (!to || point.date <= to));
}

export type Fit = {
  /** Günlük eğim (birim/gün). */
  slopePerDay: number;
  /** `originDay`'deki çizgi değeri. */
  intercept: number;
  originDay: number;
  /** Artıkların dayanıklı yayılımı (MAD × 1,4826). */
  sigma: number;
  n: number;
  /** Gün cinsinden ortalama ve kareler toplamı: tahmin bandı için. */
  meanDay: number;
  sxx: number;
};

/**
 * Theil–Sen doğrusu. En az 2 farklı gün gerekir; yoksa null. `minPairDays`: eğime yalnız en az bu
 * kadar gün arayla ölçülmüş çiftler girer (birkaç güne sıkışmış ölçümlerin kendi aralarındaki eğimi
 * dışarıda kalır); böyle çift yoksa null.
 */
/** İkili eğimler (birim/gün): yalnız en az `minPairDays` gün arayla ölçülmüş çiftler. */
function pairSlopes(pts: readonly Point[], t: readonly number[], minPairDays: number): number[] {
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      if (t[j]! - t[i]! >= minPairDays) slopes.push((pts[j]!.value - pts[i]!.value) / (t[j]! - t[i]!));
    }
  }
  return slopes;
}

export function theilSen(points: readonly Point[], { minPairDays = 1 } = {}): Fit | null {
  const pts = normalizePoints(points);
  if (pts.length < 2) return null;
  const days = pts.map((point) => dayNumber(point.date));
  const originDay = days[0]!;
  const t = days.map((day) => day - originDay);
  const slopes = pairSlopes(pts, t, minPairDays);
  if (slopes.length === 0) return null;
  const slopePerDay = median(slopes);
  const intercept = median(pts.map((point, i) => point.value - slopePerDay * t[i]!));
  const residuals = pts.map((point, i) => point.value - (intercept + slopePerDay * t[i]!));
  const mad = median(residuals.map((residual) => Math.abs(residual - median(residuals))));
  const meanDay = t.reduce((sum, value) => sum + value, 0) / t.length;
  const sxx = t.reduce((sum, value) => sum + (value - meanDay) ** 2, 0);
  return { slopePerDay, intercept, originDay, sigma: mad * 1.4826, n: pts.length, meanDay, sxx };
}

export function valueAt(fit: Fit, date: string): number {
  return fit.intercept + fit.slopePerDay * (dayNumber(date) - fit.originDay);
}

/** Tahmin için en az bu kadar nokta ve bu kadar gün. */
export const FORECAST_MIN_POINTS = 4;
export const FORECAST_MIN_SPAN_DAYS = 21;
/** Ufuk en fazla gözlenen sürenin yarısı ve 8 hafta. */
export const FORECAST_MAX_DAYS = 56;
/** Bant ≈ %80 tahmin aralığı (eğim aralığı da aynı z'yle, `slopeBand`). */
export const BAND_Z = 1.28;

/**
 * Theil–Sen eğiminin güven aralığı (Sen 1968; Gilbert 1987 §16.5): ikili eğimler sıralanır, alt ve üst
 * uç Kendall S istatistiğinin varyansından bulunan iki sıradaki eğimlerdir: `C = z·√Var(S)`, alt uç
 * `(N − C) / 2`, üst uç `(N + C) / 2 + 1` sırasında (N: eğim sayısı; kesirli sıra komşu iki eğim arasında
 * doğrusal).
 * Dağılım varsayımı yok; az noktada aralık kendiliğinden geniştir (4 noktada alt uç ≈ en küçük eğim).
 * Aynı değerler (aynı kilo, aynı tekrar) varyansı düzeltir. `z` varsayılanı tahmin bandınınki (≈%80).
 * En az 2 farklı gün gerekir; yoksa null.
 */
export function slopeBand(points: readonly Point[], { z = BAND_Z } = {}): { slopePerDay: number; low: number; high: number; n: number } | null {
  const pts = normalizePoints(points);
  if (pts.length < 2) return null;
  const origin = dayNumber(pts[0]!.date);
  const slopes = pairSlopes(
    pts,
    pts.map((point) => dayNumber(point.date) - origin),
    1,
  ).sort((a, b) => a - b);
  const n = pts.length;
  const count = slopes.length;
  // Bağ düzeltmesi: aynı değeri taşıyan t noktalık her grup için t(t−1)(2t+5).
  const ties = new Map<number, number>();
  for (const point of pts) ties.set(point.value, (ties.get(point.value) ?? 0) + 1);
  const tieTerm = [...ties.values()].reduce((sum, t) => sum + t * (t - 1) * (2 * t + 5), 0);
  const variance = Math.max(0, (n * (n - 1) * (2 * n + 5) - tieTerm) / 18);
  const c = z * Math.sqrt(variance);
  const rank = (position: number) => {
    const clamped = Math.min(count, Math.max(1, position));
    const lower = Math.floor(clamped);
    const upper = Math.ceil(clamped);
    return slopes[lower - 1]! + (slopes[upper - 1]! - slopes[lower - 1]!) * (clamped - lower);
  };
  return { slopePerDay: median(slopes), low: rank((count - c) / 2), high: rank((count + c) / 2 + 1), n };
}

export type ForecastPoint = Point & { low: number; high: number };

export type Forecast =
  | {
      ok: true;
      fit: Fit;
      points: ForecastPoint[];
      horizonDays: number;
      slopePerWeek: number;
      /**
       * Çizgi ufuk içinde ölçümün geçerli aralığının sınırına (`min`/`max`) değiyorsa: hangi sınır ve son
       * ölçümden kaç gün sonra (değdiği ilk gün; 0 → son ölçümde değmiş). Tahmin o gün biter: çizgi sınır
       * boyunca sürmez, bant da orada tek noktaya çökmez.
       */
      bound: { value: number; days: number } | null;
    }
  | { ok: false; reason: 'too_few_points' | 'too_short_span' };

/**
 * Son noktadan ileriye tahmin. `stepDays` aralıklı noktalar döner (grafikte kesikli çizgi
 * ve bant). Bant, dayanıklı yayılımla kurulan doğrusal tahmin aralığıdır; ölçüm gürültüsü
 * büyükse geniş çıkar — bu istenen davranış. `min`/`max` ölçümün geçerli aralığıdır: çizgi
 * ve bant ona kırpılır (negatif olamayan ölçümde tahmin sıfırın altına, anket 100'ün üstüne çıkmaz).
 * Çizgi sınıra ufuktan önce değiyorsa tahmin değdiği gün biter (`bound`); sınırda sürdürülse bant
 * "0–0" diye tek noktaya çöker, belirsizlik sıfırmış gibi okunurdu.
 */
export function forecast(
  points: readonly Point[],
  { horizonDays = FORECAST_MAX_DAYS, stepDays = 7, min = -Infinity, max = Infinity } = {},
): Forecast {
  const pts = normalizePoints(points);
  if (pts.length < FORECAST_MIN_POINTS) return { ok: false, reason: 'too_few_points' };
  const first = dayNumber(pts[0]!.date);
  const last = dayNumber(pts[pts.length - 1]!.date);
  const span = last - first;
  if (span < FORECAST_MIN_SPAN_DAYS) return { ok: false, reason: 'too_short_span' };

  const fit = theilSen(pts)!;
  const limit = Math.max(stepDays, Math.min(horizonDays, Math.floor(span / 2), FORECAST_MAX_DAYS));
  // Ufuk son üretilen adımdır (adımın katı): metindeki "N hafta sonra" ile yazılan tarih aynı gün.
  const horizon = Math.floor(limit / stepDays) * stepDays;
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  const lineAt = (d: number) => fit.intercept + fit.slopePerDay * (last + d - fit.originDay);
  // Çizginin gittiği yöndeki sınıra değdiği ilk gün; tahmin orada biter.
  const edge = fit.slopePerDay < 0 ? min : fit.slopePerDay > 0 ? max : NaN;
  const crossing = Number.isFinite(edge) ? Math.max(0, Math.ceil((edge - lineAt(0)) / fit.slopePerDay)) : Infinity;
  const stop = Math.min(horizon, crossing);
  const pointAt = (d: number): ForecastPoint => {
    const t = last + d - fit.originDay;
    const value = lineAt(d);
    const spread = BAND_Z * fit.sigma * Math.sqrt(1 + 1 / fit.n + (fit.sxx > 0 ? (t - fit.meanDay) ** 2 / fit.sxx : 0));
    return { date: dateOf(last + d), value: clamp(value), low: clamp(value - spread), high: clamp(value + spread) };
  };
  const out: ForecastPoint[] = [];
  for (let d = 0; d < stop; d += stepDays) out.push(pointAt(d));
  out.push(pointAt(stop));
  return {
    ok: true,
    fit,
    points: out,
    horizonDays: stop,
    slopePerWeek: fit.slopePerDay * 7,
    bound: crossing <= horizon ? { value: edge, days: crossing } : null,
  };
}

/**
 * Tahmin bugüne göre: ufku (son tahmin günü) geçmişte kalan tahmin gösterilmez — geçmiş bir güne
 * "tahmin" olmaz, o gün ya ölçülmüştür ya da ölçüm eksiktir (`stale`: son ölçüm ve kaç gün önce).
 * Bugün ufkun içindeyse bugünün tahmini de döner (çizgi doğrusal; bant komşu adımlar arasında
 * doğrusal yaklaşık). Veri yetmiyorsa `forecast` olduğu gibi.
 */
export function forecastAsOf(
  result: Forecast,
  today: string,
):
  | { kind: 'insufficient'; forecast: Extract<Forecast, { ok: false }> }
  | { kind: 'stale'; lastDate: string; endDate: string; daysSince: number }
  | { kind: 'current'; forecast: Extract<Forecast, { ok: true }>; today: ForecastPoint | null } {
  if (!result.ok) return { kind: 'insufficient', forecast: result };
  const first = result.points[0]!;
  const end = result.points.at(-1)!;
  if (end.date < today) {
    return { kind: 'stale', lastDate: first.date, endDate: end.date, daysSince: dayNumber(today) - dayNumber(first.date) };
  }
  if (today <= first.date) return { kind: 'current', forecast: result, today: null };
  const day = dayNumber(today);
  const after = result.points.findIndex((point) => dayNumber(point.date) >= day);
  const upper = result.points[after]!;
  const lower = result.points[Math.max(0, after - 1)]!;
  const span = dayNumber(upper.date) - dayNumber(lower.date);
  const t = span === 0 ? 1 : (day - dayNumber(lower.date)) / span;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    kind: 'current',
    forecast: result,
    today: { date: today, value: mix(lower.value, upper.value), low: mix(lower.low, upper.low), high: mix(lower.high, upper.high) },
  };
}

/** Hedefe ulaşma tahmini: çizgi hedefe doğru gidiyorsa tarih, gitmiyorsa ya da 1 yıldan uzaksa null. */
export function etaToGoal(fit: Fit, goal: number, fromDate: string): string | null {
  const current = valueAt(fit, fromDate);
  if (fit.slopePerDay === 0 || Math.sign(goal - current) !== Math.sign(fit.slopePerDay)) return null;
  const days = Math.ceil((goal - current) / fit.slopePerDay);
  if (days > 365) return null;
  return dateOf(dayNumber(fromDate) + Math.max(0, days));
}

export type Noise = { threshold: number; relative: boolean; better: 'higher' | 'lower' };

export type TrendStatus = 'improving' | 'declining' | 'plateau' | 'insufficient';

/** Plato penceresi ve pencerede en az bu kadar nokta. */
export const PLATEAU_WINDOW_DAYS = 28;
export const PLATEAU_MIN_POINTS = 3;

/**
 * Son `windowDays` içindeki değişim, çizginin pencere başı ve sonundaki değerleri
 * arasındaki farktır (tek tek ölçümlerin gürültüsü değil). Fark ölçüm hatası payının
 * içindeyse plato, iyi yönde aşıyorsa gelişme, kötü yönde aşıyorsa gerileme.
 *
 * Eğim yalnız en az yarım pencere (28 günde 14 gün) arayla ölçülmüş nokta çiftlerinden gelir.
 * Birkaç güne sıkışmış ölçümlerin kendi aralarındaki eğim (2 günde 0,5 cm) pencereye uzatılmaz:
 * uzatılsa gürültü 14 katına çıkar, 1 cm'lik fark "4 cm gelişme" olur (§7.5: ölçüm hatasının
 * altındaki değişim gelişme diye raporlanmaz). Kümedeki ölçümler atılmaz, başa uzak ölçümle
 * eşleşerek katkı verir. Böyle çift yoksa karar yok.
 */
export function trendStatus(
  points: readonly Point[],
  noise: Noise,
  { windowDays = PLATEAU_WINDOW_DAYS, minPoints = PLATEAU_MIN_POINTS } = {},
): {
  status: TrendStatus;
  change: number | null;
  from: string | null;
  to: string | null;
  /** Karara giren noktalar (pencere ve varsa başındaki çapa), tarihe göre; karar yoksa boş. */
  used: Point[];
} {
  const pts = normalizePoints(points);
  if (pts.length === 0) return { status: 'insufficient', change: null, from: null, to: null, used: [] };
  const to = pts[pts.length - 1]!.date;
  const from = dateOf(dayNumber(to) - windowDays);
  const window = pts.filter((point) => point.date >= from);
  // Pencere gerçekten dolu olmalı: ilk nokta pencere başına yakın (en fazla haftası içinde). Değilse
  // pencereden hemen önceki ölçüm başa bir haftadan yakınsa çizgiye katılır ve değişim pencere
  // başından ölçülür; daha eski bir ölçüm (6 ay önceki tek nokta) pencerenin başını bilinir kılmaz.
  const gap = dayNumber(window[0]?.date ?? to) - dayNumber(from);
  const before = pts.filter((point) => point.date < from).at(-1);
  const anchor = gap > 7 && before && dayNumber(from) - dayNumber(before.date) <= 7 ? before : undefined;
  if (window.length < minPoints || (gap > 7 && !anchor)) return { status: 'insufficient', change: null, from, to, used: [] };

  const used = anchor ? [anchor, ...window] : window;
  const fit = theilSen(used, { minPairDays: Math.ceil(windowDays / 2) });
  if (!fit) return { status: 'insufficient', change: null, from, to, used: [] };
  const start = valueAt(fit, anchor ? from : window[0]!.date);
  const end = valueAt(fit, to);
  const change = end - start;
  const size = noise.relative ? Math.abs(change) / Math.max(Math.abs(start), Number.EPSILON) : Math.abs(change);
  if (size < noise.threshold) return { status: 'plateau', change, from, to, used };
  const better = noise.better === 'higher' ? change > 0 : change < 0;
  return { status: better ? 'improving' : 'declining', change, from, to, used };
}

/** Grafik süzgecinin hazır aralıkları; adreste `?aralik=` ile taşınır. */
export const RANGE_PRESETS = {
  '4h': { label: 'Son 4 hafta', days: 28 },
  '3a': { label: 'Son 3 ay', days: 91 },
  '6a': { label: 'Son 6 ay', days: 182 },
  '1y': { label: 'Son 1 yıl', days: 365 },
  tumu: { label: 'Tümü', days: null },
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

/** Hazır aralığın başlangıç tarihi (bugün dahil); "tümü" için undefined. */
export function rangeStart(preset: RangePreset, today: string): string | undefined {
  const days = RANGE_PRESETS[preset].days;
  return days === null ? undefined : dateOf(dayNumber(today) - days);
}
