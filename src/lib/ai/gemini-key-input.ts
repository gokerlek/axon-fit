import * as v from 'valibot';

/** Client/server validation without importing encryption or exposing the supplied value in errors. */
export const GEMINI_KEY_ERRORS = {
  incomplete: 'Girilen değer çok kısa. Google AI Studio’dan API anahtarının tamamını kopyala; anahtar adını değil.',
  long: 'Girilen değer API anahtarı için çok uzun. Yalnız anahtarın kendisini yapıştır.',
  masked: 'Bu kısaltılmış veya gizlenmiş bir anahtar. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al.',
  spaces: 'Anahtarın içinde boşluk veya satır sonu var. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al.',
  characters: 'Girilen değer API anahtarı biçiminde değil. Yalnız anahtarı yapıştır; adres, kod veya anahtar adı kullanma.',
};
export const geminiKeySchema = v.pipe(
  v.string(), v.trim(),
  v.check(value => !/[•●*…]|\.{2,}/.test(value), GEMINI_KEY_ERRORS.masked),
  v.minLength(20, GEMINI_KEY_ERRORS.incomplete),
  v.maxLength(200, GEMINI_KEY_ERRORS.long),
  v.check(value => !/\s/.test(value), GEMINI_KEY_ERRORS.spaces),
  // Google AI Studio issues authorization keys with an AQ. prefix as well as standard keys.
  v.regex(/^[A-Za-z0-9_.-]+$/, GEMINI_KEY_ERRORS.characters),
);
export function geminiKeyError(input: unknown): string {
  const parsed = v.safeParse(geminiKeySchema, input);
  if (parsed.success) return '';
  return parsed.issues.map(issue => issue.message).find(message => Object.values(GEMINI_KEY_ERRORS).some(known => known === message))
    ?? 'Gemini API anahtarını kontrol et.';
}
