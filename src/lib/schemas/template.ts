import * as v from 'valibot';
import { PROGRESSION_SCHEMES } from '../progression.ts';
import { SET_LIMITS, isFullLoad } from '../set-plan.ts';
import {
  BLOCK_ID_PATTERN,
  BLOCK_KINDS,
  ROW_ID_PATTERN,
  TEMPLATE_ID_PATTERN,
  TEMPLATE_LIMITS as L,
  blockShapeProblem,
  countRows,
  duplicateIds,
  upgradeLegacyBlocks,
} from '../template-plan.ts';

export { BLOCK_KINDS, BLOCK_KIND_LABELS, TEMPLATE_ID_PATTERN, type BlockKind } from '../template-plan.ts';

/**
 * Antrenman şablonu şeması — sunucu ve istemci ortak (SPEC §7.4).
 *
 * Her şablon uygulama repo'sunda ayrı dosyadır: `data/templates/<id>.json`. Şablonda
 * kişisel veri yok: danışana özel hiçbir alan yok, bilinmeyen alanlar kayıtta atılır
 * (`v.object`). Yapı kuralları ve sabitler `src/lib/template-plan.ts`'te.
 *
 * Setler satırdadır (her setin hedefi, yüzdesi, AMRAP'ı). Eski dosyalar (blokta set sayısı,
 * satırda tek hedef) okunurken ve kayıt ucunda yeni biçime çevrilir (`storedBlocksSchema`);
 * düzenleyicinin şeması yalnız yeni biçimi kabul eder. Kayıt her zaman yeni biçimi yazar.
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

/** Yük yüzdesi: bozuk giriş (NaN) "Sayı gir." der; boş alan tam yüktür (alan yok). */
const loadPct = v.pipe(
  v.number('Sayı gir.'),
  v.integer('Tam sayı gir.'),
  v.minValue(SET_LIMITS.loadPctMin, `Yük en az %${SET_LIMITS.loadPctMin} olur.`),
  v.maxValue(100, 'Yük en fazla %100 olur.'),
);

/** Bir set: hedef (tekrar ya da saniye; min = max → sabit), isteğe bağlı yük yüzdesi, AMRAP. */
export const setSpecSchema = v.pipe(
  v.object({
    min: int(1, L.secondsMax),
    max: int(1, L.secondsMax),
    /** Tam yükteki setin yüzdesi; yoksa tam yük. */
    loadPct: v.optional(loadPct),
    /** "Yapabildiği kadar". */
    amrap: v.optional(v.boolean()),
  }),
  v.forward(v.partialCheck([['min'], ['max']], (set) => set.max >= set.min, 'Üst sınır alt sınırdan küçük olamaz.'), ['max']),
);
// Tekrarda üst sınır 100: kayıt türü burada bilinmediği için sunucuda `normalizeTemplate` denetler.

/** Satırın setleri: 1–10, en az biri tam yükte. */
export const rowSetsSchema = v.pipe(
  v.array(setSpecSchema, 'Setler okunamadı.'),
  v.minLength(1, 'En az bir set olmalı.'),
  v.maxLength(L.sets, `Bir harekette en fazla ${L.sets} set olur.`),
  v.check((sets) => sets.length === 0 || sets.some(isFullLoad), 'En az bir set tam yükte (yüzdesiz) olmalı.'),
);

/** Satır okunamazsa: setleri yoksa (hedefsiz eski satır da) bunu söyler. */
const rowMessage = (issue: v.ObjectIssue) => (issue.expected === '"sets"' ? 'Setler okunamadı.' : 'Satır okunamadı.');

/** Satırın kural değişikliği: yalnız tür ve yedekte tekrar (hedefler setlerde durur). */
export const ruleOverrideSchema = v.object({
  scheme: v.picklist(PROGRESSION_SCHEMES, 'Geçerli bir ilerleme türü seç.'),
  targetRir: int(0, 4),
});

export const templateRowSchema = v.object(
  {
  id: v.pipe(v.string(), v.regex(ROW_ID_PATTERN, 'Satır kimliği geçersiz.')),
  exerciseId: v.pipe(v.string(), v.regex(SLUG, 'Egzersiz seç.')),
  sets: rowSetsSchema,
  rule: v.optional(ruleOverrideSchema),
  /** Aynı hareket başka cihazda. Yoksa egzersizin kendi cihazı. */
  deviceId: v.optional(v.pipe(v.string(), v.regex(SLUG, 'Cihaz kimliği geçersiz.'))),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(L.note, `Not en fazla ${L.note} karakter.`))),
  },
  rowMessage,
);

export const templateBlockSchema = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.regex(BLOCK_ID_PATTERN, 'Blok kimliği geçersiz.')),
    kind: v.picklist(BLOCK_KINDS, 'Grup türünü seç.'),
    /** Tek harekette setler arası; grupta tur sonu dinlenme (tur = en çok seti olan hareket). */
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

/** Dosya ve kayıt ucu: eski biçim (blokta `sets`, satırda `target`) önce yeniye çevrilir. */
export const storedBlocksSchema = v.pipe(v.unknown(), v.transform(upgradeLegacyBlocks), templateBlocksSchema);

/** Yalnız blok düzenleyicinin form tipi için: blokları kökte tutan form. */
export const blocksHostSchema = v.object({ blocks: templateBlocksSchema });

const textFields = {
  name: templateNameSchema,
  description: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(L.description, `Açıklama en fazla ${L.description} karakter.`)),
    '',
  ),
};

/** Düzenleyicinin şeması (kimlik ve tarihler yok); yalnız yeni biçim. */
export const templateFormSchema = v.object({
  ...textFields,
  blocks: templateBlocksSchema,
  /** "Danışanlar kendi programlarına kopyalayabilir" (`docs/design/kendi-program.md` §3.8); varsayılan kapalı. */
  sharedWithClients: v.optional(v.boolean(), false),
});
export type TemplateInput = v.InferInput<typeof templateFormSchema>;
export type TemplateFormValues = v.InferOutput<typeof templateFormSchema>;

/**
 * Kayıt ucu: kimliksiz istek yeni şablondur; `baseSha` düzenleyicinin yüklediği sürüm.
 * Eski biçimle açık kalmış bir sekmenin kaydı da kabul edilir (yeni biçime çevrilir). Bayrağı
 * göndermeyen (eski sekme) kayıttakine dokunmaz.
 */
export const templateSaveSchema = v.object({
  ...textFields,
  blocks: storedBlocksSchema,
  sharedWithClients: v.optional(v.boolean()),
  id: v.optional(v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN, 'Şablon kimliği geçersiz.'))),
  baseSha: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/))),
});

/** Repo'daki dosya. Bilinmeyen alanlar atılır (`v.object`): dosyaya kişisel veri giremez. */
export const templateSchema = v.object({
  id: v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN)),
  ...textFields,
  blocks: storedBlocksSchema,
  /** Danışanlar kendi programlarına kopyalayabilir; yoksa kapalı. Danışan yalnız bu şablonları görür ve okur. */
  sharedWithClients: v.optional(v.boolean()),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export type Template = v.InferOutput<typeof templateSchema>;
