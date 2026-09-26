import * as v from 'valibot';

/**
 * Aparat şeması — sunucu ve istemci ortak.
 *
 * Aparat kendi başına bir kayıttır (cihazlar gibi): hazır havuz pakette
 * (`src/data/attachment-library.ts`), PT'nin eklediği ya da değiştirdiği aparatlar
 * uygulama repo'sunda (`data/attachments.json`); aynı kimlikte PT'ninki kazanır.
 * Cihaz `attachments: string[]` ile, egzersiz `attachmentId` ile bağlanır.
 */

/** Aparat adı en fazla bu kadar karakter; bir cihazda en fazla bu kadar aparat. */
export const ATTACHMENT_NAME_MAX = 40;
export const ATTACHMENTS_MAX = 12;

/** Aparat fotoğrafı: PNG, JPG, WebP; en fazla 1 MB (cihaz görseliyle aynı kural). */
export const ATTACHMENT_IMAGE_MAX_BYTES = 1024 * 1024;

export const attachmentIdSchema = v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, 'Aparat kimliği geçersiz.'));

const attachmentFields = {
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(2, 'Aparat adı çok kısa.'),
    v.maxLength(ATTACHMENT_NAME_MAX, `En fazla ${ATTACHMENT_NAME_MAX} karakter.`),
  ),
  /** `media/attachments/<kimlik>-<özet>.<uzantı>`; yalnız görsel ucu yazar. */
  image: v.optional(v.pipe(v.string(), v.regex(/^media\/attachments\/[a-z0-9-]+\.(png|jpg|webp)$/))),
};

export const attachmentSchema = v.object({ id: attachmentIdSchema, ...attachmentFields });
export type Attachment = v.InferOutput<typeof attachmentSchema>;

/** Formun şeması: kimlik yok (yeni kayıtta addan üretilir). */
export const attachmentFormSchema = v.object({ name: attachmentFields.name });
export type AttachmentInput = v.InferOutput<typeof attachmentFormSchema>;

/** Kayıt ucu: kimliksiz gelen istek yeni aparattır. */
export const attachmentSaveSchema = v.object({ id: v.optional(attachmentIdSchema), ...attachmentFields });

/** İlk sürümdeki sabit aparat kimlikleri → havuzdaki kimlik. */
const LEGACY_IDS: Record<string, string> = {
  straight_bar: 'duz-bar',
  lat_bar: 'lat-bari',
  wide_bar: 'genis-cekis-bari',
  v_bar: 'v-bar-ucgen',
  rope: 'halat',
  single_handle: 'tek-el-tutamagi',
  ez_bar: 'ez-bar-aparati',
  ankle_strap: 'ayak-bilekligi',
};

/**
 * Okurken çevrilen eski kimlikler: yeni aparata verilmez. `rope` geçerli bir kimlik biçiminde;
 * PT'nin "Rope" adlı aparatı bu kimliği alsaydı her okumada Halat'a çevrilirdi.
 */
export const LEGACY_ATTACHMENT_IDS: readonly string[] = Object.keys(LEGACY_IDS);

/**
 * Ada ya da eski kimliğe göre havuz kimliği: "V bar (üçgen)" → "v-bar-ucgen". Zaten geçerli
 * bir kimlik olduğu gibi döner: 40 karakterlik ad çakışınca oluşan `…-siy-2` kırpılıp ilk
 * aparata (`…-siy`) bağlanmasın. Çeviri yalnız eski sabit kimliğe ve ada uygulanır.
 */
export function attachmentIdOf(value: string): string {
  if (Object.hasOwn(LEGACY_IDS, value)) return LEGACY_IDS[value] as string;
  if (v.safeParse(attachmentIdSchema, value).success) return value;
  const harfler: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c', â: 'a' };
  const slug =
    value
      .toLowerCase()
      .replace(/[ığüşöçâ]/g, (ch) => harfler[ch] ?? ch)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'aparat';
  // Kimlik en az iki karakter (`attachmentIdSchema`): tek harf sayıyla uzar, "V." → "v-1" (`slugify` gibi).
  return slug.length < 2 ? `${slug}-1` : slug;
}

/**
 * Eski kayıtlarda aparat cihazın içinde ad ya da `{ name, image }` olarak tutuluyordu;
 * artık havuzdaki kimliktir. Fotoğrafı havuzdaki aparat taşır. Güncel kimlik değişmeden geçer.
 */
export function attachmentRefOf(value: unknown): string | null {
  if (typeof value === 'string') return attachmentIdOf(value);
  if (value && typeof value === 'object') {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string') return attachmentIdOf(name);
  }
  return null;
}

export const customAttachmentsSchema = v.array(attachmentSchema);
