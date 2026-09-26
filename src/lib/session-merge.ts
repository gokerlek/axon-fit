import type {
  SessionDoc,
  SessionEntry,
  SessionNotice,
  SessionSet,
  SessionTombstone,
  StoredSession,
  WaterTap,
} from './schemas/session.ts';

/**
 * Antrenman kaydının birleştirilmesi (tasarım §4.3) — telefon ve sunucu aynı saf fonksiyonu kullanır.
 *
 * Birleştirme değişmeli, birleşmeli ve idempotenttir: belgeler hangi sırayla, kaç kez gelirse gelsin
 * sonuç aynıdır. Böylece `keepalive`'la geç varan eski bir anlık görüntü yeniyi ezemez, aynı belgeyi
 * yeniden göndermek zararsızdır. Kurallar:
 * - Setler ve hareketler (entry) kimlikle birleşir. Aynı setin iki hâlinden `editedAt ?? at` büyük olan
 *   kazanır; eşitse `by`, o da eşitse içeriğin kanonik metni (deterministik).
 * - Hareketin setler dışındaki alanları (durum, geçme, `oneOff`, `lighter`, muadil, ayar notu…) tek
 *   kayıttır: hareketin `updatedAt`'i ve `by`'ı ile son yazan kazanır.
 * - Oturum düzeyindeki `order`, `rotation`, `effort` kendi `updatedAt`'iyle; son yazan kazanır.
 * - İzler (`deletedSetIds`, `deletedEntryIds`) birleşimdir ve her zaman kazanır: listedeki kimlik belgeye
 *   geri giremez.
 * - Su dokunuşları kimlikle birleşir (azaltma da kalıcı); bildirimler (tür, an) çiftiyle.
 * - Durum yalnız ileri gider: etkin < bitmiş < silinmiş. Silinmişle birleşen her şey iz dosyasıdır.
 * - Başlangıç ve tarih en erkeni; bitiş anı bitmiş belgelerin en erkeni.
 * - `writer` (son yazan cihaz) karşılaştırmaya girmez (`sameSessionData`); birleşimde sözlükte büyük
 *   olan kalır, sunucu yazarken kendi isteğinin cihazını koyar.
 *
 * Çıktı kanoniktir: alanlar sabit sırada, setler (`at`, kimlik), hareketler `order`'daki yerleri ve
 * kimlikleriyle sıralı. `normalizeSession(a)` = `mergeSessions(a, a)`.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Anahtarları sıralı, `undefined`'sız JSON metni: içerik karşılaştırması ve eşitlik bozma için. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = sortKeys(item);
    }
    return out;
  }
  return value as Json;
}

function time(iso: string): number {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : at;
}

/** (an, yazan, içerik) sırasında karşılaştırma: toplam sıra, yani en büyüğü seçmek her sırada aynı sonucu verir. */
function compareStamped(a: { at: string; by?: string | undefined; body: string }, b: { at: string; by?: string | undefined; body: string }): number {
  const byTime = time(a.at) - time(b.at);
  if (byTime !== 0) return byTime;
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  const aBy = a.by ?? '';
  const bBy = b.by ?? '';
  if (aBy !== bBy) return aBy < bBy ? -1 : 1;
  return a.body === b.body ? 0 : a.body < b.body ? -1 : 1;
}

function latest<T>(items: readonly T[], stamp: (item: T) => { at: string; by?: string | undefined }, body: (item: T) => string): T {
  let best = items[0] as T;
  for (const item of items.slice(1)) {
    if (compareStamped({ ...stamp(item), body: body(item) }, { ...stamp(best), body: body(best) }) > 0) best = item;
  }
  return best;
}

/** Oturum düzeyindeki kayıt (`order`, `rotation`, `effort`): olmayan kaybeder, olanlardan son yazan kazanır. */
function latestRegister<R extends { updatedAt: string; by?: string | undefined }>(items: readonly (R | undefined)[]): R | undefined {
  const present = items.filter((item): item is R => item !== undefined);
  if (present.length === 0) return undefined;
  return latest(present, (item) => ({ at: item.updatedAt, by: item.by }), canonicalJson);
}

function earliest(values: readonly string[]): string {
  return values.reduce((best, value) => {
    const diff = time(value) - time(best);
    return diff < 0 || (diff === 0 && value < best) ? value : best;
  });
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/* --- kanonik biçimler: alanlar sabit sırada, boş alan yok --- */

function compact<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = item;
  return out as T;
}

function normalizeSet(set: SessionSet): SessionSet {
  return compact({
    id: set.id,
    type: set.type,
    setIndex: set.setIndex,
    kg: set.kg,
    reps: set.reps,
    seconds: set.seconds,
    effort: set.effort,
    target: set.target && compact({ min: set.target.min, max: set.target.max, loadPct: set.target.loadPct, amrap: set.target.amrap }),
    topWeightKg: set.topWeightKg,
    plannedSetCount: set.plannedSetCount,
    plannedKg: set.plannedKg,
    overload: set.overload,
    extra: set.extra,
    at: set.at,
    editedAt: set.editedAt,
    by: set.by,
  });
}

type EntryHeader = Omit<SessionEntry, 'sets'>;

function normalizeHeader(entry: EntryHeader): EntryHeader {
  return compact({
    id: entry.id,
    rowId: entry.rowId,
    blockId: entry.blockId,
    exerciseId: entry.exerciseId,
    title: entry.title,
    deviceId: entry.deviceId,
    status: entry.status,
    skip: entry.skip && compact({ reason: entry.skip.reason, moved: entry.skip.moved }),
    swappedFrom: entry.swappedFrom,
    added: entry.added,
    plannedSets: entry.plannedSets,
    plan: entry.plan && compact({ topWeightKg: entry.plan.topWeightKg, reason: entry.plan.reason, stage: entry.plan.stage }),
    setupNote: entry.setupNote,
    oneOff: entry.oneOff,
    lighter: entry.lighter,
    updatedAt: entry.updatedAt,
    by: entry.by,
  });
}

function headerOf(entry: SessionEntry): EntryHeader {
  const { sets: _sets, ...header } = entry;
  return normalizeHeader(header);
}

function setOrder(a: SessionSet, b: SessionSet): number {
  return time(a.at) - time(b.at) || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function mergeSets(versions: readonly SessionSet[], deleted: ReadonlySet<string>): SessionSet[] {
  const byId = new Map<string, SessionSet[]>();
  for (const set of versions) {
    if (deleted.has(set.id)) continue;
    byId.set(set.id, [...(byId.get(set.id) ?? []), normalizeSet(set)]);
  }
  return [...byId.values()]
    .map((copies) => latest(copies, (set) => ({ at: set.editedAt ?? set.at, by: set.by }), canonicalJson))
    .sort(setOrder);
}

function mergeEntries(docs: readonly SessionDoc[], deletedEntries: ReadonlySet<string>, deletedSets: ReadonlySet<string>, order: readonly string[]): SessionEntry[] {
  const byId = new Map<string, SessionEntry[]>();
  for (const doc of docs) {
    for (const entry of doc.entries) {
      if (deletedEntries.has(entry.id)) continue;
      byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
    }
  }
  const position = new Map(order.map((id, index) => [id, index]));
  return [...byId.entries()]
    .map(([, copies]) => {
      const header = latest(copies.map(headerOf), (item) => ({ at: item.updatedAt, by: item.by }), canonicalJson);
      return { ...header, sets: mergeSets(copies.flatMap((copy) => copy.sets), deletedSets) };
    })
    .sort((a, b) => {
      const byOrder = (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER);
      return byOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
}

function mergeTaps(docs: readonly SessionDoc[]): WaterTap[] {
  const byId = new Map<string, WaterTap[]>();
  for (const doc of docs) for (const tap of doc.waterTaps) byId.set(tap.id, [...(byId.get(tap.id) ?? []), { id: tap.id, d: tap.d, at: tap.at }]);
  return [...byId.values()]
    .map((copies) => latest(copies, (tap) => ({ at: tap.at }), canonicalJson))
    .sort((a, b) => time(a.at) - time(b.at) || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function mergeNotices(docs: readonly SessionDoc[]): SessionNotice[] {
  const byKey = new Map<string, SessionNotice>();
  for (const doc of docs) for (const notice of doc.notices) byKey.set(`${notice.kind}@${notice.at}`, { kind: notice.kind, at: notice.at });
  return [...byKey.values()].sort(
    (a, b) => time(a.at) - time(b.at) || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
  );
}

function mergeTombstones(stones: readonly SessionTombstone[]): SessionTombstone {
  const first = stones[0] as SessionTombstone;
  return { version: 1, id: first.id, status: 'deleted', deletedAt: earliest(stones.map((stone) => stone.deletedAt)) };
}

/** Bir ya da daha çok belgenin birleşimi (sıra ve tekrar önemsiz). Kimlikler farklıysa hata. */
export function mergeAll(sessions: readonly StoredSession[]): StoredSession {
  const first = sessions[0];
  if (!first) throw new Error('Birleştirilecek belge yok.');
  if (sessions.some((session) => session.id !== first.id)) throw new Error('Farklı antrenmanlar birleştirilemez.');

  const stones = sessions.filter((session): session is SessionTombstone => session.status === 'deleted');
  if (stones.length > 0) return mergeTombstones(stones);
  const docs = sessions as readonly SessionDoc[];

  const deletedSetIds = uniqueSorted(docs.flatMap((doc) => doc.deletedSetIds));
  const deletedEntryIds = uniqueSorted(docs.flatMap((doc) => doc.deletedEntryIds));
  const order = latestRegister(docs.map((doc) => doc.order));
  const finished = docs.filter((doc) => doc.status === 'finished');
  const programs = docs.flatMap((doc) => (doc.program ? [doc.program] : []));
  const program = programs.length > 0 ? programs.map((item) => ({ item, key: canonicalJson(item) })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))[0]?.item : undefined;
  const rotation = latestRegister(docs.map((doc) => doc.rotation));
  const effort = latestRegister(docs.map((doc) => doc.effort));

  return compact({
    version: 1 as const,
    id: first.id,
    status: finished.length > 0 ? ('finished' as const) : ('active' as const),
    date: docs.map((doc) => doc.date).sort()[0] as string,
    startedAt: earliest(docs.map((doc) => doc.startedAt)),
    finishedAt: finished.length > 0 ? earliest(finished.map((doc) => doc.finishedAt as string)) : undefined,
    program: program && compact({ ...program }),
    rotation: rotation && compact({ value: rotation.value, updatedAt: rotation.updatedAt, by: rotation.by }),
    adjust: docs.some((doc) => doc.adjust === 'lighter') ? ('lighter' as const) : undefined,
    writer: docs.map((doc) => doc.writer).sort().at(-1) as string,
    order: order && compact({ value: [...order.value], updatedAt: order.updatedAt, by: order.by }),
    entries: mergeEntries(docs, new Set(deletedEntryIds), new Set(deletedSetIds), order?.value ?? []),
    deletedSetIds,
    deletedEntryIds,
    waterTaps: mergeTaps(docs),
    notices: mergeNotices(docs),
    effort: effort && compact({ sessionRpe: effort.sessionRpe, durationMin: effort.durationMin, updatedAt: effort.updatedAt, by: effort.by }),
  }) satisfies SessionDoc;
}

export function mergeSessions(a: StoredSession, b: StoredSession): StoredSession {
  return mergeAll([a, b]);
}

/** Kanonik biçim: alanlar sabit sırada, silinenler çıkmış, setler ve hareketler sıralı. */
export function normalizeSession<T extends StoredSession>(session: T): T {
  return mergeAll([session]) as T;
}

/** İki belge aynı veriyi mi taşıyor (`writer` hariç): "değişiklik yoksa yazma" bununla. */
export function sameSessionData(a: StoredSession, b: StoredSession): boolean {
  const strip = (session: StoredSession) => {
    const normalized = normalizeSession(session);
    if (normalized.status === 'deleted') return normalized;
    const { writer: _writer, ...rest } = normalized;
    return rest;
  };
  return canonicalJson(strip(a)) === canonicalJson(strip(b));
}

/* --- silme --- */

/**
 * Setleri ve hareketleri siler: kimlikler kalıcı iz listelerine girer, veri çıkar (§4.5). Belgede
 * olmayan kimlik de iz olur (başka cihazda henüz gönderilmemiş bir kopyası olabilir).
 */
export function withDeletions(doc: SessionDoc, ids: { setIds?: readonly string[]; entryIds?: readonly string[] }): SessionDoc {
  return normalizeSession({
    ...doc,
    deletedSetIds: [...doc.deletedSetIds, ...(ids.setIds ?? [])],
    deletedEntryIds: [...doc.deletedEntryIds, ...(ids.entryIds ?? [])],
  });
}

/** Antrenmanın tamamı silinince dosyanın yerini alan iz: değer yok. */
export function tombstoneOf(id: string, at: Date): SessionTombstone {
  return { version: 1, id, status: 'deleted', deletedAt: at.toISOString() };
}
