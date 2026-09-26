import * as v from 'valibot';
import { IRRITABILITY_LEVELS, RED_FLAG_CHECKS, SYMPTOM_DIRECTIONS, TOLERANCE_MODES } from '../check-in.ts';
import { parseCondition } from '../conditions.ts';
import { isCalendarDate } from '../measurement-log.ts';
import { FMS_PATTERNS, MEASUREMENT_IDS, type FmsPattern } from '../measurements.ts';

/**
 * Danışanın sağlık kaydı — `client-<id>` repo'sunda `health.json` (SPEC §4).
 *
 * Yalnız sağlık modülü açık ve danışan onay vermişse yazılır; kapalıysa dosya hiç
 * oluşmaz. Ağrı, semptom, kırmızı bayrak, ölçüm ve tarama burada; seansın zorluğu
 * (RPE) ve süresi antrenman verisidir, seans dosyasında durur (`sessionEffortSchema`).
 * Yük toleransı motoru (`src/lib/check-in.ts`) ikisini okurken birleştirir.
 */

/**
 * Takvim günü: `isoDate` biçime bakar, ayın gün sayısına bakmaz (2026-02-30'u kabul eder). Böyle
 * bir gün sayfada 2 Mart diye görünür ama düzenleme ve silme uçları (`isCalendarDate`) onu
 * bulamaz: dosya bozuk sayılır, üzerine yazılmaz, sayfada sorun olarak görünür.
 */
const isoDate = v.pipe(
  v.string(),
  v.isoDate('Tarih YYYY-AA-GG olmalı.'),
  v.check(isCalendarDate, 'Takvimde olmayan tarih.'),
);
const nprs = v.pipe(v.number('Sayı gir.'), v.integer('Tam sayı gir.'), v.minValue(0, 'En az 0.'), v.maxValue(10, 'En fazla 10.'));
const minutes = v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(600, 'En fazla 600 dakika.'));

/** Program satırı (`r_` + 6). */
const rowId = v.pipe(v.string(), v.regex(/^r_[a-z0-9]{6}$/));

/** "lumbar_disc_herniation:acute" gibi; sözlükte olmalı. */
const conditionRef = v.pipe(
  v.string(),
  v.check((value) => parseCondition(value) !== null, 'Bilinmeyen kısıt kimliği.'),
);

/** 1 (çok kötü) – 5 (çok iyi); v1'deki hazır oluşluk sorularıyla aynı ölçek. */
const wellness = v.pipe(v.number('Sayı gir.'), v.integer('Tam sayı gir.'), v.minValue(1, 'En az 1.'), v.maxValue(5, 'En fazla 5.'));

/**
 * Hazır oluşluk: antrenman öncesi dört kısa soru. Yalnız sayılar tutulur, serbest metin
 * yok (veri en aza). Modülde "Hazır oluşluk" parçası açık ve onaylıysa yazılır.
 */
export const readinessSchema = v.object({
  sleep: wellness,
  energy: wellness,
  /** Kas ağrısı: 5 = hiç yok. */
  soreness: wellness,
  /** Stres: 5 = hiç yok. */
  stress: wellness,
});
export type Readiness = v.InferOutput<typeof readinessSchema>;

/**
 * Seans yoklamasının sağlık kısmı. Kırmızı bayrak sorusu ağrı takibi açıksa her seans
 * cevaplanır; hazır oluşluk ayrı bir parçadır, yalnız o açıksa sorulur.
 */
export const healthCheckInSchema = v.object({
  date: isoDate,
  /**
   * Antrenmana bağlı sağlık ayrıntısı (tasarım §4.2): seans dosyası nötr kalır (`skip.reason: "other"`,
   * `adjust: "lighter"`), nedeni burada, seansın kimliğiyle. Yalnız onay sürdükçe okunur ve yazılır.
   */
  sessionId: v.optional(v.pipe(v.string(), v.regex(/^s_[a-z0-9]{8}$/))),
  /** Ağrı nedeniyle geçilen satırlar. */
  skippedRows: v.optional(v.array(v.object({ rowId, reason: v.literal('pain') }))),
  /**
   * Antrenman sonrası kartta "Hangi harekette?" (isteğe bağlı): ağrı yapan satırlar. Sonraki antrenmanda
   * seans içi ağrının kuralı bunlara uygulanır, bir hafta boyunca bunlarda artış olmaz (`session-check.ts`).
   */
  painRows: v.optional(v.pipe(v.array(rowId), v.maxLength(60))),
  /** Hafifletmenin nedeni. */
  adjustReason: v.optional(v.picklist(['readiness', 'pain'] as const)),
  readiness: v.optional(readinessSchema),
  painBaseline: v.optional(nprs),
  painPeak: v.optional(nprs),
  returnedToBaseline: v.optional(v.boolean()),
  symptomDirection: v.optional(v.picklist(SYMPTOM_DIRECTIONS, 'Semptom yönünü seç.')),
  irritability: v.optional(v.picklist(IRRITABILITY_LEVELS, 'İrritabiliteyi seç.')),
  painFreeWalkingMin: v.optional(minutes),
  redFlag: v.optional(v.picklist(RED_FLAG_CHECKS, 'Kırmızı bayrak sorusunu cevapla.')),
});
export type HealthCheckIn = v.InferOutput<typeof healthCheckInSchema>;

/**
 * Danışanın yoklama yazımı (`POST /api/me/check-in`, tasarım §2.2, §2.9): antrenman başındaki sheet ve
 * antrenman sonrası kart. Tarihi sunucu koyar; bitişteki ayrıntı (`skippedRows`) bitiş ucundan gelir.
 * Aynı `sessionId`'li kayıt varsa alanları onun üstüne yazılır. Sunucu onayın kapsamadığı alanları atar
 * (`session-check.ts` → `allowedCheckIn`).
 */
export const checkInPostSchema = v.pipe(
  v.omit(healthCheckInSchema, ['date', 'skippedRows']),
  v.check(
    (body) => Object.entries(body).some(([key, value]) => key !== 'sessionId' && value !== undefined),
    'Kaydedilecek cevap yok.',
  ),
);
export type CheckInPost = v.InferOutput<typeof checkInPostSchema>;

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
