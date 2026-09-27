import { evaluateCare, hasCare, type CareInput } from './constraint-filter.ts';
import type { CareTags } from './constraints.ts';

/**
 * Danışanın kütüphane sheet'indeki "Kısıtına uymayabilir" rozeti (`docs/design/kendi-program.md` §2.5, karar 10) —
 * saf. Kısıt süzgecinin (`constraint-filter.ts`, tasarım `kisit-tarama.md`) kararı "yaptırma" ya da "dikkat" olan
 * hareketler; ipucu işaretlenmez, rozet engel değildir. Girdi yalnız `conditions` onayı varken kurulur (çağıran
 * denetler); kısıt ya da bekleyen bildirim yoksa küme boş.
 */
export function cautionIds(exercises: readonly (CareTags & { id: string })[], care: CareInput): Set<string> {
  const ids = new Set<string>();
  if (!hasCare(care)) return ids;
  for (const exercise of exercises) {
    const { decision } = evaluateCare(exercise, care);
    if (decision === 'block' || decision === 'warn') ids.add(exercise.id);
  }
  return ids;
}
