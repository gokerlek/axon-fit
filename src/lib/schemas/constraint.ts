import * as v from 'valibot';
import { isCalendarDate } from '../measurement-log.ts';
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
  ONSET_CHOICES,
  SEVERITIES,
  STAGES,
  TRIGGERS,
} from '../constraints.ts';
import { parseCondition } from '../conditions.ts';
import { screeningTestsSchema } from './health.ts';

/**
 * Kısıt ve tarama uçlarının gövdeleri (tasarım `kisit-tarama.md` §5.5) — sunucu ve tarayıcı ortak. Tutarlılık
 * kuralları (çift bölgede taraf, tanıda kaynak, tanının türü) saf eylemlerde (`constraints.ts`) denetlenir;
 * burada biçim.
 */

const isoDate = v.pipe(v.string(), v.isoDate('Tarih YYYY-AA-GG olmalı.'), v.check(isCalendarDate, 'Takvimde olmayan tarih.'));
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max, `En fazla ${max} karakter.`));
/** Boş metin alanı yok sayılır. */
const optionalText = (max: number) => v.optional(v.pipe(text(max), v.transform((value) => value || undefined)));
const constraintId = v.pipe(v.string(), v.regex(CONSTRAINT_ID_PATTERN, 'Kısıt bulunamadı.'));
const timestamp = v.pipe(v.string(), v.isoTimestamp());
const conditionRef = v.pipe(
  v.string(),
  v.check((value) => parseCondition(value) !== null, 'Sözlükte olmayan kimlik.'),
);
const onset = v.pipe(
  v.string(),
  v.regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Başlangıç YYYY, YYYY-AA ya da YYYY-AA-GG olmalı.'),
  v.check((value) => (value.length === 10 ? isCalendarDate(value) : value.length !== 7 || (Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12)), 'Takvimde olmayan tarih.'),
);

/** PT'nin kısıt formu. */
export const constraintFormSchema = v.object({
  region: v.picklist(CONSTRAINT_REGIONS, 'Bölgeyi seç.'),
  side: v.optional(v.picklist(CONSTRAINT_SIDES, 'Tarafı seç.')),
  type: v.picklist(CONSTRAINT_TYPES, 'Türü seç.'),
  conditionId: v.optional(conditionRef),
  diagnosisSource: v.optional(v.picklist(DIAGNOSIS_SOURCES, 'Tanının kaynağını seç.')),
  findingId: v.optional(conditionRef),
  details: v.optional(
    v.object({
      surgeryDate: v.optional(isoDate),
      graft: v.optional(v.picklist(GRAFTS)),
      stage: v.optional(v.picklist(STAGES)),
    }),
  ),
  severity: v.optional(v.picklist(SEVERITIES, 'Şiddeti seç.')),
  onset: v.optional(onset),
  onsetApprox: v.optional(v.boolean()),
  avoid: v.pipe(v.array(v.picklist(AVOID_TAG_IDS)), v.maxLength(AVOID_TAG_IDS.length)),
  note: optionalText(CONSTRAINT_LIMITS.note),
  clientNote: optionalText(CONSTRAINT_LIMITS.clientNote),
});
export type ConstraintForm = v.InferOutput<typeof constraintFormSchema>;

/** `POST /api/clients/[id]/constraints`: kısıt; taramadaki ağrıdan eklenirse gözden geçirilecek hücre. */
export const constraintPostSchema = v.object({
  constraint: constraintFormSchema,
  fromScreening: v.optional(v.object({ date: isoDate, key: v.pipe(v.string(), v.regex(/^[a-z_]+(\.(left|right))?$/)) })),
});

const base = { baseUpdatedAt: v.optional(timestamp) };

/** `PATCH /api/clients/[id]/constraints/[kid]`. */
export const constraintPatchSchema = v.variant('action', [
  v.object({ action: v.literal('edit'), ...base, constraint: constraintFormSchema }),
  v.object({ action: v.literal('confirm_as_is'), ...base }),
  v.object({ action: v.literal('decline'), ...base, note: optionalText(CONSTRAINT_LIMITS.reportNote) }),
  v.object({ action: v.literal('resolve'), ...base }),
  v.object({ action: v.literal('reopen'), ...base }),
  v.object({ action: v.literal('ack_change'), ...base, close: v.optional(v.boolean()) }),
  v.object({ action: v.literal('refer'), ...base, date: isoDate }),
  v.object({ action: v.literal('clear'), ...base, date: isoDate, basis: v.picklist(CLEARANCE_BASES, 'Dayanağı seç.'), scope: optionalText(CONSTRAINT_LIMITS.scope) }),
]);
export type ConstraintPatch = v.InferOutput<typeof constraintPatchSchema>;

/** `POST /api/clients/[id]/constraints/overrides`. */
export const overridePostSchema = v.object({
  exerciseId: v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, 'Egzersiz bulunamadı.')),
  source: constraintId,
  note: optionalText(CONSTRAINT_LIMITS.clientNote),
});

/** Danışanın bildirimi (`POST /api/me/constraints`). */
export const reportSchema = v.object({
  region: v.picklist(CONSTRAINT_REGIONS, 'Nerede olduğunu seç.'),
  side: v.optional(v.picklist(CONSTRAINT_SIDES, 'Hangi taraf olduğunu seç.')),
  type: v.picklist(CONSTRAINT_TYPES, 'Ne olduğunu seç.'),
  severity: v.picklist(SEVERITIES, 'Ne kadar etkilediğini seç.'),
  since: v.optional(v.picklist(ONSET_CHOICES)),
  triggers: v.pipe(v.array(v.picklist(TRIGGERS)), v.maxLength(TRIGGERS.length)),
  note: optionalText(CONSTRAINT_LIMITS.reportNote),
});
export type ReportForm = v.InferOutput<typeof reportSchema>;

/** `PATCH /api/me/constraints/[kid]`: bekleyen bildirimi düzelt; onaylıda kötüleşti ya da düzeldi. */
export const reportPatchSchema = v.variant('action', [
  v.object({ action: v.literal('edit'), report: reportSchema }),
  v.object({ action: v.literal('worse'), severity: v.picklist(SEVERITIES, 'Şiddeti seç.') }),
  v.object({ action: v.literal('better') }),
]);

/** `POST /api/clients/[id]/screenings` ve `PUT …/[tarih]`. */
export const screeningPostSchema = v.object({ date: isoDate, tests: screeningTestsSchema, note: optionalText(500) });
export const screeningPutSchema = v.object({ tests: screeningTestsSchema, note: optionalText(500) });

/** `POST /api/clients/[id]/screenings/[tarih]/review`. */
export const screeningReviewSchema = v.object({ key: v.pipe(v.string(), v.regex(/^[a-z_]+(\.(left|right))?$/)) });
