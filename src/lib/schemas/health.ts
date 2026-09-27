import * as v from 'valibot';
import { IRRITABILITY_LEVELS, RED_FLAG_CHECKS, SYMPTOM_DIRECTIONS, TOLERANCE_MODES } from '../check-in.ts';
import { parseCondition } from '../conditions.ts';
import {
  AVOID_TAG_IDS,
  CLEARANCE_BASES,
  CONSTRAINT_ID_PATTERN,
  CONSTRAINT_LIMITS,
  CONSTRAINT_REGIONS,
  CONSTRAINT_SIDES,
  CONSTRAINT_TYPES,
  DIAGNOSIS_SOURCES,
  GRAFTS,
  SEVERITIES,
  STAGES,
  TRIGGERS,
} from '../constraints.ts';
import { isCalendarDate } from '../measurement-log.ts';
import { MEASUREMENT_IDS } from '../measurements.ts';
import { LEG_LENGTH_CM, NOT_TESTED_REASONS, RESULT_CHOICES, SCREENING_LIMIT, SCREENING_PROTOCOL } from '../screening.ts';

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

/* --- kısıtlar (tasarım `kisit-tarama.md` §2, §5.3) --- */

const timestamp = v.pipe(v.string(), v.isoTimestamp());
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max, `En fazla ${max} karakter.`));
const constraintId = v.pipe(v.string(), v.regex(CONSTRAINT_ID_PATTERN, 'Kısıt kimliği geçersiz.'));
const exerciseId = v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, 'Egzersiz kimliği geçersiz.'));
const severity = v.picklist(SEVERITIES, 'Şiddeti seç.');

/** "2026", "2026-09" ya da "2026-09-12": bilinen kesinlikte. */
const onsetSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Başlangıç YYYY, YYYY-AA ya da YYYY-AA-GG olmalı.'),
  v.check((value) => {
    if (value.length === 10) return isCalendarDate(value);
    if (value.length === 7) return Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12;
    return true;
  }, 'Takvimde olmayan tarih.'),
);

export const constraintSchema = v.object({
  id: constraintId,
  region: v.picklist(CONSTRAINT_REGIONS, 'Bölgeyi seç.'),
  side: v.optional(v.picklist(CONSTRAINT_SIDES, 'Tarafı seç.')),
  type: v.picklist(CONSTRAINT_TYPES, 'Türü seç.'),
  /** Sağlık profesyonelinin koyduğu tanı (sözlükte `kind: 'diagnosis'`). */
  conditionId: v.optional(conditionRef),
  diagnosisSource: v.optional(v.picklist(DIAGNOSIS_SOURCES)),
  /** PT'nin gözlemi (sözlükte `kind: 'finding'`); danışan görmez. */
  findingId: v.optional(conditionRef),
  origin: v.optional(v.literal('screening')),
  details: v.optional(
    v.object({
      surgeryDate: v.optional(isoDate),
      graft: v.optional(v.picklist(GRAFTS)),
      stage: v.optional(v.picklist(STAGES)),
    }),
  ),
  severity: v.optional(severity),
  onset: v.optional(onsetSchema),
  onsetApprox: v.optional(v.boolean()),
  avoid: v.pipe(v.array(v.picklist(AVOID_TAG_IDS)), v.maxLength(AVOID_TAG_IDS.length)),
  /** Danışanın "Neler zorluyor?" cevabı. */
  triggers: v.optional(v.pipe(v.array(v.picklist(TRIGGERS)), v.maxLength(TRIGGERS.length))),
  status: v.picklist(['active', 'resolved'] as const),
  resolvedAt: v.optional(timestamp),
  source: v.picklist(['pt', 'client'] as const),
  confirmedAt: v.optional(timestamp),
  /** Onaylı kısıtta danışanın bekleyen güncellemesi (kötüleşti / düzeldi). */
  clientChange: v.optional(
    v.object({
      at: timestamp,
      severity: v.optional(severity),
      previousSeverity: v.optional(severity),
      resolved: v.optional(v.boolean()),
      note: v.optional(text(CONSTRAINT_LIMITS.reportNote)),
    }),
  ),
  /** PT bildirimi kısıt olarak almadı. */
  declined: v.optional(v.object({ at: timestamp, note: v.optional(text(CONSTRAINT_LIMITS.reportNote)) })),
  /** Kırmızı bayrakta: sağlık profesyoneline yönlendirildiği gün. */
  referredAt: v.optional(isoDate),
  /** Kırmızı bayrakta: görüş alındı. */
  clearance: v.optional(v.object({ at: isoDate, basis: v.picklist(CLEARANCE_BASES), scope: v.optional(text(CONSTRAINT_LIMITS.scope)) })),
  note: v.optional(text(CONSTRAINT_LIMITS.note)),
  clientNote: v.optional(text(CONSTRAINT_LIMITS.clientNote)),
  reportNote: v.optional(text(CONSTRAINT_LIMITS.reportNote)),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Constraint = v.InferOutput<typeof constraintSchema>;

/** Danışana özel izin: o kısıtın bulguları bu harekette susar. */
export const overrideSchema = v.object({
  exerciseId,
  source: constraintId,
  at: timestamp,
  note: v.optional(text(CONSTRAINT_LIMITS.clientNote)),
});
export type Override = v.InferOutput<typeof overrideSchema>;

export const CONSTRAINT_LOG_KINDS = [
  'added',
  'reported',
  'confirmed',
  'declined',
  'edited',
  'worsened',
  'improved',
  'resolved',
  'reopened',
  'withdrawn',
  'removed',
  'override_added',
  'override_removed',
  'referred',
  'cleared',
] as const;

export const constraintLogSchema = v.object({
  at: timestamp,
  by: v.picklist(['pt', 'client'] as const),
  id: constraintId,
  kind: v.picklist(CONSTRAINT_LOG_KINDS),
  text: v.pipe(v.string(), v.maxLength(CONSTRAINT_LIMITS.logText)),
});
export type ConstraintLogEntry = v.InferOutput<typeof constraintLogSchema>;

/* --- hareket taraması (protokol 1, tasarım §4) --- */

const pointId = v.pipe(v.string(), v.regex(/^[a-z_]{2,20}$/));

/** Testin bir tarafı: ağrı ya da sürüm + kaçan noktalar (sonuç bunlardan hesaplanır, saklanmaz). */
export const screeningSideSchema = v.object({
  result: v.optional(v.picklist(RESULT_CHOICES)),
  reason: v.optional(v.picklist(NOT_TESTED_REASONS)),
  missed: v.optional(v.pipe(v.array(pointId), v.maxLength(8))),
  pain: v.optional(v.literal(true)),
  painNote: v.optional(text(140)),
  seconds: v.optional(v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(300, 'En fazla 300 sn.'))),
  reachCm: v.optional(v.pipe(v.number('Sayı gir.'), v.minValue(0, 'Negatif olamaz.'), v.maxValue(250, 'En fazla 250 cm.'))),
  /** Bacak boyu (cm; ASIS → iç ayak bileği kemiği): ön uzanma bununla yüzdeye çevrilir (Plisky 2006). İsteğe bağlı. */
  legCm: v.optional(
    v.pipe(
      v.number('Sayı gir.'),
      v.minValue(LEG_LENGTH_CM.min, `En az ${LEG_LENGTH_CM.min} cm.`),
      v.maxValue(LEG_LENGTH_CM.max, `En fazla ${LEG_LENGTH_CM.max} cm.`),
    ),
  ),
});
export type ScreeningSide = v.InferOutput<typeof screeningSideSchema>;

const singleTest = v.object({ ...screeningSideSchema.entries, note: v.optional(text(140)) });
const sidedTest = v.object({ left: v.optional(screeningSideSchema), right: v.optional(screeningSideSchema), note: v.optional(text(140)) });

export const screeningTestsSchema = v.object({
  squat: v.optional(v.object({ ...singleTest.entries, heelSupportHelps: v.optional(v.boolean()) })),
  hinge: v.optional(singleTest),
  split_squat: v.optional(sidedTest),
  single_leg_balance: v.optional(sidedTest),
  push: v.optional(singleTest),
  pull: v.optional(singleTest),
  anti_rotation: v.optional(sidedTest),
  shoulder_flexion: v.optional(sidedTest),
});
export type ScreeningTests = v.InferOutput<typeof screeningTestsSchema>;

export const screeningSchema = v.object({
  date: isoDate,
  protocol: v.literal(SCREENING_PROTOCOL),
  tests: screeningTestsSchema,
  /** Ağrının gözden geçirildiği an, hücre başına ("shoulder_flexion.right"). */
  painReviewedAt: v.optional(v.record(v.pipe(v.string(), v.regex(/^[a-z_]+(\.(left|right))?$/)), timestamp)),
  note: v.optional(text(500)),
});
export type Screening = v.InferOutput<typeof screeningSchema>;

export const healthRecordSchema = v.object({
  /** Dosya biçimi: alanı olmayan dosya sürüm 1 sayılır (eski `conditions`). */
  version: v.optional(v.literal(2)),
  /** Başvuru değerleri cinsiyete göre (bel-kalça oranı, gövde dayanıklılığı). */
  sex: v.optional(v.picklist(['female', 'male'] as const)),
  /** Ağrı tavanı: ağrısız (3/10) ya da ağrı izleme (5/10, tendinopati). */
  toleranceMode: v.optional(v.picklist(TOLERANCE_MODES)),
  /** Eski biçim (sürüm 1): kısıt kimlikleri. Okunurken kısıta çevrilir; ilk kısıt yazımı düşürür. */
  conditions: v.optional(v.pipe(v.array(conditionRef), v.maxLength(12, 'En fazla 12 kısıt.'))),
  /** Eski biçim: tek ameliyat tarihi (kısıtın `details`'ine taşınır). */
  surgeryDate: v.optional(isoDate),
  checkIns: v.array(healthCheckInSchema),
  measurements: v.array(measurementEntrySchema),
  /** Eski biçimde tarama (başka protokol): çevrilmez, olduğu gibi kalır; boşsa yazımda düşer. */
  movementScreens: v.optional(v.array(v.unknown())),
  constraints: v.optional(v.pipe(v.array(constraintSchema), v.maxLength(CONSTRAINT_LIMITS.total))),
  overrides: v.optional(v.pipe(v.array(overrideSchema), v.maxLength(CONSTRAINT_LIMITS.overrides))),
  constraintLog: v.optional(v.pipe(v.array(constraintLogSchema), v.maxLength(CONSTRAINT_LIMITS.log))),
  screenings: v.optional(v.pipe(v.array(screeningSchema), v.maxLength(SCREENING_LIMIT))),
});
export type HealthRecord = v.InferOutput<typeof healthRecordSchema>;
