import { formatKg, formatNumber } from './format.ts';
import type { OwnIndex } from './own-program-index.ts';
import type { ProgramLogEntry } from './program-plan.ts';
import type { SessionIndex } from './schemas/session.ts';

/**
 * PT'nin bildirimleri (tasarım §4.6) — saf. Bildirimler ayrı dosyada tutulmaz, danışanın repo'sundaki
 * kayıtlardan türetilir:
 * - antrenmanların index satırları (`sessions-index.json`): başka gün seçildi, yarım bırakıldı, aşırı
 *   yük onaylandı, hafifletildi (nötr: `lighter` ağrı ya da hazır oluşluk demez);
 * - program geçmişindeki danışan kayıtları (`client`): antrenman günleri, bitişte kilo ve tekrar hedefi;
 * - `proposals.json`'daki bekleyen öneriler (PT onaylar; burada hoşgörüyle okunur);
 * - sağlık ayrıntısı ("ağrı nedeniyle geçti", hafifletmenin nedeni) yalnız `health.json`'dan ve onay
 *   sürdükçe (çağıran onayı denetleyip süzer).
 *
 * Okundu bilgisi danışanın `client.json` → `inbox.seenAt`'indedir (PT yazar, açık soru 7): ondan yeni
 * bildirim okunmamıştır. Metinler PT'ye dönük, ek almayan kalıplarla ("Gün B yerine Gün C yapıldı"):
 * gün adları serbest metin olduğu için Türkçe ek eklenmez.
 */

/** Genel bakış'ta bu kadar gün geriye bakılır. */
export const NOTICE_WINDOW_DAYS = 14;
/** Danışan başına en çok bildirim (özet önbelleği küçük kalsın). */
export const NOTICES_PER_CLIENT = 10;
/** Genel bakış listesinin uzunluğu. */
export const NOTICE_FEED_LIMIT = 20;

const DAY_MS = 86_400_000;

export const PT_NOTICE_KINDS = ['other_day', 'unfinished', 'overload', 'lighter', 'pain', 'program', 'proposal', 'own_program', 'constraint'] as const;
export type PtNoticeKind = (typeof PT_NOTICE_KINDS)[number];

export const PT_NOTICE_LABELS: Record<PtNoticeKind, string> = {
  other_day: 'Başka gün',
  unfinished: 'Yarım',
  overload: 'Aşırı yük',
  lighter: 'Hafifletildi',
  pain: 'Ağrı',
  program: 'Program',
  proposal: 'Öneri',
  own_program: 'Kendi programı',
  constraint: 'Kısıt',
};

export type PtNotice = {
  /** Listede benzersiz anahtar. */
  key: string;
  kind: PtNoticeKind;
  at: string;
  text: string;
  /** Bağlantı: danışanın sayfası, programı ya da kısıtları. */
  target: 'client' | 'program' | 'constraints';
};

/** Kısıt kaydının danışan satırları (`health.json` → `constraintLog`); çağıran onayı denetler. */
export type ConstraintLogRow = { at: string; by: 'pt' | 'client'; id: string; kind: string; text: string };

/**
 * Danışanın kısıt bildirimleri (tasarım `kisit-tarama.md` §3.6): değişiklik kaydının danışan satırları, pencere
 * içinde ("Sol diz bildirildi (orta)", "Sol diz: orta → şiddetli (danışan)", "Bildirim geri çekildi: Sol diz").
 */
export function constraintNotices(log: readonly ConstraintLogRow[], since: number): PtNotice[] {
  return log
    .filter((row) => row.by === 'client' && time(row.at) >= since)
    .map((row) => ({ key: `constraint:${row.id}:${row.kind}:${row.at}`, kind: 'constraint' as const, at: row.at, text: row.text, target: 'constraints' as const }));
}

/** Onaylı sağlık ayrıntısı (`health.json` → `checkIns[]`, seansa bağlı olanlar); çağıran onaya göre süzer. */
export type SessionHealth = { sessionId: string; painSkips: number; adjustReason?: 'readiness' | 'pain' };

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

const ADJUST_REASON: Record<NonNullable<SessionHealth['adjustReason']>, string> = { readiness: 'hazır oluşluk', pain: 'ağrı' };

/** Bitmiş antrenmanlardan: `since`ten (ms) sonra bitenler. */
export function sessionNotices(index: SessionIndex, since: number, health: readonly SessionHealth[] = []): PtNotice[] {
  const bySession = new Map(health.map((item) => [item.sessionId, item]));
  const notices: PtNotice[] = [];
  for (const row of index.items) {
    if (!row.finishedAt || time(row.finishedAt) < since) continue;
    const at = row.finishedAt;
    const day = row.dayName ?? 'Antrenman';
    const push = (kind: PtNoticeKind, text: string, suffix = '') => notices.push({ key: `${kind}:${row.id}${suffix}`, kind, at, text, target: 'client' });
    if (row.otherDay || row.notices.includes('other_day')) {
      push('other_day', row.plannedDayName ? `${row.plannedDayName} yerine ${day} yapıldı` : `Başka gün seçildi: ${day}`);
    }
    if (row.unfinished || row.notices.includes('unfinished')) {
      push('unfinished', `${day} yarım bırakıldı${row.progress ? ` (${formatNumber(row.progress.done)}/${formatNumber(row.progress.planned)} set)` : ''}`);
    }
    if (row.notices.includes('overload')) {
      const items = row.overloads ?? [];
      if (items.length === 0) push('overload', `${day}: hedefin çok üzerinde set onaylandı`);
      items.forEach((item, position) =>
        push('overload', `${item.title} ${formatKg(item.kg)}${item.plannedKg !== undefined ? ` (hedef ${formatNumber(item.plannedKg)})` : ''}`, `:${position}`),
      );
    }
    const detail = bySession.get(row.id);
    if (row.notices.includes('lighter')) {
      push('lighter', `${day} hafifletildi${detail?.adjustReason ? ` (${ADJUST_REASON[detail.adjustReason]})` : ''}`);
    }
    if (detail && detail.painSkips > 0) {
      push('pain', `${day}: ağrı nedeniyle ${formatNumber(detail.painSkips)} hareket geçildi`);
    }
  }
  return notices;
}

/** Program geçmişindeki danışan kayıtları ("Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt"). */
export function programNotices(log: readonly Pick<ProgramLogEntry, 'at' | 'kind' | 'changes'>[], since: number): PtNotice[] {
  return log
    .filter((entry) => entry.kind === 'client' && time(entry.at) >= since)
    .map((entry) => ({
      key: `program:${entry.at}`,
      kind: 'program' as const,
      at: entry.at,
      text: entry.changes.map((change) => (change.scope ? `${change.scope}: ${change.text}` : change.text)).join(' · '),
      target: 'program' as const,
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Paylaşılmış programın geçmişinden PT'ye giden kayıt: danışanın düzenleyici kaydı ya da bitişteki kaydı (günler değil). */
function clientEdit(entry: Pick<ProgramLogEntry, 'kind' | 'by' | 'sessionId'>): boolean {
  return (entry.kind === 'edit' && entry.by !== 'pt') || (entry.kind === 'client' && entry.sessionId !== undefined);
}

/**
 * Danışanın kendi programları (`docs/design/kendi-program.md` §7.1), `own_program` türü, bağlantı Program sekmesi:
 * Bugün'ün programını değiştirdi (index `active.at`), paylaştı (`items[].shared.at`), paylaşımı kapattı ya da
 * sildi (`events`), paylaşılmış programı düzenledi (`logs`: çağıran yalnız `clientEditedAt`'i pencerede olan
 * paylaşılmış programların geçmişini verir). Paylaşılmamış programdaki düzenlemeler bildirilmez.
 */
export function ownProgramNotices(index: OwnIndex | null | undefined, since: number, logs: ReadonlyMap<string, readonly ProgramLogEntry[]> = new Map()): PtNotice[] {
  if (!index) return [];
  const notices: PtNotice[] = [];
  const push = (key: string, at: string, text: string) => notices.push({ key: `own_program:${key}`, kind: 'own_program', at, text, target: 'program' });
  const names = new Map(index.items.map((item) => [item.id, item.name]));
  if (index.active && time(index.active.at) >= since) {
    const id = index.active.programId;
    const name = id ? (names.get(id) ?? index.events.find((event) => event.id === id)?.name) : null;
    push(`active:${index.active.at}`, index.active.at, id ? `Bugün'ün programı: ${name ?? 'kendi programı'}` : 'Antrenörün programına döndü');
  }
  for (const item of index.items) {
    if (item.shared && time(item.shared.at) >= since) push(`shared:${item.id}:${item.shared.at}`, item.shared.at, `Paylaştı: ${item.name}`);
    if (!item.shared) continue;
    for (const entry of logs.get(item.id) ?? []) {
      if (!clientEdit(entry) || time(entry.at) < since) continue;
      const text = entry.changes.map((change) => (change.scope ? `${change.scope}: ${change.text}` : change.text)).join(' · ');
      push(`edit:${item.id}:${entry.at}`, entry.at, `${item.name} · ${text}`);
    }
  }
  for (const event of index.events) {
    if (time(event.at) < since) continue;
    push(`${event.kind}:${event.id}:${event.at}`, event.at, event.kind === 'deleted' ? `Sildi: ${event.name}` : `Paylaşımı kapattı: ${event.name}`);
  }
  return notices;
}

/**
 * `proposals.json`'daki bekleyen öneriler (`proposals.ts`; burada hoşgörüyle yalnız `status`, `at` ve `text`
 * okunur, bilinmeyen türler de sayılır): tek bildirim, en yeni önerinin anında; tek öneri varsa metniyle
 * ("Öneri: Leg Press 3 → 4 set"). Bekleyen öneri pencere dışında da görünür (PT'nin kararını bekliyor).
 */
export function proposalNotices(raw: unknown): PtNotice[] {
  const items = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  const pending = items.filter((item): item is Record<string, unknown> => isRecord(item) && item.status === 'pending' && typeof item.at === 'string');
  if (pending.length === 0) return [];
  const at = pending.map((item) => item.at as string).sort((a, b) => time(b) - time(a))[0] as string;
  const only = pending.length === 1 && typeof pending[0]?.text === 'string' ? pending[0].text : null;
  return [{ key: `proposal:${at}`, kind: 'proposal', at, text: only ? `Öneri: ${only}` : `${formatNumber(pending.length)} değişiklik önerisi bekliyor`, target: 'program' }];
}

/** Bir danışanın bildirimleri, en yeniden eskiye; pencere `windowDays`, en çok `limit`. */
export function clientNotices(input: {
  index: SessionIndex | null;
  log: readonly Pick<ProgramLogEntry, 'at' | 'kind' | 'changes'>[];
  proposals: unknown;
  health?: readonly SessionHealth[];
  /** Kendi programların index'i ve paylaşılmış programların geçmişi (`ownProgramNotices`). */
  own?: { index: OwnIndex | null; logs?: ReadonlyMap<string, readonly ProgramLogEntry[]> } | undefined;
  /** Kısıt kaydı, yalnız `conditions` onayı sürdükçe. */
  constraintLog?: readonly ConstraintLogRow[];
  now: Date;
  windowDays?: number;
  limit?: number;
}): PtNotice[] {
  const since = input.now.getTime() - (input.windowDays ?? NOTICE_WINDOW_DAYS) * DAY_MS;
  const all = [
    ...(input.index ? sessionNotices(input.index, since, input.health) : []),
    ...programNotices(input.log, since),
    ...proposalNotices(input.proposals),
    ...(input.own ? ownProgramNotices(input.own.index, since, input.own.logs) : []),
    ...constraintNotices(input.constraintLog ?? [], since),
  ];
  return all.sort((a, b) => time(b.at) - time(a.at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, input.limit ?? NOTICES_PER_CLIENT);
}

/** `inbox.seenAt`'ten yeni bildirim okunmamıştır; hiç okunmadıysa hepsi. */
export function isUnread(notice: Pick<PtNotice, 'at'>, seenAt: string | undefined): boolean {
  return !seenAt || time(notice.at) > time(seenAt);
}

/**
 * `health.json` → seansa bağlı ayrıntı, onaya göre süzülmüş (`pain`: ağrı takibi, `readiness`: hazır
 * oluşluk). Dosyanın biçimi bozuksa boş.
 */
export function sessionHealthOf(raw: unknown, consent: { pain: boolean; readiness: boolean }): SessionHealth[] {
  const checkIns = isRecord(raw) && Array.isArray(raw.checkIns) ? raw.checkIns : [];
  return checkIns.flatMap((item): SessionHealth[] => {
    if (!isRecord(item) || typeof item.sessionId !== 'string') return [];
    const skips = consent.pain && Array.isArray(item.skippedRows) ? item.skippedRows.filter((row) => isRecord(row) && row.reason === 'pain').length : 0;
    const reason = item.adjustReason === 'pain' ? (consent.pain ? 'pain' : undefined) : item.adjustReason === 'readiness' && consent.readiness ? 'readiness' : undefined;
    if (skips === 0 && !reason) return [];
    return [{ sessionId: item.sessionId, painSkips: skips, ...(reason ? { adjustReason: reason } : {}) }];
  });
}

export type ClientDigest = { id: string; name: string; seenAt?: string; notices: PtNotice[] };
export type FeedItem = PtNotice & { clientId: string; clientName: string; unread: boolean };

/**
 * Genel bakış'ın "Bildirimler" listesi: bütün danışanların bildirimleri tek listede, en yeniden eskiye,
 * en çok `limit`. `unread`: okunmamışların toplamı (listede görünmeyenler dahil); `unreadClients`:
 * "Tümünü okundu say"ın yazacağı danışanlar.
 */
export function noticeFeed(digests: readonly ClientDigest[], limit = NOTICE_FEED_LIMIT): { items: FeedItem[]; unread: number; unreadClients: string[] } {
  const all = digests.flatMap((digest) =>
    digest.notices.map((notice) => ({ ...notice, clientId: digest.id, clientName: digest.name, unread: isUnread(notice, digest.seenAt) })),
  );
  all.sort((a, b) => time(b.at) - time(a.at) || (a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0) || (a.key < b.key ? -1 : 1));
  const unreadClients = [...new Set(all.filter((item) => item.unread).map((item) => item.clientId))].sort();
  return { items: all.slice(0, limit), unread: all.filter((item) => item.unread).length, unreadClients };
}
