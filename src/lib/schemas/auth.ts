import * as v from 'valibot';

/**
 * Giriş şemaları — TEK kaynak.
 *
 * Aynı şema hem tarayıcıdaki formu (Formisch) hem sunucudaki ucu doğrular.
 * Tipler şemadan türetilir, elle tip yazılmaz: kural değişirse iki taraf da derlemede kırılır.
 */

export const OTP_LENGTH = 6;

export const epostaSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.email('Geçerli bir e-posta adresi yaz.'),
  v.maxLength(200, 'E-posta adresi çok uzun.'),
);

export const kodSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(new RegExp(`^[0-9]{${OTP_LENGTH}}$`), `${OTP_LENGTH} haneli kodu gir.`),
);

/** Form: "giriş kodu gönder" adımı. */
export const kodIsteSchema = v.object({ email: epostaSchema });
export type KodIste = v.InferOutput<typeof kodIsteSchema>;

/** Form: kod doğrulama adımı. */
export const kodGirSchema = v.object({ code: kodSchema });
export type KodGir = v.InferOutput<typeof kodGirSchema>;

/** Sunucu ucu: POST /api/giris/dogrula gövdesi. */
export const dogrulaGovdeSchema = v.object({ email: epostaSchema, code: kodSchema });
