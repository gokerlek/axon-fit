import {
  parseStoredSession,
  sessionIdOfPath,
  sessionPath,
  type NoticeKind,
  type SessionDoc,
  type SessionEntry,
  type SessionIndex,
  type SessionIndexExercise,
  type SessionIndexRow,
} from './schemas/session.ts';
import { canonicalJson } from './session-merge.ts';
import { bestOf, lacksRecords, withRecords } from './session-records.ts';

/**
 * `sessions-index.json` (tasarım §4.1, §4.2) — saf. Geçmiş listesi, "bu hafta x/3", hareket deneyimi ve
 * PT'nin bildirimleri tek okumayla gelsin diye her antrenmanın özet satırı. Index türetilmiş veridir:
 * her okumada `sessions/` ağacıyla karşılaştırılır (`repairIndex`); satırı olmayan ya da `sha`'sı
 * dosyanınkinden farklı her antrenman dosyasından bellekte yeniden kurulur, dosyası kalmayan satır düşer.
 * Onarılan index bir sonraki bitişin (ya da silmenin) commit'ine biner.
 *
 * Silinen antrenmanların kimlikleri `deleted`'dadır (değer yok): kimliği orada olan dosya yeniden
 * açılamaz (`PUT` 410).
 *
 * Rekorlar (`session-records.ts`): her hareketin o antrenmandaki en iyileri satırda (`best`), rekor sayısı
 * (`prs`) index her değiştiğinde (ekleme, silme, onarım) bütün satırlar için baştan hesaplanır.
 */

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

/** Su: dokunuşların toplamı, en az 0 ("Geri al" bir −1 dokunuşudur). */
export function waterOf(doc: Pick<SessionDoc, 'waterTaps'>): number {
  return Math.max(0, doc.waterTaps.reduce((sum, tap) => sum + tap.d, 0));
}

function working(entry: SessionEntry) {
  return entry.sets.filter((set) => set.type === 'working');
}

/**
 * Tonaj (ACSM 2009 hacim tanımı): ısınma hariç çalışma setlerinde Σ kg × tekrar. Fazladan ve "bir
 * defalık" setler de sayılır (yapıldılar); süreli set tonaja girmez; kaçırılan setin yapılan tekrarı sayılır.
 */
export function volumeOf(doc: Pick<SessionDoc, 'entries'>): number {
  let total = 0;
  for (const entry of doc.entries) for (const set of working(entry)) if (set.reps !== undefined) total += (set.kg ?? 0) * set.reps;
  return Math.round(total * 100) / 100;
}

/** Çalışma seti sayısı (ısınma hariç). */
export function workingSetCount(doc: Pick<SessionDoc, 'entries'>): number {
  return doc.entries.reduce((sum, entry) => sum + working(entry).length, 0);
}

function exerciseRow(entry: SessionEntry): SessionIndexExercise | null {
  const sets = working(entry);
  if (sets.length === 0) return null;
  const full = sets.filter((set) => !set.extra && set.target?.loadPct === undefined);
  const weighed = (full.length > 0 ? full : sets).flatMap((set) => (set.kg !== undefined && set.kg > 0 ? [set.kg] : []));
  return {
    exerciseId: entry.exerciseId,
    ...(entry.rowId ? { rowId: entry.rowId } : {}),
    ...(entry.deviceId ? { deviceId: entry.deviceId } : {}),
    ...(weighed.length > 0 ? { topKg: Math.max(...weighed) } : {}),
    sets: sets.length,
    full: full.length > 0,
    ...(entry.plan?.reason ? { reason: entry.plan.reason } : {}),
    ...(entry.plan?.stage ? { stage: entry.plan.stage } : {}),
    ...(entry.oneOff ? { oneOff: true as const } : {}),
    ...(entry.lighter ? { lighter: true as const } : {}),
    best: bestOf(sets),
  };
}

/** Süre: danışanın onayladığı (`effort.durationMin`), yoksa başlangıçtan bitişe. */
export function durationOf(doc: Pick<SessionDoc, 'startedAt' | 'finishedAt' | 'effort'>): number | undefined {
  if (doc.effort?.durationMin !== undefined) return doc.effort.durationMin;
  if (!doc.finishedAt) return undefined;
  const minutes = Math.round((time(doc.finishedAt) - time(doc.startedAt)) / 60_000);
  return Math.min(24 * 60, Math.max(0, minutes));
}

/**
 * Onaylanmış aşırı yük (PT'nin bildirimi): hareket başına en ağır aşırı yük seti ve o setin planı.
 * Hareketin adı o günkü hâliyle (`title`).
 */
export function overloadsOf(doc: Pick<SessionDoc, 'entries'>): { title: string; kg: number; plannedKg?: number }[] {
  return doc.entries.flatMap((entry) => {
    const sets = working(entry).filter((set) => set.overload && set.kg !== undefined);
    const top = sets.reduce<(typeof sets)[number] | undefined>((best, set) => (!best || (set.kg ?? 0) > (best.kg ?? 0) ? set : best), undefined);
    if (!top || top.kg === undefined) return [];
    return [{ title: entry.title, kg: top.kg, ...(top.plannedKg !== undefined ? { plannedKg: top.plannedKg } : {}) }];
  });
}

/** Antrenmanın index satırı; `sha` dosyanın blob kimliği. */
export function indexRowOf(doc: SessionDoc, sha: string): SessionIndexRow {
  const notices = [...new Set(doc.notices.map((notice) => notice.kind))].sort() as NoticeKind[];
  const duration = durationOf(doc);
  const program = doc.program;
  // Kendi programda başka gün yok: plan danışanın (`docs/design/kendi-program.md` §3.4).
  const otherDay = !program?.programId && Boolean(program?.plannedDayId && program.plannedDayId !== program.dayId);
  const unfinished = doc.notices.find((notice) => notice.kind === 'unfinished');
  const overloads = notices.includes('overload') ? overloadsOf(doc) : [];
  return {
    id: doc.id,
    sha,
    path: sessionPath(doc.id),
    date: doc.date,
    startedAt: doc.startedAt,
    ...(doc.finishedAt ? { finishedAt: doc.finishedAt } : {}),
    ...(program ? { dayId: program.dayId, dayName: program.dayName } : {}),
    ...(program?.programId ? { programId: program.programId, ...(program.programName ? { programName: program.programName } : {}) } : {}),
    otherDay,
    unfinished: notices.includes('unfinished'),
    ...(duration !== undefined ? { durationMin: duration } : {}),
    volumeKg: volumeOf(doc),
    sets: workingSetCount(doc),
    water: waterOf(doc),
    exercises: doc.entries.flatMap((entry) => exerciseRow(entry) ?? []),
    notices,
    ...(otherDay && program?.plannedDayName ? { plannedDayName: program.plannedDayName } : {}),
    ...(unfinished?.done !== undefined && unfinished.planned !== undefined ? { progress: { done: unfinished.done, planned: unfinished.planned } } : {}),
    ...(overloads.length > 0 ? { overloads } : {}),
  };
}

/** Satırlar en yeniden eskiye (başlangıca göre), sonra kimlik. */
function sortRows(rows: SessionIndexRow[]): SessionIndexRow[] {
  return rows.sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Satırı ekler ya da değiştirir (kimlikle); rekorlar yeniden hesaplanır. */
export function upsertIndexRow(index: SessionIndex, row: SessionIndexRow): SessionIndex {
  return withRecords({ ...index, items: sortRows([...index.items.filter((item) => item.id !== row.id), row]) });
}

/** Silinen antrenman: satır çıkar, kimlik `deleted`'a girer (bir kez, ilk silinme anıyla); rekorlar yeniden hesaplanır. */
export function removeIndexRow(index: SessionIndex, id: string, at: Date): SessionIndex {
  const deleted = index.deleted.some((item) => item.id === id) ? index.deleted : [...index.deleted, { id, at: at.toISOString() }];
  return withRecords({ version: 1, items: index.items.filter((item) => item.id !== id), deleted });
}

export function isDeletedInIndex(index: SessionIndex, id: string): boolean {
  return index.deleted.some((item) => item.id === id);
}

export type SessionFileRef = { path: string; sha: string };

export type RepairResult = {
  index: SessionIndex;
  /** Yeniden kurulan satırlar (eksik ya da `sha`'sı farklı). */
  rebuilt: string[];
  /** Dosyası kalmadığı için düşen satırlar. */
  dropped: string[];
  /** Okunamayan ya da şemaya uymayan dosyalar: eski satır (varsa) korunur. */
  unreadable: string[];
  /** Index'in içeriği değişti mi (yazılması gerekir mi). */
  changed: boolean;
};

/**
 * Index'i `sessions/` klasörünün dosyalarıyla karşılaştırıp onarır. Yalnız farklı olanlar okunur
 * (`read`, blob kimliğiyle); rekor girdisi olmayan eski bitmiş satır da (`lacksRecords`). Silinmiş
 * sayılan kimliğin dosyası (iz dosyası) okunmaz. İz dosyası bulunursa kimlik `deleted`'a girer; index'in
 * kendisi bozuksa bile silinenler böylece geri gelir. Rekor sayıları sonda baştan hesaplanır.
 */
export async function repairIndex(
  index: SessionIndex,
  files: readonly SessionFileRef[],
  read: (file: SessionFileRef) => Promise<unknown>,
): Promise<RepairResult> {
  const rows = new Map(index.items.map((row) => [row.id, row]));
  const deleted = [...index.deleted];
  const deletedIds = new Set(deleted.map((item) => item.id));
  const next: SessionIndexRow[] = [];
  const rebuilt: string[] = [];
  const unreadable: string[] = [];
  const present = new Set<string>();

  for (const file of files) {
    const id = sessionIdOfPath(file.path);
    if (!id) continue;
    present.add(id);
    if (deletedIds.has(id)) continue;
    const row = rows.get(id);
    if (row && row.sha === file.sha && row.path === file.path && !lacksRecords(row)) {
      next.push(row);
      continue;
    }
    let stored = null;
    try {
      stored = parseStoredSession(await read(file));
    } catch {
      stored = null;
    }
    if (!stored || stored.id !== id) {
      unreadable.push(id);
      if (row) next.push(row);
      continue;
    }
    if (stored.status === 'deleted') {
      deleted.push({ id, at: stored.deletedAt });
      deletedIds.add(id);
      continue;
    }
    next.push(indexRowOf(stored, file.sha));
    rebuilt.push(id);
  }

  const dropped = index.items.filter((row) => !present.has(row.id) || deletedIds.has(row.id)).map((row) => row.id);
  const repaired: SessionIndex = withRecords({ version: 1, items: sortRows(next), deleted });
  return { index: repaired, rebuilt, dropped, unreadable, changed: canonicalJson(repaired) !== canonicalJson(index) };
}
