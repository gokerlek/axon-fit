import * as v from 'valibot';
import {
  DAY_ID_PATTERN,
  OWN_PROGRAM_ID_PATTERN,
  OWN_PROGRAM_NAME_MAX,
  PROGRAM_LIMITS as L,
  duplicateNames,
  duplicateProgramIds,
  upgradeProgram,
  upgradeProgramBody,
} from '../program-plan.ts';
import {
  clientWeekdaysSchema,
  dayBlocksSchema,
  dayIdSchema,
  daySourceSchema,
  phaseIdSchema,
  programLogEntrySchema,
  weekdaysSchema,
} from './program.ts';

/**
 * Danışanın kendi programı — şemalar (`docs/design/kendi-program.md` §5.2, §5.3, §6). Sunucu ve telefon ortak.
 *
 * Dosya `own-programs/<id>.json`: `program.json` ile aynı gövde (sürüm 2, tek gizli evre), üstüne kimlik,
 * ad, paylaşım ve günün kopyalandığı PT günü (`copiedFrom`). Evre yok (`phased: false`, tek evre, süresiz);
 * `clientSchedule` ve `clientTargets` yazılmaz, gelirse atılır (`v.object`). Günler 1–7.
 *
 * Index (`own-programs-index.json`) türetilmiş veridir: satır satır hoşgörüyle okunur (`own-program-index.ts`),
 * burada yalnız satırın, seçimin ve olayın şeması. Node'un test aracı doğrudan çalıştırdığı için içe aktarmalar
 * göreli ve `.ts` uzantılıdır.
 */

const timestamp = v.pipe(v.string(), v.isoTimestamp());
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));

export const ownProgramIdSchema = v.pipe(v.string(), v.regex(OWN_PROGRAM_ID_PATTERN, 'Program kimliği geçersiz.'));

/** Ad: kırpılır, 1–40 karakter. Benzersizlik ve ayrılmış ad çağıranda (`ownNameProblem`). */
export const ownProgramNameSchema = v.pipe(
  v.string('Ad gir.'),
  v.trim(),
  v.minLength(1, 'Ad gir.'),
  v.maxLength(OWN_PROGRAM_NAME_MAX, `En fazla ${OWN_PROGRAM_NAME_MAX} karakter.`),
);

/** Günün kopyalandığı PT günü: o anki adıyla; PT günü sonra değişse de kopya değişmez. */
export const dayCopySchema = v.object({
  dayId: v.pipe(v.string(), v.regex(DAY_ID_PATTERN)),
  dayName: v.pipe(v.string(), v.maxLength(L.dayName)),
  at: timestamp,
});

export const ownProgramDaySchema = v.object({
  id: dayIdSchema,
  name: v.pipe(v.string('Gün adı gir.'), v.trim(), v.minLength(1, 'Gün adı gir.'), v.maxLength(L.dayName, `En fazla ${L.dayName} karakter.`)),
  blocks: dayBlocksSchema,
  source: v.optional(daySourceSchema),
  copiedFrom: v.optional(dayCopySchema),
});

/** Tek, gizli, süresiz evre: 1–7 gün, gün adları benzersiz; sıklık yalnız gün seçilmemişse anlamlı. */
export const ownProgramPhaseSchema = v.object({
  id: phaseIdSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(L.phaseName)),
  daysPerWeek: v.optional(
    v.pipe(v.number('Sayı gir.'), v.integer('Tam sayı gir.'), v.minValue(1, 'En az 1 gün.'), v.maxValue(L.daysPerWeek, `En fazla ${L.daysPerWeek} gün.`)),
  ),
  days: v.pipe(
    v.array(ownProgramDaySchema),
    v.minLength(1, 'Programda en az bir gün olmalı.'),
    v.maxLength(L.daysPerPhase, `Programda en fazla ${L.daysPerPhase} gün olur.`),
    v.check((days) => duplicateNames(days).length === 0, 'Aynı adda iki gün var.'),
  ),
});

export const ownProgramPhasesSchema = v.pipe(
  v.array(ownProgramPhaseSchema),
  v.length(1, 'Kendi programda evre olmaz.'),
  v.check((phases) => duplicateProgramIds(phases).length === 0, 'Gün, blok ve satır kimlikleri benzersiz olmalı.'),
);

const CURRENT_MISSING = 'Şu anki evre programda yok.';
const currentExists = (input: { currentPhaseId: string; phases: readonly { id: string }[] }) =>
  input.phases.some((phase) => phase.id === input.currentPhaseId);

/** Repo'daki dosya: sürüm 1 önce çevrilir; bilinmeyen alanlar (`clientTargets`, `clientSchedule`) atılır. */
export const ownProgramSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgram),
  v.object({
    version: v.literal(2),
    id: ownProgramIdSchema,
    name: ownProgramNameSchema,
    phased: v.literal(false),
    /** İçerik yazımında +1 (düzenleyici ya da bitişte satır); rotasyon, günler, paylaşım artırmaz. */
    revision: positive,
    createdAt: timestamp,
    updatedAt: timestamp,
    /** Antrenörle paylaşıldıysa an; yoksa paylaşılmamış. PT'nin yazma izninin tek kaynağı. */
    shared: v.optional(v.object({ at: timestamp })),
    phases: ownProgramPhasesSchema,
    current: v.object({ phaseId: phaseIdSchema, startedAt: timestamp }),
    rotation: v.object({ lastDayId: v.optional(dayIdSchema), lastCompletedAt: v.optional(timestamp) }),
    /** Danışanın antrenman günleri (katman yok): doğrudan yazılır. */
    schedule: v.optional(v.object({ weekdays: weekdaysSchema, at: v.optional(timestamp) })),
    log: v.pipe(v.array(programLogEntrySchema), v.maxLength(L.log)),
  }),
  v.check((program) => program.phases.some((phase) => phase.id === program.current.phaseId), CURRENT_MISSING),
);
export type OwnProgramFile = v.InferOutput<typeof ownProgramSchema>;

const bodyFields = {
  currentPhaseId: phaseIdSchema,
  phases: ownProgramPhasesSchema,
  /** Seçili günler; göndermeyen (eski taslak) kayıttakine dokunmaz. */
  weekdays: v.optional(weekdaysSchema),
};

/** Düzenleyicinin şeması (Formisch): ad, tek evre, şu anki evre, günler. Kip `own-pt`'de ad salt okunur. */
export const ownProgramFormSchema = v.pipe(
  v.object({ name: ownProgramNameSchema, ...bodyFields }),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
);
export type OwnProgramFormInput = v.InferInput<typeof ownProgramFormSchema>;
export type OwnProgramFormValues = v.InferOutput<typeof ownProgramFormSchema>;

/**
 * Kayıt uçları (danışan `PUT /api/me/programs/[pid]`, PT `PUT /api/clients/[id]/programs/[pid]`). `baseRevision`
 * null = oluşturma (yalnız danışan); `baseWeekdays` düzenleyicinin açılıştaki günleri: gönderilen günler onunla
 * aynıysa kayıttakine dokunulmaz (arada Bugün'den değişen günler ezilmesin, §3.6). Ad PT'nin kaydında yok sayılır.
 */
export const ownProgramSaveSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgramBody),
  v.object({
    ...bodyFields,
    name: v.optional(ownProgramNameSchema),
    baseWeekdays: v.optional(weekdaysSchema),
    baseRevision: v.nullable(positive),
    baseCreatedAt: v.optional(timestamp),
  }),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
);
export type OwnProgramSaveBody = v.InferOutput<typeof ownProgramSaveSchema>;

/** Paylaşım: `{ shared }`; revision artmaz. */
export const ownProgramShareSchema = v.object({ shared: v.boolean() });

/** Bugün'ün programı (kalıcı seçim): kendi programın kimliği ya da null (PT'nin programı). */
export const ownProgramActiveSchema = v.object({ programId: v.nullable(ownProgramIdSchema) });

/** "Günlerini değiştir": günler ve (verilirse) gösterilen program; null ya da yoksa kalıcı seçim. */
export const scheduleBodySchema = v.object({
  weekdays: clientWeekdaysSchema,
  programId: v.optional(v.nullable(ownProgramIdSchema)),
});

/* --- own-programs-index.json --- */

export const ownIndexItemSchema = v.object({
  id: ownProgramIdSchema,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(OWN_PROGRAM_NAME_MAX)),
  /** Dosyanın blob `sha`'sı: onarım bununla karşılaştırır (her program yazımı index'i de yazar). */
  sha: v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/)),
  days: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(L.daysPerPhase)),
  daysPerWeek: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(L.daysPerWeek))),
  weekdays: weekdaysSchema,
  /** Günlerin son değiştiği an: kaçan gün penceresi (`attention.ts`, Bugün'ün şeridi). */
  weekdaysAt: v.optional(timestamp),
  revision: positive,
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Gösterim; karar dosyadan (§3.5). */
  shared: v.optional(v.object({ at: timestamp })),
  /** Paylaşılmışken son düzenlemeler (bildirimler, §7). */
  ptEditedAt: v.optional(timestamp),
  clientEditedAt: v.optional(timestamp),
});

export const ownIndexActiveSchema = v.object({ programId: v.nullable(ownProgramIdSchema), at: timestamp });

export const OWN_EVENT_KINDS = ['unshared', 'deleted'] as const;
export const ownIndexEventSchema = v.object({
  kind: v.picklist(OWN_EVENT_KINDS),
  id: ownProgramIdSchema,
  name: v.pipe(v.string(), v.maxLength(OWN_PROGRAM_NAME_MAX)),
  at: timestamp,
});
