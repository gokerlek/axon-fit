import * as v from 'valibot';
import { MOVEMENT_PATTERNS } from '../alternatives.ts';
import { DEEP_MUSCLES } from '../deep-muscles.ts';
import { parseCondition } from '../conditions.ts';
import {
  AXIAL_LOADS,
  CONTRACTION_TYPES,
  JOINT_WINDOWS,
  KINETIC_CHAINS,
  LOAD_VECTORS,
  RESISTANCE_PROFILES,
  SHEAR_LEVELS,
  SPINAL_ALIGNMENTS,
} from '../exercise-filter.ts';
import { attachmentIdOf, attachmentIdSchema } from './attachment.ts';
import { GRIPS, GRIP_WIDTHS } from '../grips.ts';
import { PROGRESSION_SCHEMES } from '../progression.ts';
import { isValidVideoId, parseVideoUrl } from '../video.ts';

/**
 * Egzersiz şeması — sunucu ve istemci ortak.
 *
 * Hazır kütüphane pakette (`src/data/exercise-library.ts`), PT'nin kendi
 * egzersizleri uygulama repo'sunda (`data/exercises.json`). İkisi aynı şekle uyar.
 * Yol takma adıyla çalışma zamanı içe aktarması yok (testler Node'un test aracıyla çalışır).
 */

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'band',
  'kettlebell',
  'bodyweight',
  'cardio_machine',
] as const;

/**
 * Kaslar — kas haritasının (body-muscles) parçalarıyla bire bir; sol ve sağ birlikte.
 * Kardiyo bir kas değil ama egzersizin neyi çalıştırdığı olarak burada durur.
 */
export const MUSCLES = [
  'chest_upper',
  'chest_lower',
  'delt_front',
  'delt_side',
  'delt_rear',
  'traps_upper',
  'traps_mid',
  'traps_lower',
  'lats_upper',
  'lats_mid',
  'lats_lower',
  'erectors',
  'quadratus',
  'biceps',
  'triceps_long',
  'triceps_lateral',
  'forearm_flexors',
  'forearm_extensors',
  'abs_upper',
  'abs_lower',
  'obliques',
  'serratus',
  'glutes',
  'glute_medius',
  'hip_flexors',
  'quadriceps',
  'adductors',
  'hamstrings_medial',
  'hamstrings_lateral',
  'gastroc_medial',
  'gastroc_lateral',
  'soleus',
  'tibialis',
  'neck',
  'nape',
  'cardio',
] as const;

/** Set kaydının nasıl tutulacağı: ağırlık+tekrar, sadece tekrar, ya da süre. */
export const TRACKING_TYPES = ['weight_reps', 'bodyweight_reps', 'duration'] as const;

/** Kondisyon: tüm vücudu çalıştıran, kardiyoyla karışık hareketler (burpee, battle rope, kızak…). */
export const CATEGORIES = ['compound', 'isolation', 'conditioning', 'warmup', 'cooldown'] as const;
export type Category = (typeof CATEGORIES)[number];

const count = (max: number) =>
  v.pipe(v.number('Sayı gir.'), v.integer('Tam sayı gir.'), v.minValue(1, 'En az 1.'), v.maxValue(max, `En fazla ${max}.`));

/**
 * İlerleme kuralı (`src/lib/progression.ts`): tür, hedef aralığı (tekrar ya da saniye)
 * ve set sonunda yedekte kalacak tekrar. Egzersizde yoksa türüne göre varsayılan
 * kullanılır; şablondaki satır bunu değiştirebilir.
 */
export const progressionSchema = v.pipe(
  v.object({
    scheme: v.picklist(PROGRESSION_SCHEMES, 'Geçerli bir ilerleme türü seç.'),
    targetMin: count(3600),
    targetMax: count(3600),
    targetRir: v.pipe(v.number('Sayı gir.'), v.integer('Tam sayı gir.'), v.minValue(0, 'En az 0.'), v.maxValue(4, 'En fazla 4.')),
  }),
  v.forward(
    v.partialCheck(
      [['targetMin'], ['targetMax']],
      (rule) => rule.targetMax >= rule.targetMin,
      'Üst sınır alt sınırdan küçük olamaz.',
    ),
    ['targetMax'],
  ),
);

/** "lumbar_disc_herniation" ya da "lumbar_disc_herniation:acute"; sözlükte olmalı. */
const conditionRef = v.pipe(
  v.string(),
  v.check((value) => parseCondition(value) !== null, 'Bilinmeyen kısıt kimliği.'),
);

export const exerciseSchema = v.object({
  /** Okunabilir kimlik (slug). Şablonlar ve set kayıtları buna bakar; değiştirilmez. */
  id: v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, 'Kimlik yalnız küçük harf, rakam ve tire içerebilir.')),
  title: v.pipe(v.string(), v.trim(), v.minLength(2, 'Egzersiz adı çok kısa.'), v.maxLength(60)),
  description: v.pipe(v.string(), v.trim(), v.maxLength(400, 'Açıklama en fazla 400 karakter.')),
  /** Harekete başlarken hatırlatılacak kısa maddeler. */
  cues: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.maxLength(120, 'İpucu en fazla 120 karakter.'))),
    // Formda boş bırakılan satırlar kayda girmesin.
    v.transform((items) => items.filter((item) => item.length > 0)),
    v.maxLength(6, 'En fazla 6 ipucu.'),
  ),
  category: v.picklist(CATEGORIES, 'Geçerli bir tür seç.'),
  trackingType: v.picklist(TRACKING_TYPES, 'Geçerli bir kayıt türü seç.'),
  equipment: v.picklist(EQUIPMENT, 'Geçerli bir ekipman seç.'),
  /**
   * Hareketin yapıldığı cihaz (`src/data/device-library.ts` ya da PT'nin cihazı). Varsa
   * ağırlık önerileri cihazın ayarlanabilen ağırlıklarından seçilir; `loadStepKg` ve
   * `minLoadKg` yalnız cihazsız harekette kullanılır.
   */
  deviceId: v.optional(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))),
  /** Hangi aparatla yapıldığı: havuzdaki aparatın kimliği (cihazın aparatlarından seçilir). */
  attachmentId: v.optional(attachmentIdSchema),
  /**
   * Biyomekanik etiketler — sakatlık süzgeci bunlara bakar (`src/lib/exercise-filter.ts`).
   * Hepsi isteğe bağlı: etiketlenmemiş hareket süzülmez, uygulama bunu açıkça söyler.
   */
  kineticChain: v.optional(v.picklist(KINETIC_CHAINS, 'Zincir tipini seç.')),
  axialLoading: v.optional(v.picklist(AXIAL_LOADS, 'Eksenel yükü seç.')),
  shearForce: v.optional(v.picklist(SHEAR_LEVELS, 'Kesme kuvvetini seç.')),
  spinalAlignment: v.optional(v.picklist(SPINAL_ALIGNMENTS, 'Omurga hizasını seç.')),
  /** Hareketin geçtiği kritik açı pencereleri: hareketi yasaklamak yerine aralığı kısmak için. */
  jointWindows: v.optional(v.pipe(v.array(v.picklist(JOINT_WINDOWS)), v.maxLength(6, 'En fazla 6 açı penceresi.'))),
  loadVector: v.optional(v.picklist(LOAD_VECTORS, 'Yük vektörünü seç.')),
  contractionType: v.optional(v.picklist(CONTRACTION_TYPES, 'Kasılma tipini seç.')),
  resistanceProfile: v.optional(v.picklist(RESISTANCE_PROFILES, 'Direnç profilini seç.')),
  /** Yük altında omuz iç rotasyonda mı (upright row, empty can). */
  internalRotationUnderLoad: v.optional(v.boolean()),
  /** Bu hareketin yaptırılmayacağı kısıtlar ("lumbar_disc_herniation:acute"). */
  contraindications: v.optional(v.pipe(v.array(conditionRef), v.maxLength(12, 'En fazla 12 kısıt.'))),
  /** PT'nin "bunda sorun yok" dediği kısıtlar: uyarıyı susturur, yasağı susturmaz. */
  safeFor: v.optional(v.pipe(v.array(conditionRef), v.maxLength(12, 'En fazla 12 kısıt.'))),
  /**
   * Derin/stabilizatör aktivasyon hedefleri (`src/lib/deep-muscles.ts`): rotator manşet,
   * multifidus, pelvik taban… Haritada çizilmez ve **haftalık hacme girmez**; düzeltici
   * çalışmada "bu hareket şunu uyandırır" demek için.
   */
  activationTargets: v.optional(
    v.pipe(v.array(v.picklist(DEEP_MUSCLES, 'Geçerli bir derin kas seç.')), v.maxLength(8, 'En fazla 8 aktivasyon hedefi.')),
  ),
  /** Tutuş: pronasyon/supinasyon/nötr/karışık ve genişlik (`src/lib/grips.ts`). */
  grip: v.optional(v.picklist(GRIPS, 'Geçerli bir tutuş seç.')),
  gripWidth: v.optional(v.picklist(GRIP_WIDTHS, 'Geçerli bir tutuş genişliği seç.')),
  /** Hareket kalıbı (yatay itiş, squat…): muadil önerisinin ilk ölçütü (`src/lib/alternatives.ts`). */
  pattern: v.optional(v.picklist(MOVEMENT_PATTERNS, 'Hareket kalıbını seç.')),
  /** PT'nin sabitlediği muadiller (egzersiz kimlikleri); önerilerde en başta gelir. */
  alternatives: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))), v.maxLength(12, 'En fazla 12 muadil sabitlenebilir.')),
  ),
  /**
   * Kasın bu hareketteki payı üç seviyede: hedef, yardımcı, dengeleyici (haftalık yükte
   * 1 / 0,5 / 0,25 set sayılır). Seviye her kas için ayrıdır: birden çok kas aynı anda
   * hedef olabilir. Bir kas yalnız bir seviyede bulunur; form ve sunucu ayırır.
   */
  primaryMuscles: v.pipe(
    v.array(v.picklist(MUSCLES, 'Geçerli bir kas seç.')),
    v.minLength(1, 'En az bir hedef kas seç.'),
    v.maxLength(8, 'En fazla 8 hedef kas seçilebilir.'),
  ),
  secondaryMuscles: v.pipe(v.array(v.picklist(MUSCLES, 'Geçerli bir kas seç.')), v.maxLength(10, 'En fazla 10 yardımcı kas seçilebilir.')),
  /** Hareketi taşımayan ama gövdeyi sabit tutan kaslar (squat'ta karın, plank'ta omuz). */
  stabilizerMuscles: v.optional(
    v.pipe(v.array(v.picklist(MUSCLES, 'Geçerli bir kas seç.')), v.maxLength(10, 'En fazla 10 dengeleyici kas seçilebilir.')),
    [],
  ),
  /**
   * Ağırlık adımı: aletin izin verdiği en küçük artış (halter 2,5, dambıl 2, makine 5…).
   * Ne kadar artacağını danışanın performansı belirler; öneri bu adıma yuvarlanır.
   * Taban: barın/aletin kendi ağırlığı; öneri bunun altına inmez.
   */
  loadStepKg: v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(50, 'En fazla 50 kg.')),
  minLoadKg: v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(500, 'En fazla 500 kg.')),
  progression: v.optional(progressionSchema),
  video: v.optional(
    v.pipe(
      v.object({
        provider: v.picklist(['youtube', 'vimeo'], 'Video sağlayıcı YouTube ya da Vimeo olabilir.'),
        /** Video kimliği; gömme adresi buradan kurulur, medya barındırmıyoruz (`src/lib/video.ts`). */
        id: v.pipe(v.string(), v.trim(), v.maxLength(64)),
      }),
      v.check(isValidVideoId, 'Video kimliği geçersiz.'),
    ),
  ),
});

export type Exercise = v.InferOutput<typeof exerciseSchema>;

/**
 * Formun şeması: `id` ve `video` yok; video yerine yapıştırılan bağlantı var.
 *
 * Kimlik yeni kayıtta sunucuda başlıktan üretilir, düzenlemede zaten bellidir.
 * Formda olmayan bir alanı zorunlu tutmak formu sessizce geçersiz bırakır.
 */
export const exerciseFormSchema = v.object({
  // Sabitlenen muadiller detay sayfasındaki karttan yönetilir; form onlara dokunmaz.
  ...v.omit(exerciseSchema, ['id', 'video', 'alternatives']).entries,
  pattern: v.picklist(MOVEMENT_PATTERNS, 'Hareket kalıbını seç.'),
  // Formda kural her zaman açık yazılır (varsayılan da olsa); egzersizde isteğe bağlı.
  progression: progressionSchema,
  videoUrl: v.pipe(
    v.string(),
    v.trim(),
    v.check(
      (value) => value === '' || parseVideoUrl(value) !== null,
      'Bu bağlantıyı tanıyamadım. YouTube ya da Vimeo video bağlantısı yapıştır.',
    ),
  ),
});
export type ExerciseInput = v.InferOutput<typeof exerciseFormSchema>;

export type Equipment = (typeof EQUIPMENT)[number];
export type Muscle = (typeof MUSCLES)[number];

/** Kasların bölgeleri (Göğüs, Omuz, Sırt…): kas listelerini sıralamak ve gruplamak için. */
export const MUSCLE_GROUPS: readonly { id: string; label: string; muscles: readonly Muscle[] }[] = [
  { id: 'chest', label: 'Göğüs', muscles: ['chest_upper', 'chest_lower'] },
  { id: 'shoulders', label: 'Omuz', muscles: ['delt_front', 'delt_side', 'delt_rear'] },
  {
    id: 'back',
    label: 'Sırt',
    muscles: ['traps_upper', 'traps_mid', 'traps_lower', 'lats_upper', 'lats_mid', 'lats_lower', 'erectors', 'quadratus'],
  },
  { id: 'arms', label: 'Kol', muscles: ['biceps', 'triceps_long', 'triceps_lateral', 'forearm_flexors', 'forearm_extensors'] },
  { id: 'core', label: 'Karın', muscles: ['abs_upper', 'abs_lower', 'obliques', 'serratus'] },
  {
    id: 'legs',
    label: 'Kalça ve bacak',
    muscles: [
      'glutes',
      'glute_medius',
      'hip_flexors',
      'quadriceps',
      'adductors',
      'hamstrings_medial',
      'hamstrings_lateral',
      'gastroc_medial',
      'gastroc_lateral',
      'soleus',
      'tibialis',
    ],
  },
  { id: 'neck', label: 'Boyun', muscles: ['neck', 'nape'] },
  { id: 'other', label: 'Diğer', muscles: ['cardio'] },
];

/**
 * Birden çok parçadan oluşan kaslar. Özetlerde bütün parçaları seçiliyse tek ad
 * yazılır: "Üst kanat, Orta kanat, Alt kanat" yerine "Kanat" (`src/lib/muscles.ts`).
 */
export const MUSCLE_FAMILIES: readonly { label: string; muscles: readonly Muscle[] }[] = [
  { label: 'Göğüs', muscles: ['chest_upper', 'chest_lower'] },
  { label: 'Omuz', muscles: ['delt_front', 'delt_side', 'delt_rear'] },
  { label: 'Trapez', muscles: ['traps_upper', 'traps_mid', 'traps_lower'] },
  { label: 'Kanat', muscles: ['lats_upper', 'lats_mid', 'lats_lower'] },
  { label: 'Bel', muscles: ['erectors', 'quadratus'] },
  { label: 'Triceps', muscles: ['triceps_long', 'triceps_lateral'] },
  { label: 'Ön kol', muscles: ['forearm_flexors', 'forearm_extensors'] },
  { label: 'Karın', muscles: ['abs_upper', 'abs_lower'] },
  { label: 'Arka bacak', muscles: ['hamstrings_medial', 'hamstrings_lateral'] },
  { label: 'Baldır', muscles: ['gastroc_medial', 'gastroc_lateral', 'soleus'] },
  { label: 'Boyun', muscles: ['neck', 'nape'] },
];

/**
 * Önceki sürümlerden kalan kas değerleri (12'li grup ve 24'lü liste) → yeni parçalar.
 * Repo'daki eski kayıtlar okunurken çevrilir; yoksa kayıt okunamaz ve listede görünmez.
 *
 * Çeviri her okumada yeni kayıtlara da uygulanır; bu yüzden burada yalnız güncel
 * listede (`MUSCLES`) artık olmayan adlar durur. Eski "Boyun" (`neck`) bugün de bir kas
 * (boyun ön yüzü); çevrilirse hedef `neck` + yardımcı `nape` her okumada `[neck, nape]`
 * hedefe dönüşürdü.
 */
const LEGACY_MUSCLES: Record<string, readonly Muscle[]> = {
  chest: ['chest_upper', 'chest_lower'],
  upper_chest: ['chest_upper'],
  shoulders: ['delt_front', 'delt_side', 'delt_rear'],
  front_delts: ['delt_front'],
  side_delts: ['delt_side'],
  rear_delts: ['delt_rear'],
  back: ['lats_upper', 'lats_mid', 'lats_lower'],
  lats: ['lats_upper', 'lats_mid', 'lats_lower'],
  upper_traps: ['traps_upper'],
  mid_back: ['traps_mid', 'traps_lower'],
  lower_back: ['erectors', 'quadratus'],
  triceps: ['triceps_long', 'triceps_lateral'],
  forearms: ['forearm_flexors', 'forearm_extensors'],
  core: ['abs_upper', 'abs_lower'],
  abs: ['abs_upper', 'abs_lower'],
  hamstrings: ['hamstrings_medial', 'hamstrings_lateral'],
  calves: ['gastroc_medial', 'gastroc_lateral', 'soleus'],
};

function migrateMuscles(values: unknown): unknown {
  if (!Array.isArray(values)) return values;
  return [...new Set(values.flatMap((value) => (typeof value === 'string' ? (LEGACY_MUSCLES[value] ?? [value]) : [value])))];
}

function migrateStoredExercise(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const { loadIncrementKg, targetMuscle, ...item } = input as Record<string, unknown>;
  // Eskiden tek hedef kas vardı (`targetMuscle`); artık liste.
  const primary = migrateMuscles(item.primaryMuscles ?? (targetMuscle === undefined ? undefined : [targetMuscle]));
  const secondary = migrateMuscles(item.secondaryMuscles);
  const stabilizer = migrateMuscles(item.stabilizerMuscles);
  const without = (values: unknown, ...others: unknown[]) =>
    Array.isArray(values)
      ? values.filter((muscle) => !others.some((list) => Array.isArray(list) && list.includes(muscle)))
      : values;
  return {
    ...item,
    // İlk sürümdeki ad: "artış" aslında aletin adımıydı.
    loadStepKg: item.loadStepKg ?? loadIncrementKg,
    // Aparat eskiden sabit bir kimlik ya da addı; artık havuzdaki kimlik.
    attachmentId:
      typeof item.attachmentId === 'string'
        ? item.attachmentId
        : typeof item.attachment === 'string'
          ? attachmentIdOf(item.attachment)
          : undefined,
    primaryMuscles: primary,
    secondaryMuscles: without(secondary, primary),
    stabilizerMuscles: without(stabilizer, primary, secondary),
  };
}

/** Repo'daki `data/exercises.json`: eski alan ve kas adları okunurken yenisine çevrilir. */
export const customExercisesSchema = v.array(v.pipe(v.unknown(), v.transform(migrateStoredExercise), exerciseSchema));

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Halter',
  dumbbell: 'Dambıl',
  machine: 'Makine',
  cable: 'Kablo',
  band: 'Direnç bandı',
  kettlebell: 'Kettlebell',
  bodyweight: 'Vücut ağırlığı',
  cardio_machine: 'Kardiyo aleti',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  compound: 'Bileşik',
  isolation: 'İzolasyon',
  conditioning: 'Kondisyon',
  warmup: 'Isınma',
  cooldown: 'Soğuma',
};

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest_upper: 'Üst göğüs',
  chest_lower: 'Alt göğüs',
  delt_front: 'Ön omuz',
  delt_side: 'Yan omuz',
  delt_rear: 'Arka omuz',
  traps_upper: 'Üst trapez',
  traps_mid: 'Orta trapez',
  traps_lower: 'Alt trapez',
  lats_upper: 'Üst kanat',
  lats_mid: 'Orta kanat',
  lats_lower: 'Alt kanat',
  erectors: 'Bel dikleştiricileri',
  quadratus: 'Kuadratus (QL)',
  biceps: 'Biceps',
  triceps_long: 'Triceps uzun baş',
  triceps_lateral: 'Triceps dış baş',
  forearm_flexors: 'Ön kol bükücüleri',
  forearm_extensors: 'Ön kol açıcıları',
  abs_upper: 'Üst karın',
  abs_lower: 'Alt karın',
  obliques: 'Yan karın',
  serratus: 'Serratus',
  glutes: 'Kalça',
  glute_medius: 'Yan kalça',
  hip_flexors: 'Kalça fleksörü',
  quadriceps: 'Ön bacak',
  adductors: 'İç bacak',
  hamstrings_medial: 'Arka bacak (iç)',
  hamstrings_lateral: 'Arka bacak (dış)',
  gastroc_medial: 'Baldır (iç)',
  gastroc_lateral: 'Baldır (dış)',
  soleus: 'Soleus',
  tibialis: 'Kaval',
  neck: 'Boyun ön yüzü (SCM)',
  nape: 'Ense (üst trapez/levator)',
  cardio: 'Kardiyo',
};
