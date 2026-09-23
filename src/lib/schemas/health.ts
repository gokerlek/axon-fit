import * as v from 'valibot';
import { IRRITABILITY_LEVELS, RED_FLAG_CHECKS, SYMPTOM_DIRECTIONS, TOLERANCE_MODES } from '@/lib/check-in';
import { parseCondition } from '@/lib/conditions';
import { FMS_PATTERNS, MEASUREMENT_IDS, type FmsPattern } from '@/lib/measurements';

/**
 * Danışanın sağlık kaydı — `client-<id>` repo'sunda `health.json` (SPEC §4).
 *
 * Yalnız sağlık modülü açık ve danışan onay vermişse yazılır; kapalıysa dosya hiç
 * oluşmaz. Ağrı, semptom, kırmızı bayrak, ölçüm ve tarama burada; seansın zorluğu
 * (RPE) ve süresi antrenman verisidir, seans dosyasında durur (`sessionEffortSchema`).
 * Yük toleransı motoru (`src/lib/check-in.ts`) ikisini okurken birleştirir.
 */

const isoDate = v.pipe(v.string(), v.isoDate('Tarih YYYY-AA-GG olmalı.'));
const nprs = v.pipe(v.number('Sayı gir.'), v.integer('Tam sayı gir.'), v.minValue(0, 'En az 0.'), v.maxValue(10, 'En fazla 10.'));
const minutes = v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(600, 'En fazla 600 dakika.'));

/** "lumbar_disc_herniation:acute" gibi; sözlükte olmalı. */
const conditionRef = v.pipe(
  v.string(),
  v.check((value) => parseCondition(value) !== null, 'Bilinmeyen kısıt kimliği.'),
);

/** Seans yoklamasının sağlık kısmı. Kırmızı bayrak sorusu her seans cevaplanır. */
export const healthCheckInSchema = v.object({
  date: isoDate,
  painBaseline: v.optional(nprs),
  painPeak: v.optional(nprs),
  returnedToBaseline: v.optional(v.boolean()),
  symptomDirection: v.optional(v.picklist(SYMPTOM_DIRECTIONS, 'Semptom yönünü seç.')),
  irritability: v.optional(v.picklist(IRRITABILITY_LEVELS, 'İrritabiliteyi seç.')),
  painFreeWalkingMin: v.optional(minutes),
  redFlag: v.picklist(RED_FLAG_CHECKS, 'Kırmızı bayrak sorusunu cevapla.'),
});
export type HealthCheckIn = v.InferOutput<typeof healthCheckInSchema>;

/** Seans dosyasına giden efor bilgisi (sağlık verisi değil). */
export const sessionEffortSchema = v.object({
  /** CR-10; seans bitiminden ~10 dk sonra sorulur, zamanlama sabit tutulur. */
  sessionRpe: v.optional(v.pipe(v.number('Sayı gir.'), v.minValue(0), v.maxValue(10, 'En fazla 10.'))),
  durationMin: v.optional(v.pipe(minutes, v.minValue(1, 'En az 1 dakika.'))),
});
export type SessionEffort = v.InferOutput<typeof sessionEffortSchema>;

/** Periyodik ölçüm: tek değer, gerekiyorsa taraf. */
export const measurementEntrySchema = v.object({
  date: isoDate,
  id: v.picklist(MEASUREMENT_IDS, 'Bilinmeyen ölçüm.'),
  value: v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(1000)),
  side: v.optional(v.picklist(['left', 'right'] as const)),
});
export type MeasurementEntry = v.InferOutput<typeof measurementEntrySchema>;

const fmsScore = v.picklist([0, 1, 2, 3] as const, 'Puan 0–3 olmalı.');
const fmsEntrySchema = v.object({
  score: v.optional(fmsScore),
  left: v.optional(fmsScore),
  right: v.optional(fmsScore),
  clearingPain: v.optional(v.boolean()),
});

/** Hareket taraması: yalnız PT'nin girdiği patern puanları; toplam skor tutulmaz. */
export const movementScreenSchema = v.object({
  date: isoDate,
  entries: v.record(v.picklist(Object.keys(FMS_PATTERNS) as FmsPattern[]), fmsEntrySchema),
});

export const healthRecordSchema = v.object({
  /** Başvuru değerleri cinsiyete göre (bel-kalça oranı, gövde dayanıklılığı). */
  sex: v.optional(v.picklist(['female', 'male'] as const)),
  /** Ağrı tavanı: ağrısız (3/10) ya da ağrı izleme (5/10, tendinopati). */
  toleranceMode: v.optional(v.picklist(TOLERANCE_MODES)),
  /** Kısıtlar: sakatlık süzgeci bunlarla çalışır. */
  conditions: v.pipe(v.array(conditionRef), v.maxLength(12, 'En fazla 12 kısıt.')),
  /** ACL rekonstrüksiyonu gibi faza bağlı kurallar için ameliyat tarihi. */
  surgeryDate: v.optional(isoDate),
  checkIns: v.array(healthCheckInSchema),
  measurements: v.array(measurementEntrySchema),
  movementScreens: v.array(movementScreenSchema),
});
export type HealthRecord = v.InferOutput<typeof healthRecordSchema>;
