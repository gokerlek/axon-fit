import * as v from 'valibot';
import { mondayOf } from './program-plan.ts';
import type { SessionIndex } from './schemas/session.ts';
import type { SessionRepo } from './session-files-core.ts';

const schema = v.object({
  version: v.literal(1),
  targets: v.record(v.pipe(v.string(), v.isoDate()), v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7))),
});
export const WEEKLY_GOALS_PATH = 'weekly-goals.json';

export function snapshotGoals(known: Record<string, number>, dates: readonly string[], target: number): Record<string, number> {
  const next = { ...known };
  for (const date of dates) {
    next[mondayOf(date)] ??= Math.max(1, Math.min(7, Math.trunc(target) || 1));
  }
  return next;
}

/** First recorded goal in a week stays fixed. A conflict retry reads the winning values. */
export async function freezeWeeklyGoals(repo: SessionRepo, index: SessionIndex, target: number | undefined): Promise<Record<string, number>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const stored = await repo.read(WEEKLY_GOALS_PATH);
    const known = stored ? v.parse(schema, stored.content).targets : {};
    // A temporarily unavailable program must not replace missing historical goals with guesses.
    if (target === undefined) return known;
    const next = snapshotGoals(known, index.items.filter(row => row.finishedAt).map(row => row.date), target);
    if (JSON.stringify(known) === JSON.stringify(next)) return known;
    try {
      await repo.write(WEEKLY_GOALS_PATH, { version: 1, targets: next }, {
        sha: stored?.sha,
        message: 'Haftalık antrenman hedefleri sabitlendi',
      });
      return next;
    } catch (error) {
      if (attempt === 1 || !(error && typeof error === 'object' && 'status' in error && error.status === 409)) throw error;
    }
  }
  throw new Error('Haftalık hedefler kaydedilemedi.');
}
