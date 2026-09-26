import 'server-only';
import { assertRepoAllowed, gh, GithubError, owner, toGithubError } from './client';
import { BrokenJsonError } from './errors';

/**
 * Repo içindeki dosya işlemleri (JSON ve ikili dosyalar).
 *
 * Yazmada `sha` iyimser kilit görevi görür: dosya biz okuduktan sonra değiştiyse
 * GitHub reddeder ve burası 409 üretir. Üst katman (React Query) bu durumda bir kez
 * yeniden dener; veri katmanı güncel `sha` ile tekrar yazar.
 */

export type StoredFile<T> = { content: T; sha: string };

function decode(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf8');
}

function encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/**
 * Dosya yoksa null. İçerik JSON değilse `BrokenJsonError` (500): üzerine boş kayıt yazılıp veri
 * kaybolmasın; hata aynı okumanın `sha`'sını taşır, onarmak isteyen (ayar sihirbazı) onunla yazar.
 */
export async function readJson<T>(repo: string, path: string): Promise<StoredFile<T> | null> {
  assertRepoAllowed(repo);
  let sha = '';
  try {
    const response = await gh().rest.repos.getContent({ owner: owner(), repo, path });
    const data = response.data;
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      throw new GithubError(`${path} bir dosya değil.`, 400);
    }
    sha = data.sha;
    return { content: JSON.parse(decode(data.content)) as T, sha: data.sha };
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return null;
    if (error instanceof SyntaxError) throw new BrokenJsonError(path, sha);
    throw toGithubError(error, path);
  }
}

/**
 * Dosyanın yalnız `sha`'sını verir (içeriğini ayrıştırmadan).
 * İkili dosyaların üzerine yazarken gerekir: JSON okuyucu burada kullanılamaz.
 */
export async function getFileSha(repo: string, path: string): Promise<string | null> {
  assertRepoAllowed(repo);
  try {
    const response = await gh().rest.repos.getContent({ owner: owner(), repo, path });
    const data = response.data;
    if (Array.isArray(data) || data.type !== 'file') return null;
    return data.sha;
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return null;
    throw toGithubError(error, path);
  }
}

export async function readBinary(repo: string, path: string): Promise<{ bytes: Uint8Array; sha: string } | null> {
  assertRepoAllowed(repo);
  try {
    const response = await gh().rest.repos.getContent({ owner: owner(), repo, path });
    const data = response.data;
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) return null;
    return { bytes: new Uint8Array(Buffer.from(data.content, 'base64')), sha: data.sha };
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return null;
    throw toGithubError(error, path);
  }
}

export async function writeJson(
  repo: string,
  path: string,
  content: unknown,
  options: { sha?: string | undefined; message: string },
): Promise<{ sha: string }> {
  assertRepoAllowed(repo);
  try {
    const response = await gh().rest.repos.createOrUpdateFileContents({
      owner: owner(),
      repo,
      path,
      message: options.message,
      // Sonda satır sonu: dosyalar git'te düzgün fark verir.
      content: encode(`${JSON.stringify(content, null, 2)}\n`),
      ...(options.sha ? { sha: options.sha } : {}),
    });
    return { sha: response.data.content?.sha ?? '' };
  } catch (error) {
    throw toGithubError(error, path);
  }
}

export async function writeBinary(
  repo: string,
  path: string,
  bytes: Uint8Array,
  options: { sha?: string | undefined; message: string },
): Promise<{ sha: string }> {
  assertRepoAllowed(repo);
  try {
    const response = await gh().rest.repos.createOrUpdateFileContents({
      owner: owner(),
      repo,
      path,
      message: options.message,
      content: Buffer.from(bytes).toString('base64'),
      ...(options.sha ? { sha: options.sha } : {}),
    });
    return { sha: response.data.content?.sha ?? '' };
  } catch (error) {
    throw toGithubError(error, path);
  }
}

export async function deleteFile(
  repo: string,
  path: string,
  options: { sha: string; message: string },
): Promise<void> {
  assertRepoAllowed(repo);
  try {
    await gh().rest.repos.deleteFile({
      owner: owner(),
      repo,
      path,
      message: options.message,
      sha: options.sha,
    });
  } catch (error) {
    throw toGithubError(error, path);
  }
}

export type DirEntry = { name: string; path: string; sha: string; type: 'file' | 'dir' };

/** Klasör listesi. Klasör yoksa boş dizi döner (hata değil: henüz yazılmamış demektir). */
export async function listDir(repo: string, path: string): Promise<DirEntry[]> {
  assertRepoAllowed(repo);
  try {
    const response = await gh().rest.repos.getContent({ owner: owner(), repo, path });
    if (!Array.isArray(response.data)) return [];
    return response.data
      .filter((item) => item.type === 'file' || item.type === 'dir')
      .map((item) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        type: item.type as 'file' | 'dir',
      }));
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return [];
    throw toGithubError(error, path);
  }
}
