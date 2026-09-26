import { formatDay, formatDayShort, formatKg, formatNumber, formatSignedWithUnit, formatWithUnit } from './format.ts';
import { E1RM_MAX_REPS, type RecordEvent, type RecordKind, type RecordMark } from './personal-records.ts';
import type { TrackingType } from './progression.ts';
import type { Achievement, AchievementId, ExercisePoint, Streak } from './progress.ts';
import { forecast, forecastAsOf, type Forecast } from './trend.ts';

/**
 * İlerleme sekmesinin metinleri ve grafik seçimleri — saf, sunucu ve telefon ortak.
 *
 * Danışanın dilinde (SPEC §6): "e1RM", "1RM", "tonaj", "hacim" gibi kısaltmalar yok; tahmini maksimum,
 * toplam ağırlık denir. Sayılar Türkçe (`format.ts`).
 */

/** Hareket grafiğinin gösterebildiği değerler. `short`: 375 px'te yan yana üç düğmeye sığan ad. */
export const METRICS = {
  top: { label: 'En ağır set', short: 'En ağır', unit: 'kg', forecast: true },
  e1rm: { label: 'Tahmini maksimum', short: 'Maksimum', unit: 'kg', forecast: true },
  volume: { label: 'Toplam ağırlık', short: 'Toplam', unit: 'kg', forecast: false },
  reps: { label: 'En çok tekrar', short: 'En çok', unit: 'tekrar', forecast: true },
  total_reps: { label: 'Toplam tekrar', short: 'Toplam', unit: 'tekrar', forecast: false },
  seconds: { label: 'En uzun set', short: 'En uzun', unit: 'sn', forecast: true },
  total_seconds: { label: 'Toplam süre', short: 'Toplam', unit: 'sn', forecast: false },
} as const;
export type Metric = keyof typeof METRICS;

/**
 * Kayıt türüne göre grafikler; ilki varsayılan. Toplamlarda tahmin çizilmez: set sayısıyla oynar,
 * ilerlemenin kendisi değildir.
 */
export const METRICS_OF: Record<TrackingType, readonly Metric[]> = {
  weight_reps: ['top', 'e1rm', 'volume'],
  bodyweight_reps: ['reps', 'total_reps'],
  duration: ['seconds', 'total_seconds'],
};

const tenth = (value: number) => Math.round(value * 10) / 10;

/** Grafiğin noktaları; değeri olmayan gün (ör. 12'den çok tekrarlı günün tahmini maksimumu) çizilmez. */
export function metricPoints(points: readonly ExercisePoint[], metric: Metric): { date: string; value: number }[] {
  const pick = (point: ExercisePoint): number | undefined => {
    switch (metric) {
      case 'top':
        return point.topKg;
      case 'e1rm':
        return point.e1rm === undefined ? undefined : tenth(point.e1rm);
      case 'volume':
        return point.volumeKg > 0 ? point.volumeKg : undefined;
      case 'reps':
        return point.bestReps;
      case 'total_reps':
        return point.totalReps > 0 ? point.totalReps : undefined;
      case 'seconds':
        return point.bestSeconds;
      case 'total_seconds':
        return point.totalSeconds > 0 ? point.totalSeconds : undefined;
    }
  };
  return points.flatMap((point) => {
    const value = pick(point);
    return value === undefined ? [] : [{ date: point.date, value }];
  });
}

/**
 * Değer ekseninin en az aralığı: 60 → 62,5 kg'lık bir adım uçurum gibi görünmesin. Ağırlıkta en büyük
 * değerin %10'u (en az 5 kg), tekrarda 4, sürede 20 sn; toplamlarda veri aralığı **[sentez]**.
 */
export function metricMinSpan(metric: Metric, values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  if (metric === 'top' || metric === 'e1rm') return Math.max(5, Math.max(...values) * 0.1);
  if (metric === 'reps') return 4;
  if (metric === 'seconds') return 20;
  return undefined;
}

/** Tahmin (Theil–Sen, `trend.ts`): yalnız ilerleme değerlerinde; negatif olamaz. */
export function metricForecast(metric: Metric, points: readonly { date: string; value: number }[]): Forecast | null {
  return METRICS[metric].forecast ? forecast(points, { min: 0 }) : null;
}

/** "45 sn", "1 dk 30 sn", "2 dk". */
export function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} sn`;
  return rest === 0 ? `${minutes} dk` : `${minutes} dk ${rest} sn`;
}

/**
 * Tahminin tek satırı, danışanın dilinde. Veri yetmiyorsa ne gerektiği; son kayıt tahminin ufkundan
 * eskiyse tahmin yazılmaz (geçmiş bir güne tahmin olmaz, `forecastAsOf`). Eğilim düz ya da aşağıysa
 * ileriye sayı verilmez: hafifletme ya da ara olabilir, düşüşü uzatmak yanıltır.
 */
export function describeTrend(result: Forecast, unit: string, today: string): string {
  if (!result.ok) {
    return result.reason === 'too_few_points'
      ? 'Tahmin için en az 4 antrenman gerekir.'
      : 'Tahmin için kayıtların en az 3 haftaya yayılması gerekir.';
  }
  const view = forecastAsOf(result, today);
  if (view.kind === 'stale') return `Son kayıt ${view.daysSince} gün önce; tahmin bir sonraki antrenmanla güncellenir.`;
  const slope = tenth(result.slopePerWeek);
  const trend = `Eğilim haftada ${formatSignedWithUnit(slope, unit)}.`;
  if (slope <= 0 || result.bound) return trend;
  const end = result.points.at(-1)!;
  const weeks = Math.round(result.horizonDays / 7);
  const [low, high] = [tenth(end.low), tenth(end.high)];
  const range = low === high ? '' : `; olası aralık ${formatNumber(low)}–${formatWithUnit(high, unit)}`;
  return `${trend} Böyle giderse ${weeks} hafta sonra (${formatDay(end.date)}) ≈ ${formatWithUnit(tenth(end.value), unit)}${range}. Tahmin eğilimin süreceğini varsayar.`;
}

/** Tahmini maksimumun açıklaması (grafiğin altında). */
export const E1RM_NOTE = `Tek tekrarda kaldırabileceğin en ağır yükün tahmini; kaldırman gereken bir hedef değil, gidişatı gösterir. Epley formülüyle hesaplanır: ağırlık × (1 + tekrar ÷ 30). Yalnız 1–${E1RM_MAX_REPS} tekrarlı setlerden: tekrar arttıkça tahmin şaşar, en isabetlisi az tekrarlı setlerdir.`;

/** Rekorun adı; vücut ağırlığında "en ağır" ek yüktür. */
export function recordLabel(kind: RecordKind, trackingType: TrackingType): string {
  switch (kind) {
    case 'heaviest':
      return trackingType === 'bodyweight_reps' ? 'En ağır ek yük' : 'En ağır set';
    case 'e1rm':
      return 'Tahmini maksimum';
    case 'reps_at_weight':
      return 'Aynı ağırlıkta en çok tekrar';
    case 'most_reps':
      return 'En çok tekrar';
    case 'longest':
      return 'En uzun süre';
  }
}

/** Rekorun değeri: "62,5 kg × 8", "≈ 83,3 kg (62,5 kg × 10)", "15 tekrar", "1 dk 30 sn". */
export function recordValue(mark: Pick<RecordMark, 'kind' | 'value' | 'kg' | 'reps' | 'seconds'>): string {
  switch (mark.kind) {
    case 'heaviest':
    case 'reps_at_weight':
      return `${formatKg(mark.kg ?? 0)} × ${mark.reps ?? 0}`;
    case 'e1rm':
      return `≈ ${formatKg(tenth(mark.value))} (${formatKg(mark.kg ?? 0)} × ${mark.reps ?? 0})`;
    case 'most_reps':
      return `${mark.reps ?? mark.value} tekrar`;
    case 'longest':
      return formatSeconds(mark.seconds ?? mark.value);
  }
}

/** Önceki en iyi: "önceki en iyi 60 kg × 8", tahminde "önceki ≈ 80 kg". */
export function recordPrevious(event: Pick<RecordEvent, 'kind' | 'previous'>): string {
  const previous = event.previous;
  if (event.kind === 'e1rm') return `önceki ≈ ${formatKg(tenth(previous.value))}`;
  return `önceki en iyi ${recordValue(previous)}`;
}

/** Hafta: "21–27 Eyl", ay değişirse "28 Eyl–4 Eki", yıl değişirse yıllı. */
export function weekLabel(weekStart: string, weekEnd: string): string {
  const withYear = weekStart.slice(0, 4) !== weekEnd.slice(0, 4);
  if (!withYear && weekStart.slice(0, 7) === weekEnd.slice(0, 7)) return `${Number(weekStart.slice(8))}–${formatDayShort(weekEnd)}`;
  return `${formatDayShort(weekStart, withYear)}–${formatDayShort(weekEnd, withYear)}`;
}

export const ACHIEVEMENT_TITLES: Record<AchievementId, string> = {
  first_workout: 'İlk antrenman',
  workouts_10: '10 antrenman',
  workouts_25: '25 antrenman',
  workouts_50: '50 antrenman',
  streak_4: '4 hafta üst üste',
  streak_12: '12 hafta üst üste',
  first_record: 'İlk rekor',
};

/** Başarının altındaki satır: kazanıldıysa günü, değilse ne gerektiği ve ilerleme. */
export function achievementDetail(achievement: Achievement, weeklyTarget: number): string {
  if (achievement.achievedOn) return formatDay(achievement.achievedOn);
  switch (achievement.id) {
    case 'first_workout':
      return 'İlk antrenmanını bitir.';
    case 'first_record':
      return 'Bir harekette en iyini geç.';
    case 'streak_4':
    case 'streak_12':
      return `Her hafta en az ${weeklyTarget} gün antrenman · ${achievement.current}/${achievement.target} hafta`;
    default:
      return `${achievement.current}/${achievement.target} antrenman`;
  }
}

/** Seri satırı: "3 hafta üst üste · en uzun 6 hafta"; seri yoksa bu haftanın durumu. */
export function streakText(streak: Streak): string {
  const week = `Bu hafta ${streak.thisWeek}/${streak.target} gün`;
  if (streak.current === 0) return streak.best > 0 ? `${week} · en uzun seri ${streak.best} hafta` : week;
  const best = streak.best > streak.current ? ` · en uzun ${streak.best} hafta` : '';
  return `${streak.current} hafta üst üste${best} · ${week.toLocaleLowerCase('tr')}`;
}
