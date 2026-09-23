import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { checkInvite, hashInviteCode, newClientId, newInvite } from './client-access.ts';
import {
  accessState,
  canRecordHealth,
  hasNewDeviceCode,
  formatInviteCode,
  healthConsentState,
  INVITE_MAX_ATTEMPTS,
  INVITE_TTL_DAYS,
  inviteStatus,
  normalizeInviteCode,
} from './client-status.ts';
import { CLIENT_ID_PATTERN, clientFormSchema, HEALTH_CONSENT_VERSION, type Client } from './schemas/client.ts';

const SIR = 'test-sirri';
const simdi = new Date('2026-09-23T10:00:00.000Z');

describe('danışan kimliği', () => {
  test('repo adına uygun biçimde ve her seferinde farklı', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newClientId()));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, CLIENT_ID_PATTERN);
  });
});

describe('davet kodu', () => {
  test('kod saklanmaz, yalnız anahtarlı özeti; süre 7 gün', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    assert.match(code, /^\d{8}$/);
    assert.equal(JSON.stringify(invite).includes(code), false);
    assert.equal(invite.codeHash, hashInviteCode(SIR, 'c_abc12345', code));
    assert.equal(new Date(invite.expiresAt).getTime() - simdi.getTime(), INVITE_TTL_DAYS * 86_400_000);
  });

  test('özet danışana ve sırra bağlı: aynı kod başka danışanda ya da başka sırla tutmaz', () => {
    assert.notEqual(hashInviteCode(SIR, 'c_aaaaaaaa', '12345678'), hashInviteCode(SIR, 'c_bbbbbbbb', '12345678'));
    assert.notEqual(hashInviteCode(SIR, 'c_aaaaaaaa', '12345678'), hashInviteCode('baska', 'c_aaaaaaaa', '12345678'));
  });

  test('doğru kod açar; boşluklu ve tireli yazım da kabul', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    const ctx = { secret: SIR, clientId: 'c_abc12345', now: simdi };
    assert.deepEqual(checkInvite(invite, { ...ctx, code }), { ok: true });
    assert.deepEqual(checkInvite(invite, { ...ctx, code: formatInviteCode(code) }), { ok: true });
    assert.deepEqual(checkInvite(invite, { ...ctx, code: `${code.slice(0, 4)}-${code.slice(4)}` }), { ok: true });
    assert.deepEqual(checkInvite(invite, { ...ctx, code: '00000000' === code ? '11111111' : '00000000' }), {
      ok: false,
      reason: 'invalid',
    });
  });

  test('başka danışanın kimliğiyle aynı kod açmaz', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    assert.deepEqual(checkInvite(invite, { secret: SIR, clientId: 'c_zzz99999', code, now: simdi }), {
      ok: false,
      reason: 'invalid',
    });
  });

  test('kullanılmış, süresi dolmuş ya da kilitli davet doğru kodla da açılmaz', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    const ctx = { secret: SIR, clientId: 'c_abc12345', code };
    const sonra = new Date(simdi.getTime() + (INVITE_TTL_DAYS + 1) * 86_400_000);

    assert.deepEqual(checkInvite({ ...invite, used: true }, { ...ctx, now: simdi }), { ok: false, reason: 'used' });
    assert.deepEqual(checkInvite(invite, { ...ctx, now: sonra }), { ok: false, reason: 'expired' });
    assert.deepEqual(checkInvite({ ...invite, attempts: INVITE_MAX_ATTEMPTS }, { ...ctx, now: simdi }), {
      ok: false,
      reason: 'locked',
    });
    assert.deepEqual(checkInvite(null, { ...ctx, now: simdi }), { ok: false, reason: 'none' });
  });

  test('durum sırası: kullanıldı > kilitli > süresi doldu > bekliyor', () => {
    const { invite } = newInvite(SIR, 'c_abc12345', simdi);
    const sonra = new Date(simdi.getTime() + (INVITE_TTL_DAYS + 1) * 86_400_000);
    assert.equal(inviteStatus(invite, simdi), 'pending');
    assert.equal(inviteStatus(invite, sonra), 'expired');
    assert.equal(inviteStatus({ ...invite, attempts: INVITE_MAX_ATTEMPTS }, sonra), 'locked');
    assert.equal(inviteStatus({ ...invite, used: true, attempts: INVITE_MAX_ATTEMPTS }, sonra), 'used');
    assert.equal(normalizeInviteCode(' 1234 - 5678 '), '12345678');
  });
});

describe('giriş durumu', () => {
  const saat = (hh: string) => `2026-09-23T${hh}:00:00.000Z`;
  const davet = (createdAt: string, extra: Partial<ReturnType<typeof newInvite>['invite']> = {}) => ({
    ...newInvite(SIR, 'c_abc12345', new Date(createdAt)).invite,
    ...extra,
  });
  const an = new Date(saat('12'));

  test('katılmış danışana yeni cihaz kodu üretilince "katıldı" kalır, kod ayrıca bildirilir', () => {
    const access = { joinedAt: saat('09'), lastJoinAt: saat('09') };
    const yeni = davet(saat('10'));
    assert.equal(accessState(access, yeni, an), 'joined');
    assert.equal(hasNewDeviceCode(access, yeni, an), true);
    // Kullanılmış eski davet yeni kod sayılmaz.
    assert.equal(hasNewDeviceCode(access, davet(saat('08'), { used: true }), an), false);
  });

  test('erişim kapatılınca "kapalı", yeniden davet edilince davetin durumu', () => {
    const access = { joinedAt: saat('08'), lastJoinAt: saat('08'), revokedAt: saat('09') };
    assert.equal(accessState(access, null, an), 'revoked');
    assert.equal(accessState(access, davet(saat('07')), an), 'revoked');
    assert.equal(accessState(access, davet(saat('10')), an), 'pending');
    // Kapatıldıktan sonra yeniden girdi.
    assert.equal(accessState({ ...access, lastJoinAt: saat('11') }, davet(saat('10'), { used: true }), an), 'joined');
  });

  test('hiç girmemiş danışanda davetin durumu; eski kayıtta kullanılmış davet "katıldı" demek', () => {
    assert.equal(accessState({}, null, an), 'none');
    assert.equal(accessState({}, davet(saat('10')), an), 'pending');
    assert.equal(accessState({}, davet(saat('10'), { used: true }), an), 'used');
  });
});

describe('sağlık onayı', () => {
  const danisan = (health: Client['modules']['health'], consent?: Client['consents']['health']) => ({
    modules: { health },
    consents: consent ? { health: consent } : {},
  });
  const onay = (fields: Client['modules']['health']['fields'], extra: Partial<NonNullable<Client['consents']['health']>> = {}) => ({
    granted: true,
    version: HEALTH_CONSENT_VERSION,
    fields,
    at: simdi.toISOString(),
    ...extra,
  });

  test('modül kapalıysa hiçbir şey tutulmaz, onay olsa da', () => {
    const kapali = danisan({ enabled: false, fields: ['check_in'] }, onay(['check_in']));
    assert.equal(healthConsentState(kapali), 'off');
    assert.equal(canRecordHealth(kapali, 'check_in'), false);
  });

  test('modül açık ama onay yoksa kayıt yok', () => {
    const bekliyor = danisan({ enabled: true, fields: ['check_in'] });
    assert.equal(healthConsentState(bekliyor), 'pending');
    assert.equal(canRecordHealth(bekliyor, 'check_in'), false);
    assert.equal(healthConsentState(danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in'], { granted: false }))), 'declined');
  });

  test('onay yalnız kapsadığı parçalar için geçerli; yeni parça yeniden onay ister', () => {
    const acik = danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in', 'measurements']));
    assert.equal(healthConsentState(acik), 'granted');
    assert.equal(canRecordHealth(acik, 'check_in'), true);
    // Onaylanmış ama PT modülde açmamış: tutulmaz.
    assert.equal(canRecordHealth(acik, 'measurements'), false);

    const genisledi = danisan({ enabled: true, fields: ['check_in', 'screening'] }, onay(['check_in']));
    assert.equal(healthConsentState(genisledi), 'outdated');
    assert.equal(canRecordHealth(genisledi, 'check_in'), false);
  });

  test('onay metni değişince eski onay güncel değil', () => {
    const eski = danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in'], { version: '2025-01' }));
    assert.equal(healthConsentState(eski), 'outdated');
  });
});

describe('danışan formu', () => {
  const temel = { name: 'Ayşe Demir', note: '', status: 'active' as const, healthEnabled: false, healthFields: [], startTemplateId: '' };

  test('modül kapalıyken parça seçmek gerekmez', () => {
    assert.equal(v.safeParse(clientFormSchema, temel).success, true);
  });

  test('modül açıksa en az bir parça; hata parça alanına düşer', () => {
    const sonuc = v.safeParse(clientFormSchema, { ...temel, healthEnabled: true });
    assert.equal(sonuc.success, false);
    assert.deepEqual(
      sonuc.issues?.map((issue) => issue.path?.map((segment) => segment.key).join('.')),
      ['healthFields'],
    );
  });

  test('başlangıç şablonu boş olabilir ya da geçerli bir şablon kimliği olmalı', () => {
    assert.equal(v.safeParse(clientFormSchema, { ...temel, startTemplateId: 't_ab12cd34' }).success, true);
    assert.equal(v.safeParse(clientFormSchema, { ...temel, startTemplateId: '../clients' }).success, false);
  });

  test('ad kırpılır ve boş olamaz', () => {
    assert.equal(v.safeParse(clientFormSchema, { ...temel, name: '   ' }).success, false);
    const sonuc = v.safeParse(clientFormSchema, { ...temel, name: '  Ayşe  ' });
    assert.equal(sonuc.success && sonuc.output.name, 'Ayşe');
  });
});
