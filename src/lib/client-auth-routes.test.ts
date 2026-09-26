import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  joinRoute,
  LOGIN_DENIED,
  passwordLoginRoute,
  postGuard,
  setPasswordRoute,
  type RouteResult,
} from './client-auth-routes.ts';
import { issueInvite, loginWithPassword, redeemInvite, revokeAccess, setClientPassword, updateClient } from './clients-core.ts';
import { APP_REPO, clientStore, fakeClock, fakeGithub, INDEX_PATH, seedClient } from './fake-github.ts';
import type { ClientSession } from './session-core.ts';

const SIFRE = 'mavi-deniz-42';

function world() {
  const gh = fakeGithub();
  const clock = fakeClock();
  gh.addRepo(APP_REPO);
  gh.put(APP_REPO, INDEX_PATH, []);
  const clients = clientStore(gh, clock);
  const sessions: ClientSession[] = [];
  const logs: string[] = [];
  const known = async (id: string) => ((gh.get(APP_REPO, INDEX_PATH) as { id: string }[]) ?? []).some((row) => row.id === id);
  let loginCalls = 0;
  const deps = {
    isKnownClient: known,
    createSession: async (session: ClientSession) => {
      sessions.push(session);
    },
    log: (message: string) => {
      logs.push(message);
    },
  };
  return {
    gh,
    clock,
    ...clients,
    sessions,
    routeLogs: logs,
    loginCalls: () => loginCalls,
    login: (body: unknown) =>
      passwordLoginRoute(
        {
          ...deps,
          login: (id, password) => {
            loginCalls += 1;
            return loginWithPassword(clients.store, id, password);
          },
        },
        body,
      ),
    join: (body: unknown) => joinRoute({ ...deps, redeem: (id, code) => redeemInvite(clients.store, id, code) }, body),
    setPassword: (session: ClientSession | null, body: unknown) =>
      setPasswordRoute({ session, setPassword: (s, password) => setClientPassword(clients.store, s, password), log: deps.log }, body),
  };
}

async function joined(w: ReturnType<typeof world>, id: string): Promise<ClientSession> {
  const { code } = await issueInvite(w.store, id);
  const result = await w.join({ clientId: id, code });
  assert.equal(result.status, 200);
  return w.sessions.at(-1) as ClientSession;
}

const denied: RouteResult = { status: 401, body: { error: LOGIN_DENIED } };

describe('/api/giris çekirdeği: tek tip yanıt, bilinmeyen kimlik GitHub\'a gitmez, oturum', () => {
  test('bozuk kimlik, bilinmeyen, şifresiz, yanlış, kilitli, kapalı, arşivde: hepsi aynı 401', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const other = seedClient(w.gh, w.clock);
    const session = await joined(w, client.id);
    assert.deepEqual(await w.login({ clientId: other.id, password: SIFRE }), denied, 'şifresiz');
    assert.equal((await w.setPassword(session, { password: SIFRE, confirm: SIFRE })).status, 200);

    const calls = w.gh.calls.length;
    assert.deepEqual(await w.login({ clientId: 'c_bilinmiyor1', password: SIFRE }), denied, 'bilinmeyen');
    assert.deepEqual(await w.login({ clientId: '../app', password: SIFRE }), denied, 'bozuk kimlik');
    assert.equal(w.gh.calls.length, calls, 'bilinmeyen ve bozuk kimlik GitHub\'a gitmez');
    assert.equal(w.loginCalls(), 1);

    for (let deneme = 0; deneme < 5; deneme += 1) assert.deepEqual(await w.login({ clientId: client.id, password: `yanlis-${deneme}` }), denied);
    assert.deepEqual(await w.login({ clientId: client.id, password: SIFRE }), denied, 'kilitli');
    w.clock.advance(15 * 60);
    await updateClient(w.store, client.id, { name: client.name, note: '', status: 'archived', healthEnabled: false, healthFields: [] });
    assert.deepEqual(await w.login({ clientId: client.id, password: SIFRE }), denied, 'arşivde');
    assert.equal(w.sessions.length, 1, 'yalnız kare kodla açılan oturum');
  });

  test('doğru şifre: kayıttaki kuşakla oturum, kare kod anı YOK (şifre değiştiremez)', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joined(w, client.id);
    assert.ok(session.joinedAt, 'kare kodla açılan oturum anı taşır');
    await w.setPassword(session, { password: SIFRE, confirm: SIFRE });
    w.clock.advance(60);
    await revokeAccess(w.store, client.id);
    w.clock.advance(1);
    const fresh = await joined(w, client.id);
    await w.setPassword(fresh, { password: SIFRE, confirm: SIFRE });
    assert.deepEqual(await w.login({ clientId: client.id, password: SIFRE }), { status: 200, body: { ok: true } });
    assert.deepEqual(w.sessions.at(-1), { role: 'client', clientId: client.id, accessVersion: 2 });
  });

  test('GitHub hatası: 502, "şifre yanlış" denmez; sebep günlüğe, şifre yazılmaz', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    w.gh.failNext('read', 'client.json', 502);
    const result = await w.login({ clientId: client.id, password: SIFRE });
    assert.equal(result.status, 502);
    assert.equal(w.routeLogs.length, 1);
    assert.match(w.routeLogs[0] ?? '', /502/);
    assert.equal(w.routeLogs[0]?.includes(SIFRE), false);
  });
});

describe('/api/me/password çekirdeği', () => {
  test('oturum yok 401; zayıf ve uyuşmayan şifre alan hatasıyla 400; izinsiz oturum 409; kapatılmış oturum 401', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    assert.equal((await w.setPassword(null, { password: SIFRE, confirm: SIFRE })).status, 401);
    const session = await joined(w, client.id);
    const short = await w.setPassword(session, { password: '1234567', confirm: '1234567' });
    assert.equal(short.status, 400);
    assert.match(String((short.body.fields as Record<string, string>).password), /en az 8/);
    const mismatch = await w.setPassword(session, { password: SIFRE, confirm: `${SIFRE}!` });
    assert.equal((mismatch.body.fields as Record<string, string>).confirm, 'Şifreler aynı değil.');
    assert.equal((await w.setPassword(session, { password: SIFRE, confirm: SIFRE })).status, 200);

    const byPassword: ClientSession = { role: 'client', clientId: client.id, accessVersion: 1 };
    assert.equal((await w.setPassword(byPassword, { password: 'turuncu-dag-77', confirm: 'turuncu-dag-77' })).status, 409);
    await revokeAccess(w.store, client.id);
    assert.equal((await w.setPassword(session, { password: 'turuncu-dag-77', confirm: 'turuncu-dag-77' })).status, 401);
  });
});

describe('/api/join çekirdeği', () => {
  test('doğru kod: oturum kodun kullanıldığı anı taşır; yanlış kod 401, oturum yok', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const { code } = await issueInvite(w.store, client.id);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    assert.equal((await w.join({ clientId: client.id, code: wrong })).status, 401);
    assert.equal(w.sessions.length, 0);
    assert.equal((await w.join({ clientId: client.id, code })).status, 200);
    assert.deepEqual(w.sessions[0], { role: 'client', clientId: client.id, accessVersion: 1, joinedAt: w.clock.now().toISOString() });
  });
});

describe('durum değiştiren POST\'lar: yalnız aynı köken ve JSON (giriş CSRF\'si)', () => {
  const site = 'https://pt.example.com';
  const headers = (entries: Record<string, string>) => new Headers(entries);
  test('başka köken 403, köken yoksa Referer; ikisi de yoksa 403; JSON değilse 415', () => {
    const json = { 'content-type': 'application/json' };
    assert.equal(postGuard(headers({ ...json, origin: site }), site), null);
    assert.equal(postGuard(headers({ ...json, referer: `${site}/giris?c=c_abc123` }), site), null);
    assert.equal(postGuard(headers({ ...json, origin: 'https://kotu.example' }), site)?.status, 403);
    assert.equal(postGuard(headers({ ...json, origin: 'null' }), site)?.status, 403);
    assert.equal(postGuard(headers(json), site)?.status, 403);
    assert.equal(postGuard(headers({ origin: site, 'content-type': 'text/plain' }), site)?.status, 415);
    assert.equal(postGuard(headers({ origin: site, 'content-type': 'application/x-www-form-urlencoded' }), site)?.status, 415);
  });
});
