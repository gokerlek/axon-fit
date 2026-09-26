import { randomUUID } from 'node:crypto';
import * as v from 'valibot';
import type { KdfVersion } from './client-auth.ts';
import { loginGateOf, type ClientStore, type LoginGate } from './clients-core.ts';
import { GithubError } from './github/errors.ts';
import type { LoginCode } from './pt-login.ts';
import { clientSchema, type Client } from './schemas/client.ts';
import type { AuthEnv, CookieJar, CookieOptions, LoginCodeStore, SessionStore, StoredFile } from './session-core.ts';

/**
 * Sahte GitHub ve istek ortamı — YALNIZ testler için (uygulama kodu bunu içe aktarmaz).
 *
 * Dosyalar repo → yol → {metin, sha}. `sha` kilidi gerçek API gibi: dosya varken sha'sız ya da yanlış
 * sha'lı yazma 409, repo yoksa 404. Her iş `calls`'a düşer ("read client-c_x/client.json"). İşler bir
 * tur bekler (`setImmediate`): `Promise.all` ile başlatılan iki istek gerçekteki gibi iç içe geçer.
 * `onNext` bir sonraki uygun işin önünde bir kez çalışır: hata fırlatıp işi düşürebilir ya da araya
 * başka bir istek sokabilir (yarış penceresi).
 */

export const APP_REPO = 'pulsecoach-data';
export const LOGIN_CODE_PATH = 'data/login-code.json';
export const INDEX_PATH = 'data/clients.json';
export const clientRepo = (id: string) => `client-${id}`;

type Op = 'read' | 'write' | 'delete';
type Hook = { op: Op; path: string; message: string | undefined; run: () => Promise<void> | void };
type RepoMeta = { private: boolean; fork: boolean };

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export function fakeGithub() {
  const files = new Map<string, Map<string, { text: string; sha: string }>>();
  const meta = new Map<string, RepoMeta>();
  const calls: string[] = [];
  const hooks: Hook[] = [];

  async function runHook(op: Op, path: string, message?: string) {
    const index = hooks.findIndex((hook) => hook.op === op && hook.path === path && (!hook.message || hook.message === message));
    if (index < 0) return;
    const [hook] = hooks.splice(index, 1);
    await hook?.run();
  }

  const gh = {
    files,
    calls,
    /** Repo açar (varsayılan: özel, fork değil). */
    addRepo(repo: string, repoMeta: RepoMeta = { private: true, fork: false }) {
      if (!files.has(repo)) files.set(repo, new Map());
      meta.set(repo, repoMeta);
    },
    hasRepo: (repo: string) => files.has(repo),
    /** Test kurulumu: dosyayı doğrudan koyar (repo yoksa açar). */
    put(repo: string, path: string, content: unknown) {
      if (!files.has(repo)) gh.addRepo(repo);
      files.get(repo)!.set(path, { text: JSON.stringify(content), sha: randomUUID().slice(0, 8) });
    },
    /** Dosyanın içeriği (yoksa undefined). */
    get(repo: string, path: string): unknown {
      const file = files.get(repo)?.get(path);
      return file ? JSON.parse(file.text) : undefined;
    },
    sha: (repo: string, path: string) => files.get(repo)?.get(path)?.sha,
    /** Bir sonraki uygun işin önünde bir kez çalışır (mesaj verilirse yalnız o mesajlı yazmada). */
    onNext(op: Op, path: string, run: () => Promise<void> | void, message?: string) {
      hooks.push({ op, path, message, run });
    },
    /** Bir sonraki uygun işi bu durum koduyla düşürür. */
    failNext(op: Op, path: string, status: number, message?: string) {
      gh.onNext(op, path, () => {
        throw new GithubError(`${path}: sahte GitHub hatası.`, status);
      }, message);
    },
    count: (prefix: string) => calls.filter((call) => call.startsWith(prefix)).length,

    async read(repo: string, path: string): Promise<StoredFile | null> {
      calls.push(`read ${repo}/${path}`);
      await tick();
      await runHook('read', path);
      const file = files.get(repo)?.get(path);
      return file ? { content: JSON.parse(file.text), sha: file.sha } : null;
    },
    async write(repo: string, path: string, content: unknown, options: { sha?: string | undefined; message: string }): Promise<{ sha: string }> {
      calls.push(`write ${repo}/${path} ${options.message}`);
      await tick();
      await runHook('write', path, options.message);
      const repoFiles = files.get(repo);
      if (!repoFiles) throw new GithubError(`${path}: bulunamadı.`, 404);
      const current = repoFiles.get(path);
      if ((current && current.sha !== options.sha) || (!current && options.sha)) {
        throw new GithubError(`${path}: kayıt sen çalışırken değişti.`, 409);
      }
      const next = { text: JSON.stringify(content), sha: randomUUID().slice(0, 8) };
      repoFiles.set(path, next);
      return { sha: next.sha };
    },
    async delete(repo: string, path: string, options: { sha: string; message: string }): Promise<void> {
      calls.push(`delete ${repo}/${path} ${options.message}`);
      await tick();
      await runHook('delete', path, options.message);
      const current = files.get(repo)?.get(path);
      if (!current) throw new GithubError(`${path}: bulunamadı.`, 404);
      if (current.sha !== options.sha) throw new GithubError(`${path}: kayıt sen çalışırken değişti.`, 409);
      files.get(repo)!.delete(path);
    },
    /** `checkAppRepo`: oluşturmadan bakar; açık ya da fork ise 409. */
    async checkRepo(repo: string): Promise<{ exists: boolean }> {
      calls.push(`repos.get ${repo}`);
      await tick();
      const info = meta.get(repo);
      if (!files.has(repo) || !info) return { exists: false };
      if (info.fork || !info.private) throw new GithubError(`"${repo}" ${info.fork ? 'bir fork' : 'herkese açık'}.`, 409);
      return { exists: true };
    },
    /** `createAppRepo`: yoksa özel açar. */
    async ensureRepo(repo: string): Promise<{ created: boolean }> {
      if ((await gh.checkRepo(repo)).exists) return { created: false };
      calls.push(`repos.create ${repo}`);
      gh.addRepo(repo);
      return { created: true };
    },
    async deleteRepo(repo: string): Promise<void> {
      calls.push(`repos.delete ${repo}`);
      await tick();
      if (!files.delete(repo)) throw new GithubError(`${repo}: bulunamadı.`, 404);
      meta.delete(repo);
    },
  };
  return gh;
}

export type FakeGithub = ReturnType<typeof fakeGithub>;

/** Elle ilerleyen saat. */
export function fakeClock(start = '2026-09-25T10:00:00.000Z') {
  let current = Date.parse(start);
  return {
    now: () => new Date(current),
    advance(seconds: number) {
      current += seconds * 1000;
    },
  };
}

export type FakeClock = ReturnType<typeof fakeClock>;

/** Tarayıcının çerezleri: yazılan çerez sonraki isteklerde gelir; her yazma ve silme kaydedilir. */
export function fakeBrowser(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const sets: { name: string; value: string; options: CookieOptions }[] = [];
  const deleted: string[] = [];
  const jar: CookieJar = {
    get: (name) => values.get(name),
    set: (name, value, options) => {
      values.set(name, value);
      sets.push({ name, value, options });
    },
    delete: (name) => {
      values.delete(name);
      deleted.push(name);
    },
  };
  return { jar, values, sets, deleted };
}

export const TEST_ENV: AuthEnv = {
  secret: 'test-sirri-0123456789abcdef',
  owner: 'gokerlek',
  ptEmail: 'pt@example.com',
  emailLogin: true,
  secureCookies: true,
};

/**
 * `data/login-code.json`'un işleri. `readCached` Next'in veri önbelleği gibi: ilk okumayı saklar,
 * `invalidate`'e kadar GitHub'a gitmez. Repo denetiminin olumsuz sonucu da öyle (`repoProblem`).
 */
export function fakeLoginCodes(gh: FakeGithub) {
  let cached: { value: StoredFile | null } | null = null;
  let problem: { value: string | null } | null = null;
  const waits: number[] = [];
  const store: LoginCodeStore = {
    readCached: async () => {
      cached ??= { value: await gh.read(APP_REPO, LOGIN_CODE_PATH) };
      return structuredClone(cached.value);
    },
    readFresh: () => gh.read(APP_REPO, LOGIN_CODE_PATH),
    write: (state: LoginCode, sha, message) => gh.write(APP_REPO, LOGIN_CODE_PATH, state, { sha, message }),
    invalidate: () => {
      cached = null;
    },
    repoProblem: async () => {
      if (!problem) {
        try {
          await gh.checkRepo(APP_REPO);
          problem = { value: null };
        } catch (error) {
          if (!(error instanceof GithubError && error.status === 409)) throw error;
          problem = { value: error.message };
        }
      }
      return problem.value;
    },
    ensureRepo: () => gh.ensureRepo(APP_REPO),
    wait: async (ms) => {
      waits.push(ms);
    },
  };
  return { store, waits };
}

/** Danışan kaydı: gerçek okuyucu gibi şemadan geçer; bozuksa 500. */
async function readClientRecord(gh: FakeGithub, id: string): Promise<{ client: Client; sha: string } | null> {
  const stored = await gh.read(clientRepo(id), 'client.json');
  if (!stored) return null;
  const parsed = v.safeParse(clientSchema, stored.content);
  if (!parsed.success) throw new GithubError(`${id}: danışan kaydı beklenen biçimde değil.`, 500);
  return { client: parsed.output, sha: stored.sha };
}

/** Tek bir isteğin oturum ortamı: tarayıcının çerezleri, saat ve (aynı) sahte GitHub. */
export function sessionStore(
  gh: FakeGithub,
  clock: FakeClock,
  browser: ReturnType<typeof fakeBrowser>,
  loginCode: LoginCodeStore = fakeLoginCodes(gh).store,
  env: AuthEnv = TEST_ENV,
): SessionStore {
  return {
    cookies: browser.jar,
    env,
    now: clock.now,
    readClient: async (id) => (await readClientRecord(gh, id))?.client ?? null,
    loginCode,
  };
}

/**
 * Danışan akışlarının GitHub işleri. `logs` günlüğe yazılanlar, `indexInvalidations` önbellek düşürmeleri.
 * Giriş özeti (`readLoginGate`) Next'in veri önbelleği gibi: ilk okumayı saklar, o danışanın kaydı ya da
 * `auth.json`'u yazılınca düşer (gerçek depo: `auth-<id>` etiketi).
 */
export function clientStore(gh: FakeGithub, clock: FakeClock, secret = TEST_ENV.secret, { kdf = 1 }: { kdf?: KdfVersion } = {}) {
  const logs: string[] = [];
  let indexInvalidations = 0;
  const gates = new Map<string, LoginGate>();
  const store: ClientStore = {
    secret,
    // Testler hızlı (ilk) özet sürümüyle; güncel sürümün ayarı `client-auth.test.ts`'te sabit.
    kdf,
    now: clock.now,
    readClient: (id) => readClientRecord(gh, id),
    writeClient: async (client, sha, message) => {
      await gh.write(clientRepo(client.id), 'client.json', client, { sha, message });
      gates.delete(client.id);
    },
    readInvite: (id) => gh.read(clientRepo(id), 'invite.json'),
    writeInvite: (id, invite, sha, message) => gh.write(clientRepo(id), 'invite.json', invite, { sha, message }),
    deleteInvite: (id, sha, message) => gh.delete(clientRepo(id), 'invite.json', { sha, message }),
    readAuth: (id) => gh.read(clientRepo(id), 'auth.json'),
    writeAuth: async (id, auth, sha, message) => {
      const written = await gh.write(clientRepo(id), 'auth.json', auth, { sha, message });
      gates.delete(id);
      return written;
    },
    deleteAuth: async (id, sha, message) => {
      await gh.delete(clientRepo(id), 'auth.json', { sha, message });
      gates.delete(id);
    },
    readLoginGate: async (id) => {
      if (!gates.has(id)) {
        const [client, auth] = await Promise.all([readClientRecord(gh, id), gh.read(clientRepo(id), 'auth.json')]);
        gates.set(id, loginGateOf(client?.client ?? null, auth));
      }
      return structuredClone(gates.get(id) as LoginGate);
    },
    readIndex: () => gh.read(APP_REPO, INDEX_PATH),
    writeIndex: async (items, sha, message) => {
      await gh.write(APP_REPO, INDEX_PATH, items, { sha, message });
    },
    invalidateIndex: () => {
      indexInvalidations += 1;
    },
    deleteRepo: async (id) => {
      await gh.deleteRepo(clientRepo(id));
      gates.delete(id);
    },
    log: (message) => {
      logs.push(message);
    },
  };
  return { store, logs, invalidations: () => indexInvalidations };
}

/** Yeni danışan kaydı ve liste satırı (oluşturma akışı GitHub'a değil konuya odaklansın diye). */
export function seedClient(gh: FakeGithub, clock: FakeClock, overrides: Partial<Client> = {}): Client {
  const id = overrides.id ?? `c_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const client: Client = {
    id,
    name: 'Ayşe Demir',
    createdAt: clock.now().toISOString(),
    status: 'active',
    modules: { health: { enabled: false, fields: [] } },
    consents: {},
    access: { version: 1 },
    visibleTo: [],
    ...overrides,
  };
  gh.addRepo(clientRepo(id));
  gh.put(clientRepo(id), 'client.json', client);
  const index = (gh.get(APP_REPO, INDEX_PATH) as { id: string; status: string }[] | undefined) ?? [];
  gh.put(APP_REPO, INDEX_PATH, [...index.filter((item) => item.id !== id), { id, status: client.status }]);
  return client;
}
