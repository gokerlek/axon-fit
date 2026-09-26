import type { SessionResult, SetResult } from './progression.ts';
import type { SessionDoc, SessionEntry } from './schemas/session.ts';

/**
 * Antrenman kaydından öneri motorunun girdisi (tasarım §4.2) — saf.
 *
 * `planSession` geçmişi antrenman başına çalışma setleri olarak alır (eskiden yeniye). Bir hareket
 * kaydı (entry) motorun `SetResult`'larına çevrilir: `kg → weightKg`, `reps | seconds → value`, zorluk
 * yoksa `good`; satır (`rowId`) ve cihaz (`deviceId`) hareketten her sete dağıtılır. Isınma ve plandan
 * fazla setler karara girmez (SPEC §7.1); danışanın "bir defalık" dediği hareket (`oneOff`) hiç
 * girmez, motor bir önceki seanstan planlar (§6.2). `lighter` hareket motorda kalır: ilk kez nötr
 * sayılması öneri katmanının işi (§5.5).
 */

/** Motorun seti; cihaz geçmişi süzmek için (`SPEC §7.3`) cihaz da taşınır. */
export type EngineSetResult = SetResult & { deviceId?: string };

export function toSetResults(entry: SessionEntry): EngineSetResult[] {
  if (entry.oneOff) return [];
  return entry.sets
    .filter((set) => set.type === 'working' && !set.extra)
    .map((set) => ({
      weightKg: set.kg ?? 0,
      value: set.reps ?? set.seconds ?? 0,
      effort: set.effort ?? 'good',
      ...(set.setIndex !== undefined ? { setIndex: set.setIndex } : {}),
      ...(set.target ? { target: set.target } : {}),
      ...(set.topWeightKg !== undefined ? { topWeightKg: set.topWeightKg } : {}),
      ...(entry.rowId ? { rowId: entry.rowId } : {}),
      ...(set.plannedSetCount !== undefined ? { plannedSetCount: set.plannedSetCount } : {}),
      ...(entry.deviceId ? { deviceId: entry.deviceId } : {}),
    }));
}

/**
 * Bir hareketin geçmişi, `planSession`'ın beklediği biçimde: bitmiş antrenmanlar eskiden yeniye,
 * her birinde o hareketin (ve verilmişse aynı cihazın) çalışma setleri. Seti olmayan antrenman atlanır.
 */
export function exerciseHistory(
  sessions: readonly Pick<SessionDoc, 'status' | 'startedAt' | 'id' | 'entries'>[],
  select: { exerciseId: string; deviceId?: string | undefined },
): SessionResult[] {
  return sessions
    .filter((session) => session.status === 'finished')
    .slice()
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || (a.id < b.id ? -1 : 1))
    .flatMap((session) => {
      const results = session.entries
        .filter((entry) => entry.exerciseId === select.exerciseId && ('deviceId' in select ? entry.deviceId === select.deviceId : true))
        .flatMap(toSetResults);
      return results.length > 0 ? [results] : [];
    });
}
