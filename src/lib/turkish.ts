/**
 * Serbest metin adlara Türkçe ek (kendi programın adı: "Evde'ye yaz", `docs/design/kendi-program.md` §2.9) — saf.
 * Özel ad gibi kesme işaretiyle; son ünlüye göre büyük ünlü uyumu, ünlüyle biten adda kaynaştırma (y). Sayıyla
 * biten ad okunuşuna göre ("Programım 2" → "2'ye"). Ünlüsü olmayan kısaltma harf harf okunur ("PPL" → "PPL'ye").
 */

const BACK = new Set(['a', 'ı', 'o', 'u']);
const FRONT = new Set(['e', 'i', 'ö', 'ü']);

/** Rakamların okunuşunun son ünlüsü ve ünlüyle bitip bitmediği (0 sıfır … 9 dokuz). */
const DIGITS: Record<string, { vowel: string; open: boolean }> = {
  '0': { vowel: 'ı', open: false },
  '1': { vowel: 'i', open: false },
  '2': { vowel: 'i', open: true },
  '3': { vowel: 'ü', open: false },
  '4': { vowel: 'ö', open: false },
  '5': { vowel: 'e', open: false },
  '6': { vowel: 'ı', open: true },
  '7': { vowel: 'i', open: true },
  '8': { vowel: 'i', open: false },
  '9': { vowel: 'u', open: false },
};

/** Sondaki okunuş: son ünlü ve ünlüyle bitiyor mu; belirlenemezse null. */
function ending(word: string): { vowel: string; open: boolean } | null {
  const text = word.trim().toLocaleLowerCase('tr');
  const last = text.at(-1);
  if (!last) return null;
  if (/\d/.test(last)) {
    // "10", "20" … onlar basamağı sıfırsa ("on", "yirmi"): yaklaşık olarak son rakamdan; 0'da onluk okunuşu.
    if (last === '0' && text.length > 1) {
      const tens: Record<string, { vowel: string; open: boolean }> = {
        '1': { vowel: 'o', open: false },
        '2': { vowel: 'i', open: true },
        '3': { vowel: 'u', open: false },
        '4': { vowel: 'ı', open: false },
        '5': { vowel: 'i', open: false },
        '6': { vowel: 'ı', open: false },
        '7': { vowel: 'i', open: false },
        '8': { vowel: 'e', open: true },
        '9': { vowel: 'a', open: false },
      };
      return tens[text.at(-2) ?? ''] ?? DIGITS['0'] ?? null;
    }
    return DIGITS[last] ?? null;
  }
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index] as string;
    if (BACK.has(char) || FRONT.has(char)) return { vowel: char, open: index === text.length - 1 };
  }
  // Ünlüsüz kısaltma harf harf okunur: son harfin adı ("pe", "le", "ka", "ha").
  if (/[a-zçğşı]/.test(last)) return { vowel: ['k', 'h'].includes(last) ? 'a' : 'e', open: true };
  return null;
}

/** Yönelme: "Evde" → "Evde'ye", "Tatil" → "Tatil'e", "Kardiyo" → "Kardiyo'ya", "Programım 2" → "Programım 2'ye". */
export function dative(word: string): string {
  const name = word.trim();
  const end = ending(name);
  if (!end) return name;
  const vowel = BACK.has(end.vowel) ? 'a' : 'e';
  return `${name}'${end.open ? 'y' : ''}${vowel}`;
}

/** Dörtlü uyumun ünlüsü (belirtme eki): a/ı → ı, e/i → i, o/u → u, ö/ü → ü. */
const NARROW: Record<string, string> = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' };

/** Belirtme: "Evde" → "Evde'yi", "Tatil" → "Tatil'i", "Kardiyo" → "Kardiyo'yu", "Programım 2" → "Programım 2'yi". */
export function accusative(word: string): string {
  const name = word.trim();
  const end = ending(name);
  if (!end) return name;
  return `${name}'${end.open ? 'y' : ''}${NARROW[end.vowel] ?? 'i'}`;
}
