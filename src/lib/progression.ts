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
 *   belirler, sonuç bu adıma yuvarlanır. Izgara tabandan (bar, kızak) sayılır: taban + tam
 *   adımlar; plaka yüklemelide cihazın üst sınırı geçilmez.
 * - Çift ilerleme: tekrar aralığının tepesine bütün setlerde ulaşılınca ağırlık artar,
 *   tekrar hedefi alta döner; ulaşılmadıysa aynı ağırlıkla bir tekrar daha.
 * - Doğrusal: her başarılı antrenmanda bir adım (yeni başlayanlar için).
 * - Cihazın en ağır ayarında ağırlık artamaz: "cihazın en ağır ayarındasın" önerilir
 *   (`device_max`; tepedeyse tekrar hedefi tepede kalır, değilse bir tekrar daha). Kayıt en ağır
 *   ayarın da üstündeyse ağırlık en ağır ayara çekilir. Set arasında ağırlık korunur.
 * - Hedefin altında kalınan antrenmandan sonra ağırlık korunur; setlerin hiçbiri hedefe
 *   ulaşmadıysa yaklaşık %5 (en az bir adım) iner; 3 antrenman üst üste tıkanırsa hafifletilir.
 * - Yarıda bırakılan antrenman (planın tam yük setlerinden biri yapılmadı) artış getirmez,
 *   ağırlık korunur; tıkanma serisinde nötrdür (ne sıfırlar ne artırır).
 * - Hafifletme ve ısınma v1 kararlarıyla aynı (K16, §7.8); yalnız tabanın altına düşen hafifletme
 *   tabana iner (v1'de ağırlık korunurdu). Tıkanma hafifletmesi %10'dur (StrongLifts; tasarım açık
 *   soru 2, v1 ve SPEC'in ilk hâli %15); ağrı ve hazır oluşluk hafifletmesi %15'te kalır.
 * - Hafif yapılan seans (`lighter`, tasarım §5.5) motordan saklanmaz: ilk kez nötrdür (sonraki seans
 *   planın ağırlığıyla), üst üste ikincisi kaçırmadır. Tanışma ve ayar seansının (`noStall`) kaçırması
 *   tıkanma sayılmaz. Aşamaya göre katman (onay, artış miktarı) `recommend.ts`'te.
 * - Set başına hedef (`planSession`): her setin kendi aralığı, yük yüzdesi ve AMRAP'ı olur;
 *   kararı tam yükteki setler verir, yüzdeli setler üst ağırlığı izler. Isınma setleri
 *   ilk çalışma setinin ağırlığına göre hesaplanır (piramitte en hafif set).
 * - Geçmiş aralığa göre okunur: set kaydı yapıldığı günkü hedefi taşıyabilir (`SetResult.target`).
 *   Tıkanma o hedefe göre; tepeye ulaşma hem o hedefin hem güncel aralığın tepesine göre
 *   değerlendirilir (genişletilen aralıkta tekrar eklenir, daraltılanda ağırlık artar); yeni hedef
 *   güncel aralıktandır. Seri en yeni antrenmandan geriye, güncel aralıkla kesişen kesintisiz
 *   antrenmanlardır: kesişmeyen ilk antrenmanda kesilir (eski aralığa dönülse de önceki evrenin
 *   antrenmanları ve tıkanmaları seriye girmez). Satır kimliği verilirse başka satırın kayıtları
 *   atlanır (aynı hareket Gün A'da 4–6, Gün B'de 8–12). Seri boşsa PT'nin başlangıç ağırlığı, o da
 *   yoksa en yeni antrenmandan çeviri: ağırlıklı harekette Epley'le (v1'in 1RM formülü) yeni
 *   aralığın alt sınırına, son ağırlıktan en çok iki adım artışla; ağırlıksız harekette hedef son
 *   performanstan. Hedefi olmayan eski kayıtlar güncel hedefle değerlendirilir.
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
  /** Bar ya da aletin kendi ağırlığı; öneri bunun altına inmez, adımlar bundan sayılır (taban + tam adımlar). */
  minLoadKg: number;
  /** Ayarlanabilen en ağır yük (plaka yüklemeli cihazın üst sınırı); öneri bunu geçmez. Yoksa sınır yok. */
  maxLoadKg?: number;
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

/** Satırın bir seti (şablon ve programda saklanır). */
export type SetTarget = {
  /** Tekrar ya da (süreli harekette) saniye; min = max → sabit hedef. */
  min: number;
  max: number;
  /** Tam yükteki (en ağır) setin yüzdesi, 40–99; yoksa tam yük. Yalnız ağırlıklı harekette. */
  loadPct?: number;
  /** "Yapabildiği kadar": aralık yine hedeftir; zorluk düğmesi tıkanma sayılmaz. */
  amrap?: boolean;
};

/** Bir set: ağırlık ve tekrar ya da saniye (`value`). */
export type SetResult = {
  weightKg: number;
  value: number;
  effort: Effort;
  /** Satırın kaçıncı seti (0'dan, `PlannedSet.setIndex`); yoksa yapılış sırası. */
  setIndex?: number;
  /**
   * Setin yapıldığı günkü hedefi: satırdaki set (aralık — süreli harekette saniye —, yük yüzdesi,
   * AMRAP). Tıkanma buna göre değerlendirilir; aralığı güncel satırdakiyle kesişmeyen antrenman seriyi
   * keser. Eski kayıtta yok: güncel hedefle değerlendirilir.
   */
  target?: SetTarget;
  /** Antrenmanın planlanan üst (tam yük) ağırlığı (`SessionPlan.topWeightKg`): piramit tepeye varmadan bitince referans. */
  topWeightKg?: number;
  /** Kaydın bağlı olduğu satır (`r_…`, SPEC §7.4): satır kimliği verilen öneride başka satırın kaydı seriye girmez. */
  rowId?: string;
  /**
   * O günkü plandaki çalışma seti sayısı (`SessionPlan.sets.length`): planını tamamlayan antrenman
   * (hafifletme, sonradan set eklenen satır) yarıda bırakılmış sayılmasın diye. Yoksa güncel plana bakılır.
   */
  plannedSetCount?: number;
  /**
   * Plandan hafif yapıldı, programa yazılmadı (tasarım §5.5): ilk kez nötr (sonraki seans planın üst
   * ağırlığıyla, `topWeightKg`), serideki bir önceki seans da hafifse kaçırma.
   */
  lighter?: boolean;
  /** Tanışma ya da ayar seansında planlandı (§5.2–5.3): kaçırması tıkanma serisine girmez. */
  noStall?: boolean;
};
/** Bir antrenmandaki çalışma setleri (ısınma hariç), yapılış sırasıyla. */
export type SessionResult = readonly SetResult[];

export type Plan = { weightKg: number; target: number };

/** Planlanan set: ağırlık, hedef, AMRAP ve satırdaki yeri (hafifletmede set atlanınca da doğru sete bağlansın). */
export type PlannedSet = Plan & { amrap: boolean; loadPct?: number; setIndex: number };
export type SessionPlan = {
  sets: PlannedSet[];
  /** Tam yükteki setin ağırlığı. */
  topWeightKg: number;
  reason: SuggestionReason;
};

export type SuggestionReason =
  | 'first_time'
  | 'range_increase'
  | 'increase'
  | 'add_rep'
  | 'add_time'
  | 'hold'
  | 'incomplete'
  | 'decrease'
  | 'deload'
  | 'harder_variant'
  | 'device_max'
  | 'no_progression'
  // Öneri katmanı (`src/lib/recommend.ts`): aşamaya göre onay, ara sonrası ayar, büyük adımda önce tekrar.
  | 'confirm_increase'
  | 'calibrate'
  | 'reps_first'
  // Hafif seans ilk kez: plan bir kez daha (§5.5).
  | 'lighter_retry'
  // Yoklamadan sonra yalnız bugünün planı hafifletildi (`recommend.ts` → `lightenPlan`); motor o antrenmanı saymaz.
  | 'lighten'
  // Yük toleransı (ağrı izleme) öneriyi geri çektiğinde — `src/lib/check-in.ts`.
  | 'pain_hold'
  | 'pain_reduce'
  | 'pain_reduce_unavailable'
  | 'paused';

export type Suggestion = Plan & { reason: SuggestionReason };

export const REASON_LABELS: Record<SuggestionReason, string> = {
  first_time: 'İlk kez: rahat bir ağırlıkla başla.',
  range_increase: 'Tekrar aralığı değişti: ağırlık son antrenmandan çevrildi, en çok iki adım artıyor.',
  increase: 'Hedefe ulaşıldı: ağırlık artıyor.',
  add_rep: 'Aynı ağırlık, bir tekrar daha.',
  add_time: 'Aynı hareket, biraz daha uzun.',
  hold: 'Hedefin altında kaldı: aynı ağırlıkla tekrar dene.',
  incomplete: 'Antrenman tamamlanmadı: artış yok, aynı ağırlıkla tekrar dene.',
  decrease: 'Çok zorladı: ağırlık biraz azalıyor.',
  deload: 'Üst üste tıkandı: hafif bir antrenman.',
  harder_variant: 'Aralığın tepesine ulaşıldı: ağırlık ekle ya da zor bir varyasyona geç.',
  device_max: 'Cihazın en ağır ayarındasın: tekrarları artır ya da zor bir varyasyona geç.',
  no_progression: 'Bu hareket için ilerleme yok.',
  confirm_increase: 'Tepeye ulaştın; bir kez daha yap, sonra artır.',
  calibrate: 'Aradan sonra ilk antrenman: son ağırlığın biraz altında ayar.',
  reps_first: 'Sonraki ağırlık büyük bir sıçrama: önce tekrar ekle.',
  lighter_retry: 'Geçen sefer plandan hafifti: planı bir kez daha dene.',
  lighten: 'Bugün hafif: ağırlık yaklaşık %15 az, 3 ve üstü setli harekette bir set eksik.',
  pain_hold: 'Ağrı ya da irritabilite yükselmiş: artırma yok, aynı yükte kal.',
  pain_reduce: 'Ağrı eşiği aşıldı ya da 24 saatte geçmedi: yük %15 azaldı.',
  pain_reduce_unavailable:
    'Ağrı eşiği aşıldı ya da 24 saatte geçmedi; yük azaltılamadı (zaten en hafif ayarda): tekrar ya da set sayısını azalt.',
  paused: 'Bugün yük verilmiyor: önce değerlendirme gerekli.',
};

/** Kaç antrenman üst üste tıkanınca hafifletilir. */
export const DELOAD_AFTER_FAILED = 3;
/**
 * Tıkanma hafifletmesinde ağırlık çarpanı: %10 düşür (StrongLifts "failure"; tasarım açık soru 2 kabul).
 * v1 K16 ve SPEC'in ilk hâli %15'ti. Tek sabit: PT fork'unda buradan değiştirir.
 */
export const DELOAD_FACTOR = 0.9;
/** Ağrı (`applyTolerance` "reduce") ve hazır oluşluk hafifletmesi: %15 (SPEC §7.5, tasarım §2.2). */
export const LIGHTEN_FACTOR = 0.85;
/** Azaltma oranı: en yakın adıma yuvarlanır, en az bir adım. */
export const DECREASE_RATIO = 0.05;
/** Süreli harekette antrenman başına eklenen süre (sn). */
export const DURATION_STEP_SECONDS = 5;
/** Aşırı yük uyarısı: hedef + max(hedef × %20, 5 kg) (v1 K14). */
export const OVERLOAD_RATIO = 0.2;
export const OVERLOAD_MIN_KG = 5;
/** AMRAP sette aralığın bu kadar üstü → iki adım. */
export const AMRAP_EXTRA_REPS = 3;
/** Başka tekrar aralığından çeviride artış sınırı: son ağırlıktan en çok bu kadar adım. */
export const CONVERT_MAX_STEPS = 2;

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

/** Ağırlığı tabandan sayılan adım ızgarasına (taban + tam adımlar) aşağı yuvarlar; adım 0 ise dokunmaz. */
export function roundDownToStep(kg: number, stepKg: number, baseKg = 0): number {
  if (stepKg <= 0) return clean(kg);
  return clean(baseKg + Math.floor(clean((kg - baseKg) / stepKg)) * stepKg);
}

/**
 * Ağırlık ızgarası: sabit adım (halter 2,5 kg) ya da cihazın ağırlık listesi. Bütün
 * yuvarlama ve adım hareketleri buradan geçer; ikisi aynı kurallarla davranır. Sabit adım
 * tabandan sayılır (37 kg kızak, 5 kg adım → 37, 42, 47…), üst sınır varsa orada biter.
 * Antrenman ekranının ağırlık stepper'ı da bununla adımlar (bir sonraki/önceki ayar).
 */
export type Grid = {
  /** `kg`'ye eşit ya da altındaki en büyük ağırlık (yoksa en küçük). */
  floor(kg: number): number;
  /** `kg`'nin üstündeki `n`'inci ağırlık (liste bitince en büyüğü). */
  up(kg: number, n: number): number;
  /** `kg`'nin altındaki, `target`'a en yakın ağırlık; en az bir adım iner, inecek yer yoksa `kg`. */
  below(kg: number, target: number): number;
  /** En küçük ağırlık (bar, ilk blok, en hafif dambıl). */
  min: number;
  /** En büyük ağırlık (cihazın en ağır ayarı); sınır yoksa sonsuz. */
  max: number;
};

const EPSILON = 1e-9;

/** Ağırlıksız (vücut ağırlığı, süre) ya da adımı 0 olan alette `null`. */
export function gridOf(spec: LoadSpec): Grid | null {
  const loads = spec.loadsKg?.length ? [...new Set(spec.loadsKg.map(clean))].sort((a, b) => a - b) : null;
  if (loads) {
    const first = loads[0] as number;
    const last = loads[loads.length - 1] as number;
    return {
      min: first,
      max: last,
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
  const base = spec.minLoadKg;
  const lastIndex = spec.maxLoadKg === undefined ? Infinity : Math.max(0, Math.floor(clean((spec.maxLoadKg - base) / step)));
  /** Izgaranın `index`'inci ağırlığı (0: taban); dışarıdaki sıra kenara çekilir. */
  const at = (index: number) => clean(base + Math.min(Math.max(index, 0), lastIndex) * step);
  /** `kg`'ye eşit ya da altındaki ağırlığın sırası (tabanın altında eksi). */
  const indexOf = (kg: number) => Math.floor(clean((kg - base) / step));
  return {
    min: base,
    max: lastIndex === Infinity ? Infinity : at(lastIndex),
    floor: (kg) => at(indexOf(kg)),
    up: (kg, n) => at(Math.max(indexOf(kg) + 1, 0) + n - 1),
    below: (kg, target) => {
      // `kg`'nin altındaki son ağırlığa kadar, hedefe en yakın (eşitlikte ağır olan).
      const highest = Math.min(Math.ceil(clean((kg - base) / step)) - 1, lastIndex);
      return highest < 0 ? kg : at(Math.min(Math.round(clean((target - base) / step)), highest));
    },
  };
}

function usesWeight(spec: LoadSpec): boolean {
  return spec.trackingType === 'weight_reps' && gridOf(spec) !== null;
}

type TargetRange = Pick<SetTarget, 'min' | 'max'>;

/** Setin değerlendirileceği aralık: kaydın kendi hedefi, yoksa (eski kayıt) kuralınki. */
function rangeOf(set: SetResult, rule: Pick<ProgressionRule, 'targetMin' | 'targetMax'>): TargetRange {
  return set.target ?? { min: rule.targetMin, max: rule.targetMax };
}

/** İki aralık kesişiyor mu: 8–12 ile 8–10 ya da 12–15 evet, 4–6 ile 8–12 hayır. */
function overlaps(a: TargetRange, b: TargetRange): boolean {
  return a.min <= b.max && b.min <= a.max;
}

/** Kayıt güncel aralıkla aynı seride mi (aralıklar kesişiyor); hedefi olmayan eski kayıt öyle sayılır. */
function fitsRange(target: SetTarget | undefined, range: TargetRange): boolean {
  return !target || overlaps(target, range);
}

/** Kayıt bu satırın mı: satır kimliği verilmediyse ya da kayıtta yoksa (eski kayıt) öyle sayılır. */
function inRow(set: SetResult, rowId: string | undefined): boolean {
  return rowId === undefined || set.rowId === undefined || set.rowId === rowId;
}

/** Tepe: kaydın kendi hedefinin ve güncel aralığın tepesine ulaşıldı (genişletilen aralıkta tepe yukarı kayar). */
function reachedTop(set: SetResult, rule: ProgressionRule): boolean {
  return set.effort !== 'fail' && set.value >= Math.max(rangeOf(set, rule).max, rule.targetMax);
}

function missed(set: SetResult, rule: ProgressionRule): boolean {
  return set.effort === 'fail' || set.value < rangeOf(set, rule).min;
}

function sessionFailed(session: SessionResult, rule: ProgressionRule): boolean {
  return session.some((set) => missed(set, rule));
}

/** Antrenmanın çalışma ağırlığı: en ağır set. */
function workWeight(session: SessionResult): number {
  return Math.max(...session.map((set) => set.weightKg));
}

/**
 * Başka tekrar hedefine çeviri (Epley, v1'in 1RM formülü): `reps` tekrar yapılan ağırlıktan
 * `targetReps` tekrarlık ağırlık = ağırlık × (30 + tekrar) / (30 + hedef). Izgaraya çağıran yuvarlar.
 */
function convertReps(weightKg: number, reps: number, targetReps: number): number {
  return (weightKg * (30 + reps)) / (30 + targetReps);
}

/**
 * Başka tekrar aralığındaki antrenmandan ağırlık: Epley'le en temkinli set, ızgaraya aşağı; son
 * ağırlıktan en çok `CONVERT_MAX_STEPS` adım ağır (çeviri kaba bir tahmindir, sıçratmaz).
 */
function convertedWeight(results: readonly SetResult[], reps: number, grid: Grid): number {
  const converted = grid.floor(Math.min(...results.map((set) => convertReps(set.weightKg, set.value, reps))));
  return Math.min(converted, grid.up(workWeight(results), CONVERT_MAX_STEPS));
}

/**
 * Güncel satırın serisi (`chain`): en yeni antrenmandan geriye, satıra uyan kesintisiz antrenmanlar;
 * uymayan ilk antrenmanda kesilir. `own` verilirse (satır kimliği) başka satırın antrenmanları
 * atlanır; satırın hiç antrenmanı yoksa (yeni satır) bütün antrenmanlara bakılır. `latest` en yeni
 * antrenmandır: seri boşsa çevirinin kaynağı.
 */
function seriesOf<T>(
  sessions: readonly T[],
  fits: (session: T) => boolean,
  own?: (session: T) => boolean,
): { chain: T[]; latest: T | undefined } {
  const mine = own ? sessions.filter(own) : sessions;
  const pool = mine.length > 0 ? mine : sessions;
  let start = pool.length;
  while (start > 0 && fits(pool[start - 1] as T)) start--;
  return { chain: pool.slice(start), latest: pool.at(-1) };
}

/**
 * Yarıda mı bırakıldı: o günkü plana (kayıttaki `plannedSetCount`) ve güncel plana (`shortNow`: yapılan
 * setlerin yerlerinden) göre eksik set var. O günkü planını tamamlayan antrenman (hafifletme, satıra
 * sonradan set eklendi) eksik sayılmaz; iki bilgi de yoksa antrenman tamam sayılır.
 */
function isShort(session: SessionResult, shortNow: (done: ReadonlySet<number>) => boolean | undefined): boolean {
  const done = new Set(session.map((set, position) => set.setIndex ?? position));
  const planned = session.find((set) => set.plannedSetCount !== undefined)?.plannedSetCount;
  const now = shortNow(done);
  return planned === undefined ? now === true : done.size < planned && now !== false;
}

/**
 * Serinin sonundaki tıkanma sayısı (eskiden yeniye). Yarıda bırakılan antrenman nötrdür: seriyi ne
 * sıfırlar ne artırır. Hafifletmeyi gerektiren seriden hemen sonraki eksik antrenman hafifletme
 * antrenmanıdır (planı gereği az setli): seriyi sıfırlar.
 */
function failedStreak<T>(chain: readonly T[], failed: (session: T) => boolean, short: (session: T) => boolean): number {
  let streak = 0;
  for (const session of chain) {
    if (!short(session)) streak = failed(session) ? streak + 1 : 0;
    else if (streak >= DELOAD_AFTER_FAILED) streak = 0;
  }
  return streak;
}

/**
 * Hafifletme ağırlığı: `factor` kadarına düşür (tıkanmada %10, `DELOAD_FACTOR`; ağrıda ve hazır
 * oluşlukta %15, `LIGHTEN_FACTOR`), ızgaraya (tabandan sayılan adım ya da cihazın listesi) aşağı
 * yuvarla. Tabanın altına düşerse tabana (bar, kızak, en hafif ayar) iner: halter 22,5 → 20 (v1'de
 * 22,5 kalırdı). Sıfıra inmez; inecek yer yoksa ağırlık korunur (hafifletme o zaman yalnız set
 * sayısındadır).
 */
export function deloadWeight(weightKg: number, spec: LoadSpec, factor: number = DELOAD_FACTOR): number {
  const grid = gridOf(spec);
  if (!grid) return weightKg;
  // `floor` tabanın altındaki değeri tabana çeker: max(taban, aşağı yuvarlanmış değer).
  const reduced = grid.floor(weightKg * factor);
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
 * `history` yapılış sırasıyla antrenmanlardır (en yenisi sonda); her biri yalnız çalışma setlerini
 * içerir. Karar serinin (bkz. dosya başı) son antrenmanından verilir, tıkanma serisi de yalnız
 * seriden sayılır. Seri boşsa PT'nin başlangıç ağırlığı (`startWeightKg`), yoksa başka aralıktaki en
 * yeni antrenmandan çeviri, hiç geçmiş yoksa taban ağırlık önerilir.
 */
export function nextSession({
  spec,
  rule,
  history,
  startWeightKg,
  setCount,
  rowId,
}: {
  spec: LoadSpec;
  rule: ProgressionRule;
  history: readonly SessionResult[];
  startWeightKg?: number;
  /** Satırın çalışma seti sayısı: kayıtta o günkü plan yoksa yarıda bırakılan antrenman bununla anlaşılır. */
  setCount?: number;
  /** Satırın kimliği (`r_…`): verilirse başka satırın kayıtları seriye girmez. */
  rowId?: string;
}): Suggestion {
  const range = { min: rule.targetMin, max: rule.targetMax };
  const { chain, latest } = seriesOf(
    history.filter((session) => session.length > 0),
    (session) => session.every((set) => fitsRange(set.target, range)),
    rowId === undefined ? undefined : (session) => session.every((set) => inRow(set, rowId)),
  );
  const grid = usesWeight(spec) ? gridOf(spec) : null;
  const withinRange = (value: number) => Math.min(rule.targetMax, Math.max(rule.targetMin, value));
  const last = chain.at(-1);

  if (!last) {
    // Seri yok. PT'nin başlangıç ağırlığı çeviriden önce gelir; hiç geçmiş yoksa taban.
    if (startWeightKg !== undefined || !latest) {
      const start = startWeightKg ?? grid?.min ?? spec.minLoadKg;
      return { weightKg: grid ? grid.floor(start) : start, target: rule.targetMin, reason: 'first_time' };
    }
    // Başka aralıktaki en yeni antrenmandan. Ağırlıksızda hedef son performanstan, yeni aralığa kırpılır.
    if (!grid) {
      return { weightKg: workWeight(latest), target: withinRange(Math.min(...latest.map((set) => set.value))), reason: 'first_time' };
    }
    const weightKg = convertedWeight(latest, rule.targetMin, grid);
    return { weightKg, target: rule.targetMin, reason: weightKg > workWeight(latest) ? 'range_increase' : 'first_time' };
  }

  const weight = workWeight(last);
  // Cihazın en ağır ayarının üstündeki kayıt (ayar değişti ya da elle girildi) en ağır ayara çekilir.
  const kept = grid ? Math.min(weight, grid.max) : weight;
  if (rule.scheme === 'none') return { weightKg: kept, target: rule.targetMin, reason: 'no_progression' };

  const failed = (session: SessionResult) => sessionFailed(session, rule);
  const short = (session: SessionResult) => isShort(session, (done) => (setCount === undefined ? undefined : done.size < setCount));
  if (failedStreak(chain, failed, short) >= DELOAD_AFTER_FAILED) {
    return { weightKg: deloadWeight(weight, spec), target: rule.targetMin, reason: 'deload' };
  }
  // Yarıda bırakıldı (hafifletme antrenmanı değil): yapılmayan set tepeye ulaşmadı sayılır, tıkanma değil.
  const incomplete = short(last) && failedStreak(chain.slice(0, -1), failed, short) < DELOAD_AFTER_FAILED;
  const lowest = Math.min(...last.map((set) => set.value));

  if (grid) {
    if (!incomplete && last.every((set) => missed(set, rule))) {
      const lowered = Math.min(decreaseWeight(weight, spec), grid.max);
      return { weightKg: lowered, target: rule.targetMin, reason: lowered < weight ? 'decrease' : 'hold' };
    }
    if (sessionFailed(last, rule)) return { weightKg: kept, target: rule.targetMin, reason: 'hold' };
    if (incomplete) return { weightKg: kept, target: rule.targetMin, reason: 'incomplete' };

    const reached = last.every((set) => reachedTop(set, rule));
    if (rule.scheme === 'linear' || reached) {
      // Hedef zorluğun çok altında kalındıysa (çok kolaydı) iki adım; doğrusalda hep bir.
      const averageRir = last.reduce((sum, set) => sum + EFFORT_RIR[set.effort], 0) / last.length;
      const raised = grid.up(weight, rule.scheme !== 'linear' && averageRir >= rule.targetRir + 2 ? 2 : 1);
      if (raised > weight) return { weightKg: raised, target: rule.targetMin, reason: 'increase' };
      // Cihazın en ağır ayarı (ya da kayıt onun da üstünde): ağırlık artamaz. Tepedeyse hedef tepede, değilse bir tekrar daha.
      return { weightKg: kept, target: reached ? rule.targetMax : withinRange(lowest + 1), reason: 'device_max' };
    }
    return { weightKg: kept, target: withinRange(lowest + 1), reason: kept < weight ? 'device_max' : 'add_rep' };
  }

  // Ağırlıksız ilerleme: vücut ağırlığı, bant ya da süre.
  const isDuration = spec.trackingType === 'duration';
  if (sessionFailed(last, rule)) return { weightKg: weight, target: rule.targetMin, reason: 'hold' };
  if (incomplete) return { weightKg: weight, target: rule.targetMin, reason: 'incomplete' };
  if (last.every((set) => reachedTop(set, rule))) {
    return { weightKg: weight, target: rule.targetMax, reason: 'harder_variant' };
  }
  return {
    weightKg: weight,
    target: withinRange(lowest + (isDuration ? DURATION_STEP_SECONDS : 1)),
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

  // Önceki set kendi hedefine göre (kayıtta yoksa kuralınki).
  const range = rangeOf(last, rule);
  if (last.effort === 'fail' || last.value <= range.min - 3) {
    const lowered = decreaseWeight(last.weightKg, spec);
    return { weightKg: lowered, target: plan.target, reason: lowered < last.weightKg ? 'decrease' : 'hold' };
  }
  // Cihazın en ağır ayarındaysa artacak yer yok: aynı ağırlık.
  const raised = grid.up(last.weightKg, 1);
  if (last.effort === 'easy' && last.value >= range.max && raised > last.weightKg) {
    return { weightKg: raised, target: plan.target, reason: 'increase' };
  }
  return { weightKg: last.weightKg, target: plan.target, reason: 'hold' };
}

/* --- set başına plan: her setin kendi hedefi, yük yüzdesi ve AMRAP'ı --- */

/** Tam yükte mi (yüzde yok ya da %100). */
export function isFullLoad(set: Pick<SetTarget, 'loadPct'>): boolean {
  return set.loadPct === undefined || set.loadPct >= 100;
}

/** Tam yükteki setlerin sırası (ilerlemeye bunlar karar verir). */
export function topSetIndexes(sets: readonly SetTarget[]): number[] {
  return sets.flatMap((set, index) => (isFullLoad(set) ? [index] : []));
}

/**
 * Üst ağırlığın yüzdesi: ızgaraya aşağı yuvarlanır, tabanın altına inmez, üst ağırlığı
 * geçmez; ağırlıksızda (vücut ağırlığı, süre, adımı 0 olan bant) üst ağırlık.
 */
export function percentOfTop(topKg: number, loadPct: number | undefined, spec: LoadSpec): number {
  if (loadPct === undefined || loadPct >= 100) return topKg;
  const grid = usesWeight(spec) ? gridOf(spec) : null;
  if (!grid) return topKg;
  return Math.min(topKg, grid.floor(clean((topKg * loadPct) / 100)));
}

/**
 * `set`: sonucun değerlendirileceği hedef (kaydın kendi hedefi, yoksa satırın seti); `current`: satırın
 * bugünkü seti; `fits`: ikisinin aralığı kesişiyor (aynı seri).
 */
type Pair = { set: SetTarget; current: SetTarget; result: SetResult; fits: boolean };

/**
 * Sonucu planın setiyle eşler: `setIndex` ya da yapılış sırası; setsiz sonuç atılır. Kayıt
 * kendi hedefini taşıyorsa (aralık, yük yüzdesi, AMRAP) karar ona göre verilir.
 */
function pairsOf(session: SessionResult, sets: readonly SetTarget[]): Pair[] {
  return session.flatMap((result, position) => {
    const current = sets[result.setIndex ?? position];
    return current ? [{ set: result.target ?? current, current, result, fits: fitsRange(result.target, current) }] : [];
  });
}

/** Karar veren setler: tam yükteki setler; antrenman üst setten önce bittiyse hepsi. */
function deciding(pairs: readonly Pair[]): Pair[] {
  const top = pairs.filter((pair) => isFullLoad(pair.set));
  return top.length > 0 ? top : [...pairs];
}

/** AMRAP'ta zorluk düğmesi tıkanma sayılmaz; yalnız alt sınırın altı. */
function missedPair({ set, result }: Pair): boolean {
  return set.amrap ? result.value < set.min : result.effort === 'fail' || result.value < set.min;
}

/** Setin tepesi: kaydın kendi hedefinin ve satırın bugünkü setinin tepesi (bkz. `reachedTop`). */
function topOf({ set, current }: Pair): number {
  return Math.max(set.max, current.max);
}

function reachedPair(pair: Pair): boolean {
  return (pair.set.amrap || pair.result.effort !== 'fail') && pair.result.value >= topOf(pair);
}

/**
 * Antrenmanın referans (üst) ağırlığı: tam yükteki en ağır set. Tam yükte set yoksa (piramit tepeye
 * varmadan bitti) kayıttaki planlanan üst ağırlık; o da yoksa yüzdeli setlerden geri hesap. Yüzdeli
 * setler aşağı yuvarlandığı için geri hesap kayıplıdır (100'ün de 102,5'in de %80'i 80): kayıtla
 * birebir tutan üst ağırlıkların en hafifi (`light`: korunan, inen ve hafifletilen öneri) ve en ağırı
 * (`heavy`: artış) döner. Birebir tutan yoksa (bir basamak plandan hafif yapıldı) ikisi de hiçbir
 * basamağı yapılandan ağır planlamayan en ağır üst ağırlıktır.
 */
function referenceWeights(pairs: readonly Pair[], spec: LoadSpec): { light: number; heavy: number } {
  const both = (kg: number) => ({ light: kg, heavy: kg });
  const top = pairs.filter((pair) => isFullLoad(pair.set));
  if (top.length > 0) return both(Math.max(...top.map((pair) => pair.result.weightKg)));
  const planned = pairs.flatMap(({ result }) => (result.topWeightKg === undefined ? [] : [result.topWeightKg]));
  if (planned.length > 0) return both(Math.max(...planned));
  const grid = usesWeight(spec) ? gridOf(spec) : null;
  if (!grid) return both(Math.max(...pairs.map((pair) => pair.result.weightKg)));
  const heavy = Math.min(...pairs.map(({ set, result }) => largestTop(result.weightKg, set.loadPct ?? 100, spec, grid)));
  const exact = (topKg: number) =>
    pairs.every(({ set, result }) => Math.abs(percentOfTop(topKg, set.loadPct, spec) - result.weightKg) <= EPSILON);
  if (!exact(heavy)) return both(heavy);
  let light = heavy;
  for (let lower = grid.below(light, light); lower < light && exact(lower); lower = grid.below(light, light)) light = lower;
  return { light, heavy };
}

/**
 * Yüzdeli setin kaydıyla tutarlı en ağır üst ağırlık: yüzdeden geri hesaptan ızgarada yukarı
 * doğru, o yüzdeyle planlanacak set yapılandan ağır olmayana kadar.
 */
function largestTop(weightKg: number, loadPct: number, spec: LoadSpec, grid: Grid): number {
  let top = grid.floor(clean((weightKg * 100) / loadPct));
  for (let next = grid.up(top, 1); next > top && percentOfTop(next, loadPct, spec) <= weightKg + EPSILON; next = grid.up(top, 1)) {
    top = next;
  }
  return top;
}

/**
 * Aynı aralık ve aynı yükteki setler birlikte ilerler: grubun geçen seferki en düşük değeri + adım.
 * Gruplar satırın bugünkü setlerine göredir; hedef bugünkü aralığa kırpılır (8–12'den 8–15'e
 * genişletilen satırda 12 → 13).
 */
function groupTargets(sets: readonly SetTarget[], pairs: readonly Pair[], unit: number): number[] {
  const key = (set: SetTarget) => `${set.min}-${set.max}@${isFullLoad(set) ? 100 : set.loadPct}`;
  const lowest = new Map<string, number>();
  for (const { current, result } of pairs) {
    const previous = lowest.get(key(current));
    lowest.set(key(current), previous === undefined ? result.value : Math.min(previous, result.value));
  }
  return sets.map((set) => {
    const value = lowest.get(key(set));
    return value === undefined ? set.min : Math.min(set.max, Math.max(set.min, value + unit));
  });
}

/** Hafifletmede kalan setler: önce tam yükteki setler, sonra baştakiler; satır sırasıyla. */
function deloadIndexes(sets: readonly SetTarget[]): number[] {
  const keep = deloadSets(sets.length);
  const order = [...topSetIndexes(sets), ...sets.flatMap((set, index) => (isFullLoad(set) ? [] : [index]))];
  return order.slice(0, keep).sort((a, b) => a - b);
}

/** Planın setleri: üst ağırlık yüzdelerle dağılır; `indexes` verilirse yalnız o setler (hafifletme). */
export function plannedSets(
  sets: readonly SetTarget[],
  spec: LoadSpec,
  topWeightKg: number,
  targets: readonly number[],
  options: { indexes?: readonly number[]; amrap?: boolean } = {},
): PlannedSet[] {
  const indexes = options.indexes ?? sets.map((_, index) => index);
  return indexes.flatMap((index) => {
    const set = sets[index];
    if (!set) return [];
    return [
      {
        weightKg: percentOfTop(topWeightKg, set.loadPct, spec),
        target: targets[index] ?? set.min,
        amrap: options.amrap === false ? false : Boolean(set.amrap),
        ...(isFullLoad(set) ? {} : { loadPct: set.loadPct }),
        setIndex: index,
      },
    ];
  });
}

/**
 * Geçmişteki bir antrenman, satırın setleriyle eşlenmiş. `short`: yarıda bırakıldı (bugünkü planın
 * tam yük setlerinden biri yapılmadı; kayıtta varsa o günkü plan da eksik). Hafif seans (§5.5)
 * seride işaretlenir: serideki bir önceki seans hafif değilse nötr (`lighterNeutral`), hafifse
 * kaçırma (`lighterMiss`).
 */
type Analyzed = {
  results: SessionResult;
  pairs: Pair[];
  short: boolean;
  lighter: boolean;
  noStall: boolean;
  lighterNeutral: boolean;
  lighterMiss: boolean;
};

/** `planSession`'ın serisi (bkz. dosya başı): eşlenmiş antrenmanlar, en yenisi sonda; `latest` çeviri kaynağı. */
function analyzeSeries(
  sets: readonly SetTarget[],
  history: readonly SessionResult[],
  rowId: string | undefined,
): { chain: Analyzed[]; latest: Analyzed | undefined } {
  const full = topSetIndexes(sets);
  const sessions: Analyzed[] = history.flatMap((results) => {
    const pairs = pairsOf(results, sets);
    if (pairs.length === 0) return [];
    return [
      {
        results,
        pairs,
        short: isShort(results, (done) => full.some((index) => !done.has(index))),
        lighter: results.some((set) => set.lighter === true),
        noStall: results.some((set) => set.noStall === true),
        lighterNeutral: false,
        lighterMiss: false,
      },
    ];
  });
  const { chain, latest } = seriesOf(
    sessions,
    ({ pairs }) => pairs.every((pair) => pair.fits),
    rowId === undefined ? undefined : ({ results }) => results.every((set) => inRow(set, rowId)),
  );
  const marked = chain.map((session, index) => {
    const repeat = session.lighter && Boolean(chain[index - 1]?.lighter);
    return { ...session, lighterNeutral: session.lighter && !repeat, lighterMiss: repeat };
  });
  return { chain: marked, latest };
}

/** Tıkanma serisine giren kaçırma: Tanışma ve ayar seansı saymaz; ilk hafif seans nötr, ikincisi kaçırma. */
function stalled(session: Analyzed): boolean {
  if (session.noStall) return false;
  return session.lighterMiss || (!session.lighterNeutral && deciding(session.pairs).some(missedPair));
}

/** Tıkanma serisinde nötr: yarıda bırakılan ve ilk kez hafif yapılan antrenman. */
function neutralSession(session: Analyzed): boolean {
  return session.short || session.lighterNeutral;
}

/** Hafif seansın referansı planın üst ağırlığıdır (kayıttaki `topWeightKg`); yoksa yapılan. */
function referenceOf(session: Analyzed, spec: LoadSpec): { light: number; heavy: number } {
  const reference = referenceWeights(session.pairs, spec);
  if (!session.lighter) return reference;
  const planned = session.results.flatMap((set) => (set.topWeightKg === undefined ? [] : [set.topWeightKg]));
  return planned.length > 0 ? { light: Math.max(...planned), heavy: Math.max(...planned) } : reference;
}

/**
 * Set başına hedefli bir sonraki antrenman. Kararı tam yükteki (üst) setler verir;
 * yüzdeli setler (back-off, piramidin alt basamakları) üst ağırlığı yüzdeleriyle izler.
 * AMRAP sette zorluk düğmesi tıkanma sayılmaz: alt sınırın altı tıkanma, tepe ulaşma;
 * aralığın `AMRAP_EXTRA_REPS` üstü iki adım artırır.
 *
 * Geçmiş `nextSession`'daki gibi okunur: seri, setlerinin aralığı satırın setleriyle kesişen
 * kesintisiz antrenmanlardır; kayıt kendi hedefiyle değerlendirilir; seri boşsa ağırlık tam yükteki
 * setlerin hedefine çevrilir. Planın tam yük setlerinden biri yapılmadıysa antrenman yarıda
 * bırakılmıştır: artış yok, tıkanma serisinde nötr.
 *
 * Hafif seans (`SetResult.lighter`, tasarım §5.5): ilk kez nötrdür, sonraki seans planın üst
 * ağırlığıyla kurulur (`lighter_retry`); üst üste ikincisi bütün setleri kaçırılmış sayılır (planın
 * ağırlığından ~%5 iniş, tıkanma serisine girer). Tanışma ve ayar seansının (`noStall`) kaçırması
 * tıkanma serisine girmez.
 *
 * Bütün setleri aynı (aralık aynı, yüzde ve AMRAP yok) satırda sonuç `nextSession` ile
 * aynıdır (testte karşılaştırılır; `nextSession`'a satırın set sayısı verilir). Tek bilinçli
 * fark: planın set sayısından fazla sonuç (danışanın fazladan yaptığı set) karara girmez.
 */
export function planSession({
  spec,
  rule,
  sets,
  history,
  startWeightKg,
  rowId,
}: {
  spec: LoadSpec;
  rule: Pick<ProgressionRule, 'scheme' | 'targetRir'>;
  sets: readonly SetTarget[];
  history: readonly SessionResult[];
  startWeightKg?: number;
  /** Satırın kimliği (`r_…`): verilirse başka satırın kayıtları seriye girmez. */
  rowId?: string;
}): SessionPlan {
  const grid = usesWeight(spec) ? gridOf(spec) : null;
  const mins = sets.map((set) => set.min);
  const build = (topWeightKg: number, targets: readonly number[], reason: SuggestionReason): SessionPlan => ({
    sets: plannedSets(sets, spec, topWeightKg, targets),
    topWeightKg,
    reason,
  });

  const { chain, latest } = analyzeSeries(sets, history, rowId);
  const lastSession = chain.at(-1);
  const last = lastSession?.pairs;

  if (!lastSession || !last) {
    // Seri yok. PT'nin başlangıç ağırlığı çeviriden önce gelir; hiç geçmiş yoksa taban.
    if (startWeightKg !== undefined || !latest) {
      const start = startWeightKg ?? grid?.min ?? spec.minLoadKg;
      return build(grid ? grid.floor(start) : start, mins, 'first_time');
    }
    // Başka aralıktaki en yeni antrenmandan. Ağırlıksızda hedef son performanstan, setin aralığına kırpılır.
    const source = deciding(latest.pairs).map((pair) => pair.result);
    if (!grid) {
      const lowest = Math.min(...source.map((set) => set.value));
      const targets = sets.map((set) => (set.amrap ? set.min : Math.min(set.max, Math.max(set.min, lowest))));
      return build(referenceWeights(latest.pairs, spec).light, targets, 'first_time');
    }
    // Ağırlıklıda tam yükteki setlerin hedefine (en çok tekrarlısına) çevrilir.
    const fullSets = sets.filter(isFullLoad);
    const reps = Math.max(...(fullSets.length > 0 ? fullSets : sets).map((set) => set.min));
    const topWeightKg = convertedWeight(source, reps, grid);
    return build(topWeightKg, mins, topWeightKg > workWeight(source) ? 'range_increase' : 'first_time');
  }

  const { light, heavy } = referenceOf(lastSession, spec);
  // Cihazın en ağır ayarının üstündeki kayıt en ağır ayara çekilir (bkz. `nextSession`).
  const kept = grid ? Math.min(light, grid.max) : light;
  if (rule.scheme === 'none') return build(kept, mins, 'no_progression');

  if (failedStreak(chain, stalled, neutralSession) >= DELOAD_AFTER_FAILED) {
    const topWeightKg = deloadWeight(light, spec);
    return {
      sets: plannedSets(sets, spec, topWeightKg, mins, { indexes: deloadIndexes(sets), amrap: false }),
      topWeightKg,
      reason: 'deload',
    };
  }
  // Hafif seans: ilk kez planın ağırlığıyla bir kez daha; üst üste ikincisi bütün setleri kaçırmış sayılır.
  if (lastSession.lighterNeutral) return build(kept, mins, 'lighter_retry');
  if (lastSession.lighterMiss) {
    if (!grid) return build(light, mins, 'hold');
    const lowered = Math.min(decreaseWeight(light, spec), grid.max);
    return build(lowered, mins, lowered < light ? 'decrease' : 'hold');
  }
  // Yarıda bırakıldı (hafifletme antrenmanı değil): yapılmayan tam yük seti tepeye ulaşmadı sayılır, tıkanma değil.
  const incomplete = lastSession.short && failedStreak(chain.slice(0, -1), stalled, neutralSession) < DELOAD_AFTER_FAILED;

  const decisive = deciding(last);
  if (grid) {
    // Bütün setler tıkandıysa iner; karar setlerinden biri tıkandıysa (yüzdeli setler iyi olsa da) korunur.
    if (!incomplete && last.every(missedPair)) {
      const lowered = Math.min(decreaseWeight(light, spec), grid.max);
      return build(lowered, mins, lowered < light ? 'decrease' : 'hold');
    }
    if (decisive.some(missedPair)) return build(kept, mins, 'hold');
    if (incomplete) return build(kept, mins, 'incomplete');
    const reached = decisive.every(reachedPair);
    const grouped = groupTargets(sets, last, 1);
    const addRep = sets.map((set, index) => (set.amrap ? set.min : (grouped[index] ?? set.min)));
    if (rule.scheme === 'linear' || reached) {
      const rated = decisive.filter((pair) => !pair.set.amrap);
      const averageRir = rated.reduce((sum, pair) => sum + EFFORT_RIR[pair.result.effort], 0) / (rated.length || 1);
      const easy = rated.length > 0 && averageRir >= rule.targetRir + 2;
      const beyond = last.some((pair) => pair.set.amrap && pair.result.value >= topOf(pair) + AMRAP_EXTRA_REPS);
      // Belirsiz referansta (yüzdeli setlerden geri hesap) artış, kayıtla tutan en ağır üst ağırlığa kadar çıkabilir.
      const raised = Math.max(heavy, grid.up(light, rule.scheme !== 'linear' && (easy || beyond) ? 2 : 1));
      if (raised > light) return build(raised, mins, 'increase');
      // Cihazın en ağır ayarı: ağırlık artamaz (bkz. `nextSession`).
      return build(kept, reached ? sets.map((set) => set.max) : addRep, 'device_max');
    }
    return build(kept, addRep, kept < light ? 'device_max' : 'add_rep');
  }

  // Ağırlıksız ilerleme: vücut ağırlığı, bant ya da süre.
  const isDuration = spec.trackingType === 'duration';
  if (decisive.some(missedPair)) return build(light, mins, 'hold');
  if (incomplete) return build(light, mins, 'incomplete');
  if (decisive.every(reachedPair)) return build(light, sets.map((set) => set.max), 'harder_variant');
  return build(light, groupTargets(sets, last, isDuration ? DURATION_STEP_SECONDS : 1), isDuration ? 'add_time' : 'add_rep');
}

/**
 * Serinin bir antrenmanı, öneri katmanının okuduğu biçimde (`recommend.ts`: aşama kuralları, 2-for-2,
 * önce tekrar). Hesap `planSession`'la aynı eşleme ve seriyle yapılır; öneri katmanı geçmişi kendisi
 * yorumlamaz.
 */
export type SeriesSession = {
  /** Referans (üst) ağırlık: koruma ve iniş için (`light`); hafif seansta planın üst ağırlığı. */
  weightKg: number;
  /** Artışta çıkılabilecek en ağır üst ağırlık (yüzdeli setlerden geri hesapta `heavy`). */
  heavyKg: number;
  /** Karar setlerinin hepsi tepede (hafif seansta hiçbir zaman). */
  reached: boolean;
  /** Karar setlerinden biri alt sınırın altında; hafif seansta ilk kez hayır, üst üste ikincisinde evet. */
  missed: boolean;
  /** Yarıda bırakıldı ya da ilk kez hafif: tıkanma serisinde nötr. */
  neutral: boolean;
  lighter: boolean;
  noStall: boolean;
  /** Karar setlerinin (AMRAP hariç) zorlukları. */
  efforts: Effort[];
  /** Karar setlerinin değerleri (tekrar ya da saniye) ve tepeleri, aynı sırayla. */
  values: number[];
  tops: number[];
  /** AMRAP sette aralığın `AMRAP_EXTRA_REPS` üstü. */
  beyond: boolean;
  /**
   * Motor bu antrenmandan tek başına ilerleme verirdi: kaçırma ve eksik yok; ağırlıklıda doğrusal
   * ya da tepede, ağırlıksızda tepede ("zor varyasyon").
   */
  advanced: boolean;
};

/** `planSession`'ın serisi, eskiden yeniye (seri boşsa boş). */
export function sessionSeries({
  spec,
  rule,
  sets,
  history,
  rowId,
}: {
  spec: LoadSpec;
  rule: Pick<ProgressionRule, 'scheme'>;
  sets: readonly SetTarget[];
  history: readonly SessionResult[];
  rowId?: string;
}): SeriesSession[] {
  const weighted = usesWeight(spec);
  return analyzeSeries(sets, history, rowId).chain.map((session) => {
    const decisive = deciding(session.pairs);
    const { light, heavy } = referenceOf(session, spec);
    const reached = !session.lighter && decisive.every(reachedPair);
    const missed = session.lighterMiss || (!session.lighterNeutral && decisive.some(missedPair));
    const neutral = neutralSession(session);
    const progressed = weighted && rule.scheme === 'linear' ? true : reached;
    return {
      weightKg: light,
      heavyKg: heavy,
      reached,
      missed,
      neutral,
      lighter: session.lighter,
      noStall: session.noStall,
      efforts: decisive.filter((pair) => !pair.set.amrap).map((pair) => pair.result.effort),
      values: decisive.map((pair) => pair.result.value),
      tops: decisive.map(topOf),
      beyond: session.pairs.some((pair) => pair.set.amrap && pair.result.value >= topOf(pair) + AMRAP_EXTRA_REPS),
      advanced: rule.scheme !== 'none' && !missed && !neutral && !session.lighter && progressed,
    };
  });
}

/**
 * Aynı antrenmanda bir sonraki set. Yüzde aynıysa `nextSet` kuralı (önceki setin kendi
 * aralığıyla); yüzde değişiyorsa (üst setten back-off'a, piramidin bir basamağına) bu
 * antrenmanda yapılan son tam yük setinin gerçek ağırlığından hesaplanır; önceki set
 * belirgin tıkandıysa o ağırlık önce ~%5 iner.
 */
export function nextSetInPlan({
  spec,
  rule,
  sets,
  plan,
  done,
  raise = true,
}: {
  spec: LoadSpec;
  rule: Pick<ProgressionRule, 'scheme'>;
  sets: readonly SetTarget[];
  plan: SessionPlan;
  done: SessionResult;
  /** false: "kolay ve tepede" adımı yok (bugünün yoklamasıyla ayarlanan satır, tasarım §5.5). */
  raise?: boolean;
}): PlannedSet & { reason: SuggestionReason } {
  const i = done.length;
  const fallback: PlannedSet = { weightKg: plan.topWeightKg, target: sets[0]?.min ?? 0, amrap: false, setIndex: 0 };
  if (i >= plan.sets.length) return { ...(plan.sets.at(-1) ?? fallback), reason: 'hold' };
  const next = plan.sets[i] as PlannedSet;
  const last = done[i - 1];
  const previous = plan.sets[i - 1];
  // Önceki set kendi hedefine göre değerlendirilir (kayıtta yoksa planın seti).
  const lastSpec = last?.target ?? (previous ? sets[previous.setIndex] : undefined);
  const nextSpec = sets[next.setIndex];
  if (!last || !lastSpec || !nextSpec) return { ...next, reason: 'hold' };

  const samePct = (lastSpec.loadPct ?? 100) === (nextSpec.loadPct ?? 100);
  const grid = usesWeight(spec) ? gridOf(spec) : null;
  if (!grid || rule.scheme === 'none') return { ...next, weightKg: samePct ? last.weightKg : next.weightKg, reason: 'hold' };

  const failedBadly = (!lastSpec.amrap && last.effort === 'fail') || last.value <= lastSpec.min - 3;
  if (samePct) {
    if (failedBadly) {
      const lowered = decreaseWeight(last.weightKg, spec);
      return { ...next, weightKg: lowered, reason: lowered < last.weightKg ? 'decrease' : 'hold' };
    }
    // Cihazın en ağır ayarındaysa artacak yer yok: aynı ağırlık. Öneri katmanı artışı bilerek erteledi
    // (önce tekrar, 2-for-2 onayı) ya da bugünün yoklaması geri çekti (`raise: false`): "kolay ve tepede"
    // adımı yok (tasarım §5.3–5.5).
    const deferred = !raise || plan.reason === 'reps_first' || plan.reason === 'confirm_increase';
    const raised = grid.up(last.weightKg, 1);
    if (!deferred && !lastSpec.amrap && last.effort === 'easy' && last.value >= lastSpec.max && raised > last.weightKg) {
      return { ...next, weightKg: raised, reason: 'increase' };
    }
    return { ...next, weightKg: last.weightKg, reason: 'hold' };
  }

  // Bu antrenmanda yapılan son tam yük seti; yoksa planın üst ağırlığı.
  let reference = plan.topWeightKg;
  done.forEach((result, index) => {
    const planned = plan.sets[index];
    const target = result.target ?? (planned ? sets[planned.setIndex] : undefined);
    if (target && isFullLoad(target)) reference = result.weightKg;
  });
  if (failedBadly) reference = decreaseWeight(reference, spec);
  const weightKg = percentOfTop(reference, nextSpec.loadPct, spec);
  const reason: SuggestionReason = weightKg < next.weightKg ? 'decrease' : weightKg > next.weightKg ? 'increase' : 'hold';
  return { ...next, weightKg, reason };
}

/** Tolerans vb. üst ağırlığı değiştirince setleri yeniden hesaplar (hedef ve AMRAP aynı). */
export function rescalePlan(
  plan: SessionPlan,
  sets: readonly SetTarget[],
  spec: LoadSpec,
  topWeightKg: number,
  reason: SuggestionReason,
): SessionPlan {
  return {
    sets: plan.sets.map((planned) => ({
      ...planned,
      weightKg: percentOfTop(topWeightKg, sets[planned.setIndex]?.loadPct ?? planned.loadPct, spec),
    })),
    topWeightKg,
    reason,
  };
}

/** Set düzeninin kuralları (düzenleyicide kural anlatımının altında); düz sette `null`. */
export function describeSetRules(sets: readonly SetTarget[], spec: LoadSpec): string | null {
  const weighted = usesWeight(spec);
  const parts: string[] = [];
  if (weighted && sets.some((set) => !isFullLoad(set))) {
    parts.push('Yüzdeli setler tam yükteki setin ağırlığını izler; ağırlık artışına yalnız tam yükteki setler karar verir.');
  }
  if (sets.some((set) => set.amrap)) {
    parts.push(
      `AMRAP sette zorluk düğmesi tıkanma sayılmaz; alt sınırın altında kalınırsa tıkanma sayılır.${
        weighted ? ` Aralığın ${AMRAP_EXTRA_REPS}+ tekrar üstüne çıkılırsa ağırlık iki adım artar.` : ''
      }`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
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
