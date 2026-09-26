import { GithubError } from '../github/errors.ts';
import type { RepoFiles, WriteOptions } from '../repo-files.ts';

/**
 * Sahte uygulama repo'su — YALNIZ testler için (uygulama kodu bunu içe aktarmaz).
 *
 * Araştırma betiklerindeki sahte Octokit'in (`scripts/dl-review/octokit-mock.mjs` + `helpers.ts`)
 * `RepoFiles` sözleşmesine taşınmış hâli; `github/files.ts` ile GitHub'ın birlikte davranışını taklit eder:
 * - Her dosyanın bir `sha`'sı var. Eski `sha` ile, var olan dosyaya `sha`'sız ya da silinmiş dosyaya
 *   `sha`'lı yazma 409 (`…: kayıt sen çalışırken değişti.`, `toGithubError`'daki gibi).
 * - JSON metin olarak saklanır (`JSON.stringify(…, null, 2)`) ve okurken ayrıştırılır: `undefined`
 *   alanlar gerçekteki gibi düşer. Bozuk metin 500 (`… bozuk JSON içeriyor.`).
 * - `failNext` o yoldaki bir sonraki işi bir kez düşürür (yarıda kalan silme, çakışma). Okuma 404'ü
 *   gerçekteki gibi "dosya yok" (`null`) sayılır.
 * - Her iş sırasıyla `log`'a düşer; `changes()` yalnız yazma ve silmeleri verir (sıra denetimi).
 */

type Op = 'read' | 'write' | 'delete';
type Entry = { text?: string; bytes?: Uint8Array; sha: string };
export type LogEntry = { op: Op; path: string; message?: string };

/** `github/client.ts` `toGithubError` ile aynı eşleme: 409/422 çakışma, 404, 403, 401, gerisi 502. */
function githubError(path: string, status: number): GithubError {
  if (status === 409 || status === 422) return new GithubError(`${path}: kayıt sen çalışırken değişti.`, 409);
  if (status === 404) return new GithubError(`${path}: bulunamadı.`, 404);
  if (status === 403) return new GithubError(`${path}: GitHub izin vermedi (yetki ya da istek sınırı).`, 403);
  if (status === 401) return new GithubError(`${path}: GitHub anahtarı geçersiz.`, 401);
  return new GithubError(`${path}: GitHub'a ulaşılamadı.`, 502);
}

export function fakeRepo(initial: Record<string, unknown> = {}) {
  const stored = new Map<string, Entry>();
  const failures: { op: Op; path: string; status: number }[] = [];
  const log: LogEntry[] = [];
  let counter = 0;
  const nextSha = () => `sha-${++counter}`;

  /** Bu yoldaki işe ayrılmış hata varsa bir kez döner. */
  function failure(op: Op, path: string): number | null {
    const index = failures.findIndex((item) => item.op === op && item.path === path);
    if (index < 0) return null;
    return failures.splice(index, 1)[0]?.status ?? null;
  }

  /** Yazma kilidi: dosya varsa `sha`'sı eşleşmeli, yoksa `sha` verilmemeli. */
  function checkSha(path: string, sha: string | undefined) {
    const current = stored.get(path);
    if (current ? current.sha !== sha : sha !== undefined) throw githubError(path, current && !sha ? 422 : 409);
  }

  const files: RepoFiles = {
    async readJson(path) {
      log.push({ op: 'read', path });
      const status = failure('read', path);
      if (status === 404) return null;
      if (status !== null) throw githubError(path, status);
      const entry = stored.get(path);
      if (!entry) return null;
      try {
        return { content: JSON.parse(entry.text ?? '') as unknown, sha: entry.sha };
      } catch {
        throw new GithubError(`${path} bozuk JSON içeriyor.`, 500);
      }
    },
    async writeJson(path, content, options: WriteOptions) {
      log.push({ op: 'write', path, message: options.message });
      const status = failure('write', path);
      if (status !== null) throw githubError(path, status);
      checkSha(path, options.sha);
      const sha = nextSha();
      stored.set(path, { text: `${JSON.stringify(content, null, 2)}\n`, sha });
      return { sha };
    },
    async getFileSha(path) {
      log.push({ op: 'read', path });
      const status = failure('read', path);
      if (status === 404) return null;
      if (status !== null) throw githubError(path, status);
      return stored.get(path)?.sha ?? null;
    },
    async writeBinary(path, bytes, options: WriteOptions) {
      log.push({ op: 'write', path, message: options.message });
      const status = failure('write', path);
      if (status !== null) throw githubError(path, status);
      checkSha(path, options.sha);
      const sha = nextSha();
      stored.set(path, { bytes: new Uint8Array(bytes), sha });
      return { sha };
    },
    async deleteFile(path, options) {
      log.push({ op: 'delete', path, message: options.message });
      const status = failure('delete', path);
      if (status !== null) throw githubError(path, status);
      const current = stored.get(path);
      if (!current) throw githubError(path, 404);
      if (current.sha !== options.sha) throw githubError(path, 409);
      stored.delete(path);
    },
  };

  const repo = {
    files,
    log,
    /** Dosyayı doğrudan koyar: test kurulumu ya da PT'nin GitHub'da elle düzenlemesi (`sha` değişir). */
    put(path: string, json: unknown) {
      stored.set(path, { text: `${JSON.stringify(json, null, 2)}\n`, sha: nextSha() });
    },
    /** Ham metin (bozuk JSON denemek için). */
    putText(path: string, text: string) {
      stored.set(path, { text, sha: nextSha() });
    },
    putBinary(path: string, bytes: Uint8Array) {
      stored.set(path, { bytes: new Uint8Array(bytes), sha: nextSha() });
    },
    /** Dosyanın şu anki JSON içeriği (yoksa `undefined`). */
    get(path: string): unknown {
      const text = stored.get(path)?.text;
      return text === undefined ? undefined : (JSON.parse(text) as unknown);
    },
    bytes: (path: string): Uint8Array | undefined => stored.get(path)?.bytes,
    has: (path: string) => stored.has(path),
    sha: (path: string) => stored.get(path)?.sha,
    paths: () => [...stored.keys()].sort(),
    /** O yoldaki bir sonraki `op` işini bu GitHub durum koduyla düşürür (bir kez). */
    failNext(op: Op, path: string, status: number) {
      failures.push({ op, path, status });
    },
    /** Yazma ve silmeler, sırayla. */
    changes: () => log.filter((entry) => entry.op !== 'read'),
  };

  for (const [path, json] of Object.entries(initial)) repo.put(path, json);
  return repo;
}

export type FakeRepo = ReturnType<typeof fakeRepo>;
