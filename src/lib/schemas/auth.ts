import * as v from 'valibot';
import { INVITE_CODE_LENGTH } from '../client-status';

/**
 * Giriş şemaları — TEK kaynak.
 *
 * Aynı şema hem tarayıcıdaki formu (Formisch) hem sunucudaki ucu doğrular.
 * Tipler şemadan türetilir, elle tip yazılmaz: kural değişirse iki taraf da derlemede kırılır.
 */

export const OTP_LENGTH = 6;

export const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.email('Geçerli bir e-posta adresi yaz.'),
  v.maxLength(200, 'E-posta adresi çok uzun.'),
);

export const codeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(new RegExp(`^[0-9]{${OTP_LENGTH}}$`), `${OTP_LENGTH} haneli kodu gir.`),
);

/** Form: "giriş kodu gönder" adımı. */
export const requestCodeSchema = v.object({ email: emailSchema });
export type RequestCode = v.InferOutput<typeof requestCodeSchema>;

/** Form: kod doğrulama adımı. */
export const enterCodeSchema = v.object({ code: codeSchema });
export type EnterCode = v.InferOutput<typeof enterCodeSchema>;

/** Sunucu ucu: POST /api/auth/verify gövdesi. */
export const verifyBodySchema = v.object({ email: emailSchema, code: codeSchema });

/** Danışanın davet kodu: 8 hane; boşluk ve tire yok sayılır ("1234 5678"). */
export const joinSchema = v.object({
  code: v.pipe(
    v.string(),
    v.transform((value) => value.replace(/[\s-]/g, '')),
    v.regex(new RegExp(`^[0-9]{${INVITE_CODE_LENGTH}}$`), `${INVITE_CODE_LENGTH} haneli kodu gir.`),
  ),
});
export type JoinInput = v.InferOutput<typeof joinSchema>;
