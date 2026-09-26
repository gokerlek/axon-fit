import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {
  beginLoginCodeAttempt,
  finishLoginCodeAttempt,
  hashLoginCode,
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_MAX_PER_HOUR,
  LOGIN_CODE_MIN_INTERVAL_SECONDS,
  LOGIN_CODE_TTL_SECONDS,
  loginCodeSchema,
  loginCodeStatus,
  ptSessionFromPayload,
  requestLoginCode,
  type LoginCode,
} from './pt-login.ts';

const SIR = 'test-sirri';
const PT = 'pt@example.com';
const simdi = new Date('2026-09-25T10:00:00.000Z');
const sn = (saniye: number) => new Date(simdi.getTime() + saniye * 1000);

/** Oran sınırı içinde yeni kod (yoksa test düşer). */
function yeniKod(current: LoginCode | null, an: Date) {
  const request = requestLoginCode(current, { secret: SIR, email: PT, now: an });
  assert.ok(request.ok, 'kod üretilmeliydi');
  return request;
}

/** Sunucunun sırası: önce sayılmış durum "yazılır", ancak sonra kod karşılaştırılır. */
function dene(state: LoginCode | null, code: string, an = sn(10)) {
  const begun = beginLoginCodeAttempt(state, { secret: SIR, email: PT, now: an });
  if (!begun.ok) return { state, result: begun };
  const result = finishLoginCodeAttempt(begun.counted, { secret: SIR, code, now: an });
  return { state: result.ok ? result.used : begun.counted, result };
}

const yanlis = (code: string) => (code === '000000' ? '111111' : '000000');

describe('PT oturumu', () => {
  const env = { owner: 'GokerLek', ptEmail: PT, emailLogin: true };
  const github = { role: 'pt', via: 'github', subject: 'gokerlek' };
  const eposta = { role: 'pt', via: 'email', subject: PT };

  test('GitHub oturumu repoların sahibine açık (büyük/küçük harf duyarsız)', () => {
    assert.deepEqual(ptSessionFromPayload(github, env), github);
    assert.equal(ptSessionFromPayload({ ...github, subject: 'baskasi' }, env), null);
  });

  test('e-postayla açılmış oturum yalnız yol açıkken geçerli: RESEND_API_KEY kaldırılınca düşer', () => {
    assert.deepEqual(ptSessionFromPayload(eposta, env), eposta);
    assert.equal(ptSessionFromPayload(eposta, { ...env, emailLogin: false }), null);
    // GitHub oturumu e-posta yolunun kapanmasından etkilenmez.
    assert.deepEqual(ptSessionFromPayload(github, { ...env, emailLogin: false }), github);
  });

  test('PT_EMAIL boşsa ya da adres başkasıysa e-posta oturumu yok', () => {
    assert.equal(ptSessionFromPayload({ ...eposta, subject: '' }, { ...env, ptEmail: '' }), null);
    assert.equal(ptSessionFromPayload({ ...eposta, subject: 'baska@example.com' }, env), null);
  });

  test('rolü, yolu ya da kimliği eksik yük reddedilir', () => {
    assert.equal(ptSessionFromPayload({ ...github, role: 'client' }, env), null);
    assert.equal(ptSessionFromPayload({ ...github, via: 'sms' }, env), null);
    assert.equal(ptSessionFromPayload({ role: 'pt', subject: 'gokerlek' }, env), null);
    assert.equal(ptSessionFromPayload({ role: 'pt', via: 'github' }, env), null);
  });
});

describe('giriş kodu: istek ve oran sınırı', () => {
  test('dosyada ne kod ne adres var, yalnız özetleri; kod 6 hane, 5 dakika geçerli', () => {
    const { code, state } = yeniKod(null, simdi);
    assert.match(code, new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`));
    const degerler = Object.values(state).flat();
    assert.equal(degerler.includes(code), false);
    assert.equal(degerler.some((deger) => String(deger).includes('@')), false);
    assert.equal(state.codeHash, hashLoginCode(SIR, code));
    assert.equal(Date.parse(state.expiresAt) - simdi.getTime(), LOGIN_CODE_TTL_SECONDS * 1000);
    assert.deepEqual([state.attempts, state.used, state.issuedAt], [0, false, [simdi.toISOString()]]);
    assert.equal(v.safeParse(loginCodeSchema, state).success, true);
  });

  test('en çok dakikada bir: erken istek kod üretmez ve etkin kodu bozmaz', () => {
    const ilk = yeniKod(null, simdi);
    assert.deepEqual(requestLoginCode(ilk.state, { secret: SIR, email: PT, now: sn(LOGIN_CODE_MIN_INTERVAL_SECONDS - 1) }), {
      ok: false,
      reason: 'too_soon',
    });
    // Erken istek hiçbir şey yazmaz: ilk kod hâlâ açar.
    assert.equal(dene(ilk.state, ilk.code, sn(30)).result.ok, true);
  });

  test('yeni kod eskisinin yerine geçer: aynı anda tek etkin kod', () => {
    const ilk = yeniKod(null, simdi);
    const ikinci = yeniKod(ilk.state, sn(LOGIN_CODE_MIN_INTERVAL_SECONDS));
    assert.equal(dene(ikinci.state, ikinci.code, sn(70)).result.ok, true);
    // Eski kod yalnız yenisiyle tesadüfen aynıysa açar (10⁻⁶).
    assert.equal(dene(ikinci.state, ilk.code, sn(70)).result.ok, ilk.code === ikinci.code);
  });

  test('saatte en çok 5 kod; en eskisi bir saati doldurunca yer açılır', () => {
    let state: LoginCode | null = null;
    for (let i = 0; i < LOGIN_CODE_MAX_PER_HOUR; i += 1) state = yeniKod(state, sn(i * 60)).state;
    assert.deepEqual(requestLoginCode(state, { secret: SIR, email: PT, now: sn(5 * 60) }), { ok: false, reason: 'hourly_limit' });
    assert.deepEqual(requestLoginCode(state, { secret: SIR, email: PT, now: sn(3599) }), { ok: false, reason: 'hourly_limit' });
    // İlk kod (0. saniye) bir saati doldurdu: listeden düşer, yeni kod üretilir.
    const sonra = yeniKod(state, sn(3600));
    assert.equal(sonra.state.issuedAt.length, LOGIN_CODE_MAX_PER_HOUR);
    assert.equal(sonra.state.issuedAt.includes(simdi.toISOString()), false);
  });
});

describe('giriş kodu: deneme (sayaç sunucuda)', () => {
  test('deneme kod görülmeden sayılır; 3 yanlıştan sonra kod kilitli, doğru kod da açmaz', () => {
    const { state, code } = yeniKod(null, simdi);
    const begun = beginLoginCodeAttempt(state, { secret: SIR, email: PT, now: sn(10) });
    assert.ok(begun.ok);
    assert.equal(begun.counted.attempts, 1);

    let current: LoginCode | null = state;
    const sonuclar: string[] = [];
    for (let i = 0; i < LOGIN_CODE_MAX_ATTEMPTS; i += 1) {
      const deneme = dene(current, yanlis(code));
      current = deneme.state;
      sonuclar.push(deneme.result.ok ? 'ok' : deneme.result.reason);
    }
    assert.deepEqual(sonuclar, ['invalid', 'invalid', 'too_many']);
    assert.equal(loginCodeStatus(current, sn(10)), 'locked');
    assert.deepEqual(dene(current, code).result, { ok: false, reason: 'too_many' });
  });

  test('2 yanlış + doğru kod açar; dosya "kullanıldı" olur ve aynı kod yeniden açmaz', () => {
    const { state, code } = yeniKod(null, simdi);
    const iki = dene(dene(state, yanlis(code)).state, yanlis(code)).state;
    const acildi = dene(iki, code);
    assert.equal(acildi.result.ok, true);
    assert.equal(acildi.state?.used, true);
    assert.equal(acildi.state?.attempts, 3);
    assert.deepEqual(dene(acildi.state, code).result, { ok: false, reason: 'expired' });
  });

  test('süresi dolmuş, hiç üretilmemiş ya da başka adrese üretilmiş kod denenmez (sayılmaz)', () => {
    const { state } = yeniKod(null, simdi);
    const ctx = { secret: SIR, email: PT, now: sn(10) };
    assert.deepEqual(beginLoginCodeAttempt(state, { ...ctx, now: sn(LOGIN_CODE_TTL_SECONDS) }), { ok: false, reason: 'expired' });
    assert.deepEqual(beginLoginCodeAttempt(null, ctx), { ok: false, reason: 'expired' });
    assert.deepEqual(beginLoginCodeAttempt(state, { ...ctx, email: 'baska@example.com' }), { ok: false, reason: 'expired' });
    // Adres özeti büyük/küçük harfe ve boşluğa takılmaz.
    assert.equal(beginLoginCodeAttempt(state, { ...ctx, email: ' PT@Example.com ' }).ok, true);
  });

  test('durum sırası: kullanıldı > kilitli > süresi doldu > bekliyor', () => {
    const { state } = yeniKod(null, simdi);
    const sonra = sn(LOGIN_CODE_TTL_SECONDS + 1);
    assert.equal(loginCodeStatus(state, sn(10)), 'pending');
    assert.equal(loginCodeStatus(state, sonra), 'expired');
    assert.equal(loginCodeStatus({ ...state, attempts: LOGIN_CODE_MAX_ATTEMPTS }, sonra), 'locked');
    assert.equal(loginCodeStatus({ ...state, used: true, attempts: LOGIN_CODE_MAX_ATTEMPTS }, sonra), 'used');
    assert.equal(loginCodeStatus(null, sn(10)), 'none');
  });
});
