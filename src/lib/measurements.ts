/**
 * Periyodik ölçümler — PT'nin danışan başına tuttuğu ikinci katman.
 *
 * Seans başına yoklama `src/lib/check-in.ts`'te; buradakiler ayda bir ya da
 * değerlendirme günlerinde alınır. Normlar ve eşikler `docs/research/medical-fitness/`
 * (ISAK antropometri, WHO bel-kalça oranı, 5 tekrar otur-kalk, gövde dayanıklılık
 * bataryası) kaynaklıdır. Ölçüm hatasının altındaki değişim "gelişme" diye
 * raporlanmaz — yoksa PT gürültüye göre program değiştirir.
 *
 * Hepsi sağlık verisidir: yalnız sağlık modülü açık ve danışan onay vermişse
 * `health.json`'a yazılır (SPEC §4).
 */

export const MEASUREMENT_TIERS = ['recommended', 'optional'] as const;
export type MeasurementTier = (typeof MEASUREMENT_TIERS)[number];

export type MeasurementDef = {
  label: string;
  unit: 'kg' | 'cm' | 's' | '%' | 'puan';
  group: 'anthropometry' | 'performance' | 'mobility' | 'questionnaire';
  tier: MeasurementTier;
  frequency: string;
  /** Sağ/sol ayrı mı ölçülür. */
  sided?: boolean;
  note?: string;
};

export const MEASUREMENTS = {
  // --- Antropometri (ISAK Seviye 1'in çevre ölçümleri) ---
  body_mass: { label: 'Vücut ağırlığı', unit: 'kg', group: 'anthropometry', tier: 'recommended', frequency: 'Ayda bir, sabah aç karnına' },
  stature: { label: 'Boy', unit: 'cm', group: 'anthropometry', tier: 'recommended', frequency: 'İlk görüşmede' },
  waist_girth: { label: 'Bel çevresi', unit: 'cm', group: 'anthropometry', tier: 'recommended', frequency: 'Ayda bir', note: 'En dar yer; normal soluk verişin sonunda.' },
  hip_girth: { label: 'Kalça çevresi', unit: 'cm', group: 'anthropometry', tier: 'recommended', frequency: 'Ayda bir', note: 'Kalçanın en geniş yeri.' },
  arm_relaxed_girth: { label: 'Kol çevresi (gevşek)', unit: 'cm', group: 'anthropometry', tier: 'optional', frequency: 'Ayda bir', sided: true },
  arm_flexed_girth: { label: 'Kol çevresi (kasılı)', unit: 'cm', group: 'anthropometry', tier: 'optional', frequency: 'Ayda bir', sided: true },
  mid_thigh_girth: { label: 'Uyluk çevresi (orta)', unit: 'cm', group: 'anthropometry', tier: 'optional', frequency: 'Ayda bir', sided: true },
  calf_girth: { label: 'Baldır çevresi', unit: 'cm', group: 'anthropometry', tier: 'optional', frequency: 'Ayda bir', sided: true },

  // --- Performans ---
  sit_to_stand_5x: {
    label: '5 tekrar otur-kalk',
    unit: 's',
    group: 'performance',
    tier: 'recommended',
    frequency: 'Üç ayda bir',
    note: 'Kollar göğüste çapraz. 2,3 sn altındaki değişim ölçüm hatasıdır.',
  },
  trunk_flexor_endurance: { label: 'Gövde fleksör dayanıklılığı', unit: 's', group: 'performance', tier: 'optional', frequency: 'Üç ayda bir' },
  trunk_extensor_endurance: {
    label: 'Gövde ekstansör dayanıklılığı (Biering-Sørensen)',
    unit: 's',
    group: 'performance',
    tier: 'optional',
    frequency: 'Üç ayda bir',
    note: 'Önce bir alıştırma seansı: güvenilirlik 0,82 → 0,96.',
  },
  side_bridge_endurance: { label: 'Yan köprü dayanıklılığı', unit: 's', group: 'performance', tier: 'optional', frequency: 'Üç ayda bir', sided: true },

  // --- Hareketlilik ---
  weight_bearing_lunge: {
    label: 'Ayak bileği dorsifleksiyonu (duvar lunge testi)',
    unit: 'cm',
    group: 'mobility',
    tier: 'recommended',
    frequency: 'Üç ayda bir',
    sided: true,
    note: 'Topuk yerde, diz duvara değerken ayak başparmağının duvara uzaklığı.',
  },

  // --- Anketler (skoru PT girer; anket metni lisanslı olabilir, burada yok) ---
  odi: { label: 'Oswestry (bel)', unit: '%', group: 'questionnaire', tier: 'recommended', frequency: 'Dört haftada bir' },
  spadi: { label: 'SPADI (omuz)', unit: '%', group: 'questionnaire', tier: 'recommended', frequency: 'Dört haftada bir' },
  visa_p: { label: 'VISA-P (patellar tendon)', unit: 'puan', group: 'questionnaire', tier: 'recommended', frequency: 'Dört haftada bir' },
} as const satisfies Record<string, MeasurementDef>;

export type MeasurementId = keyof typeof MEASUREMENTS;
export const MEASUREMENT_IDS = Object.keys(MEASUREMENTS) as MeasurementId[];

export function measurementDef(id: MeasurementId): MeasurementDef {
  return MEASUREMENTS[id];
}

export type Sex = 'female' | 'male';

/* --- Yorumlayıcılar --- */

/** Bel-kalça oranı; erkekte ≥0,90, kadında ≥0,85 artmış metabolik risk (WHO). */
export function waistHipRatio(waistCm: number, hipCm: number, sex: Sex): { ratio: number; elevatedRisk: boolean } {
  const ratio = Math.round((waistCm / hipCm) * 100) / 100;
  return { ratio, elevatedRisk: ratio >= (sex === 'male' ? 0.9 : 0.85) };
}

/** 5 tekrar otur-kalk: >12 sn düşme riski değerlendirmesi, >15 sn tekrarlayan düşme riski. */
export function sitToStandFlag(seconds: number): 'normal' | 'fall_risk_assessment' | 'recurrent_fall_risk' {
  if (seconds > 15) return 'recurrent_fall_risk';
  if (seconds > 12) return 'fall_risk_assessment';
  return 'normal';
}

/** Otur-kalkta ölçüm hatasını aşan en küçük değişim (sn). */
export const SIT_TO_STAND_MCID = 2.3;

/** Gövde dayanıklılık testlerinde tipik hata %12–24: %25 altındaki değişim gerçek sayılmaz. */
export const ENDURANCE_NOISE = 0.25;

/**
 * Bel ve kalça çevresinde ölçüm hatasını aşan en küçük değişim (cm). Teknik ölçüm hatası
 * belde ölçümcü içi ~1,31, ölçümcüler arası ~1,56 cm; kalçada ~1,23 ve ~1,38 cm (WHO bel
 * çevresi ve bel-kalça oranı uzman raporu). Yalnız bu iki çevre için kaynaklı: kol, uyluk ve
 * baldıra aynen uygulanmaz.
 */
export const WAIST_HIP_GIRTH_NOISE_CM = 2;

export type Change = 'improved' | 'declined' | 'no_real_change';

/**
 * İki ölçüm arasındaki değişim gerçek mi? `better` hangi yönün iyi olduğunu söyler
 * (dayanıklılıkta yüksek, otur-kalkta düşük iyidir).
 */
export function realChange(
  before: number,
  after: number,
  { threshold, relative, better }: { threshold: number; relative: boolean; better: 'higher' | 'lower' },
): Change {
  const delta = after - before;
  const raw = relative ? Math.abs(delta) / Math.max(Math.abs(before), Number.EPSILON) : Math.abs(delta);
  // Ondalık çıkarma kayar (82,1 − 80,1 = 1,99999…): tam eşikteki fark gürültü sayılmasın.
  const size = Math.round(raw * 1e9) / 1e9;
  if (size < threshold) return 'no_real_change';
  const up = delta > 0;
  return (better === 'higher') === up ? 'improved' : 'declined';
}

/**
 * Sağ-sol yan köprü farkı ölçüm hatası bandını (%25) aşıyor mu. Karşılaştırma yuvarlanmamış
 * oranla (%25,4 bandı aşar). `differencePercent` gösterim içindir ve kararla çelişmez: bandın
 * yakınında (%24,5–25,5) bir ondalıkla (%25,4 "aşıyor", %25 "bandında"), uzağında tam sayıyla;
 * bandı aşan fark hiçbir zaman "%25" diye yazılmaz (%25,025 → %25,03).
 */
export function sideBridgeAsymmetry(leftS: number, rightS: number): { differencePercent: number; flagged: boolean } {
  const larger = Math.max(leftS, rightS);
  const ratio = larger === 0 ? 0 : Math.abs(leftS - rightS) / larger;
  // Ondalık çıkarma kayar (33,2 − 24,9 = 8,3000…04 → %25,000…01): tam sınırdaki fark bandı aşmış sayılmasın.
  const flagged = Math.round(ratio * 1e9) / 1e9 > ENDURANCE_NOISE;
  const percent = ratio * 100;
  const band = ENDURANCE_NOISE * 100;
  const scale = Math.abs(percent - band) <= 0.5 ? 10 : 1;
  const shown = Math.round(percent * scale) / scale;
  return { differencePercent: flagged && shown <= band ? Math.ceil(percent * 100) / 100 : shown, flagged };
}

/**
 * Gövde dayanıklılık oranları ve cinsiyete göre başvuru değerleri (McGill). Hedef
 * değil başvuru: sapma tek başına yasak ya da tanı gerekçesi değildir.
 */
export const ENDURANCE_REFERENCE: Record<Sex, { sideToExtensor: number; sideToFlexor: number }> = {
  male: { sideToExtensor: 0.65, sideToFlexor: 0.99 },
  female: { sideToExtensor: 0.39, sideToFlexor: 0.79 },
};

export function enduranceRatios(
  { flexorS, extensorS, sideS }: { flexorS: number; extensorS: number; sideS: number },
  sex: Sex,
): { sideToExtensor: number; sideToFlexor: number; reference: (typeof ENDURANCE_REFERENCE)[Sex] } {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    sideToExtensor: round(sideS / extensorS),
    sideToFlexor: round(sideS / flexorS),
    reference: ENDURANCE_REFERENCE[sex],
  };
}

/* --- Hareket taraması (FMS) --- */

/**
 * FMS'in 7 paterni. Toplam skor saklanmaz: sakatlık öngörüsündeki kanıtı çelişkili
 * (AUC 0,53–0,83). Değerli olan asimetri ve ağrı bayrağıdır. Puanlama tablosu ve
 * test yönergeleri tescilli; burada yalnız PT'nin girdiği puanlar tutulur.
 */
export const FMS_PATTERNS = {
  deep_squat: { label: 'Derin squat', sided: false },
  hurdle_step: { label: 'Engel adımı', sided: true },
  inline_lunge: { label: 'Tek çizgide lunge', sided: true },
  shoulder_mobility: { label: 'Omuz hareketliliği', sided: true, clearing: 'Sıkışma testi' },
  active_straight_leg_raise: { label: 'Aktif düz bacak kaldırma', sided: true },
  trunk_stability_push_up: { label: 'Gövde stabilitesi şınav', sided: false, clearing: 'Ekstansiyon (press-up) testi' },
  rotary_stability: { label: 'Rotasyonel stabilite', sided: true, clearing: 'Fleksiyon (posterior rocking) testi' },
} as const;

export type FmsPattern = keyof typeof FMS_PATTERNS;
export type FmsScore = 0 | 1 | 2 | 3;

/** Bir paternin kaydı: tek puan ya da sağ/sol; clearing testi ağrılıysa true. */
export type FmsEntry = { score?: FmsScore; left?: FmsScore; right?: FmsScore; clearingPain?: boolean };

export function fmsSummary(entries: Partial<Record<FmsPattern, FmsEntry>>): {
  /** Sağ ve sol puanı farklı paternler. */
  asymmetries: FmsPattern[];
  /** 0 puan ya da ağrılı clearing testi: önce değerlendirme (kırmızı bayrak). */
  painFlags: FmsPattern[];
  /** En düşük patern puanı (düzeltici çalışma buradan başlar). */
  lowest: { pattern: FmsPattern; score: FmsScore } | null;
} {
  const asymmetries: FmsPattern[] = [];
  const painFlags: FmsPattern[] = [];
  let lowest: { pattern: FmsPattern; score: FmsScore } | null = null;

  for (const pattern of Object.keys(FMS_PATTERNS) as FmsPattern[]) {
    const entry = entries[pattern];
    if (!entry) continue;
    const scores = [entry.score, entry.left, entry.right].filter((value): value is FmsScore => value !== undefined);
    if (entry.left !== undefined && entry.right !== undefined && entry.left !== entry.right) asymmetries.push(pattern);
    if (entry.clearingPain || scores.includes(0)) painFlags.push(pattern);
    const min = scores.length ? (Math.min(...scores) as FmsScore) : null;
    if (min !== null && (lowest === null || min < lowest.score)) lowest = { pattern, score: min };
  }
  return { asymmetries, painFlags, lowest };
}
