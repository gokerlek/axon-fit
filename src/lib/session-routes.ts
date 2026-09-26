import * as v from 'valibot';
import { originGuard, postGuard } from './client-auth-routes.ts';
import { describeError, GithubError } from './github/errors.ts';
import type { Client } from './schemas/client.ts';
import { finishBodySchema, patchBodySchema, sessionDocSchema, sessionIdSchema } from './schemas/session.ts';
import {
  deleteSession,
  finishSession,
  patchSession,
  putSession,
  readIndex,
  readSession,
  type SessionRepo,
} from './session-files-core.ts';
import type { ClientSession } from './session-core.ts';

/**
 * Danışanın antrenman uçlarının ince çekirdeği (tasarım §4.7): `/api/me/sessions`,
 * `/api/me/sessions/[id]` (GET, PUT, PATCH, DELETE), `/api/me/sessions/[id]/finish`. Uçlar isteği okuyup
 * buraya verir, sonucu yanıta çevirir; kararlar burada ve test edilir.
 *
 * - Kimlik yalnız oturumdan (SPEC §5): kayıtla doğrulanmış danışan, yalnız kendi `client-` repo'su.
 * - Durum değiştiren istekler yalnız bu siteden ve JSON'la (`/api/giris` gibi); DELETE gövdesiz, köken yeter.
 * - Gövde şemadan geçer; bilinmeyen alanlar (sağlık ayrıntısı dahil) atılır. Sağlık ayrıntısı yalnız
 *   bitişte ve onay varken `health.json`'a gider.
 * - GitHub sınırı: 429 + `Retry-After` (Route Handler beklemez); kota azaldıysa yanıtta `slow: true`
 *   (telefon birleştirme penceresini büyütür). Tek commit iki kez çakışırsa 503 + `Retry-After`.
 * - Günlüğe yazma sayısı için yalnız iş ve kimlik yazılır, değer yazılmaz.
 */

export type SessionRouteResult = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

/** Kota bu sayının altına inince telefona yavaşlaması söylenir (tasarım §4.3). */
export const SLOW_REMAINING = 500;
/** `Retry-After` başlığı gelmezse. */
const DEFAULT_RETRY_AFTER = 60;

export type SessionRouteDeps = {
  session: ClientSession | null;
  /** Oturumun hâlâ geçerli olduğu danışan kaydı (`sessionClient`); yoksa null. */
  loadClient(session: ClientSession): Promise<Client | null>;
  repo(clientId: string): SessionRepo;
  timeZone(): Promise<string>;
  now(): Date;
  log(message: string): void;
};

export type Authorized = { client: Client; repo: SessionRepo };

const EXPIRED = { status: 401, body: { error: 'Oturumun kapanmış. Yeniden giriş yap.' } };
const NOT_FOUND = { status: 404, body: { error: 'Antrenman bulunamadı.' } };
const GONE = { status: 410, body: { error: 'Bu antrenman silinmiş.', reason: 'deleted' } };

async function authorize(deps: SessionRouteDeps): Promise<Authorized | SessionRouteResult> {
  if (!deps.session) return EXPIRED;
  const client = await deps.loadClient(deps.session);
  if (!client) return EXPIRED;
  return { client, repo: deps.repo(client.id) };
}

function fieldsOf(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? '';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function invalid(issues: readonly v.BaseIssue<unknown>[]): SessionRouteResult {
  return { status: 400, body: { error: 'Kayıt geçersiz.', fields: fieldsOf(issues) } };
}

function slow(remaining: number | null): Record<string, unknown> {
  return remaining !== null && remaining < SLOW_REMAINING ? { slow: true } : {};
}

/** GitHub hataları yanıta: sınır 429 + Retry-After, çakışma 503 + Retry-After, geri kalanı durumuyla. */
function failure(deps: SessionRouteDeps, error: unknown, context: string): SessionRouteResult {
  deps.log(`[seans] ${context}: ${describeError(error)}`);
  if (error instanceof GithubError && error.rateLimited) {
    const seconds = error.retryAfter ?? DEFAULT_RETRY_AFTER;
    return {
      status: 429,
      body: { error: 'Şu an çok yoğun; kayıtların telefonda duruyor, biraz sonra gönderilecek.', retryAfter: seconds },
      headers: { 'Retry-After': String(seconds) },
    };
  }
  if (error instanceof GithubError && error.status === 409) {
    const seconds = error.retryAfter ?? 5;
    return { status: 503, body: { error: error.message, retryAfter: seconds }, headers: { 'Retry-After': String(seconds) } };
  }
  const status = error instanceof GithubError && error.status >= 400 && error.status < 600 ? error.status : 502;
  return { status, body: { error: 'Kayıt gönderilemedi. Biraz sonra tekrar dene.' } };
}

/**
 * Ucun ortak kapısı: kimlik biçimi, oturum ve kayıt, GitHub hatalarının yanıta çevrilmesi. Antrenman
 * ekranının öteki uçları (`workout-routes.ts`: gün planı, su) da bununla çalışır.
 */
export async function run(
  deps: SessionRouteDeps,
  id: string | null,
  context: string,
  work: (auth: Authorized) => Promise<SessionRouteResult>,
): Promise<SessionRouteResult> {
  if (id !== null && !v.is(sessionIdSchema, id)) return NOT_FOUND;
  try {
    const auth = await authorize(deps);
    if ('status' in auth) return auth;
    return await work(auth);
  } catch (error) {
    return failure(deps, error, `${deps.session?.clientId ?? '?'} ${id ?? ''} ${context}`.trim());
  }
}

/* --- okuma --- */

/** Geçmiş listesi: `sessions/` ağacıyla onarılmış index. */
export function indexRoute(deps: SessionRouteDeps): Promise<SessionRouteResult> {
  return run(deps, null, 'index', async ({ repo }) => {
    const result = await readIndex(repo);
    return { status: 200, body: { index: result.index, repaired: result.changed } };
  });
}

export function getRoute(deps: SessionRouteDeps, id: string): Promise<SessionRouteResult> {
  return run(deps, id, 'get', async ({ repo }) => {
    const result = await readSession(repo, id);
    if (result.status === 'missing') return NOT_FOUND;
    if (result.status === 'deleted') return GONE;
    return { status: 200, body: { doc: result.doc } };
  });
}

/* --- yazma --- */

/** `PUT`: birleştir + yaz (idempotent); birleşmiş belgeyi döner. */
export function putRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'put', async ({ client, repo }) => {
    const parsed = v.safeParse(sessionDocSchema, input);
    if (!parsed.success) return invalid(parsed.issues);
    if (parsed.output.id !== id) return { status: 400, body: { error: 'Kayıt başka bir antrenmana ait.' } };
    const result = await putSession(repo, { now: deps.now(), timeZone: await deps.timeZone() }, parsed.output);
    switch (result.status) {
      case 'deleted':
        return GONE;
      case 'finished':
        return { status: 409, body: { error: 'Bu antrenman başka bir cihazda bitirildi.', reason: 'finished', doc: result.doc } };
      case 'unchanged':
        return { status: 200, body: { doc: result.doc, unchanged: true } };
      default:
        deps.log(`[seans] ${client.id} ${id} put ${result.status}`);
        return { status: result.status === 'created' ? 201 : 200, body: { doc: result.doc, ...slow(result.remaining) } };
    }
  });
}

/** Bitiş: tek commit (seans + index + rotasyon + onaylı sağlık ayrıntısı). */
export function finishRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'finish', async ({ client, repo }) => {
    const parsed = v.safeParse(finishBodySchema, input);
    if (!parsed.success) return invalid(parsed.issues);
    if (parsed.output.doc.id !== id) return { status: 400, body: { error: 'Kayıt başka bir antrenmana ait.' } };
    const result = await finishSession(repo, { now: deps.now(), timeZone: await deps.timeZone(), client }, parsed.output);
    if (result.status === 'deleted') return GONE;
    if (result.status === 'already') return { status: 200, body: { doc: result.doc, already: true } };
    deps.log(`[seans] ${client.id} ${id} finish`);
    return { status: 200, body: { doc: result.doc, rotation: result.plan.rotation, health: result.plan.health, ...slow(result.remaining) } };
  });
}

/** Geçmişte düzeltme: silme (iz listeleri), seans zorluğu, su, başka cihazda bitirilen seansa set ekleme. */
export function patchRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'patch', async ({ client, repo }) => {
    const parsed = v.safeParse(patchBodySchema, input);
    if (!parsed.success) return invalid(parsed.issues);
    const result = await patchSession(repo, { now: deps.now(), timeZone: await deps.timeZone() }, id, parsed.output);
    if (result.status === 'missing') return NOT_FOUND;
    if (result.status === 'deleted') return GONE;
    if (result.status === 'unchanged') return { status: 200, body: { doc: result.doc, unchanged: true } };
    deps.log(`[seans] ${client.id} ${id} patch`);
    return { status: 200, body: { doc: result.doc, ...slow(result.remaining) } };
  });
}

/** Antrenmanın tamamını siler: iz dosyası + index, tek commit, genel mesaj. */
export function deleteRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string): Promise<SessionRouteResult> {
  const blocked = originGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'delete', async ({ client, repo }) => {
    const result = await deleteSession(repo, { now: deps.now(), timeZone: await deps.timeZone() }, id);
    deps.log(`[seans] ${client.id} ${id} delete ${result.status}`);
    return { status: 200, body: { ok: true, ...(result.status === 'already' ? { already: true } : {}) } };
  });
}
