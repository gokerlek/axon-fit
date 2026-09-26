import * as v from 'valibot';
import { sessionDocSchema, type SessionDoc } from './schemas/session.ts';
import { canonicalJson, mergeAll } from './session-merge.ts';
import type { ExtraRow, ExtraRows, WorkoutDay } from './workout-plan.ts';
import type { RestTimer } from './workout-rest.ts';
import type { SetDraft } from './workout-session.ts';
import { parseSetTimer, type SetTimer } from './workout-timer.ts';

/**
 * Telefondaki antrenman kaydı ve gönderim kuyruğu (tasarım §4.3, §4.4) — saf. Kaynak telefondur: etkin
 * antrenmanın tamamı `localStorage`'da (`pulsecoach.session.<danışan>`) her değişiklikte yazılır;
 * yenileme ya da çökme bir şey kaybettirmez. Bitiş (ya da silinme) sunucuda onaylanınca silinir.
 *
 * Kuyruk tek kirli bayrak + son belgedir, işlem listesi yok:
 * - Her yerel değişiklik sayacı artırır (`rev`). Set değişikliği gönderim ister (`dueRev`); su gibi
 *   değişiklikler kendi başına yazmaz, sonraki set yazımına ya da bitişe biner.
 * - Uçta tek istek; yanıt gelince belge yine kirliyse son hâl gider. Son yazma 15 sn'den yeniyse
 *   gönderim 15. saniyeye ertelenir (kota azaldıysa, `slow`, 60 sn).
 * - `PUT` birleşmiş belgeyi döner; telefon kendi değişikliklerini onun üstüne birleştirir. Tarih
 *   sunucunun (ilk yazımda `todayIn`); sunucu belgeyi etkin tutar.
 * - Sınır ve geçici hatada üstel bekleme: 5 sn × 2ⁿ, en çok 5 dk, rastgele pay.
 */

export const LOCAL_VERSION = 1;
/** Aynı antrenmanın iki yazımı arasında en az (süperset turları tek yazmada birleşir). */
export const SEND_WINDOW_MS = 15_000;
/** Sunucu kotanın azaldığını söyledi (`slow: true`). */
export const SLOW_WINDOW_MS = 60_000;
export const BACKOFF = { baseMs: 5000, maxMs: 5 * 60_000 } as const;
/** `keepalive` isteğinin gövde sınırı (tarayıcılarda 64 KB). */
export const KEEPALIVE_MAX_BYTES = 60_000;

export function localWorkoutKey(clientId: string): string {
  return `pulsecoach.session.${clientId}`;
}

/** Son okunan gün planı ve Bugün'ün sayıları (`GET /api/me/workout`): başlangıç ağ beklemesin. */
export function workoutCacheKey(clientId: string): string {
  return `pulsecoach.workout.${clientId}`;
}

/** Bu telefonun yazan kimliği (`w_…`): seansa `writer`, kayıtlara `by`. */
export const WRITER_KEY = 'pulsecoach.writer';

export type LocalWorkout = {
  v: typeof LOCAL_VERSION;
  doc: SessionDoc;
  /** Sunucunun son onayladığı belge; dosya henüz yoksa null. */
  acked: SessionDoc | null;
  /** Başlangıçtaki günün planı (anlık görüntü). */
  plan: WorkoutDay;
  /** Muadil ve eklenen hareketlerin planları (sunucudan, kendi geçmişleriyle): günün etkin hâli bunlarla (`effectiveDay`). */
  extras: ExtraRows;
  /** Sağlık onayı var: bitişte "Ağrı" nedeni çıkar. */
  pain: boolean;
  /** Yerel değişiklik sayacı; sunucuya ulaşan son değişiklik; gönderilmesi gereken son değişiklik. */
  rev: number;
  ackedRev: number;
  dueRev: number;
  /** Son gönderim (epoch ms): birleştirme penceresi buradan. */
  lastSentAt: number | null;
  slow: boolean;
  rest: RestTimer | null;
  /** Bu antrenmandaki dinlenme sayısı: kilit uyarısı yalnız ilkinde. */
  restCount: number;
  draft: SetDraft | null;
  /** Süreli setin sayacı ("Başlat ▶"); sayılmıyorsa null. */
  timer: SetTimer | null;
};

export function createLocalWorkout(
  doc: SessionDoc,
  plan: WorkoutDay,
  acked: SessionDoc | null = null,
  options: { extras?: ExtraRows; pain?: boolean } = {},
): LocalWorkout {
  return {
    v: LOCAL_VERSION,
    doc,
    acked,
    plan,
    extras: options.extras ?? {},
    pain: options.pain ?? false,
    rev: 0,
    ackedRev: 0,
    dueRev: 0,
    lastSentAt: null,
    slow: false,
    rest: null,
    restCount: 0,
    draft: null,
    timer: null,
  };
}

/** Yerel değişiklik: `send` set değişikliğidir (gönderim ister). */
export function withChange(local: LocalWorkout, doc: SessionDoc, options: { send: boolean }): LocalWorkout {
  const rev = local.rev + 1;
  return { ...local, doc, rev, dueRev: options.send ? rev : local.dueRev };
}

/** Gönderilmesi gereken bir değişiklik var mı. */
export function sendPending(local: LocalWorkout): boolean {
  return local.dueRev > local.ackedRev;
}

/** Sunucuya ulaşmamış herhangi bir değişiklik (su dahil): sayfadan çıkarken `keepalive`'la gider. */
export function hasUnsent(local: LocalWorkout): boolean {
  return local.rev > local.ackedRev;
}

/** Gönderim ne zaman: birleştirme penceresi dolana kadar bekle (ms; 0 = şimdi). */
export function sendDelay(local: Pick<LocalWorkout, 'lastSentAt' | 'slow'>, now: number): number {
  if (local.lastSentAt === null) return 0;
  const window = local.slow ? SLOW_WINDOW_MS : SEND_WINDOW_MS;
  return Math.max(0, local.lastSentAt + window - now);
}

/** Üstel bekleme: 5 sn × 2ⁿ, en çok 5 dk; ±%20 rastgele pay (telefonlar aynı anda dönmesin). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF.maxMs, BACKOFF.baseMs * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/**
 * Sunucunun birleşik belgesi üstüne telefondaki son hâl: tarih sunucunun, belge etkin, yazan bu
 * telefon. `sentRev` gönderilen belgenin sayacı: o ana kadarki değişiklikler sunucudadır.
 */
export function acknowledge(local: LocalWorkout, server: SessionDoc, sentRev: number, options: { slow?: boolean } = {}): LocalWorkout {
  const merged = mergeAll([server, local.doc]) as SessionDoc;
  const { finishedAt: _finishedAt, ...rest } = merged;
  const doc: SessionDoc = { ...rest, status: 'active', date: server.date, writer: local.doc.writer };
  return { ...local, doc, acked: server, ackedRev: Math.max(local.ackedRev, sentRev), slow: options.slow ?? local.slow };
}

/** Telefonda olup sunucuya ulaşmamış (yeni ya da düzeltilmiş) setler: "Çevrimdışı · 2 set telefonda". */
export function unsentSets(local: Pick<LocalWorkout, 'doc' | 'acked'>): number {
  const known = new Map<string, string>();
  for (const entry of local.acked?.entries ?? []) for (const set of entry.sets) known.set(set.id, canonicalJson(set));
  let count = 0;
  for (const entry of local.doc.entries) {
    for (const set of entry.sets) if (set.type === 'working' && known.get(set.id) !== canonicalJson(set)) count += 1;
  }
  return count;
}

/** Başka cihazda bitirilen antrenmana eklenebilecek setler (409 `finished`): sunucuda olmayanlar. */
export function setsMissingOn(local: SessionDoc, server: SessionDoc): number {
  const known = new Set(server.entries.flatMap((entry) => entry.sets.map((set) => set.id)));
  const deleted = new Set(server.deletedSetIds);
  return local.entries.reduce((sum, entry) => sum + entry.sets.filter((set) => set.type === 'working' && !known.has(set.id) && !deleted.has(set.id)).length, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restOf(value: unknown): RestTimer | null {
  if (!isRecord(value)) return null;
  const { setId, startedAt, endsAt, total } = value;
  if (typeof setId !== 'string' || typeof startedAt !== 'number' || typeof endsAt !== 'number' || typeof total !== 'number') return null;
  return {
    setId,
    startedAt,
    endsAt,
    total,
    warned: value.warned === true,
    endedAt: typeof value.endedAt === 'number' ? value.endedAt : null,
    alarms: typeof value.alarms === 'number' ? value.alarms : 0,
    lastAlarmAt: typeof value.lastAlarmAt === 'number' ? value.lastAlarmAt : null,
    ack: value.ack === true,
    mode: value.mode === 'mini' ? 'mini' : 'full',
  };
}

function isPlan(value: unknown): value is WorkoutDay {
  return isRecord(value) && typeof value.dayId === 'string' && typeof value.dayName === 'string' && Array.isArray(value.blocks) && isRecord(value.rows);
}

function isExtra(value: unknown): value is ExtraRow {
  return (
    isRecord(value) &&
    typeof value.exerciseId === 'string' &&
    isRecord(value.row) &&
    typeof value.row.rowId === 'string' &&
    isRecord(value.row.plan) &&
    isRecord(value.template) &&
    Array.isArray(value.template.sets)
  );
}

/** Muadil ve eklenen hareketlerin planları: biçimi bozuk olan atlanır (hareket asıl satırın düzeniyle sürer). */
function extrasOf(value: unknown): ExtraRows {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, ExtraRow] => isExtra(entry[1])));
}

function isDraft(value: unknown): value is SetDraft {
  return isRecord(value) && typeof value.rowId === 'string' && typeof value.setIndex === 'number';
}

/**
 * Yerel kaydı okur. Belge şemadan geçer ve etkin olmalı; plan biçimce denetlenir. Okunamayan kayıt
 * yok sayılır (null): üzerine yeni antrenman yazılabilir.
 */
export function parseLocalWorkout(text: string | null): LocalWorkout | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== LOCAL_VERSION || !isPlan(raw.plan)) return null;
  const doc = v.safeParse(sessionDocSchema, raw.doc);
  if (!doc.success || doc.output.status !== 'active') return null;
  const acked = raw.acked === null || raw.acked === undefined ? null : v.safeParse(sessionDocSchema, raw.acked);
  const count = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0);
  return {
    v: LOCAL_VERSION,
    doc: doc.output,
    acked: acked?.success ? acked.output : null,
    plan: raw.plan,
    extras: extrasOf(raw.extras),
    pain: raw.pain === true,
    rev: count(raw.rev),
    ackedRev: count(raw.ackedRev),
    dueRev: count(raw.dueRev),
    lastSentAt: typeof raw.lastSentAt === 'number' ? raw.lastSentAt : null,
    slow: raw.slow === true,
    rest: restOf(raw.rest),
    restCount: count(raw.restCount),
    draft: isDraft(raw.draft) ? raw.draft : null,
    timer: parseSetTimer(raw.timer),
  };
}
