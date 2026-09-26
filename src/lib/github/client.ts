import 'server-only';
import { Octokit } from 'octokit';
import { CLIENT_REPO_PREFIX, serverEnv } from '../env';
import { CLIENT_ID_PATTERN } from '../schemas/client';
import { GithubError, rateLimitOf } from './errors';

/** Hata tipi saf modülde (`errors.ts`): testlerdeki çekirdekler de aynı sınıfı kullanır. */
export { GithubError };

/**
 * GitHub erişiminin tek kapısı.
 *
 * KORUMA KURALI (SPEC §9.2): token hesap seviyesinde geniş yetkili olduğu için
 * uygulama YALNIZCA iki tür repoya dokunabilir:
 *   1. uygulama repo'su (APP_REPO)
 *   2. `client-` önekli danışan repoları
 * Başka bir repo adı buraya gelirse istek hiç çıkmaz. Bu kontrol tek noktada,
 * bilerek: bir hata ya da kötü girdi gidip başka bir repoyu silemesin.
 */

let client: Octokit | null = null;

export function gh(): Octokit {
  client ??= new Octokit({ auth: serverEnv().githubToken, userAgent: 'pulsecoach' });
  return client;
}

let sessionClient: Octokit | null = null;

/**
 * Antrenman kayıtlarının (seans, index, bitiş commit'i) GitHub istemcisi (tasarım §4.3). Aynı token ve
 * aynı repo kapısı (`assertRepoAllowed`, çağıran dosya işlerinde); farkı yeniden deneme ve bekleme:
 * - 409 (sha çakışması) ve 429 hiç yeniden denenmez: 409'da çekirdek taze okuyup bir kez birleştirir;
 *   eski sha'yla üç kez daha denemek (1 + 4 + 9 sn) yalnız süre ve kota harcardı.
 * - 5xx bir kez yeniden denenir.
 * - Sınıra takılınca Route Handler'ın içinde `Retry-After` (ya da 60 sn) beklenmez: hata hemen döner,
 *   uç 429 + `Retry-After` verir, telefon veriyi tutup üstel bekler.
 */
export function sessionWriter(): Octokit {
  sessionClient ??= new Octokit({
    auth: serverEnv().githubToken,
    userAgent: 'pulsecoach',
    retry: { doNotRetry: [400, 401, 403, 404, 409, 410, 422, 429, 451], retries: 1 },
    throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false },
  });
  return sessionClient;
}

export function clientRepoName(clientId: string): string {
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new GithubError(`Geçersiz danışan kimliği: ${clientId}`, 400);
  }
  return `${CLIENT_REPO_PREFIX}${clientId}`;
}

export function isClientRepo(repo: string): boolean {
  return repo.startsWith(CLIENT_REPO_PREFIX) && CLIENT_ID_PATTERN.test(repo.slice(CLIENT_REPO_PREFIX.length));
}

/** İzin verilen repo mu? Değilse istek hiç gönderilmez. */
export function assertRepoAllowed(repo: string): void {
  const { appRepo } = serverEnv();
  if (repo === appRepo || isClientRepo(repo)) return;
  throw new GithubError(
    `Bu uygulama "${repo}" repo'suna dokunamaz. Yalnız "${appRepo}" ve "${CLIENT_REPO_PREFIX}*" repolarına izin var.`,
    403,
  );
}

export function owner(): string {
  return serverEnv().owner;
}

export function appRepo(): string {
  return serverEnv().appRepo;
}

/**
 * Octokit hatalarını tek tipe indirger; 409/422 çakışma olarak işaretlenir. İstek sınırı (429 ya da
 * sınır kaynaklı 403) 429 olur ve `retryAfter`, `remaining` başlıklarını taşır (`rateLimitOf`): uç
 * telefona ne kadar bekleyeceğini söyleyebilsin. İzin 403'ü 403 kalır.
 */
export function toGithubError(error: unknown, context: string): GithubError {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
  const response = typeof error === 'object' && error && 'response' in error ? (error.response as { headers?: Record<string, unknown> }) : undefined;
  const message = error instanceof Error ? error.message : '';
  const rate = rateLimitOf(status, response?.headers, message);
  if (rate.rateLimited) return new GithubError(`${context}: GitHub istek sınırı doldu; biraz sonra tekrar dene.`, 429, rate);
  if (status === 409 || status === 422) {
    return new GithubError(`${context}: kayıt sen çalışırken değişti.`, 409, rate);
  }
  if (status === 404) return new GithubError(`${context}: bulunamadı.`, 404);
  if (status === 403) return new GithubError(`${context}: GitHub izin vermedi (yetki ya da istek sınırı).`, 403, rate);
  if (status === 401) return new GithubError(`${context}: GitHub anahtarı geçersiz.`, 401);
  return new GithubError(`${context}: GitHub'a ulaşılamadı.`, 502, rate);
}
