import 'server-only';
import { Octokit } from 'octokit';
import { CLIENT_REPO_PREFIX, serverEnv } from '../env';

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

export class GithubError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

/** Danışan kimliği biçimi: `c_` + 6-24 küçük harf/rakam. Repo adına doğrudan girdiği için dar tutulur. */
const CLIENT_ID_PATTERN = /^c_[a-z0-9]{6,24}$/;

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

/** Octokit hatalarını tek tipe indirger; 409/422 çakışma olarak işaretlenir. */
export function toGithubError(error: unknown, context: string): GithubError {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
  if (status === 409 || status === 422) {
    return new GithubError(`${context}: kayıt sen çalışırken değişti.`, 409);
  }
  if (status === 404) return new GithubError(`${context}: bulunamadı.`, 404);
  if (status === 403) return new GithubError(`${context}: GitHub izin vermedi (yetki ya da istek sınırı).`, 403);
  if (status === 401) return new GithubError(`${context}: GitHub anahtarı geçersiz.`, 401);
  return new GithubError(`${context}: GitHub'a ulaşılamadı.`, 502);
}
