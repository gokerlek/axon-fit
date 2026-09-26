import type { TrackingType } from './progression.ts';

/**
 * Kişisel rekorlar ve tahmini maksimum — saf (tasarım `docs/design/antrenman-ekrani.md` §2.8, §8 satır 10).
 *
 * - **Tahmini maksimum (e1RM):** Epley (1985): ağırlık × (1 + tekrar ÷ 30); tek tekrarda ağırlığın kendisi.
 *   Yalnız 1–12 tekrarlı setlerden (tasarım §2.8, v1 ALGO-9): tahmin denklemleri düşük tekrarda daha
 *   isabetli, tekrar arttıkça şaşar (Reynolds 2006: 5 TM'den tahmin 10 ve 20 TM'den iyi; LeSuer 1997:
 *   ≤ 10 tekrarla sınandı). Ağırlıksız ya da 0 kg'lık sette yok. Kaynaklar: Epley B., *Poundage Chart*
 *   (Boyd Epley Workout, 1985) · Reynolds, Gordon & Robergs 2006 (*JSCR* 20(3):584–592) · LeSuer ve ark.
 *   1997 (*JSCR* 11(4):211–213).
 * - **Rekor türleri** kayıt türüne göre: ağırlıklı harekette en ağır set, tahmini maksimum ve bir
 *   ağırlıkta en çok tekrar; vücut ağırlığında en çok tekrar ve (ek yükle yapıldıysa) en ağır ek yük;
 *   süreli harekette en uzun süre.
 * - **Rekor kesin büyüktür** (eşitlik rekor değil) ve **ilk kayıt referanstır**: bir türün (bir ağırlıkta
 *   en çok tekrarda o ağırlığın) ilk değeri başlangıç noktasıdır, rekor sayılmaz (v1 `pr.ts`).
 * - Sayılan setler: çalışma setleri (ısınma hariç); fazladan ve "bir defalık" setler de yapıldığı için
 *   sayılır (tasarım §6.2: "hacim ve rekorlarda sayılır"). Seçimi çağıran yapar (`progress.ts`).
 * - Hareket başına bir kutlama: aynı antrenmanda bir hareketin birden çok rekoru tek satırda toplanır,
 *   öne en önemlisi çıkar (`RECORD_PRIORITY`).
 */

/** Tahmini maksimum en çok bu kadar tekrarlı setten (tasarım §2.8). */
export const E1RM_MAX_REPS = 12;

/** Epley; 0,01 kg'a yuvarlı. Uygun değilse (0 kg, 0 ya da 12'den çok tekrar, kesirli tekrar) null. */
export function epley(kg: number | undefined, reps: number | undefined): number | null {
  if (kg === undefined || reps === undefined || !(kg > 0) || !Number.isInteger(reps) || reps < 1 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return kg;
  return Math.round(kg * (1 + reps / 30) * 100) / 100;
}

export const RECORD_KINDS = ['heaviest', 'e1rm', 'reps_at_weight', 'most_reps', 'longest'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** Kayıt türüne göre izlenen rekorlar. */
export const RECORD_KINDS_OF: Record<TrackingType, readonly RecordKind[]> = {
  weight_reps: ['heaviest', 'e1rm', 'reps_at_weight'],
  bodyweight_reps: ['most_reps', 'heaviest'],
  duration: ['longest'],
};

/** Aynı antrenmanda birden çok rekor: öne çıkan (küçük önce). */
export const RECORD_PRIORITY: Record<RecordKind, number> = { heaviest: 0, e1rm: 1, reps_at_weight: 2, most_reps: 3, longest: 4 };

export type RecordSet = { kg?: number | undefined; reps?: number | undefined; seconds?: number | undefined };
export type RecordSession = { id: string; date: string; sets: readonly RecordSet[] };

/**
 * Bir rekor değeri. `value` karşılaştırılan sayı: en ağırda kg, tahmini maksimumda tahmin, tekrarlarda
 * tekrar, sürede saniye. `kg`/`reps`/`seconds` setin kendisi (gösterim için).
 */
export type RecordMark = {
  kind: RecordKind;
  value: number;
  kg?: number;
  reps?: number;
  seconds?: number;
  sessionId: string;
  date: string;
};

export type RecordEvent = RecordMark & { previous: RecordMark };

/** Değerler 0,01 kg'a yuvarlı; kayan nokta artığı eşitliği rekora çevirmesin. */
const EPSILON = 1e-6;

function loaded(set: RecordSet): set is RecordSet & { kg: number; reps: number } {
  return set.kg !== undefined && set.kg > 0 && set.reps !== undefined && set.reps >= 1;
}

/**
 * Bir antrenmanın rekor adayları: tür başına en iyisi (bir ağırlıkta en çok tekrarda ağırlık başına bir).
 * Eşitlikte önce gelen set; en ağırda aynı ağırlığın en çok tekrarı yazılır.
 */
export function sessionMarks(session: RecordSession, trackingType: TrackingType): RecordMark[] {
  const kinds = new Set(RECORD_KINDS_OF[trackingType]);
  const base = { sessionId: session.id, date: session.date };
  const marks: RecordMark[] = [];

  if (kinds.has('heaviest')) {
    let best: { kg: number; reps: number } | null = null;
    for (const set of session.sets) {
      if (!loaded(set)) continue;
      if (!best || set.kg > best.kg + EPSILON || (Math.abs(set.kg - best.kg) <= EPSILON && set.reps > best.reps)) best = { kg: set.kg, reps: set.reps };
    }
    if (best) marks.push({ kind: 'heaviest', value: best.kg, kg: best.kg, reps: best.reps, ...base });
  }

  if (kinds.has('e1rm')) {
    let best: { value: number; kg: number; reps: number } | null = null;
    for (const set of session.sets) {
      const value = epley(set.kg, set.reps);
      if (value !== null && (!best || value > best.value + EPSILON)) best = { value, kg: set.kg!, reps: set.reps! };
    }
    if (best) marks.push({ kind: 'e1rm', ...best, ...base });
  }

  if (kinds.has('reps_at_weight')) {
    const byWeight = new Map<number, number>();
    for (const set of session.sets) if (loaded(set)) byWeight.set(set.kg, Math.max(byWeight.get(set.kg) ?? 0, set.reps));
    for (const [kg, reps] of [...byWeight].sort(([a], [b]) => b - a)) marks.push({ kind: 'reps_at_weight', value: reps, kg, reps, ...base });
  }

  if (kinds.has('most_reps')) {
    const best = Math.max(0, ...session.sets.map((set) => set.reps ?? 0));
    if (best > 0) marks.push({ kind: 'most_reps', value: best, reps: best, ...base });
  }

  if (kinds.has('longest')) {
    const best = Math.max(0, ...session.sets.map((set) => set.seconds ?? 0));
    if (best > 0) marks.push({ kind: 'longest', value: best, seconds: best, ...base });
  }

  return marks;
}

/** Rekorun anahtarı: tür; bir ağırlıkta en çok tekrarda tür + ağırlık. */
export function recordKey(mark: Pick<RecordMark, 'kind' | 'kg'>): string {
  return mark.kind === 'reps_at_weight' ? `${mark.kind}:${mark.kg}` : mark.kind;
}

export type Records = {
  /** Şu anki en iyiler: tür başına (ağırlıkta tekrarda ağırlık başına), ağır ağırlık önce. */
  best: RecordMark[];
  /** Kırılan rekorlar, eskiden yeniye (ilk kayıtlar referans, burada yok). */
  events: RecordEvent[];
};

/** Bir hareketin (ve cihazın) antrenmanları eskiden yeniye → en iyiler ve kırılan rekorlar. */
export function recordsOf(sessions: readonly RecordSession[], trackingType: TrackingType): Records {
  const best = new Map<string, RecordMark>();
  const events: RecordEvent[] = [];
  for (const session of sessions) {
    // Her tür (ağırlıkta tekrarda her ağırlık) bir antrenmanda bir kez aday olur.
    const marks = sessionMarks(session, trackingType);
    for (const mark of marks) {
      const key = recordKey(mark);
      const previous = best.get(key);
      if (!previous) {
        best.set(key, mark);
        continue;
      }
      if (mark.value > previous.value + EPSILON) {
        events.push({ ...mark, previous });
        best.set(key, mark);
      }
    }
  }
  const order = (mark: RecordMark) => RECORD_KINDS.indexOf(mark.kind);
  return {
    best: [...best.values()].sort((a, b) => order(a) - order(b) || (b.kg ?? 0) - (a.kg ?? 0)),
    events,
  };
}

/** Aynı antrenmanın rekorları öne çıkan önce (hareket başına bir kutlama). */
export function byPriority<T extends Pick<RecordMark, 'kind' | 'kg'>>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => RECORD_PRIORITY[a.kind] - RECORD_PRIORITY[b.kind] || (b.kg ?? 0) - (a.kg ?? 0));
}
