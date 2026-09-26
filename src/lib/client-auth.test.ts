import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import {
  beginLoginAttempt,
  clearedAttempts,
  lockMinutes,
  loginLocked,
  newAuthRecord,
  parseAuth,
  verifyPassword,
  type AuthRecord,
} from './client-auth.ts';
import {
  canSetPassword,
  hasPassword,
  LOGIN_LOCK_MAX_MINUTES,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_MAX_LOCKS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SET_WINDOW_MINUTES,
} from './client-status.ts';

const simdi = new Date('2026-09-26T10:00:00.000Z');
const sonra = (dakika: number) => new Date(simdi.getTime() + dakika * 60 * 1000);

async function kayit(sifre = 'kırmızı-bisiklet'): Promise<AuthRecord> {
  return newAuthRecord(sifre, { accessVersion: 1, now: simdi });
}

describe('şifrenin özeti (SPEC §5)', () => {
  test('doğru şifre açar, yanlışı açmaz; kayıtta şifre düz durmaz', async () => {
    const record = await kayit('kırmızı-bisiklet');
    assert.equal(await verifyPassword(record, 'kırmızı-bisiklet'), true);
    assert.equal(await verifyPassword(record, 'kirmizi-bisiklet'), false);
    assert.equal(await verifyPassword(record, 'kırmızı-bisiklet '), false, 'boşluk kırpılmaz');
    assert.equal(JSON.stringify(record).includes('bisiklet'), false);
    assert.deepEqual(parseAuth({ content: record, sha: 'x' })?.auth, record);
  });

  test('her kayıt kendi tuzuyla: aynı şifre iki kez aynı özeti vermez', async () => {
    const [a, b] = await Promise.all([kayit(), kayit()]);
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.passwordHash, b.passwordHash);
  });

  test('farklı klavyenin yazdığı aynı harf (NFD "ş") aynı şifredir', async () => {
    const record = await kayit('şifrem-güçlü');
    assert.equal(await verifyPassword(record, 'şifrem-güçlü'.normalize('NFD')), true);
  });

  test('bozuk dosya şifre yok sayılır', () => {
    assert.equal(parseAuth(null), null);
    assert.equal(parseAuth({ content: { passwordHash: 'düz-şifre' }, sha: 'x' }), null);
  });
});

describe('yanlış şifre sayacı ve kilit', () => {
  test('her deneme karşılaştırmadan önce sayılır; beşincisi 15 dk kilidi birlikte yazar', async () => {
    let record = await kayit();
    for (let deneme = 1; deneme < LOGIN_MAX_ATTEMPTS; deneme += 1) {
      const begun = beginLoginAttempt(record, simdi);
      assert.ok(begun.ok);
      assert.equal(begun.counted.failedAttempts, deneme);
      assert.equal(begun.counted.lockedUntil, null);
      record = begun.counted;
    }
    const fifth = beginLoginAttempt(record, simdi);
    assert.ok(fifth.ok);
    assert.equal(fifth.counted.lockedUntil, sonra(LOGIN_LOCK_MINUTES).toISOString());
    assert.deepEqual(beginLoginAttempt(fifth.counted, sonra(LOGIN_LOCK_MINUTES - 1)), { ok: false, reason: 'locked' });
    assert.equal(loginLocked(fifth.counted, sonra(LOGIN_LOCK_MINUTES)), false);
  });

  test('kilit dolunca sayaç baştan başlar; doğru şifre sayacı ve kilidi kaldırır', async () => {
    const locked: AuthRecord = { ...(await kayit()), failedAttempts: LOGIN_MAX_ATTEMPTS, lockedUntil: sonra(LOGIN_LOCK_MINUTES).toISOString() };
    const after = beginLoginAttempt(locked, sonra(LOGIN_LOCK_MINUTES));
    assert.ok(after.ok);
    assert.equal(after.counted.failedAttempts, 1);
    assert.equal(after.counted.lockedUntil, null);
    assert.deepEqual(
      { failedAttempts: clearedAttempts(locked).failedAttempts, lockedUntil: clearedAttempts(locked).lockedUntil },
      { failedAttempts: 0, lockedUntil: null },
    );
  });
});

describe('şifre belirleme izni oturuma bağlı (PT ekranı, /me ve uç aynı kuraldan)', () => {
  const t = (saat: string) => `2026-09-26T${saat}.000Z`;
  const at = (saat: string) => new Date(t(saat));

  test('hiç şifresi yoksa her geçerli oturum; şifreyle açılan oturum hiçbir zaman', () => {
    assert.equal(canSetPassword({ lastJoinAt: t('09:00:00') }, {}, at('10:00:00')), true);
    assert.equal(hasPassword({ lastJoinAt: t('09:00:00') }), false);
    const set = { lastJoinAt: t('09:00:00'), passwordSetAt: t('09:05:00') };
    assert.equal(hasPassword(set), true);
    assert.equal(canSetPassword(set, {}, at('09:06:00')), false, 'şifreyle açılan oturum');
    assert.equal(canSetPassword(set, { joinedAt: t('09:00:00') }, at('09:06:00')), false, 'şifreden önceki kare kod');
  });

  test('şifreden sonra kare kodu kullanan oturum 60 dk içinde; eski şifre o an açmaz', () => {
    const reset = { lastJoinAt: t('11:00:00'), passwordSetAt: t('09:05:00') };
    assert.equal(hasPassword(reset), false, 'kare kod eski şifreyi geçersiz kıldı');
    const session = { joinedAt: t('11:00:00') };
    assert.equal(canSetPassword(reset, session, at('11:00:00')), true);
    assert.equal(canSetPassword(reset, session, at('11:59:59')), true);
    assert.equal(canSetPassword(reset, session, at('12:00:00')), false, '60. dakika');
    assert.equal(canSetPassword(reset, session, at('10:59:00')), false, 'gelecekteki an');
    // Kaydın katılım anı yazılamamış olsa da (yutulan yazma) izin oturumdan gelir.
    assert.equal(canSetPassword({ passwordSetAt: t('09:05:00') }, session, at('11:10:00')), true);
  });
});

describe('özet parametreleri ve politika sabitleri (değerleriyle sabit)', () => {
  test('yeni kayıt kdf 2: scrypt N=2^17, r=8, p=1, 64 bayt; kdf 1 (eski) N=2^14', async () => {
    const current = await newAuthRecord('mavi-deniz-42', { accessVersion: 1, now: simdi });
    assert.equal(current.kdf, 2);
    const expected = scryptSync('mavi-deniz-42', Buffer.from(current.salt, 'hex'), 64, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
    assert.equal(current.passwordHash, expected.toString('hex'));
    const legacy = await newAuthRecord('mavi-deniz-42', { accessVersion: 1, now: simdi, kdf: 1 });
    assert.equal(legacy.passwordHash, scryptSync('mavi-deniz-42', Buffer.from(legacy.salt, 'hex'), 64, { N: 2 ** 14, r: 8, p: 1 }).toString('hex'));
    // Sürümü yazılmamış (ilk günün) kaydı kdf 1 sayılır.
    const { kdf: _kdf, ...old } = legacy;
    assert.equal(parseAuth({ content: old, sha: 'x' })?.auth.kdf, 1);
  });

  test('128 karakteri aşan şifre, özeti kayıtta olsa da açmaz', async () => {
    const long = 'k'.repeat(129);
    const record = await newAuthRecord(long, { accessVersion: 1, now: simdi, kdf: 1 });
    assert.equal(await verifyPassword(record, long), false);
    assert.equal(await verifyPassword(record, long.slice(0, 128)), false);
  });

  test('politika: 5 deneme, 15 dk, üçüncü kilitte kapanır, 8 karakter, 60 dk şifre penceresi', () => {
    assert.deepEqual(
      [LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES, LOGIN_MAX_LOCKS, LOGIN_LOCK_MAX_MINUTES, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_SET_WINDOW_MINUTES],
      [5, 15, 3, 24 * 60, 8, 128, 60],
    );
    assert.deepEqual([1, 2, 3, 7, 20].map(lockMinutes), [15, 30, 60, 960, 1440]);
  });
});
