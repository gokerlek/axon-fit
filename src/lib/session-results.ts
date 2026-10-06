import type { SessionResult, SetResult } from './progression.ts';
import { stallCounts } from './recommend.ts';
import type { SessionDoc, SessionEntry } from './schemas/session.ts';

/**
 * Antrenman kaydından öneri motorunun girdisi (tasarım §4.2) — saf.
 *
 * `planSession` geçmişi antrenman başına çalışma setleri olarak alır (eskiden yeniye). Bir hareket
 * kaydı (entry) motorun `SetResult`'larına çevrilir: `kg → weightKg`, `reps | seconds → value`, zorluk
 * yoksa `unknown`; satır (`rowId`) ve cihaz (`deviceId`) hareketten her sete dağıtılır. Isınma ve plandan
 * fazla setler karara girmez (SPEC §7.1); danışanın "bir defalık" dediği hareket (`oneOff`) hiç
 * girmez, motor bir önceki seanstan planlar (§6.2). `lighter` hareket motorda kalır ve her sete
 * işaretlenir: motor ilk kez nötr, üst üste ikincisini kaçırma sayar (§5.5). Tanışma'da ya da ayar
 * seansında planlanan hareketin (`plan.stage: "intro"`, `plan.reason: "calibrate"`) setleri `noStall`
 * taşır: kaçırması tıkanma serisine girmez (§5.2–5.3). Yoklamadan sonra yalnız o gün hafifletilen
 * hareket (`plan.reason: "lighten"`, §2.2) de girmez: hafifletme o günün planıdır, sonraki plan bir önceki
 * normal antrenmandan kurulur.
 */

/** Motorun seti; cihaz geçmişi süzmek için (`SPEC §7.3`) cihaz da taşınır. */
export type EngineSetResult = SetResult & { deviceId?: string };

export function toSetResults(entry: SessionEntry): EngineSetResult[] {
  if (entry.oneOff || entry.plan?.reason === 'lighten') return [];
  const noStall = !stallCounts(entry.plan);
  return entry.sets
    .filter((set) => set.type === 'working' && !set.extra)
    .map((set) => ({
      weightKg: set.kg ?? 0,
      value: set.reps ?? set.seconds ?? 0,
      effort: set.effort ?? 'unknown',
      ...(set.setIndex !== undefined ? { setIndex: set.setIndex } : {}),
      ...(set.target ? { target: set.target } : {}),
      ...(set.topWeightKg !== undefined ? { topWeightKg: set.topWeightKg } : {}),
      ...(entry.rowId ? { rowId: entry.rowId } : {}),
      ...(set.plannedSetCount !== undefined ? { plannedSetCount: set.plannedSetCount } : {}),
      ...(entry.deviceId ? { deviceId: entry.deviceId } : {}),
      ...(entry.lighter ? { lighter: true } : {}),
      ...(noStall ? { noStall: true } : {}),
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
