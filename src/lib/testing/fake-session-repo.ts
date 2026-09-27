import { gitBlobSha, jsonText } from '../github/blob.ts';
import { GithubError } from '../github/errors.ts';
import type { RepoHead, SessionRepo, StoredJson } from '../session-files-core.ts';

/**
 * Sahte danışan repo'su, antrenman dosyaları için — YALNIZ testler için (uygulama kodu bunu içe aktarmaz).
 *
 * Git gibi davranır: her yazma yeni bir commit'tir ve commit'ler dosyaların tam anlık görüntüsünü tutar.
 * Böylece "bitiş tek commit" ve "değişiklik yoksa yazma yok" commit sayısıyla denetlenir. `sha`'lar gerçek
 * blob kimlikleridir (`gitBlobSha(jsonText(…))`): index satırındaki `sha` dosyanınkiyle aynı çıkmalı.
 * - `write` (Contents API): dosya varken `sha`'sız ya da eski `sha`'lı yazma 409.
 * - `commit` (Git Data API): taban dalın ucu değilse 409 (ileri sarma değil).
 * - `read(path, ref)`: o commit'teki hâl; bozuk metin 500.
 * - İşler bir tur bekler (`setImmediate`): `Promise.all` ile başlatılan istekler iç içe geçer.
 * - `onNext(op, …)` bir sonraki uygun işin önünde bir kez çalışır (araya yazma sokmak, hata fırlatmak).
 */

type Op = 'head' | 'read' | 'write' | 'commit' | 'tree' | 'blob';
type Snapshot = Map<string, { text: string; sha: string }>;
type Commit = { id: string; files: Snapshot; message: string };

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export function fakeSessionRepo(initial: Record<string, unknown> = {}) {
  const commits = new Map<string, Commit>();
  const history: string[] = [];
  const calls: string[] = [];
  const logs: string[] = [];
  const invalidated: string[] = [];
  let noticeDrops = 0;
  const hooks: { op: Op; path: string | undefined; run: () => Promise<void> | void }[] = [];
  let remaining: number | null = 4000;

  function addCommit(files: Snapshot, message: string): string {
    const id = `c${history.length}`;
    commits.set(id, { id, files, message });
    history.push(id);
    return id;
  }
  const headId = () => history.at(-1) as string;
  const snapshot = (id: string = headId()) => {
    const commit = commits.get(id);
    if (!commit) throw new GithubError(`${id}: bulunamadı.`, 404);
    return commit.files;
  };
  const entry = (content: unknown) => {
    const text = jsonText(content);
    return { text, sha: gitBlobSha(text) };
  };

  async function hook(op: Op, path?: string) {
    await tick();
    const index = hooks.findIndex((item) => item.op === op && (item.path === undefined || item.path === path));
    if (index < 0) return;
    const [found] = hooks.splice(index, 1);
    await found?.run();
  }

  addCommit(new Map(Object.entries(initial).map(([path, content]) => [path, entry(content)])), 'Başlangıç');

  const repo: SessionRepo = {
    async head(): Promise<RepoHead> {
      calls.push('head');
      await hook('head');
      const commit = headId();
      return { branch: 'main', commit, tree: `tree-${commit}` };
    },
    async read(path, ref): Promise<StoredJson | null> {
      calls.push(ref ? `read ${path}@${ref}` : `read ${path}`);
      await hook('read', path);
      const file = snapshot(ref).get(path);
      if (!file) return null;
      try {
        return { content: JSON.parse(file.text) as unknown, sha: file.sha };
      } catch {
        throw new GithubError(`${path} bozuk JSON içeriyor.`, 500);
      }
    },
    async readBlob(sha) {
      calls.push(`blob ${sha.slice(0, 7)}`);
      await hook('blob');
      for (const commit of commits.values()) {
        for (const file of commit.files.values()) if (file.sha === sha) return JSON.parse(file.text) as unknown;
      }
      throw new GithubError(`${sha}: bulunamadı.`, 404);
    },
    async listSessions(tree) {
      calls.push(`tree ${tree}`);
      await hook('tree');
      const files = snapshot(tree.replace(/^tree-/, ''));
      return [...files.entries()]
        .filter(([path]) => /^sessions\/[^/]+$/.test(path))
        .map(([path, file]) => ({ path, sha: file.sha }));
    },
    async listFolder(tree, folder) {
      calls.push(`tree ${tree} ${folder}`);
      await hook('tree', folder);
      const files = snapshot(tree.replace(/^tree-/, ''));
      return [...files.entries()]
        .filter(([path]) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes('/'))
        .map(([path, file]) => ({ path, sha: file.sha }));
    },
    async write(path, content, options) {
      calls.push(`write ${path} ${options.message}`);
      await hook('write', path);
      const files = new Map(snapshot());
      const current = files.get(path);
      if (current ? current.sha !== options.sha : options.sha !== undefined) throw new GithubError(`${path}: kayıt sen çalışırken değişti.`, 409);
      const next = entry(content);
      files.set(path, next);
      addCommit(files, options.message);
      return { sha: next.sha, remaining };
    },
    async commit(input) {
      calls.push(`commit ${input.message}`);
      await hook('commit');
      if (input.head.commit !== headId()) throw new GithubError('commit: kayıt sen çalışırken değişti.', 409);
      const files = new Map(snapshot());
      for (const file of input.files) files.set(file.path, entry(file.content));
      for (const path of input.deletions ?? []) files.delete(path);
      const id = addCommit(files, input.message);
      return { commit: id, remaining };
    },
    invalidate(id) {
      invalidated.push(id);
    },
    noticesChanged() {
      noticeDrops += 1;
    },
    log(message) {
      logs.push(message);
    },
  };

  return {
    repo,
    calls,
    logs,
    invalidated,
    /** PT'nin bildirim özeti kaç kez düşürüldü. */
    noticeDrops: () => noticeDrops,
    /** Dalın ucundaki içerik (yoksa `undefined`). */
    get(path: string): unknown {
      const file = snapshot().get(path);
      return file ? (JSON.parse(file.text) as unknown) : undefined;
    },
    sha: (path: string) => snapshot().get(path)?.sha,
    paths: () => [...snapshot().keys()].sort(),
    /** Dışarıdan bir yazma (PT'nin kaydı, elle düzenleme): yeni commit. */
    put(path: string, content: unknown, message = 'Dışarıdan yazma') {
      const files = new Map(snapshot());
      files.set(path, entry(content));
      addCommit(files, message);
    },
    putText(path: string, text: string, message = 'Dışarıdan yazma') {
      const files = new Map(snapshot());
      files.set(path, { text, sha: gitBlobSha(text) });
      addCommit(files, message);
    },
    remove(path: string, message = 'Dışarıdan silme') {
      const files = new Map(snapshot());
      files.delete(path);
      addCommit(files, message);
    },
    /** Başlangıçtan sonraki commit sayısı. */
    commitCount: () => history.length - 1,
    /** Başlangıçtan sonraki commit mesajları, eskiden yeniye. */
    messages: () => history.slice(1).map((id) => commits.get(id)?.message ?? ''),
    /** Son commit'te değişen yollar. */
    lastChanged(): string[] {
      const last = commits.get(headId());
      const before = commits.get(history.at(-2) ?? '');
      if (!last) return [];
      const paths = new Set([...last.files.keys(), ...(before?.files.keys() ?? [])]);
      return [...paths].filter((path) => last.files.get(path)?.sha !== before?.files.get(path)?.sha).sort();
    },
    onNext(op: Op, run: () => Promise<void> | void, path?: string) {
      hooks.push({ op, path, run });
    },
    failNext(op: Op, error: GithubError, path?: string) {
      hooks.push({
        op,
        path,
        run: () => {
          throw error;
        },
      });
    },
    setRemaining(value: number | null) {
      remaining = value;
    },
  };
}

export type FakeSessionRepo = ReturnType<typeof fakeSessionRepo>;
