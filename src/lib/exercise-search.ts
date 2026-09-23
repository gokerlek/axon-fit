/**
 * Egzersiz arama — şablon düzenleyicinin kütüphane panelinde ada ya da kasa göre.
 *
 * Türkçe harfler katlanır: "gogus" ile "GÖĞÜS", "incline" ile "Incline" eşleşir (Türkçe
 * küçük harfte I → ı olur; ı da i'ye katlanır). Boşlukla ayrılan kelimelerin hepsi
 * eşleşmeli ("dambıl göğüs"). Kelime başlıkta ya da hedef/yardımcı kasların adlarında
 * aranır; kas adlarını çağıran verir (kasın adı, ailesi, bölgesi).
 *
 * Sıra: başlık aramayla başlıyorsa önce; sonra bütün kelimeleri başlıkta geçenler;
 * sonra hedef kas üzerinden eşleşenler; en son yalnız yardımcı kas üzerinden.
 *
 * Saf fonksiyonlar; testler Node'un kendi test aracıyla çalışır.
 */

export type Searchable = { title: string; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[] };

const TURKISH: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' };

/** Aramada karşılaştırılacak biçim: Türkçe küçük harf, Türkçe ve diğer aksanlar atılır. */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/[ığüşöç]/g, (letter) => TURKISH[letter] ?? letter)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

function byTitle<T extends Searchable>(a: T, b: T): number {
  return a.title.localeCompare(b.title, 'tr');
}

export function searchExercises<T extends Searchable>(
  list: readonly T[],
  query: string,
  muscleNames: (muscle: string) => readonly string[],
): T[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...list].sort(byTitle);
  const whole = tokens.join(' ');
  const names = (muscles: readonly string[]) => muscles.flatMap((muscle) => muscleNames(muscle).map(fold));

  const ranked: { item: T; rank: number }[] = [];
  for (const item of list) {
    const title = fold(item.title);
    const primary = names(item.primaryMuscles);
    const secondary = names(item.secondaryMuscles);
    let rank = 0;
    let matched = true;
    for (const token of tokens) {
      if (title.includes(token)) continue;
      if (primary.some((name) => name.includes(token))) rank = Math.max(rank, 2);
      else if (secondary.some((name) => name.includes(token))) rank = 3;
      else {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    // Bütün kelimeler başlıkta: başlık aramayla başlıyorsa en önde.
    if (rank === 0) rank = title.startsWith(whole) ? 0 : 1;
    ranked.push({ item, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || byTitle(a.item, b.item)).map(({ item }) => item);
}
