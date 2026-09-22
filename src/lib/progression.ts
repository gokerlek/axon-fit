import type { Category, Equipment } from '@/lib/schemas/exercise';

/**
 * İlerleme (progressive overload) — bir sonraki antrenmanın ve setin önerisi.
 *
 * Saf fonksiyonlar: ağ, tarih, rastgelelik yok; aynı girdi hep aynı öneriyi verir.
 * Geçmiş danışanın repo'sundaki set kayıtlarından gelir (SPEC §7); kural egzersizin
 * varsayılanıdır, şablondaki satır bunu değiştirebilir. Öneri her zaman öneridir:
 * danışan ya da PT başka bir ağırlık girebilir.
 *
 * Kurallar (sektör pratiği):
 * - Ağırlık adımı aletin izin verdiği en küçük sıçramadır; artışı kişinin performansı
 *   belirler, sonuç bu adıma yuvarlanır.
 * - Çift ilerleme: tekrar aralığının tepesine bütün setlerde ulaşılınca ağırlık artar,
 *   tekrar hedefi alta döner; ulaşılmadıysa aynı ağırlıkla bir tekrar daha.
 * - Doğrusal: her başarılı antrenmanda bir adım (yeni başlayanlar için).
 * - Hedefin altında kalınan antrenmandan sonra ağırlık korunur; setlerin hiçbiri hedefe
 *   ulaşmadıysa yaklaşık %5 (en az bir adım) iner; 3 antrenman üst üste tıkanırsa hafifletilir.
 * - Hafifletme ve ısınma v1 kararlarıyla aynı (K16, §7.8).
 *
 * Bu dosya yol takma adıyla (`@/…`) çalışma zamanı içe aktarması yapmaz: testler
 * Node'un kendi test aracıyla doğrudan çalışır (`npm test`).
 */

export const PROGRESSION_SCHEMES = ['double', 'linear', 'none'] as const;
export type ProgressionScheme = (typeof PROGRESSION_SCHEMES)[number];

export type ProgressionRule = {
  scheme: ProgressionScheme;
  /** Hedef aralığı: tekrar ya da (süreli harekette) saniye. */
  targetMin: number;
  targetMax: number;
  /** Set sonunda yedekte kalması istenen tekrar (RIR), 0–4. */
  targetRir: number;
};

export type TrackingType = 'weight_reps' | 'bodyweight_reps' | 'duration';

/** Egzersizin yükle ilgili alanları. */
export type LoadSpec = {
  trackingType: TrackingType;
  /** Aletin izin verdiği en küçük artış; 0 ise ağırlık ilerlemesi yok. */
  loadStepKg: number;
  /** Bar ya da aletin kendi ağırlığı; öneri bunun altına inmez. */
  minLoadKg: number;
  /**
   * Cihazda gerçekten ayarlanabilen ağırlıklar (küçükten büyüğe): ağırlık bloğu, ara
   * ağırlıklar, dambıl seti… Verilirse öneriler yalnız bunlardan seçilir, `loadStepKg`
   * yerine bir sonraki/önceki ağırlık kullanılır (`src/lib/device-loads.ts`).
   */
  loadsKg?: readonly number[];
};

/** Danışanın setten sonra tek dokunuşla seçtiği zorluk. */
export const EFFORTS = ['easy', 'good', 'hard', 'fail'] as const;
export type Effort = (typeof EFFORTS)[number];

/** Zorluk → yedekte kalan tekrar tahmini (RIR). */
export const EFFORT_RIR: Record<Effort, number> = { easy: 4, good: 2, hard: 1, fail: 0 };

export const EFFORT_LABELS: Record<Effort, string> = {
  easy: 'Kolay',
  good: 'İyi',
  hard: 'Zor',
  fail: 'Başaramadım',
};

export const PROGRESSION_LABELS: Record<ProgressionScheme, string> = {
  double: 'Çift ilerleme',
  linear: 'Doğrusal',
  none: 'İlerleme yok',
};

export const RIR_LABELS: Record<number, string> = {
  0: 'Tükenişe kadar',
  1: '1 tekrar yedekte',
  2: '2 tekrar yedekte',
  3: '3 tekrar yedekte',
  4: '4 tekrar yedekte',
};

/** Bir set: ağırlık ve tekrar ya da saniye (`value`). */
export type SetResult = { weightKg: number; value: number; effort: Effort };
/** Bir antrenmandaki çalışma setleri (ısınma hariç), yapılış sırasıyla. */
export type SessionResult = readonly SetResult[];

export type Plan = { weightKg: number; target: number };

export type SuggestionReason =
  | 'first_time'
  | 'increase'
  | 'add_rep'
  | 'add_time'
  | 'hold'
  | 'decrease'
  | 'deload'
  | 'harder_variant'
  | 'no_progression';

export type Suggestion = Plan & { reason: SuggestionReason };

export const REASON_LABELS: Record<SuggestionReason, string> = {
  first_time: 'İlk kez: rahat bir ağırlıkla başla.',
  increase: 'Hedefe ulaşıldı: ağırlık artıyor.',
  add_rep: 'Aynı ağırlık, bir tekrar daha.',
  add_time: 'Aynı hareket, biraz daha uzun.',
  hold: 'Hedefin altında kaldı: aynı ağırlıkla tekrar dene.',
  decrease: 'Çok zorladı: ağırlık biraz azalıyor.',
  deload: 'Üst üste tıkandı: hafif bir antrenman.',
  harder_variant: 'Aralığın tepesine ulaşıldı: ağırlık ekle ya da zor bir varyasyona geç.',
  no_progression: 'Bu hareket için ilerleme yok.',
};

/** Kaç antrenman üst üste tıkanınca hafifletilir. */
export const DELOAD_AFTER_FAILED = 3;
/** Hafifletmede ağırlık çarpanı (v1 K16: %15 düşür). */
export const DELOAD_FACTOR = 0.85;
/** Azaltma oranı: en yakın adıma yuvarlanır, en az bir adım. */
export const DECREASE_RATIO = 0.05;
/** Süreli harekette antrenman başına eklenen süre (sn). */
export const DURATION_STEP_SECONDS = 5;
/** Aşırı yük uyarısı: hedef + max(hedef × %20, 5 kg) (v1 K14). */
export const OVERLOAD_RATIO = 0.2;
export const OVERLOAD_MIN_KG = 5;

/** Ekipmana göre ağırlık adımı ve taban ağırlık varsayılanı (formda ekipman seçilince gelir). */
export const EQUIPMENT_LOAD_DEFAULTS: Record<Equipment, { loadStepKg: number; minLoadKg: number }> = {
  barbell: { loadStepKg: 2.5, minLoadKg: 20 },
  dumbbell: { loadStepKg: 2, minLoadKg: 0 },
  machine: { loadStepKg: 5, minLoadKg: 0 },
  cable: { loadStepKg: 2.5, minLoadKg: 0 },
  kettlebell: { loadStepKg: 4, minLoadKg: 0 },
  band: { loadStepKg: 0, minLoadKg: 0 },
  bodyweight: { loadStepKg: 0, minLoadKg: 0 },
  cardio_machine: { loadStepKg: 0, minLoadKg: 0 },
};

/**
 * Egzersizin türüne göre varsayılan kural. Bileşik hareketler daha ağır ve az tekrarlı,
 * izolasyonlar daha hafif ve çok tekrarlı, kondisyon süre/tekrar odaklı; ısınma ve
 * soğumada ilerleme yok.
 */
export function defaultRule(category: Category, trackingType: TrackingType): ProgressionRule {
  if (category === 'warmup' || category === 'cooldown') {
    if (trackingType === 'duration') {
      return category === 'warmup'
        ? { scheme: 'none', targetMin: 300, targetMax: 600, targetRir: 3 }
        : { scheme: 'none', targetMin: 30, targetMax: 60, targetRir: 3 };
    }
    return { scheme: 'none', targetMin: 12, targetMax: 20, targetRir: 3 };
  }
  if (category === 'conditioning') {
    // Kondisyonda ilerleme süre ya da tekrar üzerinden; ağırlık ikinci planda.
    if (trackingType === 'duration') return { scheme: 'double', targetMin: 20, targetMax: 45, targetRir: 2 };
    return trackingType === 'bodyweight_reps'
      ? { scheme: 'double', targetMin: 10, targetMax: 20, targetRir: 2 }
      : { scheme: 'double', targetMin: 8, targetMax: 15, targetRir: 2 };
  }
  if (trackingType === 'duration') return { scheme: 'double', targetMin: 30, targetMax: 60, targetRir: 2 };
  if (trackingType === 'bodyweight_reps') {
    return category === 'compound'
      ? { scheme: 'double', targetMin: 6, targetMax: 12, targetRir: 2 }
      : { scheme: 'double', targetMin: 8, targetMax: 15, targetRir: 2 };
  }
  return category === 'compound'
    ? { scheme: 'double', targetMin: 6, targetMax: 10, targetRir: 2 }
    : { scheme: 'double', targetMin: 10, targetMax: 15, targetRir: 1 };
}

/** Egzersizin kuralı: kendi kuralı yoksa türüne göre varsayılan. */
export function progressionOf(exercise: {
  category: Category;
  trackingType: TrackingType;
  progression?: ProgressionRule;
}): ProgressionRule {
  return exercise.progression ?? defaultRule(exercise.category, exercise.trackingType);
}

/** Kayan nokta artıklarını temizler (47.4999… → 47.5). */
function clean(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

/** Ağırlığı adım ızgarasına aşağı yuvarlar (adım 0 ise dokunmaz). */
export function roundDownToStep(kg: number, stepKg: number): number {
  if (stepKg <= 0) return clean(kg);
  return clean(Math.floor(clean(kg / stepKg)) * stepKg);
}

/**
 * Ağırlık ızgarası: sabit adım (halter 2,5 kg) ya da cihazın ağırlık listesi. Bütün
 * yuvarlama ve adım hareketleri buradan geçer; ikisi aynı kurallarla davranır.
 */
type Grid = {
  /** `kg`'ye eşit ya da altındaki en büyük ağırlık (yoksa en küçük). */
  floor(kg: number): number;
  /** `kg`'nin üstündeki `n`'inci ağırlık (liste bitince en büyüğü). */
  up(kg: number, n: number): number;
  /** `kg`'nin altındaki, `target`'a en yakın ağırlık; en az bir adım iner, inecek yer yoksa `kg`. */
  below(kg: number, target: number): number;
  /** En küçük ağırlık (bar, ilk blok, en hafif dambıl). */
  min: number;
};

const EPSILON = 1e-9;

function gridOf(spec: LoadSpec): Grid | null {
  const loads = spec.loadsKg?.length ? [...new Set(spec.loadsKg.map(clean))].sort((a, b) => a - b) : null;
  if (loads) {
    const first = loads[0] as number;
    const last = loads[loads.length - 1] as number;
    return {
      min: first,
      floor: (kg) => loads.filter((load) => load <= kg + EPSILON).at(-1) ?? first,
      up: (kg, n) => {
        const above = loads.filter((load) => load > kg + EPSILON);
        return above[Math.min(n, above.length) - 1] ?? last;
      },
      below: (kg, target) => {
        const lower = loads.filter((load) => load < kg - EPSILON);
        if (lower.length === 0) return kg;
        // Hedefe en yakın; eşitlikte ağır olan (daha az düşüş).
        return lower.reduce((best, load) => (Math.abs(load - target) <= Math.abs(best - target) ? load : best));
      },
    };
  }
  const step = spec.loadStepKg;
  if (step <= 0) return null;
  const min = spec.minLoadKg;
  return {
    min,
    floor: (kg) => Math.max(min, roundDownToStep(kg, step)),
    up: (kg, n) => clean(kg + n * step),
    below: (kg, target) => {
      const nearest = clean(Math.round(clean(target / step)) * step);
      const lowered = Math.max(min, Math.min(nearest, clean(kg - step)));
      return lowered < kg ? lowered : kg;
    },
  };
}

function usesWeight(spec: LoadSpec): boolean {
  return spec.trackingType === 'weight_reps' && gridOf(spec) !== null;
}

function reachedTop(set: SetResult, rule: ProgressionRule): boolean {
  return set.effort !== 'fail' && set.value >= rule.targetMax;
}

function missed(set: SetResult, rule: ProgressionRule): boolean {
  return set.effort === 'fail' || set.value < rule.targetMin;
}

function sessionFailed(session: SessionResult, rule: ProgressionRule): boolean {
  return session.some((set) => missed(set, rule));
}

/** Antrenmanın çalışma ağırlığı: en ağır set. */
function workWeight(session: SessionResult): number {
  return Math.max(...session.map((set) => set.weightKg));
}

/**
 * Hafifletme ağırlığı (v1 K16): %15 düşür, adıma aşağı yuvarla; tabanın altına
 * ya da sıfıra düşerse ağırlık korunur (hafifletme o zaman yalnız set sayısındadır).
 */
export function deloadWeight(weightKg: number, spec: LoadSpec): number {
  const grid = gridOf(spec);
  if (!grid) return weightKg;
  const target = weightKg * DELOAD_FACTOR;
  if (target < grid.min) return weightKg;
  const reduced = spec.loadsKg?.length ? grid.floor(target) : roundDownToStep(target, spec.loadStepKg);
  return reduced <= 0 || reduced < spec.minLoadKg || reduced >= weightKg ? weightKg : reduced;
}

/** Hafifletmede korunacak çalışma seti sayısı (v1 K16): max(1, round(n × 2/3)). */
export function deloadSets(sets: number): number {
  return sets <= 0 ? 0 : Math.max(1, Math.round((sets * 2) / 3));
}

/**
 * Yaklaşık %5 aşağı: en yakın adıma yuvarlanır, en az bir adım iner (60 → 57,5;
 * 200 → 190). Tabanın altına inmez; inecek yer yoksa ağırlık korunur.
 */
export function decreaseWeight(weightKg: number, spec: LoadSpec): number {
  const grid = gridOf(spec);
  return grid ? grid.below(weightKg, weightKg * (1 - DECREASE_RATIO)) : weightKg;
}

/**
 * Bir sonraki antrenmanın önerisi.
 *
 * `history` yapılış sırasıyla antrenmanlardır (en yenisi sonda); her biri yalnız
 * çalışma setlerini içerir. Hiç geçmiş yoksa `startWeightKg` (PT'nin başlangıç
 * ağırlığı) ya da taban ağırlık önerilir.
 */
export function nextSession({
  spec,
  rule,
  history,
  startWeightKg,
}: {
  spec: LoadSpec;
  rule: ProgressionRule;
  history: readonly SessionResult[];
  startWeightKg?: number;
}): Suggestion {
  const sessions = history.filter((session) => session.length > 0);
  const last = sessions.at(-1);

  if (!last) {
    const grid = usesWeight(spec) ? gridOf(spec) : null;
    const start = startWeightKg ?? grid?.min ?? spec.minLoadKg;
    return {
      weightKg: grid ? grid.floor(start) : start,
      target: rule.targetMin,
      reason: 'first_time',
    };
  }

  const weight = workWeight(last);
  if (rule.scheme === 'none') return { weightKg: weight, target: rule.targetMin, reason: 'no_progression' };

  // Sondan geriye üst üste tıkanan antrenmanlar.
  let failedStreak = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];
    if (!session || !sessionFailed(session, rule)) break;
    failedStreak++;
  }
  if (failedStreak >= DELOAD_AFTER_FAILED) {
    return { weightKg: deloadWeight(weight, spec), target: rule.targetMin, reason: 'deload' };
  }

  const lowest = Math.min(...last.map((set) => set.value));

  const grid = usesWeight(spec) ? gridOf(spec) : null;
  if (grid) {
    if (last.every((set) => missed(set, rule))) {
      const lowered = decreaseWeight(weight, spec);
      return { weightKg: lowered, target: rule.targetMin, reason: lowered < weight ? 'decrease' : 'hold' };
    }
    if (sessionFailed(last, rule)) return { weightKg: weight, target: rule.targetMin, reason: 'hold' };

    if (rule.scheme === 'linear') {
      return { weightKg: grid.up(weight, 1), target: rule.targetMin, reason: 'increase' };
    }
    if (last.every((set) => reachedTop(set, rule))) {
      // Hedef zorluğun çok altında kalındıysa (çok kolaydı) iki adım.
      const averageRir = last.reduce((sum, set) => sum + EFFORT_RIR[set.effort], 0) / last.length;
      const steps = averageRir >= rule.targetRir + 2 ? 2 : 1;
      return { weightKg: grid.up(weight, steps), target: rule.targetMin, reason: 'increase' };
    }
    return { weightKg: weight, target: Math.min(rule.targetMax, lowest + 1), reason: 'add_rep' };
  }

  // Ağırlıksız ilerleme: vücut ağırlığı, bant ya da süre.
  const isDuration = spec.trackingType === 'duration';
  if (sessionFailed(last, rule)) return { weightKg: weight, target: rule.targetMin, reason: 'hold' };
  if (last.every((set) => reachedTop(set, rule))) {
    return { weightKg: weight, target: rule.targetMax, reason: 'harder_variant' };
  }
  const unit = isDuration ? DURATION_STEP_SECONDS : 1;
  return {
    weightKg: weight,
    target: Math.min(rule.targetMax, Math.max(rule.targetMin, lowest + unit)),
    reason: isDuration ? 'add_time' : 'add_rep',
  };
}

/**
 * Aynı antrenmanda bir sonraki setin önerisi. İlerleme asıl antrenmandan antrenmana
 * olur; setler arasında yalnız belirgin sapmada ağırlık değişir:
 * başarısız ya da hedefin 3+ tekrar altı → ~%5 aşağı; "kolay" ve tepede → bir adım yukarı.
 */
export function nextSet({
  spec,
  rule,
  plan,
  done,
}: {
  spec: LoadSpec;
  rule: ProgressionRule;
  plan: Plan;
  done: SessionResult;
}): Suggestion {
  const last = done.at(-1);
  if (!last) return { ...plan, reason: 'hold' };
  const grid = usesWeight(spec) ? gridOf(spec) : null;
  if (!grid || rule.scheme === 'none') return { weightKg: last.weightKg, target: plan.target, reason: 'hold' };

  if (last.effort === 'fail' || last.value <= rule.targetMin - 3) {
    const lowered = decreaseWeight(last.weightKg, spec);
    return { weightKg: lowered, target: plan.target, reason: lowered < last.weightKg ? 'decrease' : 'hold' };
  }
  if (last.effort === 'easy' && last.value >= rule.targetMax) {
    return { weightKg: grid.up(last.weightKg, 1), target: plan.target, reason: 'increase' };
  }
  return { weightKg: last.weightKg, target: plan.target, reason: 'hold' };
}

/**
 * Isınma setleri (v1 §7.8): yalnız halterle yapılan bileşik bir hareket, o kas
 * grubunun antrenmandaki ilk hareketi ve çalışma ağırlığı 40 kg ve üstüyse.
 * Boş bar × 10, sonra ağırlığa göre 1–3 ara set; yüzdeler adıma aşağı yuvarlanır,
 * bir öncekine eşit ya da çalışma ağırlığına bir adımdan yakın olan atlanır.
 */
export function warmupSets({
  workWeightKg,
  spec,
  isBarbell,
  isCompound,
  isFirstForMuscle,
}: {
  workWeightKg: number;
  spec: LoadSpec;
  isBarbell: boolean;
  isCompound: boolean;
  isFirstForMuscle: boolean;
}): Plan[] {
  const grid = gridOf(spec);
  const bar = (grid?.min ?? spec.minLoadKg) > 0 ? (grid?.min ?? spec.minLoadKg) : 20;
  if (workWeightKg < 40 || !isBarbell || !isCompound || !isFirstForMuscle || !grid) return [];
  // Çalışma ağırlığına bu kadar yakın ara set atlanır: bir adım (listede en küçük aralık).
  const minGap = spec.loadsKg?.length ? grid.up(bar, 1) - bar : spec.loadStepKg;

  const steps: [number, number][] =
    workWeightKg < 80
      ? [[0.65, 5]]
      : workWeightKg < 120
        ? [
            [0.5, 5],
            [0.75, 3],
          ]
        : [
            [0.4, 5],
            [0.6, 3],
            [0.8, 2],
          ];

  const sets: Plan[] = [{ weightKg: bar, target: 10 }];
  let previous = bar;
  for (const [ratio, reps] of steps) {
    const weight = Math.max(grid.floor(workWeightKg * ratio), bar);
    if (weight <= previous || workWeightKg - weight < minGap) continue;
    sets.push({ weightKg: weight, target: reps });
    previous = weight;
  }
  return sets;
}

/** Aşırı yük sınırı (v1 K14): hedefin bu kadar üstü PT'ye bildirilir. */
export function overloadLimitKg(targetKg: number): number {
  return clean(targetKg + Math.max(targetKg * OVERLOAD_RATIO, OVERLOAD_MIN_KG));
}

export function isOverload(targetKg: number, enteredKg: number): boolean {
  return enteredKg > overloadLimitKg(targetKg);
}

function kg(value: number): string {
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`;
}

/** Kuralın düz cümleyle anlatımı (formda ve detayda PT için). */
export function describeRule(rule: ProgressionRule, spec: LoadSpec): string {
  const isDuration = spec.trackingType === 'duration';
  const unit = isDuration ? 'sn' : 'tekrar';
  const range = rule.targetMin === rule.targetMax ? `${rule.targetMin} ${unit}` : `${rule.targetMin}–${rule.targetMax} ${unit}`;

  if (rule.scheme === 'none') return `Hedef ${range}. İlerleme yok: her antrenmanda aynı hedef.`;

  const effort =
    isDuration ? '' : rule.targetRir === 0 ? ' Setler tükenişe kadar yapılır.' : ` Set sonunda ~${rule.targetRir} tekrar yedekte kalsın.`;

  if (usesWeight(spec)) {
    const amount = spec.loadsKg?.length ? 'cihazdaki bir sonraki ağırlığa çıkar' : `${kg(spec.loadStepKg)} artar`;
    const growth =
      rule.scheme === 'linear'
        ? `Her başarılı antrenmanda ağırlık ${amount}.`
        : `Bütün setlerde ${rule.targetMax} tekrara ulaşınca ağırlık ${amount} ve tekrar hedefi yeniden ${rule.targetMin} olur; ulaşılmadıysa aynı ağırlıkla bir tekrar daha.`;
    return `Hedef ${range}. ${growth} Hedefin altında kalınırsa ağırlık korunur; ${DELOAD_AFTER_FAILED} antrenman üst üste tıkanırsa %${Math.round((1 - DELOAD_FACTOR) * 100)} hafifletilir.${effort}`;
  }

  const growth = isDuration
    ? `Her antrenmanda ${DURATION_STEP_SECONDS} sn eklenir; ${rule.targetMax} sn'ye ulaşınca zor bir varyasyona geç.`
    : `Her antrenmanda bir tekrar eklenir; ${rule.targetMax} tekrara ulaşınca ağırlık ekle ya da zor bir varyasyona geç.`;
  return `Hedef ${range}. ${growth}${effort}`;
}
