import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './client-status.ts';

/**
 * Danışan şifresinin kuralları (SPEC §5) — tarayıcıda (form) ve sunucuda (`setClientPassword`) aynı.
 * En az 8, en çok 128 karakter; yaygın şifre (Türkçe dahil) ve baştan sona sıralı ya da tekrarlanan
 * karakterler olmaz. Liste kısa tutuldu: amaç en bilinen tahminleri kesmek, kilit geri kalanını sınırlar.
 */

/** Büyük-küçük harf ve Türkçe harf farkı olmadan karşılaştırma: "Fenerbahçe1907" → "fenerbahce1907". */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ı/g, 'i');
}

/** Yaygın şifreler, `fold` biçiminde (8 karakter ve üstü; kısası uzunluk kuralına takılır). */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  // sayılar ve klavye
  '12345678', '123456789', '1234567890', '0123456789', '12341234', '12344321', '11223344', '12121212',
  '87654321', '98765432', '11111111', '00000000', '88888888', '123123123', '147258369', '159753159',
  '102030405', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'zaq12wsx', 'q1w2e3r4', 'qwertyui', 'qwerty12',
  'qwerty123', 'qwertyuiop', 'asdfghjk', 'asdfghjkl', 'zxcvbnm1', 'asdf1234', 'qwer1234', '1234qwer',
  'qwe12345', 'asd12345', '123qweasd', 'aa123456', 'abc12345', 'abcd1234', 'a1234567', '12345678a',
  'a1b2c3d4',
  // İngilizce
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'iloveyou', 'iloveyou1', 'sunshine',
  'princess', 'football', 'baseball', 'superman', 'trustno1', 'letmein1', 'welcome1', 'welcome123',
  'whatever', 'starwars', 'dragon12', 'monkey12', 'michael1', 'charlie1', 'computer', 'internet',
  // Türkçe
  'sifre123', 'sifre1234', 'sifresifre', 'sifrem123', 'parola12', 'parola123', 'parolam1', 'benimsifrem',
  'merhaba1', 'merhaba123', 'hosgeldin', 'seniseviyorum', 'sevgilim', 'askim123', 'canim123', 'annem123',
  'babam123', 'bismillah', 'allah123', 'istanbul', 'istanbul34', 'ankara06', 'izmir35', 'antalya07',
  'turkiye1', 'turkiye123', 'turkiye1923', 'cumhuriyet', 'ataturk1881', 'mustafakemal',
  'galatasaray', 'galatasaray1905', 'cimbom1905', 'fenerbahce', 'fenerbahce1907', 'sarikanarya',
  'besiktas', 'besiktas1903', 'kartal1903', 'carsi1903', 'trabzonspor', 'trabzon61', 'bursaspor',
  // uygulama ve spor
  'pulsecoach', 'antrenman', 'antrenor', 'fitness1', 'spor1234', 'sporcu123',
]);

/** Baştan sona aynı karakter, sıralı ("abcdefgh", "87654321") ya da kısa bir birimin tekrarı ("abababab"). */
function trivial(folded: string): boolean {
  const codes = [...folded].map((char) => char.codePointAt(0) as number);
  const steps = codes.slice(1).map((code, index) => code - (codes[index] as number));
  if (steps.every((step) => step === 0) || steps.every((step) => step === 1) || steps.every((step) => step === -1)) return true;
  for (let unit = 2; unit <= 4; unit += 1) {
    if (codes.length >= unit * 2 && codes.every((code, index) => code === codes[index % unit])) return true;
  }
  return false;
}

/** Uygunsa null; değilse danışana gösterilecek sebep. */
export function passwordProblem(password: string): string | null {
  const length = [...password.normalize('NFC')].length;
  if (length < PASSWORD_MIN_LENGTH) return `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`;
  if (length > PASSWORD_MAX_LENGTH) return `Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir.`;
  const folded = fold(password);
  if (COMMON_PASSWORDS.has(folded)) return 'Bu şifre çok yaygın, kolay tahmin edilir. Başka bir şifre seç.';
  if (trivial(folded)) return 'Şifre sıralı ya da tekrarlanan karakterlerden oluşamaz.';
  return null;
}
