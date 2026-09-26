import { circumferenceByWindow, type CircumferenceChange, type StrengthWindow } from './muscle-progress.ts';
import { mondayOf } from './program-plan.ts';
import { addDays, PROGRESS_WEEKS, type SessionDigest, type WeekView } from './progress.ts';
import type { HealthCheckIn, HealthRecord } from './schemas/health.ts';
import type { SessionIndex, WaterTap } from './schemas/session.ts';
import { readinessScore } from './session-check.ts';
import { normalizePoints, type Point } from './trend.ts';
import { waterOnDay } from './water.ts';
import { sessionWaterOn } from './workout-plan.ts';

/**
 * İlerleme sekmesinin grafik bölümü (SPEC §7.6) — saf; sunucu hesaplar, telefona yalnız noktalar gider.
 *
 * - Antrenman düzeni: haftada antrenman günü ve planlanan gün (Bugün'deki "bu hafta x/y"nin y'si).
 * - Seans zorluğu (CR-10): antrenman verisidir (SPEC §4), onaya bağlı değildir.
 * - Hazır oluşluk, ağrı ve çevre ölçümleri sağlık verisidir: yalnız o parçanın onayı varsa hesaplanır;
 *   onay yoksa `health.json` hiç okunmaz (`progress-data.ts`), bölüm çizilmez (`off`).
 * - Su: son 30 gün, `water.json` + bitmiş antrenmanların suyu (Bugün'deki toplamla aynı kural).
 */

/** Grafik için en az bu kadar nokta; altında boş durum ne gerektiğini söyler. */
export const CHART_MIN_POINTS = 2;
/** Su grafiği bu kadar gün geriye gider. */
export const WATER_DAYS = 30;

/** Onaya bağlı bölüm: onay yoksa `off` (hiç çizilmez), kayıt okunamadıysa `unavailable`. */
export type Gated<T> = { state: 'off' } | { state: 'unavailable' } | ({ state: 'ok' } & T);

/** Sağlık kaydının İlerleme'de gösterilebilen parçaları (`canRecordHealth`). */
export type HealthParts = { readiness: boolean; pain: boolean; measurements: boolean };

/** Haftalık grafiklerin ve sağlık grafiklerinin ilk günü: haftalık görünümle aynı 12 hafta (pazartesiden). */
export function chartStart(today: string): string {
  return addDays(mondayOf(today), -7 * (PROGRESS_WEEKS - 1));
}

/* --- antrenman düzeni --- */

export type AdherenceWeek = { weekStart: string; weekEnd: string; days: number; current: boolean };

export type Adherence = {
  weeks: AdherenceWeek[];
  /** Haftalık plan (gün); program ya da gün seçimi yoksa null. */
  planned: number | null;
  /**
   * Son (en çok 4) tamamlanmış haftada yapılan ve planlanan gün. Hafta başına plandan fazlası sayılmaz;
   * bu hafta (sürüyor) ve ilk antrenmanın haftası (başlangıç, çoğu zaman yarım) girmez **[sentez]**.
   */
  recent: { done: number; planned: number; weeks: number } | null;
};

/** Son haftaların özeti için en çok bu kadar tamamlanmış hafta. */
export const ADHERENCE_RECENT_WEEKS = 4;

/**
 * Haftada antrenman günü ve plan. Plan bugünkü plandır, geçmiş haftalara da uygulanır (o günkü plan
 * kayıtlı değil; seri de böyle sayar).
 */
export function adherenceOf(input: {
  weeks: readonly Pick<WeekView, 'weekStart' | 'weekEnd' | 'days'>[];
  planned: number | undefined;
  firstDate: string | null;
  today: string;
}): Adherence {
  const planned = input.planned && input.planned > 0 ? Math.min(7, Math.trunc(input.planned)) : null;
  const weeks = input.weeks.map((week) => ({ weekStart: week.weekStart, weekEnd: week.weekEnd, days: week.days, current: week.weekEnd >= input.today }));
  const complete = weeks
    .filter((week) => !week.current && !(input.firstDate && input.firstDate >= week.weekStart && input.firstDate <= week.weekEnd))
    .slice(-ADHERENCE_RECENT_WEEKS);
  const recent =
    planned && complete.length > 0
      ? { done: complete.reduce((sum, week) => sum + Math.min(week.days, planned), 0), planned: planned * complete.length, weeks: complete.length }
      : null;
  return { weeks, planned, recent };
}

/* --- sağlık ve zorluk serileri --- */

/** Hazır oluşluk puanı (20–100, `readinessScore`), gün başına bir; aynı gün iki yoklamada listede sonraki. */
export function readinessPoints(checkIns: readonly Pick<HealthCheckIn, 'date' | 'readiness'>[], from?: string): Point[] {
  const byDay = new Map<string, number>();
  for (const item of checkIns) if (item.readiness && (!from || item.date >= from)) byDay.set(item.date, readinessScore(item.readiness));
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/**
 * Ağrı (0–10): antrenman başında sorulan son 24 saatin ağrısı ve antrenmandaki en yüksek ağrı, gün başına
 * en yükseği (tutucu).
 */
export function painPoints(checkIns: readonly Pick<HealthCheckIn, 'date' | 'painBaseline' | 'painPeak'>[], from?: string): { before: Point[]; peak: Point[] } {
  const series = (pick: (item: Pick<HealthCheckIn, 'painBaseline' | 'painPeak'>) => number | undefined) => {
    const byDay = new Map<string, number>();
    for (const item of checkIns) {
      const value = pick(item);
      if (value === undefined || (from && item.date < from)) continue;
      byDay.set(item.date, Math.max(byDay.get(item.date) ?? 0, value));
    }
    return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  };
  return { before: series((item) => item.painBaseline), peak: series((item) => item.painPeak) };
}

/** Seans zorluğu (CR-10), gün başına ortalama (0,1'e yuvarlı). */
export function rpePoints(digests: readonly Pick<SessionDigest, 'date' | 'rpe'>[], from?: string): Point[] {
  const points = digests.flatMap((digest) => (digest.rpe !== undefined && (!from || digest.date >= from) ? [{ date: digest.date, value: digest.rpe }] : []));
  return normalizePoints(points).map((point) => ({ date: point.date, value: Math.round(point.value * 10) / 10 }));
}

/* --- su --- */

export type WaterDay = { date: string; glasses: number };

function utcDay(iso: string): string | null {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : new Date(at).toISOString().slice(0, 10);
}

/**
 * Son `days` günün suyu (bardak): antrenman dışı dokunuşlar (`waterOnDay`, uygulamanın saat diliminde) ve
 * o gün biten antrenmanların suyu (`sessionWaterOn`), Bugün'deki toplamla aynı kural. Saat dilimi farkı
 * bir günü geçmediği için dokunuşlar önce UTC gününe göre ayrılır; gün yalnız komşu kovalardan sayılır.
 */
export function waterDays(input: { taps: readonly Pick<WaterTap, 'd' | 'at'>[]; index: SessionIndex; today: string; timeZone: string; days?: number }): WaterDay[] {
  const count = input.days ?? WATER_DAYS;
  const first = addDays(input.today, -(count - 1));
  const [lowest, highest] = [addDays(first, -1), addDays(input.today, 1)];
  const buckets = new Map<string, Pick<WaterTap, 'd' | 'at'>[]>();
  for (const tap of input.taps) {
    const day = utcDay(tap.at);
    if (!day || day < lowest || day > highest) continue;
    buckets.set(day, [...(buckets.get(day) ?? []), tap]);
  }
  return Array.from({ length: count }, (_, offset) => {
    const date = addDays(first, offset);
    const nearby = [-1, 0, 1].flatMap((shift) => buckets.get(addDays(date, shift)) ?? []);
    return { date, glasses: waterOnDay(nearby, date, input.timeZone) + sessionWaterOn(input.index, date) };
  });
}

/* --- hepsi --- */

export type ProgressInsights = {
  adherence: Adherence;
  /** Seans zorluğu (CR-10), son 12 hafta. */
  rpe: Point[];
  /** Son 30 gün; `water.json` okunamadıysa `unavailable`. */
  water: { state: 'ok'; days: WaterDay[] } | { state: 'unavailable' };
  /** Son 12 hafta. */
  readiness: Gated<{ points: Point[] }>;
  pain: Gated<{ before: Point[]; peak: Point[] }>;
  /** Kaslara bağlı çevre değişimleri, Gelişim'in her penceresi için. */
  circumference: Gated<{ byWindow: Record<StrengthWindow, CircumferenceChange[]> }>;
};

/**
 * `health`: onaylı parça yoksa hiç okunmaz ve null gelir; dosya yoksa null; okunamadıysa `unavailable`.
 * `water`: dosyanın dokunuşları (yoksa boş), okunamadıysa `unavailable`.
 */
export function buildInsights(input: {
  weeks: readonly WeekView[];
  plannedDays: number | undefined;
  firstDate: string | null;
  digests: readonly Pick<SessionDigest, 'date' | 'rpe'>[];
  index: SessionIndex;
  water: readonly Pick<WaterTap, 'd' | 'at'>[] | 'unavailable';
  health: Pick<HealthRecord, 'checkIns' | 'measurements'> | null | 'unavailable';
  consent: HealthParts;
  today: string;
  timeZone: string;
}): ProgressInsights {
  const from = chartStart(input.today);
  const health = input.health;
  const gated = <T>(allowed: boolean, build: (record: Pick<HealthRecord, 'checkIns' | 'measurements'>) => T): Gated<T> => {
    if (!allowed) return { state: 'off' };
    if (health === 'unavailable') return { state: 'unavailable' };
    return { state: 'ok' as const, ...build(health ?? { checkIns: [], measurements: [] }) };
  };
  return {
    adherence: adherenceOf({ weeks: input.weeks, planned: input.plannedDays, firstDate: input.firstDate, today: input.today }),
    rpe: rpePoints(input.digests, from),
    water:
      input.water === 'unavailable'
        ? { state: 'unavailable' }
        : { state: 'ok', days: waterDays({ taps: input.water, index: input.index, today: input.today, timeZone: input.timeZone }) },
    readiness: gated(input.consent.readiness, (record) => ({ points: readinessPoints(record.checkIns, from) })),
    pain: gated(input.consent.pain, (record) => painPoints(record.checkIns, from)),
    circumference: gated(input.consent.measurements, (record) => ({ byWindow: circumferenceByWindow(record.measurements, input.today) })),
  };
}
