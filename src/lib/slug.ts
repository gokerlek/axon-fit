import * as v from 'valibot';

/**
 * Kayıt kimliği (slug): egzersiz, cihaz ve aparat kimliği yeni kayıtta addan üretilir,
 * sonra değişmez (şablonlar ve set kayıtları ona bakar).
 *
 * Şemalardaki kural `^[a-z0-9-]{2,60}$`. Kuralı geçmeyen kimlik yazılırsa kayıt bir
 * sonraki okumada okunamaz; bu yüzden üretilen kimlik yazmadan önce kaydın kendi
 * kimlik kuralıyla doğrulanır (`newRecordId`).
 *
 * Saf; yol takma adıyla çalışma zamanı içe aktarması yok (testler Node'un test aracıyla çalışır).
 */

/** Başlıktan kimlik üretir; çakışırsa ya da tek karakterse sonuna sayı ekler. */
export function slugify(title: string, taken: Set<string>): string {
  const harfler: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c', â: 'a' };
  const base =
    title
      .toLowerCase()
      .replace(/[ığüşöçâ]/g, (ch) => harfler[ch] ?? ch)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'egzersiz';

  // Kimlik en az iki karakter: tek harf ya da rakam sayıyla uzar ("V." → "v-1").
  const short = base.length < 2;
  if (!short && !taken.has(base)) return base;
  for (let i = short ? 1 : 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Yeni kaydın kimliği: addan üretilir ve kaydın kimlik kuralıyla (`idSchema`) doğrulanır.
 * Kural geçmezse `null`: çağıran hiçbir şey yazmadan 400 döner.
 */
export function newRecordId(name: string, taken: Set<string>, idSchema: v.GenericSchema<string>): string | null {
  const id = slugify(name, taken);
  return v.is(idSchema, id) ? id : null;
}
