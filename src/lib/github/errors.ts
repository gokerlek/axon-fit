/**
 * GitHub katmanının hata tipleri ve yeni açılan repo'ya ilk yazma — saf: `server-only`, ortam ya da
 * Octokit yok. Test edilen çekirdekler (`session-core.ts`, `clients-core.ts`, `config-update.ts`)
 * buradan alır; `github/client.ts` aynı sınıfı yeniden dışa verir, yani `instanceof` iki yoldan
 * gelen hatada da tutar.
 */

export class GithubError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

/**
 * Dosya var ama JSON olarak okunamıyor (ör. elle yapılan düzenleme yarım kaldı). `sha` aynı okumadan
 * gelir: dosyayı onarmak isteyen (kurulum sihirbazı) ikinci bir okuma yapmadan üzerine yazabilir ve
 * yazdığı taban, sha'sını taşıdığı içerikle aynı kalır.
 */
export class BrokenJsonError extends GithubError {
  readonly sha: string;
  constructor(path: string, sha: string) {
    super(`${path} bozuk JSON içeriyor.`, 500);
    this.name = 'BrokenJsonError';
    this.sha = sha;
  }
}

/** Hatanın günlüğe yazılacak özeti: mesaj ve (varsa) durum kodu. Çağıran koda ya da adrese yer vermez. */
export function describeError(error: unknown): string {
  if (error instanceof GithubError) return `${error.message} (${error.status})`;
  return error instanceof Error ? error.message : String(error);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FRESH_REPO_RETRIES = 3;

/**
 * Repo yeni açıldığında içerik ucu kısa bir süre 404/409 verebilir: ilk yazma birkaç kez denenir
 * (0,6 · 1,2 · 1,8 sn arayla). Başka hatalar ve son denemenin hatası yukarı çıkar.
 */
export async function writeToFreshRepo<T>(write: () => Promise<T>, wait: (ms: number) => Promise<void> = sleep): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      const retryable = error instanceof GithubError && (error.status === 404 || error.status === 409);
      if (!retryable || attempt >= FRESH_REPO_RETRIES) throw error;
      await wait(600 * (attempt + 1));
    }
  }
}
