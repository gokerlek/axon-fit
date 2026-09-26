import * as v from 'valibot';
import { INVITE_CODE_LENGTH, PASSWORD_MAX_LENGTH } from '../client-status.ts';
import { passwordProblem } from '../password-rules.ts';

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

/**
 * Danışan şifresi (`password-rules.ts`: 8–128 karakter, yaygın ya da sıralı değil). Kırpılmaz: boşluk
 * da şifrenin parçası. Sunucu (`setClientPassword`) aynı kuralı yeniden uygular.
 */
export const passwordSchema = v.pipe(
  v.string('Şifreni yaz.'),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const problem = passwordProblem(dataset.value);
    if (problem) addIssue({ message: problem });
  }),
);

/** Form ve uç: şifre belirleme (kare koddan sonra ya da `/me`'deki kart). Tekrarı aynı olmalı. */
export const setPasswordSchema = v.pipe(
  v.object({ password: passwordSchema, confirm: v.string() }),
  v.forward(
    v.partialCheck([['password'], ['confirm']], (input) => input.password === input.confirm, 'Şifreler aynı değil.'),
    ['confirm'],
  ),
);
export type SetPasswordInput = v.InferOutput<typeof setPasswordSchema>;

/** Form: şifreyle giriş. Uzunluk burada denetlenmez: yanlış şifre de "yanlış" yanıtını alsın. */
export const passwordLoginSchema = v.object({
  password: v.pipe(v.string(), v.minLength(1, 'Şifreni yaz.'), v.maxLength(PASSWORD_MAX_LENGTH, 'Şifre çok uzun.')),
});
export type PasswordLoginInput = v.InferOutput<typeof passwordLoginSchema>;
