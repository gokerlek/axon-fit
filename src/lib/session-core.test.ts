import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteClient, issueInvite, redeemInvite, revokeAccess, updateClient } from './clients-core.ts';
import {
  APP_REPO,
  clientStore,
  fakeBrowser,
  fakeClock,
  fakeGithub,
  fakeLoginCodes,
  LOGIN_CODE_PATH,
  seedClient,
  sessionStore,
  TEST_ENV,
} from './fake-github.ts';
import { GithubError } from './github/errors.ts';
import { LOGIN_CODE_MAX_PER_HOUR, LOGIN_CODE_MIN_INTERVAL_SECONDS, LOGIN_CODE_TTL_SECONDS, type LoginCode } from './pt-login.ts';
import {
  CLIENT_COOKIE,
  consumeOtp,
  createSession,
  endSession,
  issueLoginCode,
  OTP_COOKIE,
  PT_COOKIE,
  readAnySession,
  readClientSession,
  readPtSession,
  startOtpChallenge,
} from './session-core.ts';

const PT = TEST_ENV.ptEmail;
const OTHER = 'yabanci@example.com';
const LOGIN_READS = `read ${APP_REPO}/${LOGIN_CODE_PATH}`;
const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');

/**
 * Sahte GitHub'la yedek e-posta girişi. `requestCode` = POST /api/auth/otp: çerez yanıttan önce,
 * kod üretimi ve gönderim yanıttan sonra (`after`). `verify` = POST /api/auth/verify.
 */
function loginWorld(options: { appRepo?: 'none' | 'private' | 'public-fork' } = {}) {
  const gh = fakeGithub();
  const clock = fakeClock();
  if (options.appRepo !== 'none') {
    gh.addRepo(APP_REPO, options.appRepo === 'public-fork' ? { private: false, fork: true } : undefined);
  }
  const codes = fakeLoginCodes(gh);
  const mails: { to: string; code: string }[] = [];
  const store = (browser: ReturnType<typeof fakeBrowser>) => sessionStore(gh, clock, browser, codes.store);
  return {
    gh,
    clock,
    codes,
    mails,
    async requestCode(browser: ReturnType<typeof fakeBrowser>, email: string) {
      await startOtpChallenge(store(browser), email);
      const code = await issueLoginCode(store(browser), email);
      if (code) mails.push({ to: email, code });
      return code;
    },
    verify: (browser: ReturnType<typeof fakeBrowser>, email: string, code: string) => consumeOtp(store(browser), code, email),
    state: () => gh.get(APP_REPO, LOGIN_CODE_PATH) as LoginCode | undefined,
  };
}

describe('giriş kodu isteği: kimliksiz, yanıt her adreste aynı', () => {
  test('her adrese aynı çerez kurulur; kod yalnız yönetici adresine; dosyada ne kod ne adres var', async () => {
    const w = loginWorld();
    const pt = fakeBrowser();
    const other = fakeBrowser();
    const code = await w.requestCode(pt, PT);
    assert.match(code ?? '', /^\d{6}$/);
    assert.equal(await w.requestCode(other, OTHER), null);

    assert.deepEqual(pt.sets.map((cookie) => cookie.name), [OTP_COOKIE]);
    assert.deepEqual(other.sets.map((cookie) => cookie.name), [OTP_COOKIE]);
    assert.deepEqual(pt.sets[0]?.options, other.sets[0]?.options);
    const text = JSON.stringify(w.state());
    assert.equal(text.includes(code ?? '-'), false);
    assert.equal(text.includes('@'), false);
  });

  test('yönetici adresi değilse GitHub\'a hiç gidilmez', async () => {
    const w = loginWorld();
    for (let i = 0; i < 100; i += 1) await w.requestCode(fakeBrowser(), OTHER);
    assert.deepEqual(w.gh.calls, []);
  });

  test('oran sınırı önbellekten denetlenir: sınırdaki 100 istek GitHub\'dan en çok bir kez okur, repo\'ya bakmaz', async () => {
    const w = loginWorld();
    const browser = fakeBrowser();
    assert.ok(await w.requestCode(browser, PT));
    const reads = w.gh.count(LOGIN_READS);
    const checks = w.gh.count('repos.get');
    for (let i = 0; i < 100; i += 1) assert.equal(await w.requestCode(browser, PT), null);
    assert.ok(w.gh.count(LOGIN_READS) - reads <= 1, `okuma: ${w.gh.count(LOGIN_READS) - reads}`);
    assert.equal(w.gh.count('repos.get'), checks);
    assert.equal(w.gh.count('write '), 1);
    assert.equal(w.mails.length, 1);
  });

  test('saatlik sınır dolunca da GitHub\'a gidilmez; bir saat dolunca yeni kod', async () => {
    const w = loginWorld();
    const browser = fakeBrowser();
    for (let i = 0; i < LOGIN_CODE_MAX_PER_HOUR; i += 1) {
      assert.ok(await w.requestCode(browser, PT), `${i + 1}. kod`);
      w.clock.advance(LOGIN_CODE_MIN_INTERVAL_SECONDS);
    }
    const reads = w.gh.count(LOGIN_READS);
    for (let i = 0; i < 100; i += 1) assert.equal(await w.requestCode(browser, PT), null);
    assert.ok(w.gh.count(LOGIN_READS) - reads <= 1);
    w.clock.advance(3600);
    assert.ok(await w.requestCode(browser, PT));
  });

  test('taze kurulum (APP_REPO yok): repo önce özel açılır, yeni repo\'ya ilk yazma yeniden denenir, PT girer', async () => {
    const w = loginWorld({ appRepo: 'none' });
    w.gh.failNext('write', LOGIN_CODE_PATH, 404);
    w.gh.failNext('write', LOGIN_CODE_PATH, 409);
    const browser = fakeBrowser();
    const code = await w.requestCode(browser, PT);
    assert.ok(code, 'kod üretilip gönderilmeliydi');
    assert.equal(w.gh.hasRepo(APP_REPO), true);
    assert.equal(w.gh.count(`repos.create ${APP_REPO}`), 1);
    assert.deepEqual(w.codes.waits, [600, 1200]);
    assert.deepEqual(await w.verify(browser, PT, code), { ok: true, email: PT });
  });

  test('APP_REPO açık ya da fork: kod yazılmaz ve gönderilmez, sebep hatada; sonraki istekler repo\'ya bakmaz', async () => {
    const w = loginWorld({ appRepo: 'public-fork' });
    for (let i = 0; i < 100; i += 1) {
      await assert.rejects(w.requestCode(fakeBrowser(), PT), (error) => {
        assert.ok(error instanceof GithubError);
        assert.equal(error.status, 409);
        assert.match(error.message, /fork/);
        return true;
      });
    }
    assert.equal(w.gh.count('write '), 0);
    assert.equal(w.gh.count('repos.create'), 0);
    assert.equal(w.mails.length, 0);
    assert.equal(w.gh.count('repos.get'), 1);
  });
});

describe('giriş kodu denemesi: sayaç sunucuda', () => {
  test('eski çerezi yeniden göndermek sayacı atlatamaz: 3. yanlışta kilit, doğru kod da açmaz', async () => {
    const w = loginWorld();
    const browser = fakeBrowser();
    const code = (await w.requestCode(browser, PT)) ?? '';
    const replayed = browser.values.get(OTP_COOKIE) ?? '';
    const results: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      browser.values.set(OTP_COOKIE, replayed);
      const result = await w.verify(browser, PT, wrongOf(code));
      results.push(result.ok ? 'ok' : result.reason);
    }
    assert.deepEqual(results.slice(0, 3), ['invalid', 'invalid', 'too_many']);
    assert.ok(results.slice(3).every((reason) => reason === 'too_many'));
    browser.values.set(OTP_COOKIE, replayed);
    assert.deepEqual(await w.verify(browser, PT, code), { ok: false, reason: 'too_many' });
    assert.deepEqual([w.state()?.attempts, w.state()?.used], [3, false]);
  });

  test('sayaç yazılamazsa kod hiç karşılaştırılmaz: doğru kod bile açmaz', async () => {
    const w = loginWorld();
    const browser = fakeBrowser();
    const code = (await w.requestCode(browser, PT)) ?? '';
    w.gh.failNext('write', LOGIN_CODE_PATH, 403, 'Giriş kodu denendi');
    await assert.rejects(w.verify(browser, PT, code), (error) => error instanceof GithubError && error.status === 403);
    assert.deepEqual([w.state()?.attempts, w.state()?.used], [0, false]);
    assert.equal(browser.values.has(OTP_COOKIE), true);
  });

  test('aynı anda iki yanlış deneme: sayacı yalnız biri yazar, öteki hiç denenmez', async () => {
    const w = loginWorld();
    const first = fakeBrowser();
    const code = (await w.requestCode(first, PT)) ?? '';
    const second = fakeBrowser({ [OTP_COOKIE]: first.values.get(OTP_COOKIE) ?? '' });
    const outcomes = await Promise.allSettled([w.verify(first, PT, wrongOf(code)), w.verify(second, PT, wrongOf(code))]);
    const summary = outcomes
      .map((outcome) =>
        outcome.status === 'fulfilled'
          ? outcome.value.ok ? 'ok' : outcome.value.reason
          : `hata ${(outcome.reason as GithubError).status}`,
      )
      .sort();
    assert.deepEqual(summary, ['hata 409', 'invalid']);
    assert.equal(w.state()?.attempts, 1);
  });

  test('aynı anda iki doğru kod: yalnız biri girer', async () => {
    const w = loginWorld();
    const first = fakeBrowser();
    const code = (await w.requestCode(first, PT)) ?? '';
    const second = fakeBrowser({ [OTP_COOKIE]: first.values.get(OTP_COOKIE) ?? '' });
    const outcomes = await Promise.allSettled([w.verify(first, PT, code), w.verify(second, PT, code)]);
    const opened = outcomes.filter((outcome) => outcome.status === 'fulfilled' && outcome.value.ok);
    assert.equal(opened.length, 1);
    assert.equal(w.state()?.used, true);
  });

  test('doğru kod bir kez açar ve çerezi siler; süresi dolan kod açmaz', async () => {
    const w = loginWorld();
    const browser = fakeBrowser();
    const code = (await w.requestCode(browser, PT)) ?? '';
    assert.deepEqual(await w.verify(browser, PT, code), { ok: true, email: PT });
    assert.equal(browser.values.has(OTP_COOKIE), false);
    assert.equal((await w.verify(browser, PT, code)).ok, false);

    w.clock.advance(LOGIN_CODE_MIN_INTERVAL_SECONDS);
    const late = fakeBrowser();
    const expiring = (await w.requestCode(late, PT)) ?? '';
    const cookie = late.values.get(OTP_COOKIE) ?? '';
    w.clock.advance(LOGIN_CODE_TTL_SECONDS);
    late.values.set(OTP_COOKIE, cookie);
    assert.deepEqual(await w.verify(late, PT, expiring), { ok: false, reason: 'expired' });
  });

  test('kilitli, kullanılmış ya da kodsuz durumda karar önbellekten: GitHub\'a gidilmez', async () => {
    const w = loginWorld();
    const browser = fakeBrowser();
    const code = (await w.requestCode(browser, PT)) ?? '';
    const cookie = browser.values.get(OTP_COOKIE) ?? '';
    for (let i = 0; i < 3; i += 1) await w.verify(browser, PT, wrongOf(code));
    const before = { reads: w.gh.count(LOGIN_READS), writes: w.gh.count('write ') };
    for (let i = 0; i < 100; i += 1) {
      browser.values.set(OTP_COOKIE, cookie);
      assert.deepEqual(await w.verify(browser, PT, code), { ok: false, reason: 'too_many' });
    }
    assert.ok(w.gh.count(LOGIN_READS) - before.reads <= 1, `okuma: ${w.gh.count(LOGIN_READS) - before.reads}`);
    assert.equal(w.gh.count('write '), before.writes);

    // Kod hiç yokken (ör. yalnız çerez kuruldu) de GitHub'a en çok bir kez gidilir.
    const empty = loginWorld();
    const lonely = fakeBrowser();
    await startOtpChallenge(sessionStore(empty.gh, empty.clock, lonely, empty.codes.store), PT);
    for (let i = 0; i < 100; i += 1) assert.deepEqual(await empty.verify(lonely, PT, '123456'), { ok: false, reason: 'expired' });
    assert.ok(empty.gh.count(LOGIN_READS) <= 1);
  });

  test('başka adres ya da başka adresin çerezi: "kod hatalı", GitHub\'a gidilmez', async () => {
    const w = loginWorld();
    const pt = fakeBrowser();
    const code = (await w.requestCode(pt, PT)) ?? '';
    const calls = w.gh.calls.length;
    assert.deepEqual(await w.verify(pt, OTHER, code), { ok: false, reason: 'invalid' });
    const other = fakeBrowser();
    await w.requestCode(other, OTHER);
    assert.deepEqual(await w.verify(other, OTHER, code), { ok: false, reason: 'invalid' });
    assert.equal(w.gh.calls.length, calls);
  });
});

describe('oturumlar', () => {
  test('PT ve danışan ayrı çerezde: biri ötekini ezmez, çıkış yalnız o rolü kapatır', async () => {
    const gh = fakeGithub();
    const clock = fakeClock();
    const client = seedClient(gh, clock);
    const browser = fakeBrowser();
    const store = sessionStore(gh, clock, browser);
    await createSession(store, { role: 'client', clientId: client.id, accessVersion: 1 });
    await createSession(store, { role: 'pt', via: 'github', subject: 'GokerLek' });
    assert.deepEqual(await readPtSession(store), { role: 'pt', via: 'github', subject: 'GokerLek' });
    assert.deepEqual(await readClientSession(store), { role: 'client', clientId: client.id, accessVersion: 1 });
    await endSession(store, 'pt');
    assert.equal(await readPtSession(store), null);
    assert.notEqual(await readClientSession(store), null);
    assert.ok(browser.sets.every((cookie) => cookie.options.httpOnly && cookie.options.secure && cookie.options.sameSite === 'lax'));
  });

  test('danışan oturumu kare kod anını taşır; şifreyle açılan oturumda alan hiç yok', async () => {
    const gh = fakeGithub();
    const clock = fakeClock();
    const client = seedClient(gh, clock);
    const byCode = fakeBrowser();
    const joinedAt = clock.now().toISOString();
    await createSession(sessionStore(gh, clock, byCode), { role: 'client', clientId: client.id, accessVersion: 1, joinedAt });
    assert.deepEqual(await readClientSession(sessionStore(gh, clock, byCode)), { role: 'client', clientId: client.id, accessVersion: 1, joinedAt });
    const byPassword = fakeBrowser();
    await createSession(sessionStore(gh, clock, byPassword), { role: 'client', clientId: client.id, accessVersion: 1 });
    const session = await readClientSession(sessionStore(gh, clock, byPassword));
    assert.deepEqual(session, { role: 'client', clientId: client.id, accessVersion: 1 });
    assert.equal(session !== null && 'joinedAt' in session, false);
  });

  test('e-postayla açılmış PT oturumu yedek yol kapanınca düşer; GitHub oturumu durur', async () => {
    const gh = fakeGithub();
    const clock = fakeClock();
    const email = fakeBrowser();
    await createSession(sessionStore(gh, clock, email), { role: 'pt', via: 'email', subject: PT });
    const github = fakeBrowser();
    await createSession(sessionStore(gh, clock, github), { role: 'pt', via: 'github', subject: 'gokerlek' });
    const closed = { ...TEST_ENV, emailLogin: false };
    const codes = fakeLoginCodes(gh).store;
    assert.equal(await readPtSession(sessionStore(gh, clock, email, codes, closed)), null);
    assert.notEqual(await readPtSession(sessionStore(gh, clock, github, codes, closed)), null);
    assert.notEqual(await readPtSession(sessionStore(gh, clock, email)), null);
  });

  test('eski düzen: PT çerezindeki danışan oturumu okunur; PT girince kendi çerezine taşınır', async () => {
    const gh = fakeGithub();
    const clock = fakeClock();
    const client = seedClient(gh, clock);
    const legacy = fakeBrowser();
    await createSession(sessionStore(gh, clock, legacy), { role: 'client', clientId: client.id, accessVersion: 1 });
    const browser = fakeBrowser({ [PT_COOKIE]: legacy.values.get(CLIENT_COOKIE) ?? '' });
    const store = sessionStore(gh, clock, browser);
    assert.equal((await readClientSession(store))?.clientId, client.id);
    await createSession(store, { role: 'pt', via: 'github', subject: 'gokerlek' });
    assert.equal(browser.values.get(CLIENT_COOKIE), legacy.values.get(CLIENT_COOKIE));
    assert.equal((await readPtSession(store))?.role, 'pt');
    assert.equal((await readClientSession(store))?.clientId, client.id);
  });
});

describe('iki role açık okuma uçları: danışan çerezi kayıtla doğrulanır (SPEC §5)', () => {
  /** Katılmış danışan: davet → giriş → çerez. */
  async function joinedClient() {
    const gh = fakeGithub();
    const clock = fakeClock();
    const clients = clientStore(gh, clock);
    const client = seedClient(gh, clock);
    const browser = fakeBrowser();
    const join = async () => {
      // Kapatmayla AYNI anda üretilen davet de kapatılmış sayılır (`revokedInvite`); saat ilerler.
      clock.advance(1);
      const { code } = await issueInvite(clients.store, client.id);
      clock.advance(1);
      const joined = await redeemInvite(clients.store, client.id, code);
      assert.ok(joined.ok);
      await createSession(sessionStore(gh, clock, browser), {
        role: 'client',
        clientId: client.id,
        accessVersion: joined.client.access.version,
      });
      clock.advance(1);
    };
    await join();
    return { gh, clock, clients, client, browser, join, session: () => readAnySession(sessionStore(gh, clock, browser)) };
  }

  test('erişim kapatılınca, arşivlenince ya da silinince oturum düşer', async () => {
    const w = await joinedClient();
    assert.deepEqual(await w.session(), { role: 'client', clientId: w.client.id, accessVersion: 1 });

    await revokeAccess(w.clients.store, w.client.id);
    assert.equal(await w.session(), null, 'erişimi kapatılmış');

    await w.join();
    assert.equal((await w.session())?.role, 'client');
    const input = { name: w.client.name, note: '', status: 'archived' as const, healthEnabled: false, healthFields: [] };
    await updateClient(w.clients.store, w.client.id, input);
    assert.equal(await w.session(), null, 'arşivlenmiş');

    await deleteClient(w.clients.store, w.client.id);
    assert.equal(w.gh.hasRepo(`client-${w.client.id}`), false);
    assert.equal(await w.session(), null, 'silinmiş');
  });

  test('PT çerezi geçerliyse danışan kaydı hiç okunmaz', async () => {
    const w = await joinedClient();
    await createSession(sessionStore(w.gh, w.clock, w.browser), { role: 'pt', via: 'github', subject: 'gokerlek' });
    w.gh.failNext('read', 'client.json', 502);
    const calls = w.gh.calls.length;
    assert.equal((await w.session())?.role, 'pt');
    assert.equal(w.gh.calls.length, calls);
  });

  test('kayıt okunamazsa hata fırlar: "erişimin kapandı" denmez, uç hatayı kendisi yanıta çevirir', async () => {
    const w = await joinedClient();
    w.gh.failNext('read', 'client.json', 502);
    await assert.rejects(w.session(), (error) => error instanceof GithubError && error.status === 502);
  });
});
