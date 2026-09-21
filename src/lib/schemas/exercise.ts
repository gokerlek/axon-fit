import * as v from 'valibot';

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

export const MUSCLES = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core',
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
  cues: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.maxLength(120))), v.maxLength(6)),
  category: v.picklist(CATEGORIES, 'Geçerli bir tür seç.'),
  trackingType: v.picklist(TRACKING_TYPES, 'Geçerli bir kayıt türü seç.'),
  equipment: v.picklist(EQUIPMENT, 'Geçerli bir ekipman seç.'),
  targetMuscle: v.picklist(MUSCLES, 'Geçerli bir kas grubu seç.'),
  secondaryMuscles: v.pipe(v.array(v.picklist(MUSCLES, 'Geçerli bir kas grubu seç.')), v.maxLength(6, 'En fazla 6 yardımcı kas seçilebilir.')),
  /** Bir sonraki sette önerilecek artış (kg) ve barın/aletin taban ağırlığı. */
  loadIncrementKg: v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(50, 'En fazla 50 kg.')),
  minLoadKg: v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(500, 'En fazla 500 kg.')),
  video: v.optional(
    v.object({
      provider: v.picklist(['youtube', 'vimeo'], 'Video sağlayıcı YouTube ya da Vimeo olabilir.'),
      /** Video kimliği; gömme adresi buradan kurulur, medya barındırmıyoruz. */
      id: v.pipe(v.string(), v.trim(), v.maxLength(64)),
    }),
  ),
  /** Görsel adresi (PT'nin kendi bağlantısı ya da repo yolu). */
  image: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300))),
});

export type Exercise = v.InferOutput<typeof exerciseSchema>;

/**
 * Formun şeması: `id` yok.
 *
 * Kimlik yeni kayıtta sunucuda başlıktan üretilir, düzenlemede zaten bellidir.
 * Formda olmayan bir alanı zorunlu tutmak formu sessizce geçersiz bırakır.
 */
export const exerciseFormSchema = v.omit(exerciseSchema, ['id']);
export type ExerciseInput = v.InferOutput<typeof exerciseFormSchema>;
export type Equipment = (typeof EQUIPMENT)[number];
export type Muscle = (typeof MUSCLES)[number];

export const customExercisesSchema = v.array(exerciseSchema);

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
  chest: 'Göğüs',
  back: 'Sırt',
  shoulders: 'Omuz',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Ön kol',
  quadriceps: 'Ön bacak',
  hamstrings: 'Arka bacak',
  glutes: 'Kalça',
  calves: 'Baldır',
  core: 'Karın',
  cardio: 'Kardiyo',
};
