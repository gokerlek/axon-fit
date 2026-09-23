import * as v from 'valibot';
import { PROGRESSION_SCHEMES } from '../progression.ts';
import {
  BLOCK_ID_PATTERN,
  BLOCK_KINDS,
  ROW_ID_PATTERN,
  TEMPLATE_ID_PATTERN,
  TEMPLATE_LIMITS as L,
  blockShapeProblem,
  countRows,
  duplicateIds,
} from '../template-plan.ts';

export { BLOCK_KINDS, BLOCK_KIND_LABELS, TEMPLATE_ID_PATTERN, type BlockKind } from '../template-plan.ts';

/**
 * Antrenman şablonu şeması — sunucu ve istemci ortak (SPEC §7.4).
 *
 * Her şablon uygulama repo'sunda ayrı dosyadır: `data/templates/<id>.json`. Şablonda
 * kişisel veri yok: danışana özel hiçbir alan yok, bilinmeyen alanlar kayıtta atılır
 * (`v.object`). Yapı kuralları ve sabitler `src/lib/template-plan.ts`'te.
 */

/** Egzersiz ve cihaz kimlikleriyle aynı biçim. */
const SLUG = /^[a-z0-9-]{2,60}$/;

const int = (min: number, max: number, unit = '') =>
  v.pipe(
    v.number('Sayı gir.'),
    v.integer('Tam sayı gir.'),
    v.minValue(min, `En az ${min}${unit}.`),
    v.maxValue(max, `En fazla ${max}${unit}.`),
  );

/** Hedef: tekrar aralığı ya da (süreli harekette) saniye. min = max → sabit hedef (5×5). */
export const templateTargetSchema = v.pipe(
  v.object({ min: int(1, L.secondsMax), max: int(1, L.secondsMax) }),
  v.forward(
    v.partialCheck([['min'], ['max']], (target) => target.max >= target.min, 'Üst sınır alt sınırdan küçük olamaz.'),
    ['max'],
  ),
);
// Tekrarda üst sınır 100: kayıt türü burada bilinmediği için sunucuda `normalizeTemplate` denetler.

/** Satırın kural değişikliği: yalnız tür ve yedekte tekrar (hedef satırda ayrıca durur). */
export const ruleOverrideSchema = v.object({
  scheme: v.picklist(PROGRESSION_SCHEMES, 'Geçerli bir ilerleme türü seç.'),
  targetRir: int(0, 4),
});

export const templateRowSchema = v.object({
  id: v.pipe(v.string(), v.regex(ROW_ID_PATTERN, 'Satır kimliği geçersiz.')),
  exerciseId: v.pipe(v.string(), v.regex(SLUG, 'Egzersiz seç.')),
  target: templateTargetSchema,
  rule: v.optional(ruleOverrideSchema),
  /** Aynı hareket başka cihazda. Yoksa egzersizin kendi cihazı. */
  deviceId: v.optional(v.pipe(v.string(), v.regex(SLUG, 'Cihaz kimliği geçersiz.'))),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(L.note, `Not en fazla ${L.note} karakter.`))),
});

export const templateBlockSchema = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.regex(BLOCK_ID_PATTERN, 'Blok kimliği geçersiz.')),
    kind: v.picklist(BLOCK_KINDS, 'Grup türünü seç.'),
    /** Tek harekette çalışma seti; grupta tur (her hareket turda bir set). */
    sets: int(1, L.sets),
    /** Tek harekette setler arası; grupta tur sonu dinlenme. */
    restSeconds: int(0, L.restSeconds, ' sn'),
    /** Yalnız devre: istasyonlar arası geçiş. */
    transitionSeconds: v.optional(int(0, L.transitionSeconds, ' sn')),
    rows: v.pipe(
      v.array(templateRowSchema),
      v.minLength(1, 'Blokta hareket yok.'),
      v.maxLength(8, 'Bir grupta en fazla 8 hareket olur.'),
    ),
  }),
  v.forward(
    v.partialCheck(
      [['kind'], ['rows']],
      (block) => blockShapeProblem(block.kind, block.rows.length) === null,
      (issue) => blockShapeProblem(issue.input.kind, issue.input.rows.length) ?? 'Grup geçersiz.',
    ),
    ['rows'],
  ),
);

/** Şablon adı (program gününü şablon olarak kaydederken de). */
export const templateNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(2, 'Şablon adı çok kısa.'),
  v.maxLength(L.name, `En fazla ${L.name} karakter.`),
);

/** Şablonun blokları: en az bir hareket, 30 blok, 40 hareket, benzersiz kimlikler. */
export const templateBlocksSchema = v.pipe(
  v.array(templateBlockSchema),
  v.minLength(1, 'En az bir hareket ekle.'),
  v.maxLength(L.blocks, `En fazla ${L.blocks} blok.`),
  v.check((blocks) => countRows(blocks) <= L.rows, `Bir şablonda en fazla ${L.rows} hareket olur.`),
  v.check((blocks) => duplicateIds(blocks).length === 0, 'Satır ve blok kimlikleri benzersiz olmalı.'),
);

/** Yalnız blok düzenleyicinin form tipi için: blokları kökte tutan form. */
export const blocksHostSchema = v.object({ blocks: templateBlocksSchema });

const templateFields = {
  name: templateNameSchema,
  description: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(L.description, `Açıklama en fazla ${L.description} karakter.`)),
    '',
  ),
  blocks: templateBlocksSchema,
};

/** Düzenleyicinin şeması (kimlik ve tarihler yok). */
export const templateFormSchema = v.object(templateFields);
export type TemplateInput = v.InferInput<typeof templateFormSchema>;
export type TemplateFormValues = v.InferOutput<typeof templateFormSchema>;

/** Kayıt ucu: kimliksiz istek yeni şablondur; `baseSha` düzenleyicinin yüklediği sürüm. */
export const templateSaveSchema = v.object({
  ...templateFields,
  id: v.optional(v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN, 'Şablon kimliği geçersiz.'))),
  baseSha: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/))),
});

/** Repo'daki dosya. Bilinmeyen alanlar atılır (`v.object`): dosyaya kişisel veri giremez. */
export const templateSchema = v.object({
  id: v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN)),
  ...templateFields,
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export type Template = v.InferOutput<typeof templateSchema>;
