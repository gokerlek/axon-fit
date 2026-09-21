import * as v from 'valibot';
import { isValidVideoId, parseVideoUrl } from '@/lib/video';

/**
 * Egzersiz şeması — sunucu ve istemci ortak.
 *
 * Hazır kütüphane pakette (`src/data/exercise-library.ts`), PT'nin kendi
 * egzersizleri uygulama repo'sunda (`data/exercises.json`). İkisi aynı şekle uyar.
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
 * Kaslar — kas haritasındaki bölgelerle bire bir (fitness standardı; sol ve sağ birlikte).
 * Kardiyo bir kas değil ama egzersizin neyi çalıştırdığı olarak burada durur.
 */
export const MUSCLES = [
  'upper_chest',
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'upper_traps',
  'mid_back',
  'lats',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'serratus',
  'glutes',
  'glute_medius',
  'hip_flexors',
  'quadriceps',
  'adductors',
  'hamstrings',
  'calves',
  'tibialis',
  'neck',
  'cardio',
] as const;

/** Set kaydının nasıl tutulacağı: ağırlık+tekrar, sadece tekrar, ya da süre. */
export const TRACKING_TYPES = ['weight_reps', 'bodyweight_reps', 'duration'] as const;

export const CATEGORIES = ['compound', 'isolation', 'warmup', 'cooldown'] as const;
export type Category = (typeof CATEGORIES)[number];

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
  targetMuscle: v.picklist(MUSCLES, 'Geçerli bir kas seç.'),
  secondaryMuscles: v.pipe(v.array(v.picklist(MUSCLES, 'Geçerli bir kas seç.')), v.maxLength(8, 'En fazla 8 yardımcı kas seçilebilir.')),
  /** Bir sonraki sette önerilecek artış (kg) ve barın/aletin taban ağırlığı. */
  loadIncrementKg: v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(50, 'En fazla 50 kg.')),
  minLoadKg: v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(500, 'En fazla 500 kg.')),
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
  /** Görselin uygulama repo'sundaki yolu (`media/exercises/<id>.<uzantı>`). Yalnız görsel ucu yazar. */
  image: v.optional(v.pipe(v.string(), v.regex(/^media\/exercises\/[a-z0-9-]+\.(png|jpg|webp)$/))),
});

export type Exercise = v.InferOutput<typeof exerciseSchema>;

/**
 * Formun şeması: `id`, `video`, `image` yok; video yerine yapıştırılan bağlantı var.
 *
 * Kimlik yeni kayıtta sunucuda başlıktan üretilir, düzenlemede zaten bellidir.
 * Görsel ayrı uca dosya olarak gider. Formda olmayan bir alanı zorunlu tutmak
 * formu sessizce geçersiz bırakır.
 */
export const exerciseFormSchema = v.object({
  ...v.omit(exerciseSchema, ['id', 'video', 'image']).entries,
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

/** Egzersiz görseli: PNG, JPG, WebP; en fazla 1 MB. SVG yok (betik taşıyabilir). */
export const EXERCISE_IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export const EXERCISE_IMAGE_MAX_BYTES = 1024 * 1024;
export type Equipment = (typeof EQUIPMENT)[number];
export type Muscle = (typeof MUSCLES)[number];

/** Kasların bölgeleri: formda ve özetlerde gruplamak için. Kardiyo "Diğer"de. */
export const MUSCLE_GROUPS: readonly { id: string; label: string; muscles: readonly Muscle[] }[] = [
  { id: 'chest', label: 'Göğüs', muscles: ['upper_chest', 'chest'] },
  { id: 'shoulders', label: 'Omuz', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
  { id: 'back', label: 'Sırt', muscles: ['upper_traps', 'mid_back', 'lats', 'lower_back'] },
  { id: 'arms', label: 'Kol', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'core', label: 'Karın', muscles: ['abs', 'obliques', 'serratus'] },
  {
    id: 'legs',
    label: 'Kalça ve bacak',
    muscles: ['glutes', 'glute_medius', 'hip_flexors', 'quadriceps', 'adductors', 'hamstrings', 'calves', 'tibialis'],
  },
  { id: 'neck', label: 'Boyun', muscles: ['neck'] },
  { id: 'other', label: 'Diğer', muscles: ['cardio'] },
];

/**
 * İlk sürümdeki 12'li gruptan kalan değerler. Repo'daki eski kayıtlar okunurken
 * yenisine çevrilir; yoksa şema bütün dosyayı reddeder ve PT'nin egzersizleri kaybolur.
 */
const LEGACY_MUSCLES: Record<string, Muscle> = { back: 'lats', shoulders: 'front_delts', core: 'abs' };

function migrateMuscle(value: unknown): unknown {
  return typeof value === 'string' ? (LEGACY_MUSCLES[value] ?? value) : value;
}

function migrateStoredExercise(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const item = input as Record<string, unknown>;
  return {
    ...item,
    targetMuscle: migrateMuscle(item.targetMuscle),
    secondaryMuscles: Array.isArray(item.secondaryMuscles)
      ? [...new Set(item.secondaryMuscles.map(migrateMuscle))]
      : item.secondaryMuscles,
  };
}

/** Repo'daki `data/exercises.json`: eski kas adları okunurken yenisine çevrilir. */
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
  warmup: 'Isınma',
  cooldown: 'Soğuma',
};

export const MUSCLE_LABELS: Record<Muscle, string> = {
  upper_chest: 'Üst göğüs',
  chest: 'Göğüs',
  front_delts: 'Ön omuz',
  side_delts: 'Yan omuz',
  rear_delts: 'Arka omuz',
  upper_traps: 'Üst trapez',
  mid_back: 'Orta sırt',
  lats: 'Kanat (lat)',
  lower_back: 'Bel',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Ön kol',
  abs: 'Karın',
  obliques: 'Yan karın',
  serratus: 'Serratus',
  glutes: 'Kalça',
  glute_medius: 'Yan kalça',
  hip_flexors: 'Kalça fleksörü',
  quadriceps: 'Ön bacak',
  adductors: 'İç bacak',
  hamstrings: 'Arka bacak',
  calves: 'Baldır',
  tibialis: 'Kaval',
  neck: 'Boyun',
  cardio: 'Kardiyo',
};
