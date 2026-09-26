import type { SessionIndex, SessionIndexExercise, SessionIndexRow, SessionSet } from './schemas/session.ts';

/**
 * Rekorlar (tasarım §2.8; v1 `pr.ts`) — saf. Kaynak `sessions-index.json`: her satırın hareketleri o
 * antrenmandaki en iyileri taşır (`best`), rekor sayısı (`prs`) index her değiştiğinde bütün satırlar için
 * baştan hesaplanır (`withRecords`). Silinen antrenman ya da set böylece rekorları kendiliğinden düzeltir.
 *
 * - Hareket, egzersiz ve cihazla ayrılır (SPEC §7.3: farklı makinelerin kiloları birbirini tutmaz).
 * - Karşılaştırma tabanı o antrenmandan ÖNCE başlamış bütün bitmiş antrenmanlardır; hareketin ilk kaydı
 *   referanstır, rekor sayılmaz. Değerler kesin büyük olmalı (eşitlik rekor değil; kg santigramla).
 * - Rekor türleri: en ağır set, tahmini 1RM (Epley), o ağırlıkta en çok tekrar (ağırlıksızda tekrar
 *   rekoru), süreli harekette en uzun süre. Hareket başına bir kutlama: `prs` rekor kıran hareket sayısıdır.
 * - Isınma girmez; fazladan ("+ Set ekle"), "bir defalık" ve hafif setler yapıldıkları için girer.
 */

/** Tahmini 1RM'de en çok bu kadar tekrar sayılır (v1: 1–12 tekrar güvenilir). */
export const E1RM_MAX_REPS = 12;

/** Ağırlık başına en çok tekrar (ağırlıksızda 0 kg). */
export type RepPoint = { kg: number; reps: number };
/** Hareketin bir antrenmandaki (ya da o güne dek) en iyileri. */
export type ExerciseBest = { sets?: RepPoint[]; seconds?: number };

const centi = (kg: number) => Math.round(kg * 100);

/**
 * Tahmini 1RM (Epley, v1'in formülü): kg × (1 + tekrar / 30), tek tekrarda ağırlığın kendisi; ağırlıksız
 * ya da tekrarsızda null. 12'nin üstü 12 sayılır (v1 hiç saymıyordu): index ağırlık başına yalnız en çok
 * tekrarı sakladığı için 15 tekrarlık set aynı ağırlıktaki 10 tekrarlık seti gölgelemesin; temkinli tahmin.
 */
export function oneRepMax(kg: number, reps: number): number | null {
  if (!(kg > 0) || !(reps >= 1)) return null;
  const counted = Math.min(Math.floor(reps), E1RM_MAX_REPS);
  return counted === 1 ? kg : Math.round(kg * (1 + counted / 30) * 100) / 100;
}

function pointsOf(map: ReadonlyMap<number, number>): RepPoint[] {
  return [...map].sort((a, b) => a[0] - b[0]).map(([kg, reps]) => ({ kg: kg / 100, reps }));
}

function addPoint(map: Map<number, number>, kg: number, reps: number): void {
  const key = centi(kg);
  map.set(key, Math.max(map.get(key) ?? 0, reps));
}

/** Hareketin setlerinden en iyileri: ağırlık başına en çok tekrar ve en uzun süre. Isınma ve 0 tekrar girmez. */
export function bestOf(sets: readonly Pick<SessionSet, 'type' | 'kg' | 'reps' | 'seconds'>[]): ExerciseBest {
  const byKg = new Map<number, number>();
  let seconds = 0;
  for (const set of sets) {
    if (set.type !== 'working') continue;
    if (set.seconds !== undefined) seconds = Math.max(seconds, set.seconds);
    else if (set.reps !== undefined && set.reps >= 1) addPoint(byKg, set.kg ?? 0, set.reps);
  }
  return { ...(byKg.size > 0 ? { sets: pointsOf(byKg) } : {}), ...(seconds > 0 ? { seconds } : {}) };
}

/** İki en iyinin birleşimi (ağırlık başına en çok tekrar, en uzun süre). */
export function mergeBest(a: ExerciseBest | undefined, b: ExerciseBest | undefined): ExerciseBest {
  const byKg = new Map<number, number>();
  for (const point of [...(a?.sets ?? []), ...(b?.sets ?? [])]) addPoint(byKg, point.kg, point.reps);
  const seconds = Math.max(a?.seconds ?? 0, b?.seconds ?? 0);
  return { ...(byKg.size > 0 ? { sets: pointsOf(byKg) } : {}), ...(seconds > 0 ? { seconds } : {}) };
}

/** Rekorun anahtarı: egzersiz ve cihaz. */
export function recordKey(item: { exerciseId: string; deviceId?: string | undefined }): string {
  return `${item.exerciseId}@${item.deviceId ?? ''}`;
}

/** En ağır set (ağırlıklı noktalardan); yoksa null. */
export function heaviestOf(best: ExerciseBest | undefined): RepPoint | null {
  let top: RepPoint | null = null;
  for (const point of best?.sets ?? []) if (point.kg > 0 && (!top || centi(point.kg) > centi(top.kg))) top = point;
  return top;
}

/** Tahmini 1RM'si en yüksek set; eşitlikte ağır olan. */
export function strongestOf(best: ExerciseBest | undefined): (RepPoint & { e1rm: number }) | null {
  let top: (RepPoint & { e1rm: number }) | null = null;
  for (const point of best?.sets ?? []) {
    const e1rm = oneRepMax(point.kg, point.reps);
    if (e1rm === null) continue;
    if (!top || centi(e1rm) > centi(top.e1rm) || (centi(e1rm) === centi(top.e1rm) && point.kg > top.kg)) top = { ...point, e1rm };
  }
  return top;
}

/** Ağırlıksız en çok tekrar (0 kg noktası). */
function bodyweightReps(best: ExerciseBest | undefined): number | null {
  return best?.sets?.find((point) => point.kg === 0)?.reps ?? null;
}

export type RecordHit =
  | { kind: 'heaviest'; now: RepPoint; before: RepPoint }
  | { kind: 'e1rm'; now: RepPoint; before: RepPoint; gainPct: number }
  /** Aynı ağırlıkta daha çok tekrar; `kg: 0` ağırlıksız tekrar rekoru. */
  | { kind: 'reps'; now: RepPoint; before: RepPoint }
  | { kind: 'seconds'; now: number; before: number };

/**
 * Bu antrenmanın öncekilere göre kırdığı rekorlar, önem sırasıyla (en ağır set, tahmini 1RM, o ağırlıkta
 * tekrar, süre). Öncesinde o türde kayıt yoksa (ilk kayıt) rekor yok.
 */
export function recordHits(before: ExerciseBest | undefined, now: ExerciseBest): RecordHit[] {
  const hits: RecordHit[] = [];
  const heavyNow = heaviestOf(now);
  const heavyBefore = heaviestOf(before);
  if (heavyNow && heavyBefore && centi(heavyNow.kg) > centi(heavyBefore.kg)) hits.push({ kind: 'heaviest', now: heavyNow, before: heavyBefore });

  const strongNow = strongestOf(now);
  const strongBefore = strongestOf(before);
  if (strongNow && strongBefore && centi(strongNow.e1rm) > centi(strongBefore.e1rm)) {
    const gainPct = Math.round(((strongNow.e1rm - strongBefore.e1rm) / strongBefore.e1rm) * 100);
    hits.push({ kind: 'e1rm', now: { kg: strongNow.kg, reps: strongNow.reps }, before: { kg: strongBefore.kg, reps: strongBefore.reps }, gainPct });
  }

  // Aynı ağırlıkta daha çok tekrar: en ağır olanı (ağırlıksızda tek nokta).
  const previous = new Map((before?.sets ?? []).map((point) => [centi(point.kg), point]));
  const reps = [...(now.sets ?? [])]
    .reverse()
    .find((point) => {
      const old = previous.get(centi(point.kg));
      return old !== undefined && point.reps > old.reps;
    });
  if (reps) hits.push({ kind: 'reps', now: reps, before: previous.get(centi(reps.kg)) as RepPoint });

  if (now.seconds !== undefined && before?.seconds !== undefined && now.seconds > before.seconds) {
    hits.push({ kind: 'seconds', now: now.seconds, before: before.seconds });
  }
  return hits;
}

/* --- index --- */

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

/** Bitmiş satırlar, eskiden yeniye (başlangıca göre, sonra kimlik). */
function chronological(rows: readonly SessionIndexRow[]): SessionIndexRow[] {
  return rows
    .filter((row) => row.finishedAt !== undefined)
    .sort((a, b) => time(a.startedAt ?? a.date) - time(b.startedAt ?? b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Satırın hareketleri anahtarla (aynı hareket iki kez yapıldıysa birleşir); en iyisi olmayan eski satır boş. */
function rowBests(row: SessionIndexRow): Map<string, { exercise: SessionIndexExercise; best: ExerciseBest }> {
  const bests = new Map<string, { exercise: SessionIndexExercise; best: ExerciseBest }>();
  for (const exercise of row.exercises) {
    if (!exercise.best) continue;
    const key = recordKey(exercise);
    const known = bests.get(key);
    bests.set(key, { exercise: known?.exercise ?? exercise, best: mergeBest(known?.best, exercise.best) });
  }
  return bests;
}

export type SessionRecord = { key: string; exerciseId: string; deviceId?: string; hits: RecordHit[] };

/**
 * Bütün bitmiş antrenmanların rekorları, eskiden yeniye: her satır için o güne dek en iyilere göre kırılan
 * rekorlar. `upto` verilirse o satırda durur.
 */
function walk(index: SessionIndex, upto?: string): Map<string, SessionRecord[]> {
  const best = new Map<string, ExerciseBest>();
  const result = new Map<string, SessionRecord[]>();
  for (const row of chronological(index.items)) {
    const bests = rowBests(row);
    const records: SessionRecord[] = [];
    for (const [key, { exercise, best: now }] of bests) {
      const hits = recordHits(best.get(key), now);
      if (hits.length > 0) records.push({ key, exerciseId: exercise.exerciseId, ...(exercise.deviceId ? { deviceId: exercise.deviceId } : {}), hits });
    }
    for (const [key, { best: now }] of bests) best.set(key, mergeBest(best.get(key), now));
    result.set(row.id, records);
    if (row.id === upto) break;
  }
  return result;
}

/**
 * Her bitmiş satırın rekor sayısı (`prs`, hareket başına bir); sıfırsa alan yok. Değişen satır yoksa aynı
 * index döner (onarımın "değişti mi" sorusu bozulmasın).
 */
export function withRecords(index: SessionIndex): SessionIndex {
  const records = walk(index);
  let changed = false;
  const items = index.items.map((row) => {
    const count = records.get(row.id)?.length ?? 0;
    if ((row.prs ?? 0) === count && (count > 0 || row.prs === undefined)) return row;
    changed = true;
    const { prs: _prs, ...rest } = row;
    return count > 0 ? { ...rest, prs: count } : rest;
  });
  return changed ? { ...index, items } : index;
}

/** Bir antrenmanın rekorları (özetin 2. kartı); bitmemişse ya da index'te yoksa boş. */
export function sessionRecords(index: SessionIndex, id: string): SessionRecord[] {
  return walk(index, id).get(id) ?? [];
}

/** Hareketin bir antrenmandaki en iyi seti: ağırlıklıda en ağır set, ağırlıksızda tekrar, süreli harekette süre. */
export type TopSet = { kind: 'kg'; kg: number; reps: number } | { kind: 'reps'; reps: number } | { kind: 'seconds'; seconds: number };

export function topSetOf(best: ExerciseBest | undefined): TopSet | null {
  const heavy = heaviestOf(best);
  if (heavy) return { kind: 'kg', kg: heavy.kg, reps: heavy.reps };
  const reps = bodyweightReps(best);
  if (reps !== null) return { kind: 'reps', reps };
  return best?.seconds !== undefined ? { kind: 'seconds', seconds: best.seconds } : null;
}

export type Trend = 'up' | 'down' | 'same' | 'first';

/** İki en iyi setin karşılaştırması: ağırlık önce, aynı ağırlıkta tekrar. Türleri farklıysa (ya da önce yoksa) `first`. */
export function trendOf(before: TopSet | null, now: TopSet): Trend {
  if (!before || before.kind !== now.kind) return 'first';
  const diff =
    now.kind === 'kg' && before.kind === 'kg'
      ? centi(now.kg) - centi(before.kg) || now.reps - before.reps
      : now.kind === 'reps' && before.kind === 'reps'
        ? now.reps - before.reps
        : now.kind === 'seconds' && before.kind === 'seconds'
          ? now.seconds - before.seconds
          : 0;
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
}

export type LastComparison = { key: string; exerciseId: string; deviceId?: string; before: TopSet | null; now: TopSet; trend: Trend };

/**
 * "Geçen sefere göre" (özetin 2. kartı): antrenmandaki her hareketin en iyi seti, aynı hareketin (aynı
 * cihazla) önceki son bitmiş antrenmanındakiyle.
 */
export function compareWithLast(index: SessionIndex, id: string): LastComparison[] {
  const rows = chronological(index.items);
  const at = rows.findIndex((row) => row.id === id);
  const row = rows[at];
  if (!row) return [];
  const earlier = rows.slice(0, at).reverse();
  const result: LastComparison[] = [];
  for (const [key, { exercise, best }] of rowBests(row)) {
    const now = topSetOf(best);
    if (!now) continue;
    const last = earlier.find((item) => rowBests(item).has(key));
    const before = last ? topSetOf(rowBests(last).get(key)?.best) : null;
    result.push({ key, exerciseId: exercise.exerciseId, ...(exercise.deviceId ? { deviceId: exercise.deviceId } : {}), before, now, trend: trendOf(before, now) });
  }
  return result;
}

/** En iyisi hesaplanmamış eski satır (bu alan eklenmeden yazılmış): onarım dosyasından yeniden kurar. */
export function lacksRecords(row: Pick<SessionIndexRow, 'finishedAt' | 'exercises'>): boolean {
  return row.finishedAt !== undefined && row.exercises.some((exercise) => exercise.best === undefined);
}
