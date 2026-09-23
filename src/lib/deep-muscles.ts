import type { Muscle } from './schemas/exercise.ts';

/**
 * Derin kaslar ve postür paternleri — medikal/düzeltici katmanın sözlüğü.
 *
 * Kas haritası (`src/lib/muscles.ts`, 35 kas) yüzey anatomisidir: görülen, boyanan,
 * haftalık hacmi sayılan kaslar. Buradakiler derindedir; haritada çizilecek yüzeyleri
 * yoktur ve **hacim sayımına girmezler** — stabilizatörün seti "set" değildir, bunlar
 * aktivasyon hedefidir.
 *
 * Kaynak: `docs/research/medical-fitness/` (Janda üst/alt çapraz, NASM Overhead Squat
 * kompansasyon tablosu, McGill omurga stabilizasyonu, Sahrmann MSI).
 */

export const DEEP_MUSCLES = [
  // Omuz / skapula
  'rotator_cuff_supraspinatus',
  'rotator_cuff_external',
  'rotator_cuff_subscapularis',
  'rhomboids',
  'pec_minor',
  'levator_scapulae',
  // Boyun
  'deep_neck_flexors',
  // Gövde
  'multifidus',
  'transversus_abdominis',
  'pelvic_floor',
  'diaphragm',
  // Kalça
  'tfl',
  'deep_hip_rotators',
  // Ayak bileği
  'tibialis_posterior',
  'peroneals',
] as const;

export type DeepMuscle = (typeof DEEP_MUSCLES)[number];

/** Yüzey ya da derin kas; postür paternleri ikisini birlikte kullanır. */
export type AnyMuscle = Muscle | DeepMuscle;

export const DEEP_MUSCLE_LABELS: Record<DeepMuscle, string> = {
  rotator_cuff_supraspinatus: 'Supraspinatus',
  rotator_cuff_external: 'Dış rotatorlar (infraspinatus, teres minor)',
  rotator_cuff_subscapularis: 'Subscapularis',
  rhomboids: 'Romboidler',
  pec_minor: 'Pektoralis minor',
  levator_scapulae: 'Levator skapula',
  deep_neck_flexors: 'Derin boyun fleksörleri',
  multifidus: 'Multifidus',
  transversus_abdominis: 'Transversus abdominis',
  pelvic_floor: 'Pelvik taban',
  diaphragm: 'Diyafram',
  tfl: 'TFL (tensor fascia latae)',
  deep_hip_rotators: 'Derin kalça rotatorları (piriformis vb.)',
  tibialis_posterior: 'Tibialis posterior',
  peroneals: 'Peroneal kaslar',
};

/** Hangi bölgeye ait — formda gruplu seçim için. */
export const DEEP_MUSCLE_REGIONS: Record<DeepMuscle, 'shoulder' | 'neck' | 'trunk' | 'hip' | 'ankle'> = {
  rotator_cuff_supraspinatus: 'shoulder',
  rotator_cuff_external: 'shoulder',
  rotator_cuff_subscapularis: 'shoulder',
  rhomboids: 'shoulder',
  pec_minor: 'shoulder',
  levator_scapulae: 'shoulder',
  deep_neck_flexors: 'neck',
  multifidus: 'trunk',
  transversus_abdominis: 'trunk',
  pelvic_floor: 'trunk',
  diaphragm: 'trunk',
  tfl: 'hip',
  deep_hip_rotators: 'hip',
  tibialis_posterior: 'ankle',
  peroneals: 'ankle',
};

export const DEEP_MUSCLE_REGION_LABELS = {
  shoulder: 'Omuz ve kürek',
  neck: 'Boyun',
  trunk: 'Gövde',
  hip: 'Kalça',
  ankle: 'Ayak bileği',
} as const;

/** Kısa klinik notlar; PT'ye seçimin yanında gösterilir. */
export const DEEP_MUSCLE_NOTES: Partial<Record<DeepMuscle, string>> = {
  transversus_abdominis:
    'Tanımlamak için var, izole çalıştırmak için değil: hollowing yerine bracing desteklenir (bracing stabiliteyi %32 artırıyor, TrA’nın tek başına katkısı %0,14).',
  multifidus: 'Bel ağrısında atrofiye uğrar; bird dog gibi nötr omurgalı işlerde hedeflenir.',
  rotator_cuff_external: 'Sıkışmada asıl çalıştırılacak grup budur; deltoid değil.',
  pec_minor: 'Üst çapraz paterninde kısalır, omzu öne-aşağı çeker.',
  tfl: 'Diz valgusunda aşırı aktif olduğu EMG ile desteklenen az sayıdaki bulgudan biri.',
  pelvic_floor: 'Doğum sonrası ve intraabdominal basınç çalışmalarında diyaframla birlikte ele alınır.',
  diaphragm: 'Nefes paterni: bracing ve IAP’nin temeli.',
};

export function isDeepMuscle(value: string): value is DeepMuscle {
  return (DEEP_MUSCLES as readonly string[]).includes(value);
}

/**
 * Postür/kompansasyon paternleri: hangi kas kısalmış (aşırı aktif), hangisi uykuda
 * (az aktif). NASM'in düzeltici zinciri bunu "inhibit → lengthen → activate → integrate"
 * sırasıyla kullanır.
 *
 * `confidence` bilerek var: bu eşlemelerin çoğu uzman görüşüdür. Uygulama bunlara
 * dayanarak egzersiz **yasaklamaz**, yalnız öneri üretir.
 */
export type PosturalPattern = {
  label: string;
  /** Kısalmış/aşırı aktif: önce gevşetilir ve uzatılır. */
  overactive: readonly AnyMuscle[];
  /** Zayıf/az aktif: sonra aktive edilip harekete katılır. */
  underactive: readonly AnyMuscle[];
  confidence: 'supported' | 'mixed' | 'expert_opinion';
  note: string;
};

export const POSTURAL_PATTERNS = {
  upper_crossed: {
    label: 'Üst çapraz patern (öne baş, yuvarlak omuz)',
    overactive: ['pec_minor', 'chest_upper', 'levator_scapulae', 'traps_upper', 'nape'],
    underactive: ['deep_neck_flexors', 'traps_lower', 'traps_mid', 'rhomboids', 'serratus', 'rotator_cuff_external'],
    confidence: 'expert_opinion',
    note: 'Janda’nın tanımı klinikte yaygın; nedensellik (gergin kas zayıfı inhibe eder) doğrulanmadı. Bulgu olarak kullan, yasak gerekçesi yapma.',
  },
  lower_crossed: {
    label: 'Alt çapraz patern (anterior pelvik tilt)',
    overactive: ['hip_flexors', 'erectors', 'tfl'],
    underactive: ['glutes', 'abs_lower', 'transversus_abdominis'],
    confidence: 'expert_opinion',
    note: 'Tek postür fotoğrafına dayanıyorsa karar verdirme; en az üç doğrulayıcı bulgu iste.',
  },
  dynamic_knee_valgus: {
    label: 'Dinamik diz valgusu (diz içeri kaçıyor)',
    overactive: ['adductors', 'tfl', 'gastroc_lateral', 'soleus'],
    underactive: ['glute_medius', 'glutes', 'tibialis_posterior'],
    confidence: 'mixed',
    note: 'EMG adduktor ve kuadriseps artışını doğruluyor; gluteus medius zayıflığının neden mi sonuç mu olduğu belirsiz.',
  },
  scapular_dyskinesis: {
    label: 'Skapular diskinezi (kürek kontrolü bozuk)',
    overactive: ['pec_minor', 'traps_upper', 'levator_scapulae'],
    underactive: ['serratus', 'traps_lower', 'rhomboids'],
    confidence: 'mixed',
    note: 'Ağrısız diskinezi tek başına yasak gerekçesi değildir; baş üstü işte kontrol kurulana kadar uyarı üretir.',
  },
  foot_pronation: {
    label: 'Ayak içe basma (pronasyon)',
    overactive: ['peroneals', 'gastroc_lateral', 'adductors'],
    underactive: ['tibialis_posterior', 'tibialis', 'glute_medius'],
    confidence: 'expert_opinion',
    note: 'Ayak bileği dorsifleksiyon kısıtıyla birlikte değerlendirilir; squat’ta topuk yükseltmek ilk denenecek çözümdür.',
  },
} as const satisfies Record<string, PosturalPattern>;

export type PosturalPatternId = keyof typeof POSTURAL_PATTERNS;
export const POSTURAL_PATTERN_IDS = Object.keys(POSTURAL_PATTERNS) as PosturalPatternId[];

export function posturalPattern(id: PosturalPatternId): PosturalPattern {
  return POSTURAL_PATTERNS[id];
}

/** Paternin önerdiği çalışma: önce gevşet/uzat, sonra aktive et. */
export function correctiveTargets(ids: readonly PosturalPatternId[]): {
  lengthen: AnyMuscle[];
  activate: AnyMuscle[];
} {
  const lengthen = new Set<AnyMuscle>();
  const activate = new Set<AnyMuscle>();
  for (const id of ids) {
    for (const muscle of POSTURAL_PATTERNS[id].overactive) lengthen.add(muscle);
    for (const muscle of POSTURAL_PATTERNS[id].underactive) activate.add(muscle);
  }
  // Aynı kas iki paternde ters roldeyse aktivasyon kazanır: zayıfı güçlendirmek önceliklidir.
  for (const muscle of activate) lengthen.delete(muscle);
  return { lengthen: [...lengthen], activate: [...activate] };
}
