import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGGED_OUT_NOTICE, loginScreen, logoutPath } from './login-screen.ts';

describe('/giris ekranı: çıkış onayıyla aynı şeyi söyler', () => {
  test('şifresi olmayan danışan çıkınca şifre kutusu yok, yeni kare kod istenir (kimlik bilinse de)', () => {
    assert.deepEqual(loginScreen({ clientId: 'c_abc123', remembered: 'c_abc123', loggedOut: true, passwordless: true }), { kind: 'no-password' });
    assert.deepEqual(loginScreen({ clientId: null, remembered: undefined, loggedOut: true, passwordless: true }), { kind: 'no-password' });
  });

  test('şifresi olan danışan çıkınca "şifreni yaz"; çıkış dışında bilgi satırı yok', () => {
    assert.deepEqual(loginScreen({ clientId: 'c_abc123', remembered: null, loggedOut: true, passwordless: false }), {
      kind: 'password',
      clientId: 'c_abc123',
      notice: LOGGED_OUT_NOTICE,
    });
    assert.deepEqual(loginScreen({ clientId: null, remembered: 'c_abc123', loggedOut: false, passwordless: false }), {
      kind: 'password',
      clientId: 'c_abc123',
      notice: null,
    });
    // `sifre=0` yalnız çıkış yönlendirmesinde anlamlı: elle eklenmiş parametre formu gizlemez.
    assert.equal(loginScreen({ clientId: 'c_abc123', remembered: null, loggedOut: false, passwordless: true }).kind, 'password');
  });

  test('kimlik: adres, sonra telefon; ikisi de yoksa bağlantı istenir; telefon okunmadan bekler', () => {
    assert.deepEqual(loginScreen({ clientId: null, remembered: null, loggedOut: false, passwordless: false }), { kind: 'no-id' });
    assert.deepEqual(loginScreen({ clientId: null, remembered: undefined, loggedOut: true, passwordless: false }), { kind: 'loading' });
    assert.equal((loginScreen({ clientId: 'c_url0001', remembered: 'c_tel0001', loggedOut: false, passwordless: false }) as { clientId: string }).clientId, 'c_url0001');
  });

  test('çıkış adresi şifre durumunu taşır; bilinmiyorsa taşımaz', () => {
    assert.equal(logoutPath('c_abc123', false), '/giris?c=c_abc123&cikis=1&sifre=0');
    assert.equal(logoutPath('c_abc123', true), '/giris?c=c_abc123&cikis=1');
    assert.equal(logoutPath('c_abc123', null), '/giris?c=c_abc123&cikis=1');
    assert.equal(logoutPath(null, false), '/giris?cikis=1&sifre=0');
  });
});
