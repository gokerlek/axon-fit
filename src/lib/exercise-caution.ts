import { evaluateCare, hasCare, type CareInput } from './constraint-filter.ts';
import type { CareTags } from './constraints.ts';

/**
 * Danışanın kendi programında kısıt (`docs/design/kendi-program.md` §2.5, karar 10; tasarım `kisit-tarama.md` §3.7) —
 * saf. Kısıt süzgecinin (`constraint-filter.ts`) kararıyla iki küme:
 *
 * - **Yasak** (`blocked`): izinsiz yaptırma (`blockedBy` dolu; PT'nin izni o kısıtı susturur). Kütüphane sheet'inde
 *   hiç çıkmaz, aramada da bulunmaz; kayıt kütüphaneden eklenen yasaklıyı reddeder (`blockedAdditions`). Programda
 *   zaten duran ya da antrenörün gününden, danışanlara açık şablondan kopyayla gelen satır kalır, "Sana önerilmiyor"
 *   notunu taşır (sessizce düşmez).
 * - **Dikkat** (`caution`): "Kısıtına uymayabilir" rozeti, engel değil. İpucu işaretlenmez.
 *
 * Girdi yalnız `conditions` onayı varken kurulur (çağıran denetler); kısıt ya da bekleyen bildirim yoksa iki küme boş.
 */

/** Danışana yasaklı hareketin metni (antrenmanda "Hareket ekle" ve kendi programın kaydı aynı cümle). */
export const BLOCKED_TEXT = 'Bu hareket şu an sana önerilmiyor; antrenörüne sor.';

export type ExerciseCaution = { blocked: Set<string>; caution: Set<string> };

export function exerciseCaution(exercises: readonly (CareTags & { id: string })[], care: CareInput): ExerciseCaution {
  const result: ExerciseCaution = { blocked: new Set(), caution: new Set() };
  if (!hasCare(care)) return result;
  for (const exercise of exercises) {
    const { decision, blockedBy } = evaluateCare(exercise, care);
    if (blockedBy.length > 0) result.blocked.add(exercise.id);
    else if (decision === 'warn') result.caution.add(exercise.id);
  }
  return result;
}

type Phases = readonly { days: readonly { blocks: readonly { rows: readonly { exerciseId: string }[] }[] }[] }[];

/** Programın bütün hareketleri (kimlikle). */
export function programExerciseIds(phases: Phases): Set<string> {
  return new Set(phases.flatMap((phase) => phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)))));
}

/**
 * Kayıtta eklenen yasaklı satırlar: hareketi yasak ve `baseline`'da (önceki kayıt, antrenörünün programı, kopyalanan
 * şablon) olmayan satırlar, düzenleyicinin alan yoluyla (`phases.0.days.1.blocks.0.rows.2.exerciseId`). Boşsa kayıt
 * sürer.
 */
export function blockedAdditions(phases: Phases, blocked: ReadonlySet<string>, baseline: ReadonlySet<string>): { path: string; exerciseId: string }[] {
  const found: { path: string; exerciseId: string }[] = [];
  if (blocked.size === 0) return found;
  phases.forEach((phase, i) =>
    phase.days.forEach((day, j) =>
      day.blocks.forEach((block, b) =>
        block.rows.forEach((row, r) => {
          if (blocked.has(row.exerciseId) && !baseline.has(row.exerciseId)) {
            found.push({ path: `phases.${i}.days.${j}.blocks.${b}.rows.${r}.exerciseId`, exerciseId: row.exerciseId });
          }
        }),
      ),
    ),
  );
  return found;
}
