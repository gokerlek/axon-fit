import * as v from 'valibot';
import {
  DAY_ID_PATTERN,
  LOG_KINDS,
  PHASE_ID_PATTERN,
  PROGRAM_LIMITS as L,
  countDays,
  duplicateNames,
  duplicateProgramIds,
  upgradeProgram,
  upgradeProgramBody,
} from '../program-plan.ts';
import { TEMPLATE_ID_PATTERN, TEMPLATE_LIMITS, countRows } from '../template-plan.ts';
import { templateBlockSchema } from './template.ts';

/**
 * Danışana özel program şeması — sunucu ve istemci ortak (SPEC §4, §7.4).
 *
 * Program danışanın kendi repo'sunda `program.json`'dur: evreler → günler → bloklar.
 * Evreler isteğe bağlıdır: `phased: false` programda tek, süresiz, gizli bir evre olur.
 * Günün blokları şablonla aynı yapıdadır (`templateBlockSchema`). Yapı kuralları ve
 * sabitler `src/lib/program-plan.ts`'te. Node'un test aracı doğrudan çalıştırdığı için
 * çalışma zamanı içe aktarmaları göreli ve `.ts` uzantılıdır.
 *
 * Sürüm 1 dosyalar (ve eski sekmeden gelen kayıtlar) okunurken sürüm 2'ye çevrilir
 * (`upgradeProgram`): `phased` evrelerden çıkarılır, satırlar set başına hedefe geçer.
 * Düzenleyicinin şeması yalnız yeni biçimi kabul eder.
 */

const timestamp = v.pipe(v.string(), v.isoTimestamp());
const int = (min: number, max: number, unit = '') =>
  v.pipe(
    v.number('Sayı gir.'),
    v.integer('Tam sayı gir.'),
    v.minValue(min, `En az ${min}${unit}.`),
    v.maxValue(max, `En fazla ${max}${unit}.`),
  );
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));

export const phaseIdSchema = v.pipe(v.string(), v.regex(PHASE_ID_PATTERN, 'Evre kimliği geçersiz.'));
export const dayIdSchema = v.pipe(v.string(), v.regex(DAY_ID_PATTERN, 'Gün kimliği geçersiz.'));

/** Günün blokları: şablonla aynı yapı; boş gün kaydedilmez. */
export const dayBlocksSchema = v.pipe(
  v.array(templateBlockSchema),
  v.minLength(1, 'Güne en az bir hareket ekle.'),
  v.maxLength(TEMPLATE_LIMITS.blocks, `Bir günde en fazla ${TEMPLATE_LIMITS.blocks} blok olur.`),
  v.check((blocks) => countRows(blocks) <= TEMPLATE_LIMITS.rows, `Bir günde en fazla ${TEMPLATE_LIMITS.rows} hareket olur.`),
);

/** Günün geldiği şablon: o anki adıyla; şablon sonra değişse ya da silinse de program değişmez. */
export const daySourceSchema = v.object({
  templateId: v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN)),
  templateName: v.pipe(v.string(), v.maxLength(TEMPLATE_LIMITS.name)),
  at: timestamp,
});

export const programDaySchema = v.object({
  id: dayIdSchema,
  name: v.pipe(v.string('Gün adı gir.'), v.trim(), v.minLength(1, 'Gün adı gir.'), v.maxLength(L.dayName, `En fazla ${L.dayName} karakter.`)),
  blocks: dayBlocksSchema,
  source: v.optional(daySourceSchema),
});

export const programPhaseSchema = v.object({
  id: phaseIdSchema,
  name: v.pipe(
    v.string('Evre adı gir.'),
    v.trim(),
    v.minLength(1, 'Evre adı gir.'),
    v.maxLength(L.phaseName, `En fazla ${L.phaseName} karakter.`),
  ),
  /** Süre (hafta); yoksa süresiz evre, geçiş önerilmez. */
  weeks: v.optional(int(1, L.weeks, ' hafta')),
  /** Haftada kaç gün; evresiz programda programın sıklığı. */
  daysPerWeek: v.optional(int(1, L.daysPerWeek, ' gün')),
  days: v.pipe(
    v.array(programDaySchema),
    v.minLength(1, 'Evrede en az bir gün olmalı.'),
    v.maxLength(L.daysPerPhase, `Bir evrede en fazla ${L.daysPerPhase} gün olur.`),
    v.check((days) => duplicateNames(days).length === 0, 'Bu evrede aynı adda iki gün var.'),
  ),
});

export const programPhasesSchema = v.pipe(
  v.array(programPhaseSchema),
  v.minLength(1, 'En az bir evre olmalı.'),
  v.maxLength(L.phases, `En fazla ${L.phases} evre olur.`),
  v.check((phases) => countDays(phases) <= L.days, `Programda en fazla ${L.days} gün olur.`),
  v.check((phases) => duplicateNames(phases).length === 0, 'Evre adları farklı olmalı.'),
  v.check((phases) => duplicateProgramIds(phases).length === 0, 'Evre, gün, blok ve satır kimlikleri benzersiz olmalı.'),
);

const bodyFields = { phased: v.boolean('Evre seçimi okunamadı.'), currentPhaseId: phaseIdSchema, phases: programPhasesSchema };
const CURRENT_MISSING = 'Şu anki evre programda yok.';
const UNPHASED_PROBLEM = 'Evresiz programda tek, süresiz gün listesi olur.';

const currentExists = (input: { currentPhaseId: string; phases: readonly { id: string }[] }) =>
  input.phases.some((phase) => phase.id === input.currentPhaseId);
/** Evresiz programda tek evre olur ve süresi yoktur. */
const unphasedOk = (input: { phased: boolean; phases: readonly { weeks?: number }[] }) =>
  input.phased || (input.phases.length === 1 && input.phases[0]?.weeks === undefined);

/** Düzenleyicinin şeması: evrelere bölündü mü, evreler, şu anki evre (geçmiş, rotasyon, revision sunucunun). */
export const programFormSchema = v.pipe(
  v.object(bodyFields),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
  v.forward(v.partialCheck([['phased'], ['phases']], unphasedOk, UNPHASED_PROBLEM), ['phases']),
);
export type ProgramFormInput = v.InferInput<typeof programFormSchema>;
export type ProgramFormValues = v.InferOutput<typeof programFormSchema>;

/**
 * Kayıt ucu: `baseRevision` null = yeni program; sayı = düzenleyicinin yüklediği sürüm.
 * `baseCreatedAt`: yüklenen programın oluşturulma anı; silinip yeniden oluşturulan program revision
 * 1'den başlasa da çakışma yakalanır. Göndermeyen (eski) sekmede yalnız revision denetlenir.
 * Eski biçimle açık kalmış sekmenin kaydı da kabul edilir (`phased` evrelerden, setler satıra).
 */
export const programSaveSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgramBody),
  v.object({ ...bodyFields, baseRevision: v.nullable(positive), baseCreatedAt: v.optional(timestamp) }),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
  v.forward(v.partialCheck([['phased'], ['phases']], unphasedOk, UNPHASED_PROBLEM), ['phases']),
);

/** Evre geçişi (program sayfasındaki öneri): sürüm kayıttaki gibi (`baseRevision`, `baseCreatedAt`). */
export const programPhaseSwitchSchema = v.object({ phaseId: phaseIdSchema, baseRevision: positive, baseCreatedAt: v.optional(timestamp) });

export const programChangeSchema = v.object({
  scope: v.optional(v.pipe(v.string(), v.maxLength(L.changeScope))),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(L.changeText)),
});

export const programLogEntrySchema = v.object({
  at: timestamp,
  revision: positive,
  kind: v.picklist(LOG_KINDS),
  changes: v.pipe(v.array(programChangeSchema), v.minLength(1), v.maxLength(L.changesPerEntry)),
});

/** Repo'daki dosya: sürüm 1 önce çevrilir. Bilinmeyen alanlar atılır (`v.object`). */
export const programSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgram),
  v.object({
    version: v.literal(2),
    /** Evrelere bölündü mü; false: tek, süresiz gün listesi. */
    phased: v.boolean(),
    /** PT'nin her kaydında +1; düzenleyici çakışmayı bununla yakalar. */
    revision: positive,
    createdAt: timestamp,
    updatedAt: timestamp,
    phases: programPhasesSchema,
    current: v.object({ phaseId: phaseIdSchema, startedAt: timestamp }),
    /** Antrenman ekranı yazar (revision artmaz). */
    rotation: v.object({ lastDayId: v.optional(dayIdSchema), lastCompletedAt: v.optional(timestamp) }),
    /** En yenisi üstte. */
    log: v.pipe(v.array(programLogEntrySchema), v.maxLength(L.log)),
  }),
  v.check((program) => program.phases.some((phase) => phase.id === program.current.phaseId), CURRENT_MISSING),
  v.forward(v.partialCheck([['phased'], ['phases']], unphasedOk, UNPHASED_PROBLEM), ['phases']),
);
export type Program = v.InferOutput<typeof programSchema>;
