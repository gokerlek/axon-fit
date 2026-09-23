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

/** Theil–Sen doğrusu. En az 2 farklı gün gerekir; yoksa null. */
export function theilSen(points: readonly Point[]): Fit | null {
  const pts = normalizePoints(points);
  if (pts.length < 2) return null;
  const days = pts.map((point) => dayNumber(point.date));
  const originDay = days[0]!;
  const t = days.map((day) => day - originDay);
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      slopes.push((pts[j]!.value - pts[i]!.value) / (t[j]! - t[i]!));
    }
  }
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
/** Bant ≈ %80 tahmin aralığı. */
const BAND_Z = 1.28;

export type ForecastPoint = Point & { low: number; high: number };

export type Forecast =
  | { ok: true; fit: Fit; points: ForecastPoint[]; horizonDays: number; slopePerWeek: number }
  | { ok: false; reason: 'too_few_points' | 'too_short_span' };

/**
 * Son noktadan ileriye tahmin. `stepDays` aralıklı noktalar döner (grafikte kesikli çizgi
 * ve bant). Bant, dayanıklı yayılımla kurulan doğrusal tahmin aralığıdır; ölçüm gürültüsü
 * büyükse geniş çıkar — bu istenen davranış.
 */
export function forecast(points: readonly Point[], { horizonDays = FORECAST_MAX_DAYS, stepDays = 7 } = {}): Forecast {
  const pts = normalizePoints(points);
  if (pts.length < FORECAST_MIN_POINTS) return { ok: false, reason: 'too_few_points' };
  const first = dayNumber(pts[0]!.date);
  const last = dayNumber(pts[pts.length - 1]!.date);
  const span = last - first;
  if (span < FORECAST_MIN_SPAN_DAYS) return { ok: false, reason: 'too_short_span' };

  const fit = theilSen(pts)!;
  const horizon = Math.max(stepDays, Math.min(horizonDays, Math.floor(span / 2), FORECAST_MAX_DAYS));
  const out: ForecastPoint[] = [];
  for (let d = 0; d <= horizon; d += stepDays) {
    const day = last + d;
    const t = day - fit.originDay;
    const value = fit.intercept + fit.slopePerDay * t;
    const spread = BAND_Z * fit.sigma * Math.sqrt(1 + 1 / fit.n + (fit.sxx > 0 ? (t - fit.meanDay) ** 2 / fit.sxx : 0));
    out.push({ date: dateOf(day), value, low: value - spread, high: value + spread });
  }
  return { ok: true, fit, points: out, horizonDays: horizon, slopePerWeek: fit.slopePerDay * 7 };
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
 */
export function trendStatus(
  points: readonly Point[],
  noise: Noise,
  { windowDays = PLATEAU_WINDOW_DAYS, minPoints = PLATEAU_MIN_POINTS } = {},
): { status: TrendStatus; change: number | null; from: string | null; to: string | null } {
  const pts = normalizePoints(points);
  if (pts.length === 0) return { status: 'insufficient', change: null, from: null, to: null };
  const to = pts[pts.length - 1]!.date;
  const from = dateOf(dayNumber(to) - windowDays);
  const window = pts.filter((point) => point.date >= from);
  // Pencere gerçekten dolu olmalı: ilk nokta pencere başına yakın (en fazla haftası içinde).
  const covers = pts[0]!.date <= from || dayNumber(window[0]?.date ?? to) - dayNumber(from) <= 7;
  if (window.length < minPoints || !covers) return { status: 'insufficient', change: null, from, to };

  const fit = theilSen(window);
  if (!fit) return { status: 'insufficient', change: null, from, to };
  const start = valueAt(fit, window[0]!.date);
  const end = valueAt(fit, to);
  const change = end - start;
  const size = noise.relative ? Math.abs(change) / Math.max(Math.abs(start), Number.EPSILON) : Math.abs(change);
  if (size < noise.threshold) return { status: 'plateau', change, from, to };
  const better = noise.better === 'higher' ? change > 0 : change < 0;
  return { status: better ? 'improving' : 'declining', change, from, to };
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
