import type { CheckInResponse } from '@/lib/check-in-routes';
import { ApiError, fetchJson } from '@/lib/query/errors';
import type { CheckInPost } from '@/lib/schemas/health';

/**
 * Yoklamanın telefondaki verisi — `localStorage` (tasarım §2.2, §2.9). Her erişim `try/catch` içinde:
 * depo kapalıysa yoklama yine çalışır, yalnız bekleyen gönderim ve "soruldu" işareti sayfa boyunca
 * bellekte kalır. Sağlık verisi burada yalnız gönderilene kadar durur (danışanın kendi telefonu).
 *
 * - `pulsecoach.check.<danışan>`: son okunan yoklama girdisi (onaylı parçalar, ağrı geçmişi): Bugün'de
 *   çekilir, "Antrenmana başla"da sheet ağ beklemeden açılır.
 * - `pulsecoach.check-asked.<danışan>`: sheet'in cevaplandığı ya da geçildiği antrenman: yenilemede
 *   yeniden sorulmaz.
 * - `pulsecoach.check-queue.<danışan>`: gönderilemeyen yoklamalar (çevrimdışı salon). Aynı antrenmanın
 *   yoklaması tek kayıtta birleşir; bağlantı gelince ya da sonraki açılışta gider.
 * - `pulsecoach.after-dismissed.<danışan>`: "Şimdi değil" denen antrenman sonrası kart.
 */

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Depo kapalı ya da dolu: bellekteki kopya yeter.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Silinecek bir şey de yok.
  }
}

const memory = new Map<string, string>();

function readKey(key: string): string | null {
  return read(key) ?? memory.get(key) ?? null;
}

function writeKey(key: string, value: string | null): void {
  if (value === null) {
    memory.delete(key);
    remove(key);
  } else {
    memory.set(key, value);
    write(key, value);
  }
}

/* --- yoklamanın girdisi --- */

export type CachedCheck = { at: number; data: CheckInResponse };

const contextKey = (clientId: string) => `pulsecoach.check.${clientId}`;

export function readCheckCache(clientId: string): CachedCheck | null {
  const text = readKey(contextKey(clientId));
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as CachedCheck;
    return typeof parsed?.at === 'number' && parsed.data && typeof parsed.data.today === 'string' && parsed.data.parts ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCheckCache(clientId: string, data: CheckInResponse): void {
  writeKey(contextKey(clientId), JSON.stringify({ at: Date.now(), data } satisfies CachedCheck));
}

/** `GET /api/me/check-in`, telefonda saklanır. */
export async function fetchCheckContext(clientId: string, signal?: AbortSignal): Promise<CheckInResponse> {
  const data = await fetchJson<CheckInResponse>('/api/me/check-in', { signal });
  saveCheckCache(clientId, data);
  return data;
}

/* --- soruldu --- */

const askedKey = (clientId: string) => `pulsecoach.check-asked.${clientId}`;

export function checkAsked(clientId: string, sessionId: string): boolean {
  return readKey(askedKey(clientId)) === sessionId;
}

export function markCheckAsked(clientId: string, sessionId: string): void {
  writeKey(askedKey(clientId), sessionId);
}

/* --- gönderim kuyruğu --- */

const queueKey = (clientId: string) => `pulsecoach.check-queue.${clientId}`;

function readQueue(clientId: string): CheckInPost[] {
  const text = readKey(queueKey(clientId));
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is CheckInPost => typeof item === 'object' && item !== null) : [];
  } catch {
    return [];
  }
}

function saveQueue(clientId: string, queue: readonly CheckInPost[]): void {
  writeKey(queueKey(clientId), queue.length > 0 ? JSON.stringify(queue) : null);
}

/** Kuyruğa ekler: aynı antrenmanın bekleyen yoklaması varsa alanları onun üstüne. */
export function queueCheckIn(clientId: string, body: CheckInPost): void {
  const queue = readQueue(clientId);
  const index = body.sessionId ? queue.findIndex((item) => item.sessionId === body.sessionId) : -1;
  if (index >= 0) queue[index] = { ...queue[index], ...body };
  else queue.push(body);
  saveQueue(clientId, queue);
}

/** Yeniden denemek sonucu değiştirmez: gövde geçersiz (400) ya da onay yok (403). */
function permanent(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

/** Kuyruğun o anki hâlini sırayla gönderir; geçici hatada durur. */
async function drain(clientId: string): Promise<void> {
  for (const body of readQueue(clientId)) {
    try {
      await fetchJson('/api/me/check-in', { method: 'POST', body: JSON.stringify(body) });
    } catch (error) {
      if (!permanent(error instanceof ApiError ? error.status : 0)) return;
    }
    // Gönderilen çıkar; gönderim sürerken aynı antrenmana eklenen alanlar (farklı gövde) kalır.
    const sent = JSON.stringify(body);
    saveQueue(
      clientId,
      readQueue(clientId).filter((item) => JSON.stringify(item) !== sent),
    );
  }
}

let flushing: Promise<void> | null = null;
let again = false;

/**
 * Bekleyen yoklamaları gönderir. Kalıcı hatada (geçersiz gövde, onay yok) atılır; ağ, oturum, sınır ya da
 * sunucu hatasında (bozuk `health.json` dahil: PT onarınca gider) kalır ve gönderim durur. Gönderim
 * sürerken gelen çağrı kaybolmaz: bitince kuyruk bir kez daha okunur.
 */
export function flushCheckIns(clientId: string): Promise<void> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    do {
      again = false;
      await drain(clientId);
    } while (again);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/* --- antrenman sonrası kart --- */

const dismissedKey = (clientId: string) => `pulsecoach.after-dismissed.${clientId}`;

export function afterDismissed(clientId: string, sessionId: string): boolean {
  return readKey(dismissedKey(clientId)) === sessionId;
}

export function dismissAfter(clientId: string, sessionId: string): void {
  writeKey(dismissedKey(clientId), sessionId);
}
