import { deloadWeight, type LoadSpec, type Plan, type Suggestion } from './progression.ts';

/**
 * Seans yoklaması ve yük toleransı — "ağrı izleme" kuralı.
 *
 * Kaynak: `docs/research/medical-fitness/` (Silbernagel 2007 ağrı izleme modeli;
 * Malliaras 2015 patellar tendinopati; ağrısız ve ağrılı egzersizi karşılaştıran RKÇ).
 * Kural üç koşuldan oluşur:
 *   1. Seans içi ağrı eşiği aşmaz (varsayılan 3/10; ağrı izleme modunda 5/10).
 *   2. Seans sonrası ağrı ertesi sabah başlangıç düzeyine döner.
 *   3. Ağrı haftadan haftaya artmaz.
 * Biri bozulursa yük geri çekilir. Kırmızı bayrak ya da aşağı yayılan semptom
 * programı durdurur — bunlar yük kararı değil, değerlendirme gerekçesidir.
 *
 * Bilinçli olarak YOK: akut:kronik iş yükü oranı (ACWR). Kaynaklar eşiklerinin
 * doğrulanmadığını ve matematiksel eşleşmeden sahte ilişki ürettiğini gösteriyor;
 * yerine ham haftalık yük ve haftalık değişim saklanır, yorumu PT yapar.
 */

/** Semptom yönü: radikülopatide programı durduran tek sinyal "aşağı yayılıyor"dur. */
export const SYMPTOM_DIRECTIONS = ['centralizing', 'stable', 'peripheralizing'] as const;
export type SymptomDirection = (typeof SYMPTOM_DIRECTIONS)[number];

export const IRRITABILITY_LEVELS = ['low', 'moderate', 'high'] as const;
export type Irritability = (typeof IRRITABILITY_LEVELS)[number];

/** Her seans bilinçli işaretlenir; "yok" da bir cevaptır. */
export const RED_FLAG_CHECKS = ['none', 'new_neuro_deficit', 'bladder_bowel_change', 'night_pain', 'new_trauma'] as const;
export type RedFlagCheck = (typeof RED_FLAG_CHECKS)[number];

export const SYMPTOM_DIRECTION_LABELS: Record<SymptomDirection, string> = {
  centralizing: 'Merkeze çekiliyor',
  stable: 'Değişmedi',
  peripheralizing: 'Aşağı yayılıyor',
};

export const IRRITABILITY_LABELS: Record<Irritability, string> = {
  low: 'Düşük (ara ara, kolay tetiklenmiyor)',
  moderate: 'Orta',
  high: 'Yüksek (sürekli, kolay tetikleniyor)',
};

export const RED_FLAG_LABELS: Record<RedFlagCheck, string> = {
  none: 'Yok',
  new_neuro_deficit: 'Yeni uyuşma / güç kaybı',
  bladder_bowel_change: 'İdrar ya da dışkılama değişikliği',
  night_pain: 'Geceleri uyandıran ağrı',
  new_trauma: 'Yeni düşme ya da darbe',
};

/**
 * Seans yoklaması. Ağrı alanları sağlık verisidir (onaylı `health.json`); RPE ve süre
 * antrenman verisidir (`sessions/*.json`). Hepsi isteğe bağlı, yalnız kırmızı bayrak
 * sorusu her seans cevaplanır.
 */
export type CheckIn = {
  /** YYYY-MM-DD */
  date: string;
  /** Son 24 saatin ortalama ağrısı (0–10): başlangıç düzeyi. */
  painBaseline?: number;
  /** Seans içindeki en yüksek ağrı (0–10). */
  painPeak?: number;
  /** Önceki seanstan sonra ağrı ertesi sabah başlangıç düzeyine döndü mü. */
  returnedToBaseline?: boolean;
  symptomDirection?: SymptomDirection;
  irritability?: Irritability;
  /** Seans zorluğu, CR-10 (0–10); seans bitiminden ~10 dk sonra sorulur. */
  sessionRpe?: number;
  /** Seans süresi (dakika). */
  durationMin?: number;
  /** Ağrısız yürüme süresi (dakika). */
  painFreeWalkingMin?: number;
  redFlag: RedFlagCheck;
};

/**
 * Ağrı tavanı. Varsayılan tutucu (0–2, en fazla 3/10): ağrıya girerek çalışmanın
 * üstünlüğü gösterilmedi. PT tendinopatide Silbernagel'in 5/10'unu seçebilir.
 */
export const TOLERANCE_MODES = ['pain_free', 'pain_monitoring'] as const;
export type ToleranceMode = (typeof TOLERANCE_MODES)[number];

export const PAIN_CEILING: Record<ToleranceMode, number> = { pain_free: 3, pain_monitoring: 5 };

export const TOLERANCE_MODE_LABELS: Record<ToleranceMode, string> = {
  pain_free: 'Ağrısız (en fazla 3/10)',
  pain_monitoring: 'Ağrı izleme (en fazla 5/10, tendinopati)',
};

/** Ağrıda en küçük anlamlı değişim (NPRS): altındaki fark gürültüdür. */
export const PAIN_MCID = 2;

export const TOLERANCE_ACTIONS = ['progress', 'hold', 'reduce', 'stop'] as const;
export type ToleranceAction = (typeof TOLERANCE_ACTIONS)[number];

export type ToleranceReason = {
  code:
    | 'red_flag'
    | 'peripheralizing'
    | 'not_back_to_baseline'
    | 'peak_over_ceiling'
    | 'pain_rising_weekly'
    | 'high_irritability';
  action: Exclude<ToleranceAction, 'progress'>;
  message: string;
};

export type ToleranceResult = {
  /** En ağır karar; hiçbir koşul bozulmadıysa "progress". */
  action: ToleranceAction;
  reasons: ToleranceReason[];
};

const SEVERITY: Record<ToleranceAction, number> = { progress: 0, hold: 1, reduce: 2, stop: 3 };

const dayIndex = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/**
 * Bugünkü yoklamaya ve geçmişe bakıp yükü ne yapacağını söyler. `history`
 * bugünü içermez; sıra önemli değil (tarihe göre gruplanır).
 */
export function assessTolerance({
  current,
  history = [],
  mode = 'pain_free',
}: {
  current: CheckIn;
  history?: readonly CheckIn[];
  mode?: ToleranceMode;
}): ToleranceResult {
  const reasons: ToleranceReason[] = [];

  if (current.redFlag !== 'none') {
    reasons.push({
      code: 'red_flag',
      action: 'stop',
      message: `Yeni kırmızı bayrak (${RED_FLAG_LABELS[current.redFlag].toLocaleLowerCase('tr')}): tıbbi değerlendirme olmadan yük verilmez.`,
    });
  }
  if (current.symptomDirection === 'peripheralizing') {
    reasons.push({
      code: 'peripheralizing',
      action: 'stop',
      message: 'Semptom aşağı yayılıyor: yükleme durur, önce merkezileşme sağlanır.',
    });
  }
  if (current.returnedToBaseline === false) {
    reasons.push({
      code: 'not_back_to_baseline',
      action: 'reduce',
      message: 'Önceki seansın ağrısı ertesi sabah geçmedi: yük %15 azaltılır.',
    });
  }
  const ceiling = PAIN_CEILING[mode];
  if (current.painPeak !== undefined && current.painPeak > ceiling) {
    reasons.push({
      code: 'peak_over_ceiling',
      action: 'reduce',
      message: `Seans içi ağrı ${current.painPeak}/10, tavan ${ceiling}/10: yük azaltılır.`,
    });
  }

  // Haftadan haftaya: son 7 günün ortalaması önceki 7 güne göre anlamlı arttı mı.
  const today = dayIndex(current.date);
  const window = (from: number, to: number) =>
    [current, ...history]
      .filter((item) => item.painBaseline !== undefined)
      .filter((item) => {
        const age = today - dayIndex(item.date);
        return age >= from && age < to;
      })
      .map((item) => item.painBaseline as number);
  const thisWeek = mean(window(0, 7));
  const lastWeek = mean(window(7, 14));
  if (thisWeek !== null && lastWeek !== null && thisWeek - lastWeek >= PAIN_MCID) {
    reasons.push({
      code: 'pain_rising_weekly',
      action: 'hold',
      message: `Ağrı haftadan haftaya arttı (${lastWeek.toFixed(1)} → ${thisWeek.toFixed(1)}): artırma yok.`,
    });
  }

  if (current.irritability === 'high') {
    reasons.push({
      code: 'high_irritability',
      action: 'hold',
      message: 'İrritabilite yüksek: yükü artırma; izometrik ve ağrısız aralıkta çalış.',
    });
  }

  reasons.sort((a, b) => SEVERITY[b.action] - SEVERITY[a.action]);
  return { action: reasons[0]?.action ?? 'progress', reasons };
}

/** Artış sayılan öneriler: "hold" bunları geri çeker. */
const RAISES = new Set<Suggestion['reason']>(['increase', 'add_rep', 'add_time', 'harder_variant']);

/**
 * İlerleme önerisini tolerans kararına göre düzeltir. `last` son yapılan plandır
 * (ağırlık ve hedef tekrar/süre); azaltma ondan hesaplanır, artırılmış öneriden değil.
 */
export function applyTolerance(
  suggestion: Suggestion,
  tolerance: ToleranceResult,
  { spec, last }: { spec: LoadSpec; last: Plan },
): Suggestion {
  switch (tolerance.action) {
    case 'stop':
      return { ...last, reason: 'paused' };
    case 'reduce':
      return { weightKg: deloadWeight(last.weightKg, spec), target: last.target, reason: 'pain_reduce' };
    case 'hold':
      return RAISES.has(suggestion.reason) ? { ...last, reason: 'pain_hold' } : suggestion;
    default:
      return suggestion;
  }
}

/** Seans iç yükü (sRPE): CR-10 × dakika, birim AU. Eksik bilgide `null`. */
export function sessionLoad(checkIn: Pick<CheckIn, 'sessionRpe' | 'durationMin'>): number | null {
  if (checkIn.sessionRpe === undefined || checkIn.durationMin === undefined) return null;
  return checkIn.sessionRpe * checkIn.durationMin;
}

/** Pazartesi başlayan hafta: "2026-09-21". */
function weekStart(date: string): string {
  const day = dayIndex(date);
  // 1970-01-01 perşembe; pazartesiye göre kaydır.
  const monday = day - ((day + 3) % 7);
  return new Date(monday * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Haftalık iç yük ve önceki haftaya göre değişim (%). Eşik yok: yorum kişiye
 * özgüdür, popülasyon eşiği dayatılmaz.
 */
export function weeklyLoads(checkIns: readonly CheckIn[]): { week: string; load: number; changePercent: number | null }[] {
  const totals = new Map<string, number>();
  for (const item of checkIns) {
    const load = sessionLoad(item);
    if (load === null) continue;
    const week = weekStart(item.date);
    totals.set(week, (totals.get(week) ?? 0) + load);
  }
  const weeks = [...totals].sort(([a], [b]) => a.localeCompare(b));
  return weeks.map(([week, load], index) => {
    const previous = weeks[index - 1]?.[1];
    return {
      week,
      load,
      changePercent: previous ? Math.round(((load - previous) / previous) * 100) : null,
    };
  });
}
