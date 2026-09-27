import { parseCondition, type ClientCondition } from './conditions.ts';
import { evaluateExercise, type ExerciseTags } from './exercise-filter.ts';

/**
 * Danışanın kütüphane sheet'indeki "Kısıtına uymayabilir" rozeti (`docs/design/kendi-program.md` §2.5, karar 10) —
 * saf. Sakatlık süzgecinin kararı "yaptırma" ya da "dikkat" olan hareketler; rozet engel değildir. Yalnız sağlık
 * onayı ve kısıt varken çağrılır (sayfa denetler); kısıt yoksa ya da okunamıyorsa küme boş.
 */
export function cautionIds(exercises: readonly (ExerciseTags & { id: string })[], conditions: readonly string[]): Set<string> {
  const parsed = conditions.flatMap((value): ClientCondition[] => {
    const condition = parseCondition(value);
    return condition ? [condition] : [];
  });
  if (parsed.length === 0) return new Set();
  const ids = new Set<string>();
  for (const exercise of exercises) {
    const { decision } = evaluateExercise(exercise, parsed);
    if (decision === 'block' || decision === 'warn') ids.add(exercise.id);
  }
  return ids;
}
