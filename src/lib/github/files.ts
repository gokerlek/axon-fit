import 'server-only';
import type { Octokit } from 'octokit';
import { jsonText } from './blob';
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
export async function readJson<T>(
  repo: string,
  path: string,
  options: { ref?: string | undefined; api?: Octokit } = {},
): Promise<StoredFile<T> | null> {
  assertRepoAllowed(repo);
  let sha = '';
  try {
    const response = await (options.api ?? gh()).rest.repos.getContent({
      owner: owner(),
      repo,
      path,
      ...(options.ref ? { ref: options.ref } : {}),
    });
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

/** Yanıttaki `x-ratelimit-remaining`: saatlik kotadan kalan (başlık yoksa null). */
function remainingOf(headers: Record<string, unknown> | undefined): number | null {
  const value = Number(headers?.['x-ratelimit-remaining']);
  return Number.isFinite(value) ? value : null;
}

/**
 * JSON yazar (`sha` kilidiyle). Yanıtın kota başlığı da döner (`remaining`): seans yazıcısı kota
 * azalınca telefona birleştirme penceresini büyütmesini söyler.
 */
export async function writeJson(
  repo: string,
  path: string,
  content: unknown,
  options: { sha?: string | undefined; message: string; api?: Octokit },
): Promise<{ sha: string; remaining: number | null }> {
  assertRepoAllowed(repo);
  try {
    const response = await (options.api ?? gh()).rest.repos.createOrUpdateFileContents({
      owner: owner(),
      repo,
      path,
      message: options.message,
      // Sonda satır sonu: dosyalar git'te düzgün fark verir (`jsonText`; tek commit'le yazılan da aynı metin).
      content: encode(jsonText(content)),
      ...(options.sha ? { sha: options.sha } : {}),
    });
    return { sha: response.data.content?.sha ?? '', remaining: remainingOf(response.headers) };
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

/* --- Git Data API: ağaç okuma ve tek commit'te birden çok dosya --- */

export type RepoHead = { branch: string; commit: string; tree: string };

/** Varsayılan dal adı süreç boyunca saklanır; okuma düşerse silinir, bir sonraki istek yeniden sorar. */
const defaultBranches = new Map<string, string>();

/** Varsayılan dalın ucu: son commit ve kök ağacı (`getBranch` tek istekte ikisini verir). */
export async function repoHead(repo: string, api: Octokit = gh()): Promise<RepoHead> {
  assertRepoAllowed(repo);
  try {
    let branch = defaultBranches.get(repo);
    if (!branch) {
      const { data } = await api.rest.repos.get({ owner: owner(), repo });
      branch = data.default_branch;
      defaultBranches.set(repo, branch);
    }
    const { data } = await api.rest.repos.getBranch({ owner: owner(), repo, branch });
    return { branch, commit: data.commit.sha, tree: data.commit.commit.tree.sha };
  } catch (error) {
    defaultBranches.delete(repo);
    throw toGithubError(error, repo);
  }
}

export type TreeEntry = { path: string; sha: string; type: 'blob' | 'tree' };

/**
 * Git nesneleri kimlikleriyle değişmez: ağaç ve blob içeriği `sha`'ya göre süreç belleğinde saklanabilir,
 * hiç bayatlamaz. Sınır aşılınca en eskisi atılır. (Sunucusuzda örnek başına; en iyi çaba.)
 */
function boundedCache<T>(max: number) {
  const map = new Map<string, T>();
  return {
    get: (key: string) => map.get(key),
    set(key: string, value: T) {
      map.set(key, value);
      if (map.size > max) map.delete(map.keys().next().value as string);
    },
  };
}

const trees = boundedCache<TreeEntry[]>(200);
const blobs = boundedCache<string>(100);

/** Ağacın doğrudan girdileri (özyinelemesiz). Contents API'nin 1.000 girdilik sınırı burada yok. */
export async function listTree(repo: string, treeSha: string, api: Octokit = gh()): Promise<TreeEntry[]> {
  assertRepoAllowed(repo);
  const key = `${repo}@${treeSha}`;
  const cached = trees.get(key);
  if (cached) return cached;
  try {
    const { data } = await api.rest.git.getTree({ owner: owner(), repo, tree_sha: treeSha });
    if (data.truncated) throw new GithubError(`${repo}: klasör listesi GitHub'da kesildi.`, 502);
    const entries = data.tree.flatMap((item): TreeEntry[] =>
      (item.type === 'blob' || item.type === 'tree') && item.path && item.sha ? [{ path: item.path, sha: item.sha, type: item.type }] : [],
    );
    trees.set(key, entries);
    return entries;
  } catch (error) {
    if (error instanceof GithubError) throw error;
    throw toGithubError(error, repo);
  }
}

/** Kök ağaçtaki bir klasörün dosyaları (`klasör/ad`, blob `sha`); klasör yoksa boş. */
export async function listFolder(repo: string, rootTree: string, folder: string, api: Octokit = gh()): Promise<{ path: string; sha: string }[]> {
  const root = await listTree(repo, rootTree, api);
  const dir = root.find((entry) => entry.type === 'tree' && entry.path === folder);
  if (!dir) return [];
  const entries = await listTree(repo, dir.sha, api);
  return entries.filter((entry) => entry.type === 'blob').map((entry) => ({ path: `${folder}/${entry.path}`, sha: entry.sha }));
}

/** Blob'u JSON olarak okur (kimliğiyle; önbellekli). Bozuk JSON `BrokenJsonError`. */
export async function readBlobJson(repo: string, sha: string, api: Octokit = gh()): Promise<unknown> {
  assertRepoAllowed(repo);
  const key = `${repo}@${sha}`;
  let text = blobs.get(key);
  if (text === undefined) {
    try {
      const { data } = await api.rest.git.getBlob({ owner: owner(), repo, file_sha: sha });
      text = data.encoding === 'base64' ? decode(data.content) : data.content;
    } catch (error) {
      throw toGithubError(error, sha);
    }
    blobs.set(key, text);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BrokenJsonError(sha, sha);
  }
}

export type CommitFile = { path: string; content: unknown };

/**
 * Birden çok dosyayı TEK commit'le yazar (tasarım §4.7): ağaç (`base_tree` + satır içi içerik) → commit
 * → dalın ref'i ileri sarılır (`force: false`). Arada dal ilerlediyse (başka bir yazma oldu) GitHub 422
 * verir, burada 409 olur: dosyaların hiçbiri yazılmamıştır; çağıran taze okuyup yeniden hesaplar. Yazma
 * sayısı dosya sayısından bağımsız 3'tür. Metin `writeJson`'la aynı (`jsonText`), blob kimlikleri önceden
 * hesaplanabilir. `deletions`: aynı commit'te silinecek yollar (ağaçta `sha: null`); şimdilik yalnız
 * geliştirmedeki deneme geçmişi kullanır (`demo-seed.ts`).
 */
export async function commitFiles(
  repo: string,
  input: { head: RepoHead; files: readonly CommitFile[]; deletions?: readonly string[] | undefined; message: string },
  api: Octokit = gh(),
): Promise<{ commit: string; remaining: number | null }> {
  assertRepoAllowed(repo);
  try {
    const tree = await api.rest.git.createTree({
      owner: owner(),
      repo,
      base_tree: input.head.tree,
      tree: [
        ...input.files.map((file) => ({ path: file.path, mode: '100644' as const, type: 'blob' as const, content: jsonText(file.content) })),
        ...(input.deletions ?? []).map((path) => ({ path, mode: '100644' as const, type: 'blob' as const, sha: null })),
      ],
    });
    const commit = await api.rest.git.createCommit({
      owner: owner(),
      repo,
      message: input.message,
      tree: tree.data.sha,
      parents: [input.head.commit],
    });
    const ref = await api.rest.git.updateRef({
      owner: owner(),
      repo,
      ref: `heads/${input.head.branch}`,
      sha: commit.data.sha,
      force: false,
    });
    return { commit: commit.data.sha, remaining: remainingOf(ref.headers) };
  } catch (error) {
    throw toGithubError(error, 'commit');
  }
}

/* --- koşullu okuma (ETag): PT'nin canlı görünümü --- */

/**
 * Sık tazelenen okumalar (canlı görünüm, tasarım §4.6) koşullu istekle gider: son yanıtın ETag'i
 * `If-None-Match` olarak gönderilir, değişmediyse GitHub 304 döner ve bu, birincil saatlik kotadan düşmez.
 * Yanıtlar süreç belleğinde (sunucusuzda örnek başına; en iyi çaba), anahtar başına tek kayıt.
 */
const conditionals = boundedCache<{ etag: string; value: unknown }>(300);

function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

async function conditionalGet<D, T>(
  key: string,
  run: (headers: Record<string, string>) => Promise<{ data: D; headers: { etag?: string | undefined } }>,
  map: (data: D) => T,
): Promise<T> {
  const cached = conditionals.get(key);
  try {
    const response = await run(cached ? { 'if-none-match': cached.etag } : {});
    const value = map(response.data);
    if (response.headers.etag) conditionals.set(key, { etag: response.headers.etag, value });
    return value;
  } catch (error) {
    if (cached && statusOf(error) === 304) return cached.value as T;
    throw error;
  }
}

export type CommitRef = { sha: string; date: string };

/** Yola (dosya ya da klasör) dokunan son commit, koşullu; hiç yoksa (ya da repo boşsa) null. */
export async function latestCommit(repo: string, path: string, api: Octokit = gh()): Promise<CommitRef | null> {
  assertRepoAllowed(repo);
  try {
    return await conditionalGet(
      `commits:${repo}:${path}`,
      (headers) => api.rest.repos.listCommits({ owner: owner(), repo, path, per_page: 1, headers }),
      (data): CommitRef | null => {
        const [first] = data;
        const date = first?.commit.committer?.date ?? first?.commit.author?.date;
        return first && date ? { sha: first.sha, date } : null;
      },
    );
  } catch (error) {
    // Hiç commit'i olmayan repo 409 döner.
    if (statusOf(error) === 409) return null;
    throw toGithubError(error, repo);
  }
}

export type ChangedFile = { filename: string; status: string; sha: string | null };

const commitFileLists = boundedCache<ChangedFile[]>(200);

/** Commit'in değiştirdiği dosyalar (commit kimliğiyle değişmez: süreç belleğinde). */
export async function commitChangedFiles(repo: string, sha: string, api: Octokit = gh()): Promise<ChangedFile[]> {
  assertRepoAllowed(repo);
  const key = `${repo}@${sha}`;
  const cached = commitFileLists.get(key);
  if (cached) return cached;
  try {
    const { data } = await api.rest.repos.getCommit({ owner: owner(), repo, ref: sha });
    const files = (data.files ?? []).map((file) => ({ filename: file.filename, status: file.status, sha: file.sha ?? null }));
    commitFileLists.set(key, files);
    return files;
  } catch (error) {
    throw toGithubError(error, sha);
  }
}

/** `readJson`'un koşullu hâli: dosya değişmediyse (304) bellekteki içerik. Yoksa null; bozuk JSON 500. */
export async function readJsonConditional<T>(repo: string, path: string, api: Octokit = gh()): Promise<StoredFile<T> | null> {
  assertRepoAllowed(repo);
  try {
    return await conditionalGet(
      `contents:${repo}:${path}`,
      (headers) => api.rest.repos.getContent({ owner: owner(), repo, path, headers }),
      (data): StoredFile<T> => {
        if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) throw new GithubError(`${path} bir dosya değil.`, 400);
        try {
          return { content: JSON.parse(decode(data.content)) as T, sha: data.sha };
        } catch {
          throw new BrokenJsonError(path, data.sha);
        }
      },
    );
  } catch (error) {
    if (statusOf(error) === 404) return null;
    if (error instanceof GithubError) throw error;
    throw toGithubError(error, path);
  }
}
