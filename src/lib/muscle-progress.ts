import {epley} from './personal-records.ts';
import { classifyChange, measurementTrends, type ChangeKind, type LineKey } from './measurement-trends.ts';
import type { MeasurementId } from './measurements.ts';
import type { ExercisePoint } from './progress.ts';
import { metricPoints, type Metric } from './progress-text.ts';
import type { TrackingType } from './progression.ts';
import { MUSCLES, type Muscle } from './schemas/exercise.ts';
import type { MeasurementEntry } from './schemas/health.ts';
import { daysBetween, FORECAST_MIN_POINTS, FORECAST_MIN_SPAN_DAYS, shiftDay, slopeBand, theilSen, valueAt, type Point } from './trend.ts';

/**
 * Güç gelişimi (İlerleme sekmesinin "Gelişim" bölümü; SPEC §7.6) — saf, sunucu ve telefon ortak; PT
 * ekranı da aynı hesabı kullanır.
 *
 * Hareket başına: seçili penceredeki antrenman günlerinin en iyi değeri (ağırlıklıda tahmini maksimum,
 * Epley, 12'den çok tekrarlı günde en ağır setten; vücut ağırlığında en çok tekrar; sürelide en uzun set —
 * `strengthPoints`) Theil–Sen doğrusuyla (`trend.ts`) özetlenir. Karar çizginin değişiminin ≈%80
 * aralığıyla verilir (Sen 1968, `slopeBand`): aralığın alt ucu sıfırın üstündeyse "gelişti", üst ucu
 * altındaysa "geriledi", sıfırı kapsıyorsa "sabit". Pencerede en az 4 antrenman günü ve 3 hafta yoksa
 * karar yok (ölçüm tahminiyle aynı kural, `FORECAST_MIN_POINTS` / `FORECAST_MIN_SPAN_DAYS`).
 *
 * Kas başına: onu çalıştıran hareketlerin kararları, şablon haritasının rol paylarıyla (hedef 1, yardımcı
 * 0,5, dengeleyici 0,25) tartılır. Bu **güç** gelişimidir: kasın büyüdüğünü göstermez (beceri ve sinir
 * uyumu da gücü artırır); çevre ölçümü onaylıysa yanında ayrıca yazılır.
 */

/** Seçilebilen pencereler; varsayılan 8 hafta **[sentez]**. */
export const STRENGTH_WINDOWS = {
  '4h': { label: '4 hafta', days: 28 },
  '8h': { label: '8 hafta', days: 56 },
  '12h': { label: '12 hafta', days: 84 },
  tumu: { label: 'Tümü', days: null },
} as const;
export type StrengthWindow = keyof typeof STRENGTH_WINDOWS;
export const STRENGTH_WINDOW_KEYS = Object.keys(STRENGTH_WINDOWS) as StrengthWindow[];
export const DEFAULT_STRENGTH_WINDOW: StrengthWindow = '8h';

/** Pencerenin ilk günü (dahil); "tümü" için undefined. */
export function strengthWindowStart(window: StrengthWindow, today: string): string | undefined {
  const days = STRENGTH_WINDOWS[window].days;
  return days === null ? undefined : shiftDay(today, -days);
}

/** Güç ölçüsü, kayıt türüne göre (İlerleme grafiğinin ilerleme değerleri, `progress-text.ts`). */
export const STRENGTH_METRIC: Record<TrackingType, Metric> = { weight_reps: 'e1rm', bodyweight_reps: 'reps', duration: 'seconds' };

export type StrengthStatus = 'improved' | 'stable' | 'declined' | 'insufficient';

/** Hareketin girdisi: İlerleme'nin hareket serisi (`ExerciseView`) ya da PT tarafında aynısı. */
export type StrengthSource = {
  key: string;
  exerciseId: string;
  title: string;
  deviceName?: string | undefined;
  trackingType: TrackingType;
  points: readonly ExercisePoint[];
  /** Kas → rol payı (hedef 1 · yardımcı 0,5 · dengeleyici 0,25); kütüphanede olmayan, ısınma ve soğuma hareketinde boş. */
  muscles: Readonly<Partial<Record<string, number>>>;
};

export type StrengthFit = {
  /** Karara giren ilk ve son antrenman günü. */
  from: string;
  to: string;
  /** Çizginin o iki gündeki değeri (birimde). */
  start: number;
  end: number;
  /** `end − start` ve ≈%80 aralığı (birimde). */
  change: number;
  low: number;
  high: number;
  /** Değişim başlangıç değerine oranla (0,08 = %8); başlangıç 0 ise null. */
  changePct: number | null;
};

export type ExerciseStrength = Omit<StrengthSource, 'points'> & {
  metric: Metric;
  /** Penceredeki günlük değerler (grafik). */
  points: Point[];
  status: StrengthStatus;
  /** Karar yoksa nedeni: pencerede 4'ten az antrenman günü ya da 3 haftadan kısa. */
  missing?: 'too_few_points' | 'too_short_span';
  fit?: StrengthFit;
};

/**
 * Güç kararının günlük değeri. Ağırlıklıda tahmini maksimum; bütün setleri 12'den çok tekrarlı günde en
 * ağır setten tahmin türetilmez. Tüm güç yüzeyleri aynı 1–12 tekrar kuralını kullanır.
 */
function strengthPoints(raw: readonly ExercisePoint[], metric: Metric): Point[] {
  if (metric !== 'e1rm') return metricPoints(raw, metric);
  return raw.flatMap((point) => {
    const value = point.e1rm ?? (epley(point.topKg,point.topReps) ?? undefined);
    return value === undefined ? [] : [{ date: point.date, value: Math.round(value * 10) / 10 }];
  });
}

/** Bir hareketin penceredeki güç eğilimi ve kararı. */
export function exerciseStrength(source: StrengthSource, input: { today: string; window: StrengthWindow }): ExerciseStrength {
  const { points: raw, ...rest } = source;
  const metric = STRENGTH_METRIC[source.trackingType];
  const from = strengthWindowStart(input.window, input.today);
  const points = strengthPoints(raw, metric).filter((point) => (!from || point.date >= from) && point.date <= input.today);
  const base = { ...rest, metric, points };
  if (points.length < FORECAST_MIN_POINTS) return { ...base, status: 'insufficient', missing: 'too_few_points' };
  const first = points[0]!.date;
  const last = points.at(-1)!.date;
  const span = daysBetween(first, last);
  if (span < FORECAST_MIN_SPAN_DAYS) return { ...base, status: 'insufficient', missing: 'too_short_span' };

  const fit = theilSen(points)!;
  const band = slopeBand(points)!;
  const start = valueAt(fit, first);
  const end = valueAt(fit, last);
  const low = band.low * span;
  const high = band.high * span;
  const status: StrengthStatus = low > 0 ? 'improved' : high < 0 ? 'declined' : 'stable';
  return {
    ...base,
    status,
    fit: { from: first, to: last, start, end, change: end - start, low, high, changePct: start > 0 ? (end - start) / start : null },
  };
}

/* --- kaslar --- */

export type MuscleRole = 'primary' | 'secondary' | 'stabilizer';

/** Rol payından rol: 1 hedef, 0,5 yardımcı, 0,25 dengeleyici (`ROLE_SET_WEIGHT`). */
export function roleOfWeight(weight: number): MuscleRole {
  return weight >= 1 ? 'primary' : weight >= 0.5 ? 'secondary' : 'stabilizer';
}

/** Belirgin gelişme: ağırlıklı değişim en az bu oran (%5) **[sentez]**; haritada tam ton, altı orta ton. */
export const STRONG_GAIN = 0.05;

export type MuscleContributor = {
  key: string;
  title: string;
  deviceName?: string;
  weight: number;
  role: MuscleRole;
  status: StrengthStatus;
  changePct: number | null;
};

export type MuscleStrength = {
  muscle: Muscle;
  status: StrengthStatus;
  /**
   * Kararla aynı yöndeki hareketlerin (sabitte kararı olan hepsinin) rol payıyla ağırlıklı ortalama
   * değişimi, tahmini maksimum cinsinden (`comparablePct`; süreli hareket girmez); yoksa null.
   */
  changePct: number | null;
  /** Gelişti ve değişim `STRONG_GAIN` ya da üstü. */
  strong: boolean;
  /** Payı büyükten küçüğe, sonra ada göre. */
  contributors: MuscleContributor[];
};

/**
 * Kas yüzdesine giren değişim, tahmini maksimum cinsinden **[sentez]**: tekrar değişimi Epley'le çevrilir
 * (aynı yükte tahmini maksimum ∝ 1 + tekrar/30, `oneRepMax`); süre bir güce çevrilemez, kas yüzdesine girmez.
 */
function comparablePct(exercise: ExerciseStrength): number | null {
  const fit = exercise.fit;
  if (!fit) return null;
  if (exercise.metric === 'e1rm') return fit.changePct;
  if (exercise.metric === 'reps') return (30 + fit.end) / (30 + fit.start) - 1;
  return null;
}

const STATUS_ORDER: Record<StrengthStatus, number> = { improved: 0, stable: 1, declined: 2, insufficient: 3 };

/**
 * Kas başına karar **[sentez]**: kararı olan hareketlerin rol payları toplanır; gelişenlerin payı toplamın
 * yarısından fazlaysa "gelişti", gerileyenlerinki yarısından fazlaysa "geriledi", değilse "sabit".
 * Kararı olan hareketlerden en az biri o kası hedef ya da yardımcı olarak çalıştırmalıdır: yalnız
 * dengeleyici olarak çalıştığı hareketler (squat'ta karın) kasa karar vermez, katkıları yine listelenir.
 * Dönemde hiç yapılmamış hareket katkı vermez; kardiyo bir kas değildir, girmez.
 */
export function muscleStrength(exercises: readonly ExerciseStrength[]): MuscleStrength[] {
  const byMuscle = new Map<Muscle, MuscleContributor[]>();
  const known = new Set<string>(MUSCLES);
  for (const exercise of exercises) {
    // Dönemde hiç yapılmamış hareket kasa katkı vermez: kas "veri az" değil, bu dönemde çalışılmamıştır.
    if (exercise.points.length === 0) continue;
    for (const [muscle, weight] of Object.entries(exercise.muscles)) {
      if (!weight || weight <= 0 || muscle === 'cardio' || !known.has(muscle)) continue;
      const list = byMuscle.get(muscle as Muscle) ?? [];
      list.push({
        key: exercise.key,
        title: exercise.title,
        ...(exercise.deviceName ? { deviceName: exercise.deviceName } : {}),
        weight,
        role: roleOfWeight(weight),
        status: exercise.status,
        changePct: comparablePct(exercise),
      });
      byMuscle.set(muscle as Muscle, list);
    }
  }

  const result: MuscleStrength[] = [];
  for (const muscle of MUSCLES) {
    const contributors = byMuscle.get(muscle);
    if (!contributors) continue;
    contributors.sort((a, b) => b.weight - a.weight || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title, 'tr'));
    const voting = contributors.filter((item) => item.status !== 'insufficient');
    if (!voting.some((item) => item.weight >= 0.5)) {
      result.push({ muscle, status: 'insufficient', changePct: null, strong: false, contributors });
      continue;
    }
    const total = voting.reduce((sum, item) => sum + item.weight, 0);
    const share = (status: StrengthStatus) => voting.filter((item) => item.status === status).reduce((sum, item) => sum + item.weight, 0);
    const status: StrengthStatus = share('improved') > total / 2 ? 'improved' : share('declined') > total / 2 ? 'declined' : 'stable';
    // Yüzde yalnız karara uyan hareketlerden: gelişen kasta gerileyen hareketin düşüşü "Gelişti · −%…" yazdırmasın.
    const weighted = voting.filter((item) => item.changePct !== null && (status === 'stable' || item.status === status));
    const weight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const changePct = weight > 0 ? weighted.reduce((sum, item) => sum + item.weight * item.changePct!, 0) / weight : null;
    result.push({ muscle, status, changePct, strong: status === 'improved' && changePct !== null && changePct >= STRONG_GAIN, contributors });
  }
  return result;
}

/** Grubun bir hareketi: kas başına rolüyle (üst göğüste yardımcı, alt göğüste hedef). */
export type GroupContributor = MuscleContributor & { roles: { muscle: Muscle; role: MuscleRole }[] };

/** Aynı hareketlerle aynı kararı ve değişimi alan kaslar tek satır (üst ve alt göğüs → "Göğüs"). */
export type MuscleGroup = Omit<MuscleStrength, 'muscle' | 'contributors'> & { muscles: Muscle[]; contributors: GroupContributor[] };

/** Karar, değişim (binde bire yuvarlı) ve katkı veren hareketler; paylar imzaya girmez (değişim zaten aynıysa satır aynı). */
function signature(item: MuscleStrength): string {
  const pct = item.changePct === null ? '-' : item.changePct.toFixed(3);
  return `${item.status}|${pct}|${item.strong}|${item.contributors.map((contributor) => contributor.key).sort().join(',')}`;
}

/** Kaslar, aynı imzadakiler birleşik; sıra kasların katalog sırası (grubun ilk kası). */
export function muscleGroups(muscles: readonly MuscleStrength[]): MuscleGroup[] {
  const groups = new Map<string, MuscleGroup>();
  for (const item of muscles) {
    const id = signature(item);
    const group = groups.get(id) ?? { status: item.status, changePct: item.changePct, strong: item.strong, muscles: [], contributors: [] };
    group.muscles.push(item.muscle);
    for (const contributor of item.contributors) {
      const known = group.contributors.find((entry) => entry.key === contributor.key);
      const role = { muscle: item.muscle, role: contributor.role };
      if (known) {
        known.roles.push(role);
        if (contributor.weight > known.weight) Object.assign(known, { weight: contributor.weight, role: contributor.role });
      } else group.contributors.push({ ...contributor, roles: [role] });
    }
    groups.set(id, group);
  }
  for (const group of groups.values()) {
    group.contributors.sort((a, b) => b.weight - a.weight || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title, 'tr'));
  }
  return [...groups.values()];
}

/** "En çok gelişen": gelişenler, değişimi büyükten küçüğe. */
export function improvedGroups(groups: readonly MuscleGroup[]): MuscleGroup[] {
  return groups.filter((group) => group.status === 'improved').sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
}

/** "Durağan / geriyen": önce gerileyenler (en çok düşen önce), sonra sabitler (değişimi küçükten büyüğe). */
export function flatGroups(groups: readonly MuscleGroup[]): MuscleGroup[] {
  return groups
    .filter((group) => group.status === 'declined' || group.status === 'stable')
    .sort((a, b) => STATUS_ORDER[b.status] - STATUS_ORDER[a.status] || (a.changePct ?? 0) - (b.changePct ?? 0));
}

/**
 * Pencereyi seçerken: 8 hafta, orada hiçbir harekete karar verilemiyorsa ve daha uzun bir pencerede
 * verilebiliyorsa o (12 hafta, sonra tümü): açılışta boş harita görünmesin **[sentez]**.
 */
export function defaultStrengthWindow(sources: readonly StrengthSource[], today: string): StrengthWindow {
  for (const window of [DEFAULT_STRENGTH_WINDOW, '12h', 'tumu'] as const) {
    if (sources.some((source) => exerciseStrength(source, { today, window }).status !== 'insufficient')) return window;
  }
  return DEFAULT_STRENGTH_WINDOW;
}

/* --- çevre ölçümleri --- */

/**
 * Kasın yanında gösterilen çevre ölçümleri **[sentez]**: kol çevresi (biceps, triceps), orta uyluk (ön ve
 * arka bacak, iç bacak), baldır, kalça (kalça kasları). Katalogda göğüs ve omuz çevresi yok. Çevre kas
 * kadar yağla da değişir; değişim yalnız "artış / azalma" diye yazılır, eşiği bilinen kalçada ölçüm hatası
 * içindeyse o söylenir (`measurement-trends.ts`).
 */
export const MUSCLE_MEASUREMENTS: Partial<Record<Muscle, readonly MeasurementId[]>> = {
  biceps: ['arm_flexed_girth', 'arm_relaxed_girth'],
  triceps_long: ['arm_flexed_girth', 'arm_relaxed_girth'],
  triceps_lateral: ['arm_flexed_girth', 'arm_relaxed_girth'],
  quadriceps: ['mid_thigh_girth'],
  adductors: ['mid_thigh_girth'],
  hamstrings_medial: ['mid_thigh_girth'],
  hamstrings_lateral: ['mid_thigh_girth'],
  gastroc_medial: ['calf_girth'],
  gastroc_lateral: ['calf_girth'],
  soleus: ['calf_girth'],
  glutes: ['hip_girth'],
  glute_medius: ['hip_girth'],
};

/** Kas grubunun çevre ölçümleri, katalog sırasıyla ve tekrarsız. */
export function measurementsFor(muscles: readonly string[]): MeasurementId[] {
  const ids = new Set(muscles.flatMap((muscle) => MUSCLE_MEASUREMENTS[muscle as Muscle] ?? []));
  return [...new Set(Object.values(MUSCLE_MEASUREMENTS).flat())].filter((id) => ids.has(id));
}

export type CircumferenceChange = {
  id: MeasurementId;
  /** Tek değerli ölçümde `value`, iki taraflıda `left` / `right`. */
  key: LineKey;
  first: Point;
  last: Point;
  /** Son eksi ilk (cm). */
  delta: number;
  /** Eşiği bilinen ölçümde (kalça) sınıf; yoksa null. */
  kind: ChangeKind | null;
};

/**
 * Penceredeki çevre değişimleri: pencerenin ilk ve son ölçümü arasında (en az iki ölçüm; tek ölçümde
 * yazılmaz). Yalnız kaslara bağlı çevreler (`MUSCLE_MEASUREMENTS`). Onay yoksa çağrılmaz.
 */
export function circumferenceChanges(entries: readonly MeasurementEntry[], input: { from?: string | undefined; to: string }): CircumferenceChange[] {
  const ids = new Set<string>(Object.values(MUSCLE_MEASUREMENTS).flat());
  const changes: CircumferenceChange[] = [];
  for (const trend of measurementTrends(
    entries.filter((entry) => ids.has(entry.id)),
    { from: input.from, to: input.to },
  )) {
    for (const line of trend.lines) {
      const first = line.points[0];
      const last = line.points.at(-1);
      if (!first || !last || first.date === last.date) continue;
      changes.push({
        id: trend.id,
        key: line.key,
        first,
        last,
        delta: Math.round((last.value - first.value) * 100) / 100,
        kind: trend.rule ? classifyChange(trend.rule, first.value, last.value) : null,
      });
    }
  }
  return changes;
}

/** Her pencere için çevre değişimleri (sunucuda bir kez; telefon pencere değiştirince yeniden okumaz). */
export function circumferenceByWindow(entries: readonly MeasurementEntry[], today: string): Record<StrengthWindow, CircumferenceChange[]> {
  return Object.fromEntries(
    STRENGTH_WINDOW_KEYS.map((window) => [window, circumferenceChanges(entries, { from: strengthWindowStart(window, today), to: today })]),
  ) as Record<StrengthWindow, CircumferenceChange[]>;
}
