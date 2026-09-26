import { formatDay, formatDayShort, formatKg, formatNumber, formatSignedWithUnit, formatWithUnit } from './format.ts';
import type { LineKey } from './measurement-trends.ts';
import { MEASUREMENTS } from './measurements.ts';
import type { CircumferenceChange, ExerciseStrength, MuscleRole, StrengthStatus } from './muscle-progress.ts';
import { E1RM_MAX_REPS, type RecordEvent, type RecordKind, type RecordMark } from './personal-records.ts';
import type { TrackingType } from './progression.ts';
import type { Achievement, AchievementId, ExercisePoint, Streak } from './progress.ts';
import { daysBetween, forecast, forecastAsOf, FORECAST_MIN_POINTS, FORECAST_MIN_SPAN_DAYS, shiftDay, type Forecast } from './trend.ts';

/**
 * İlerleme sekmesinin metinleri ve grafik seçimleri — saf, sunucu ve telefon ortak; danışanın İlerleme'si
 * ve PT'nin danışan sayfasındaki İlerleme sekmesi aynı metinleri kullanır.
 *
 * Danışanın dilinde (SPEC §6): "e1RM", "1RM", "tonaj", "hacim" gibi kısaltmalar yok; tahmini maksimum,
 * toplam ağırlık denir. Sayılar Türkçe (`format.ts`). Kime yazıldığı `ProgressViewer`: danışana ikinci
 * tekil ("kaldırdığın"), PT'ye danışanın adıyla ya da yansız ("Ayşe kaldırdı", "kaldırılan"). Adın
 * arkasına ek gelmez (ünlü uyumu addan bilinmez): ad yalnız özne olur.
 */

/** İlerleme ekranını kim görüyor: danışan kendi gidişatını, PT danışanınkini. */
export type ProgressViewer = 'client' | 'pt';

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

/**
 * Tahmini maksimum grafiğinin son noktasından sonraki, bütün setleri 12'den çok tekrarlı antrenman günleri
 * (yüklü set var, tahmini maksimum yok); `from`dan itibaren. Grafik bu günleri çizmez; hareket yapılmamış
 * sanılmasın ve "son kayıt … gün önce" denmesin diye sayılır.
 */
export function highRepDaysSince(points: readonly ExercisePoint[], from?: string): number {
  const shown = points.filter((point) => !from || point.date >= from);
  const last = shown.filter((point) => point.e1rm !== undefined).at(-1)?.date;
  return shown.filter((point) => (!last || point.date > last) && point.e1rm === undefined && point.topKg !== undefined).length;
}

/** Grafiğin altında: son günlerin neden çizilmediği ve nereye bakılacağı. */
export function highRepDaysText(count: number, viewer: ProgressViewer = 'client'): string {
  const days = count === 1 ? 'Son antrenman gününde' : `Son ${count} antrenman gününde`;
  const where = viewer === 'pt' ? "Ağırlık “En ağır”da, güç gelişimi Gelişim'de görünür." : "Ağırlığın “En ağır”da, güç gelişimin Gelişim'de görünür.";
  return `${days} bütün setler ${E1RM_MAX_REPS}'den çok tekrarlı; tahmini maksimum o günler için hesaplanmaz. ${where}`;
}

/** Tahmini maksimumun açıklaması (grafiğin altında). */
export function e1rmNote(viewer: ProgressViewer = 'client'): string {
  const lead =
    viewer === 'pt'
      ? 'Tek tekrarda kaldırabileceği en ağır yükün tahmini; kaldırması gereken bir hedef değil, gidişatı gösterir.'
      : 'Tek tekrarda kaldırabileceğin en ağır yükün tahmini; kaldırman gereken bir hedef değil, gidişatı gösterir.';
  return `${lead} Epley formülüyle hesaplanır: ağırlık × (1 + tekrar ÷ 30). Yalnız 1–${E1RM_MAX_REPS} tekrarlı setlerden: tekrar arttıkça tahmin şaşar, en isabetlisi az tekrarlı setlerdir.`;
}

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
export function achievementDetail(achievement: Achievement, weeklyTarget: number, viewer: ProgressViewer = 'client'): string {
  if (achievement.achievedOn) return formatDay(achievement.achievedOn);
  switch (achievement.id) {
    case 'first_workout':
      return viewer === 'pt' ? 'İlk antrenmanını bitirince.' : 'İlk antrenmanını bitir.';
    case 'first_record':
      return viewer === 'pt' ? 'Bir harekette en iyisini geçince.' : 'Bir harekette en iyini geç.';
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

/* --- Gelişim (güç) --- */

export const STRENGTH_STATUS_LABELS: Record<StrengthStatus, string> = {
  improved: 'Gelişti',
  stable: 'Sabit',
  declined: 'Geriledi',
  insufficient: 'Veri az',
};

/** Oransal değişim: 0,084 → "+%8,4", −0,03 → "−%3"; binde bire yuvarlı. */
export function formatChangePct(ratio: number): string {
  return formatSignedWithUnit(Math.round(ratio * 1000) / 10, '%');
}

/** Karar yoksa ne gerektiği: pencerede en az 4 antrenman günü ve 3 hafta (`FORECAST_MIN_*`). */
export function strengthMissingText(exercise: Pick<ExerciseStrength, 'missing'> & { points: readonly { date: string }[] }): string {
  if (exercise.missing === 'too_short_span') {
    const days = daysBetween(exercise.points[0]!.date, exercise.points.at(-1)!.date);
    return `Kayıtların en az ${FORECAST_MIN_SPAN_DAYS / 7} haftaya yayılması gerekir; bu dönemde ${days} güne sığıyor.`;
  }
  return `Karar için bu dönemde en az ${FORECAST_MIN_POINTS} antrenman günü gerekir; şimdilik ${exercise.points.length}.`;
}

/**
 * Hareketin satırı: çizginin başı ve sonu, değişim ve olası aralığı. "≈ 62,1 → 68,4 kg (+%10,2) · olası
 * değişim +5,3 – +10,5 kg"; karar yoksa ne gerektiği.
 */
export function strengthDetail(exercise: Pick<ExerciseStrength, 'metric' | 'fit' | 'missing'> & { points: readonly { date: string }[] }): string {
  const fit = exercise.fit;
  if (!fit) return strengthMissingText(exercise);
  const unit = METRICS[exercise.metric].unit;
  const pct = fit.changePct === null ? '' : ` (${formatChangePct(fit.changePct)})`;
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${formatNumber(Math.abs(value))}`;
  const range = `${signed(tenth(fit.low))} – ${formatSignedWithUnit(tenth(fit.high), unit)}`;
  return `≈ ${formatNumber(tenth(fit.start))} → ${formatWithUnit(tenth(fit.end), unit)}${pct} · olası değişim ${range}`;
}

/** Kasın rolü, grup satırında: hepsi aynıysa tek ad, değilse kas kas ("Hedef: alt göğüs · Yardımcı: üst göğüs"). */
export function groupRoleText(roles: readonly { muscle: string; role: MuscleRole }[], labelOf: (muscle: string) => string): string {
  const distinct = [...new Set(roles.map((item) => item.role))];
  if (distinct.length === 1) return ROLE_NAMES[distinct[0]!];
  return (['primary', 'secondary', 'stabilizer'] as const)
    .filter((role) => distinct.includes(role))
    .map((role) => `${ROLE_NAMES[role]}: ${roles.filter((item) => item.role === role).map((item) => labelOf(item.muscle).toLocaleLowerCase('tr')).join(', ')}`)
    .join(' · ');
}

const ROLE_NAMES: Record<MuscleRole, string> = { primary: 'Hedef', secondary: 'Yardımcı', stabilizer: 'Dengeleyici' };

/** Gelişim bölümünün yöntem notu (kas sheet'inin altında). */
export function strengthMethodNote(viewer: ProgressViewer = 'client'): string[] {
  const first =
    viewer === 'pt'
      ? `Her hareket için seçilen dönemdeki antrenman günlerinin en iyisi alınır: ağırlıklı harekette tahmini maksimum, vücut ağırlığıyla yapılanda en çok tekrar, süreli harekette en uzun set. Bütün setleri ${E1RM_MAX_REPS}'den çok tekrarlı gün de sayılır: tahmini maksimum o gün en ağır setten hesaplanır.`
      : `Her hareket için seçtiğin dönemdeki antrenman günlerinin en iyisi alınır: ağırlıklı harekette tahmini maksimum, vücut ağırlığıyla yaptığında en çok tekrar, süreli harekette en uzun set. Bütün setlerini ${E1RM_MAX_REPS}'den çok tekrarla yaptığın gün de sayılır: tahmini maksimum o gün en ağır setinden hesaplanır.`;
  return [first, ...STRENGTH_METHOD_REST];
}

const STRENGTH_METHOD_REST = [
  'Bu değerlerden tek bir kötü güne kapılmayan bir eğilim çizgisi çizilir (Theil–Sen). Çizginin değişiminin olası aralığı (≈%80) tamamen artıdaysa “gelişti”, tamamen eksideyse “geriledi”, sıfırı kapsıyorsa “sabit” denir.',
  `Karar için dönemde en az ${FORECAST_MIN_POINTS} antrenman günü ve ${FORECAST_MIN_SPAN_DAYS / 7} hafta gerekir.`,
  'Kas, onu çalıştıran hareketlerden hesaplanır: hedef kas tam, yardımcı kas yarım, dengeleyici kas çeyrek sayılır; yalnız dengeleyici olarak çalıştığı hareketler kasa karar vermez.',
  'Bu güç gelişimidir: kasın büyüdüğünü tek başına göstermez, beceri ve sinir sistemi de gücü artırır.',
];

export const STRENGTH_METHOD_NOTE = strengthMethodNote('client');

const SIDE_NAMES: Record<LineKey, string> = { value: '', left: 'sol', right: 'sağ' };

/**
 * Çevre değişimi: "Kol çevresi (kasılı), sağ: +0,6 cm". Eşiği bilinen ölçümde (kalça) hata payı içindeyse
 * söylenir; eşiği olmayanda (kol, uyluk, baldır) yalnız fark: gelişme ya da gerileme denmez.
 */
export function circumferenceText(change: Pick<CircumferenceChange, 'id' | 'key' | 'delta' | 'kind'>): string {
  const side = SIDE_NAMES[change.key];
  const label = `${MEASUREMENTS[change.id].label}${side ? `, ${side}` : ''}`;
  const noise = change.kind === 'no_real_change' ? ' · ölçüm hatası payı içinde' : '';
  return `${label}: ${formatSignedWithUnit(change.delta, 'cm')}${noise}`;
}

/* --- grafik bölümü --- */

/** Son `days` günün (bugün dahil) ortalaması ve nokta sayısı; nokta yoksa null. */
export function recentAverage(points: readonly { date: string; value: number }[], today: string, days = 28): { average: number; count: number } | null {
  const from = shiftDay(today, -(days - 1));
  const recent = points.filter((point) => point.date >= from && point.date <= today);
  if (recent.length === 0) return null;
  return { average: tenth(recent.reduce((sum, point) => sum + point.value, 0) / recent.length), count: recent.length };
}

/** "Son 4 tamamlanan haftada 11/12 gün (%92)." — hafta başına plandan fazlası sayılmaz. */
export function adherenceText(recent: { done: number; planned: number; weeks: number }): string {
  const pct = Math.round((recent.done / recent.planned) * 100);
  const weeks = recent.weeks === 1 ? 'Geçen hafta' : `Son ${recent.weeks} tamamlanan haftada`;
  return `${weeks} ${recent.done}/${recent.planned} gün (%${pct}).`;
}

/** Su özeti: kayıtlı gün ve o günlerin ortalaması (bardak). */
export function waterSummary(days: readonly { glasses: number }[]): { recorded: number; average: number | null } {
  const recorded = days.filter((day) => day.glasses > 0);
  return {
    recorded: recorded.length,
    average: recorded.length > 0 ? tenth(recorded.reduce((sum, day) => sum + day.glasses, 0) / recorded.length) : null,
  };
}

/* --- kime yazıldığı --- */

/**
 * İlerleme bileşenlerinin kime göre değişen metinleri (`src/components/progress`): danışana ikinci tekil,
 * PT'ye danışanın adıyla ya da yansız. `name`: danışanın adı (PT'de; boşsa "Danışan"). Ad yalnız öznedir,
 * arkasına ek gelmez. Kime göre değişmeyen metinler bileşenlerde durur.
 */
export function progressCopy(viewer: ProgressViewer, name?: string) {
  const who = name?.trim() || 'Danışan';
  const pt = viewer === 'pt';
  return {
    /* sayfa */
    emptyTitle: pt ? 'Henüz bitmiş antrenman yok' : 'İlerlemen burada görünecek',
    emptyText: pt
      ? `${who} ilk antrenmanını bitirince her hareketin ağırlık grafiği, hangi kasların ne kadar çalıştığı, rekorlar ve başarılar burada birikmeye başlar.`
      : 'İlk antrenmanını bitirdiğinde her hareket için kaldırdığın ağırlığın grafiği, hangi kasları ne kadar çalıştırdığın, rekorların ve başarıların burada birikmeye başlar.',
    firstWorkout: (day: string) => (pt ? `İlk antrenman ${day}` : `İlk antrenmanın ${day}`),

    /* Gelişim */
    strengthIntro: pt
      ? `${who} hangi kasında güç kazandı: hareketlerindeki en iyi setlerin gidişatı.`
      : 'Hangi kasında güç kazandın: hareketlerindeki en iyi setlerin gidişatı.',
    strengthNoData: (periodIn: string) =>
      `${periodIn} karar verecek kadar veri yok. Bir hareketin kararı için dönemde en az ${FORECAST_MIN_POINTS} antrenman günü ve ${FORECAST_MIN_SPAN_DAYS / 7} hafta gerekir; ${pt ? 'daha uzun bir dönem seç.' : 'daha uzun bir dönem seç ya da antrenmanlarına devam et.'}`,
    strengthHint: pt ? 'Bir kas seç: hareketleri ve grafikleri' : 'Bir kasa dokun: hareketleri ve grafikleri',
    strengthFootnote: `Bu güç gelişimidir; kasın büyüdüğünü tek başına göstermez. ${pt ? 'Bir kas seçilince' : 'Bir kasa dokununca'} hareketleri, grafikleri ve hesabın nasıl yapıldığı açılır.`,
    measurementsUnavailable: pt ? 'Ölçümler şu an okunamadı.' : 'Ölçümlerin şu an okunamadı.',
    methodNote: strengthMethodNote(viewer),

    /* Hareketler */
    exerciseIntro: pt ? 'Bir hareket seç: ağırlık, tekrar ve rekorların gidişatı.' : 'Bir hareket seç: ağırlığının, tekrarlarının ve rekorlarının gidişatı.',
    stageNote: pt ? 'bu hareketteki deneyimi' : 'bu hareketteki deneyimin',
    bestTitle: pt ? 'En iyileri' : 'En iyilerin',
    recordSessions: (count: number) => `${formatNumber(count)} antrenmanda rekor ${pt ? 'kırdı' : 'kırdın'}`,
    pickerDescription: pt ? 'Yapılan hareketler, en son yapılan önce.' : 'Yaptığın hareketler, en son yaptığın önce.',
    pickerList: pt ? 'Yapılan hareketler' : 'Yaptığın hareketler',
    e1rmNote: e1rmNote(viewer),
    highRepDays: (count: number) => highRepDaysText(count, viewer),

    /* grafikler */
    unavailable: (what: string) => `${what} şu an okunamadı. ${pt ? 'Biraz sonra sayfayı yenile.' : 'Biraz sonra yeniden dene; sürerse antrenörüne haber ver.'}`,
    weeklyLoadIntro: pt
      ? 'Hafta başına kaldırılan toplam ağırlık ya da yapılan çalışma seti; ısınma setleri hariç.'
      : 'Hafta başına kaldırdığın toplam ağırlık ya da yaptığın çalışma seti; ısınma setleri hariç.',
    workingSetsNote: `Çalışma seti: ısınma hariç ${pt ? 'yapılan' : 'yaptığın'} bütün setler (fazladan setler dahil).`,
    adherenceIntro: pt ? 'Haftada kaç gün antrenman yapıldığı ve plan.' : 'Haftada kaç gün antrenman yaptığın ve planın.',
    adherenceNoPlan: pt
      ? 'Programda haftalık gün sayısı yok; yalnız yapılan günler gösteriliyor.'
      : 'Programında haftalık gün sayısı yok; yalnız yaptığın günler gösteriliyor.',
    adherencePlanNote: `Plan bugünkü ${pt ? 'plandır' : 'planındır'}, geçmiş haftalara da uygulanır. Aynı gün iki antrenman bir gün sayılır.`,
    adherenceWeeksNote: `Bu hafta sürüyor; ${pt ? 'ilk hafta' : 'ilk haftan'} (başlangıç) özete girmez.`,
    readinessWhat: pt ? 'Hazır oluşluk cevapları' : 'Hazır oluşluk cevapların',
    readinessFirst: (score: number) => `${pt ? 'ilk puan' : 'ilk puanın'} ${formatNumber(score)}`,
    painIntro: `0 ağrı yok, 10 dayanılmaz. Antrenman öncesi: son 24 saatteki ${pt ? 'ağrı' : 'ağrın'}; antrenmanda: en yüksek ${pt ? 'ağrı' : 'ağrın'}.`,
    painWhat: pt ? 'Ağrı cevapları' : 'Ağrı cevapların',
    painFootnote: pt ? `Ağrı artıyor ya da geçmiyorsa ${who} ile konuş; programı ona göre düzenle.` : 'Ağrın artıyorsa ya da geçmiyorsa antrenörüne söyle.',
    effortEmpty: `${pt ? `${who} antrenman` : 'Antrenman'} sonrası “Nasıl geçti?” sorusunu cevapladıkça burada birikir; grafik iki cevaptan sonra çizilir.`,
    waterIntro: pt
      ? 'Son 30 günde günde kaç bardak su içildiği: Bugün ekranındaki bardaklar ve antrenmandakiler.'
      : "Son 30 günde günde kaç bardak içtiğin: Bugün'deki bardaklar ve antrenmandakiler.",
    waterWhat: pt ? 'Su kaydı' : 'Su kaydın',
    waterEmpty: pt
      ? `${who} Bugün ekranındaki su düğmesiyle ya da antrenmanda bardak ekledikçe burada günlük birikir.`
      : 'Bugün ekranındaki su düğmesiyle ya da antrenmanda eklediğin bardaklar burada günlük birikir.',
    waterDays: (days: number) => `Su ${pt ? 'girilen' : 'girdiğin'} ${formatNumber(days)} günde ortalama`,
    musclesIntro: pt ? 'Haftada hangi kasın kaç set çalıştığı.' : 'Haftada hangi kası kaç set çalıştırdığın.',
    musclesHint: pt ? 'Bir kas seç: set sayısı' : 'Bir kasa dokun: set sayısı',

    /* rekorlar */
    recordsIntro: pt ? 'Bir hareketteki en iyisinin geçildiği antrenmanlar.' : 'Bir hareketteki en iyini geçtiğin antrenmanlar.',
    recordsEmpty: pt
      ? `Henüz rekor yok. ${who} bir harekette daha ağır kaldırınca ya da aynı ağırlıkta daha çok tekrar yapınca burada görünür.`
      : 'Henüz rekor yok. Bir harekette daha ağır kaldırdığında ya da aynı ağırlıkta daha çok tekrar yaptığında burada görünür.',
  };
}

export type ProgressCopy = ReturnType<typeof progressCopy>;
