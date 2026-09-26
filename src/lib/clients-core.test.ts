import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuth } from './client-auth.ts';
import {
  accessState,
  canRecordHealth,
  canSetPassword,
  clientSessionValid,
  hasPassword,
  healthConsentState,
  inviteStatus,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_ATTEMPTS,
  passwordState,
} from './client-status.ts';
import {
  issueInvite,
  loginGateReason,
  loginWithPassword,
  markNoticesSeen,
  parseInvite,
  redeemInvite,
  revokeAccess,
  setClientPassword,
  setHealthConsent,
  updateClient,
} from './clients-core.ts';
import { APP_REPO, clientRepo, clientStore, fakeClock, fakeGithub, INDEX_PATH, seedClient } from './fake-github.ts';
import { GithubError } from './github/errors.ts';
import { measurementLock } from './measurement-log.ts';
import { HEALTH_CONSENT_VERSION, type Client, type ClientInput, type HealthField } from './schemas/client.ts';

function world() {
  const gh = fakeGithub();
  const clock = fakeClock();
  gh.addRepo(APP_REPO);
  gh.put(APP_REPO, INDEX_PATH, []);
  const clients = clientStore(gh, clock);
  const record = async (id: string) => {
    const stored = await clients.store.readClient(id);
    assert.ok(stored, 'kayıt olmalıydı');
    return stored.client;
  };
  const invite = async (id: string) => parseInvite(await clients.store.readInvite(id))?.invite ?? null;
  return {
    gh,
    clock,
    ...clients,
    record,
    invite,
    /** PT ekranındaki giriş rozeti. */
    badge: async (id: string) => accessState((await record(id)).access, await invite(id), clock.now()),
    indexStatus: (id: string) => (gh.get(APP_REPO, INDEX_PATH) as { id: string; status: string }[]).find((row) => row.id === id)?.status,
  };
}

/** PT'nin formu, kayıttaki değerlerle; değişenler üstüne yazılır. */
function form(client: Client, change: Partial<ClientInput> = {}): ClientInput {
  return {
    name: client.name,
    note: client.note ?? '',
    status: client.status,
    healthEnabled: client.modules.health.enabled,
    healthFields: client.modules.health.fields,
    ...change,
  };
}

describe('davet: erişim kapatılmadan önce üretilmiş kod (SPEC §5)', () => {
  test('dosyası silinememiş olsa da oturum açmaz, deneme de sayılmaz; kapatmadan sonra üretilen kod açar', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const { code } = await issueInvite(w.store, client.id);
    w.clock.advance(1);
    // Eski sıradan kalmış yarım kapatma: kuşak arttı ve an yazıldı, davet dosyası duruyor.
    const stored = await w.store.readClient(client.id);
    assert.ok(stored);
    const access = { ...stored.client.access, version: 2, revokedAt: w.clock.now().toISOString() };
    await w.store.writeClient({ ...stored.client, access }, stored.sha, 'yarım kapatma');
    assert.equal(inviteStatus(await w.invite(client.id), w.clock.now()), 'pending');

    assert.deepEqual(await redeemInvite(w.store, client.id, code), { ok: false, reason: 'none' });
    assert.equal((await w.invite(client.id))?.attempts, 0);
    assert.equal(await w.badge(client.id), 'revoked');

    w.clock.advance(1);
    const fresh = await issueInvite(w.store, client.id);
    const joined = await redeemInvite(w.store, client.id, fresh.code);
    assert.ok(joined.ok);
    assert.equal(joined.client.access.version, 2);
    assert.equal(await w.badge(client.id), 'joined');
  });
});

describe('erişimi kapat: önce davet silinir, sonra kuşak artar', () => {
  test('(A) davet silindi, kuşak henüz artmadı: aradaki giriş "davet yok" alır', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const { code } = await issueInvite(w.store, client.id);
    w.clock.advance(1);
    let window: Awaited<ReturnType<typeof redeemInvite>> | null = null;
    w.gh.onNext('write', 'client.json', async () => {
      window = await redeemInvite(w.store, client.id, code);
    }, 'Danışanın erişimi kapatıldı');

    await revokeAccess(w.store, client.id);
    assert.deepEqual(window, { ok: false, reason: 'none' });
    assert.equal((await w.record(client.id)).access.version, 2);
    assert.equal(await w.badge(client.id), 'revoked');
  });

  test('(B) davet okundu, silinmeden kod kullanıldı: kapatma düşer, yeniden denenince açılan oturum da düşer', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const { code } = await issueInvite(w.store, client.id);
    w.clock.advance(1);
    let window: Awaited<ReturnType<typeof redeemInvite>> | null = null;
    w.gh.onNext('delete', 'invite.json', async () => {
      window = await redeemInvite(w.store, client.id, code);
    });

    await assert.rejects(revokeAccess(w.store, client.id), (error) => error instanceof GithubError && error.status === 409);
    const joined = window as Awaited<ReturnType<typeof redeemInvite>> | null;
    assert.ok(joined?.ok, 'pencerede giriş');
    // Kapatma hiçbir şey değiştirmedi: rozet ile sunucu aynı şeyi söyler (danışan içeride).
    assert.equal(await w.badge(client.id), 'joined');
    assert.equal(clientSessionValid(await w.record(client.id), joined.client.access.version), true);

    w.clock.advance(1);
    await revokeAccess(w.store, client.id);
    assert.equal(clientSessionValid(await w.record(client.id), joined.client.access.version), false);
    assert.equal(await w.badge(client.id), 'revoked');
  });

  for (const status of [409, 403, 502]) {
    test(`davet silme ${status} alırsa kuşak artmaz, rozet "bekliyor" kalır; yeniden deneme tamamlar`, async () => {
      const w = world();
      const client = seedClient(w.gh, w.clock);
      const { code } = await issueInvite(w.store, client.id);
      w.clock.advance(1);
      w.gh.failNext('delete', 'invite.json', status);

      await assert.rejects(revokeAccess(w.store, client.id), (error) => error instanceof GithubError && error.status === status);
      assert.equal((await w.record(client.id)).access.version, 1);
      assert.equal(await w.badge(client.id), 'pending');

      w.clock.advance(1);
      await revokeAccess(w.store, client.id);
      assert.equal((await w.record(client.id)).access.version, 2);
      assert.equal(await w.invite(client.id), null);
      assert.equal(await w.badge(client.id), 'revoked');
      assert.deepEqual(await redeemInvite(w.store, client.id, code), { ok: false, reason: 'none' });
    });
  }
});

describe('danışan listesi: durum kayıtla aynı kalır', () => {
  test('liste yazılamazsa hata PT\'ye döner; aynı formu yeniden kaydetmek listeyi düzeltir', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    w.gh.failNext('write', INDEX_PATH, 403);
    await assert.rejects(updateClient(w.store, client.id, form(client, { status: 'archived' })), (error) => error instanceof GithubError && error.status === 403);
    assert.equal((await w.record(client.id)).status, 'archived');
    assert.equal(w.indexStatus(client.id), 'active');

    await updateClient(w.store, client.id, form(client, { status: 'archived' }));
    assert.equal(w.indexStatus(client.id), 'archived');
    assert.equal(w.invalidations(), 1);
  });

  test('durum değişmediyse liste okunamasa da düzenleme kaydedilir; sebep günlüğe, kişisel veri yazılmaz', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    w.gh.failNext('read', INDEX_PATH, 502);
    await updateClient(w.store, client.id, form(client, { name: 'Ayşe Demir-Kaya' }));
    assert.equal((await w.record(client.id)).name, 'Ayşe Demir-Kaya');
    assert.equal(w.logs.length, 1);
    assert.match(w.logs[0] ?? '', /data\/clients\.json.*502/);
    assert.equal(w.logs[0]?.includes('Ayşe'), false);
  });

  test('durum değiştiyse liste hatası PT\'ye döner (kayıt yazılmış olsa da)', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    w.gh.failNext('read', INDEX_PATH, 502);
    await assert.rejects(updateClient(w.store, client.id, form(client, { status: 'paused' })), (error) => error instanceof GithubError && error.status === 502);
    assert.equal((await w.record(client.id)).status, 'paused');
    assert.deepEqual(w.logs, []);
  });

  test('durum ve liste aynıysa liste yazılmaz', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    await updateClient(w.store, client.id, form(client, { note: 'Hedef: 5 km' }));
    assert.equal(w.gh.count(`write ${APP_REPO}/${INDEX_PATH}`), 0);
  });

  test('durumun anı yalnız durum değişince yazılır (duraklatmadan dönüşte kaçan gün penceresi)', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    await updateClient(w.store, client.id, form(client, { note: 'Hedef: 5 km' }));
    assert.equal((await w.record(client.id)).statusChangedAt, undefined);
    w.clock.advance(1);
    await updateClient(w.store, client.id, form(client, { status: 'paused' }));
    const paused = w.clock.now().toISOString();
    assert.equal((await w.record(client.id)).statusChangedAt, paused);
    w.clock.advance(1);
    await updateClient(w.store, client.id, form(client, { status: 'paused', name: 'Ayşe Demir-Kaya' }));
    assert.equal((await w.record(client.id)).statusChangedAt, paused);
    w.clock.advance(1);
    await updateClient(w.store, client.id, form(client, { status: 'active' }));
    assert.equal((await w.record(client.id)).statusChangedAt, w.clock.now().toISOString());
  });

  test('antrenman geçmişi kayda yazılır; formda gelmezse kayıttaki kalır (öneri tabanı, açık soru 4)', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    await updateClient(w.store, client.id, form(client, { trainingExperience: 'six_months' }));
    assert.deepEqual((await w.record(client.id)).training, { experience: 'six_months' });
    await updateClient(w.store, client.id, form(client, { name: 'Ayşe Demir-Kaya' }));
    assert.deepEqual((await w.record(client.id)).training, { experience: 'six_months' });
    await updateClient(w.store, client.id, form(client, { trainingExperience: 'new' }));
    assert.deepEqual((await w.record(client.id)).training, { experience: 'new' });
  });
});

describe('sağlık onayı: modül kapatılıp açılınca yeniden sorulur (SPEC §4, §9.4)', () => {
  const FIELDS: HealthField[] = ['conditions', 'measurements'];

  async function consented() {
    const w = world();
    const client = seedClient(w.gh, w.clock, {
      modules: { health: { enabled: true, fields: FIELDS, enabledAt: w.clock.now().toISOString() } },
    });
    w.clock.advance(60);
    await setHealthConsent(w.store, client.id, { granted: true, fields: FIELDS, version: HEALTH_CONSENT_VERSION });
    assert.equal(healthConsentState(await w.record(client.id)), 'granted');
    w.clock.advance(60);
    return { w, client };
  }

  test('kapat → aç: onay silinmez ama "yenilenecek", kayıt tutulmaz; danışan onaylayınca yeniden açılır', async () => {
    const { w, client } = await consented();
    await updateClient(w.store, client.id, form(client, { healthEnabled: false, healthFields: [] }));
    const off = await w.record(client.id);
    assert.equal(healthConsentState(off), 'off');
    assert.equal(off.consents.health?.granted, true, 'geçmiş kalır');

    w.clock.advance(60);
    await updateClient(w.store, client.id, form(client, { healthEnabled: true, healthFields: FIELDS }));
    const on = await w.record(client.id);
    // PT rozeti (dashboard/clients), danışanın /me kartı ve ölçüm kilidi aynı hesaptan okur.
    assert.equal(healthConsentState(on), 'outdated');
    assert.equal(canRecordHealth(on, 'measurements'), false);
    assert.equal(measurementLock(on), 'outdated');

    w.clock.advance(60);
    await setHealthConsent(w.store, client.id, { granted: true, fields: FIELDS, version: HEALTH_CONSENT_VERSION });
    const renewed = await w.record(client.id);
    assert.equal(healthConsentState(renewed), 'granted');
    assert.equal(canRecordHealth(renewed, 'measurements'), true);
  });

  test('parça çıkarmak onayı bozmaz; çıkarılan parça geri eklenince yeniden sorulur', async () => {
    const { w, client } = await consented();
    await updateClient(w.store, client.id, form(client, { healthFields: ['conditions'] }));
    assert.equal(healthConsentState(await w.record(client.id)), 'granted');

    w.clock.advance(60);
    await updateClient(w.store, client.id, form(client, { healthFields: FIELDS }));
    const readded = await w.record(client.id);
    assert.equal(healthConsentState(readded), 'outdated');
    assert.equal(canRecordHealth(readded, 'conditions'), false);
  });

  test('kapsamı değiştirmeyen kayıt (ad, durum) onayı bozmaz', async () => {
    const { w, client } = await consented();
    await updateClient(w.store, client.id, form(client, { name: 'Ayşe Kaya', status: 'paused' }));
    assert.equal(healthConsentState(await w.record(client.id)), 'granted');
  });

  test('reddetmiş danışan kapatıp açınca da "onay verilmedi" kalır', async () => {
    const { w, client } = await consented();
    await setHealthConsent(w.store, client.id, { granted: false, fields: [], version: HEALTH_CONSENT_VERSION });
    await updateClient(w.store, client.id, form(client, { healthEnabled: false, healthFields: [] }));
    w.clock.advance(60);
    await updateClient(w.store, client.id, form(client, { healthEnabled: true, healthFields: FIELDS }));
    assert.equal(healthConsentState(await w.record(client.id)), 'declined');
  });
});

/* --- şifre: ilk giriş kare kodla, sonrakiler şifreyle (SPEC §5) --- */

const SIFRE = 'mavi-deniz-42';
const YENI_SIFRE = 'turuncu-dag-77';

/** Kare kodla giriş: yeni davet, kod kullanılır; `/api/join`'in yazdığı oturum (kodu kullandığı anla) döner. */
async function joinWithCode(w: ReturnType<typeof world>, id: string) {
  const { code } = await issueInvite(w.store, id);
  const joinedAt = w.clock.now().toISOString();
  const joined = await redeemInvite(w.store, id, code);
  assert.ok(joined.ok, 'kare kodla giriş');
  return { clientId: id, accessVersion: joined.client.access.version, joinedAt };
}

/** `/api/giris`'in yazdığı oturum: kare kod anı taşımaz. */
function passwordSession(login: Awaited<ReturnType<typeof loginWithPassword>>) {
  assert.ok(login.ok, 'şifreyle giriş');
  return { clientId: login.client.id, accessVersion: login.client.access.version };
}

async function withPassword(password = SIFRE) {
  const w = world();
  const client = seedClient(w.gh, w.clock);
  const session = await joinWithCode(w, client.id);
  assert.deepEqual((await setClientPassword(w.store, session, password)).ok, true);
  w.clock.advance(60);
  return { w, client, session, auth: async () => parseAuth(await w.store.readAuth(client.id))?.auth ?? null };
}

describe('şifre: ilk giriş kare kodla, şifre belirlenir', () => {
  test('kare koddan sonra şifre belirlenir, sonraki giriş şifreyle; PT "şifre belirledi" görür', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joinWithCode(w, client.id);
    assert.equal(hasPassword((await w.record(client.id)).access), false);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'none' });

    const set = await setClientPassword(w.store, session, SIFRE);
    assert.ok(set.ok);
    assert.equal(hasPassword((await w.record(client.id)).access), true);
    assert.equal(canSetPassword((await w.record(client.id)).access, session, w.clock.now()), false);

    w.clock.advance(60);
    const login = await loginWithPassword(w.store, client.id, SIFRE);
    assert.ok(login.ok);
    // Oturum şifreyle açılınca da kayıttaki kuşağı taşır.
    assert.equal(clientSessionValid(await w.record(client.id), login.client.access.version), true);
  });

  test('şifre yalnız danışan repo\'sunda, özetiyle; hiçbir dosyada, kayıt mesajında ya da günlükte düz durmaz', async () => {
    const { w, client } = await withPassword();
    await loginWithPassword(w.store, client.id, 'yanlis-sifre-1');
    w.gh.failNext('write', 'auth.json', 502, 'Şifreyle giriş yapıldı');
    await loginWithPassword(w.store, client.id, SIFRE);

    assert.equal(w.gh.get(APP_REPO, 'auth.json'), undefined);
    const stored = w.gh.get(clientRepo(client.id), 'auth.json') as Record<string, unknown>;
    assert.deepEqual(Object.keys(stored).sort(), [
      'accessVersion',
      'disabledAt',
      'failedAttempts',
      'kdf',
      'lockCount',
      'lockedUntil',
      'passwordHash',
      'salt',
      'updatedAt',
    ]);
    const everything = [...w.gh.files.values()].flatMap((files) => [...files.values()].map((file) => file.text));
    for (const secret of [SIFRE, 'yanlis-sifre-1']) {
      assert.equal(everything.some((text) => text.includes(secret)), false, 'dosyalarda');
      assert.equal(w.gh.calls.some((call) => call.includes(secret)), false, 'kayıt mesajlarında');
      assert.equal(w.logs.some((line) => line.includes(secret)), false, 'günlükte');
    }
    assert.equal((w.gh.get(clientRepo(client.id), 'client.json') as { access: Record<string, unknown> }).access.passwordHash, undefined);
  });
});

describe('şifreyle giriş: sayaç, kilit', () => {
  test('yanlış şifre sayılır, doğru şifre sayacı sıfırlar', async () => {
    const { w, client, auth } = await withPassword();
    assert.deepEqual(await loginWithPassword(w.store, client.id, 'yanlis-sifre'), { ok: false, reason: 'invalid' });
    assert.deepEqual(await loginWithPassword(w.store, client.id, 'yanlis-sifre'), { ok: false, reason: 'invalid' });
    assert.equal((await auth())?.failedAttempts, 2);
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok);
    assert.equal((await auth())?.failedAttempts, 0);
  });

  test('5 yanlışta 15 dk kilit: doğru şifre de açmaz, kilitliyken deneme yazılmaz; süre dolunca açılır', async () => {
    const { w, client, auth } = await withPassword();
    for (let deneme = 1; deneme < LOGIN_MAX_ATTEMPTS; deneme += 1) {
      assert.deepEqual(await loginWithPassword(w.store, client.id, `yanlis-${deneme}`), { ok: false, reason: 'invalid' });
    }
    assert.deepEqual(await loginWithPassword(w.store, client.id, 'yanlis-5'), { ok: false, reason: 'locked' });

    const writes = w.gh.count(`write ${clientRepo(client.id)}/auth.json`);
    w.clock.advance(LOGIN_LOCK_MINUTES * 60 - 1);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'locked' });
    assert.equal(w.gh.count(`write ${clientRepo(client.id)}/auth.json`), writes, 'kilitliyken GitHub\'a yazılmaz');

    w.clock.advance(1);
    // Kilit bitti: sayaç baştan başlar, tek yanlış yeniden kilitlemez.
    assert.deepEqual(await loginWithPassword(w.store, client.id, 'yanlis-6'), { ok: false, reason: 'invalid' });
    assert.equal((await auth())?.failedAttempts, 1);
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok);
    assert.deepEqual([(await auth())?.failedAttempts, (await auth())?.lockedUntil], [0, null]);
  });

  test('eşzamanlı iki deneme: sayacı yazamayan hiç karşılaştırılmaz (doğru şifre olsa da)', async () => {
    const { w, client, auth } = await withPassword();
    const [first, second] = await Promise.allSettled([
      loginWithPassword(w.store, client.id, 'yanlis-sifre'),
      loginWithPassword(w.store, client.id, SIFRE),
    ]);
    assert.deepEqual(first.status === 'fulfilled' ? first.value : first.reason, { ok: false, reason: 'invalid' });
    assert.equal(second.status, 'rejected');
    assert.ok(second.status === 'rejected' && second.reason instanceof GithubError && second.reason.status === 409);
    assert.equal((await auth())?.failedAttempts, 1);
  });

  test('sayaç sıfırlaması yazılamazsa giriş yine geçerli; sebep günlüğe yazılır', async () => {
    const { w, client, auth } = await withPassword();
    await loginWithPassword(w.store, client.id, 'yanlis-sifre');
    w.gh.failNext('write', 'auth.json', 502, 'Şifreyle giriş yapıldı');
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok);
    assert.equal((await auth())?.failedAttempts, 2);
    assert.equal(w.logs.length, 1);
    assert.match(w.logs[0] ?? '', /auth\.json.*502/);
  });
});

describe('şifre sıfırlama yalnız PT\'den: yeni kare kod', () => {
  test('açık oturum şifreyi değiştiremez; yeni kare kodla giren yenisini belirler, eskisi açmaz', async () => {
    const { w, client, session, auth } = await withPassword();
    assert.deepEqual(await setClientPassword(w.store, session, YENI_SIFRE), { ok: false, reason: 'not_allowed' });
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok);

    // Danışan şifresini unuttu, PT yeni kare kod üretti; birkaç yanlış denemeden sonra kodla giriyor.
    await loginWithPassword(w.store, client.id, 'hatirlamiyorum');
    const fresh = await joinWithCode(w, client.id);
    assert.equal(canSetPassword((await w.record(client.id)).access, fresh, w.clock.now()), true);
    assert.equal(await auth(), null, 'kod kullanılınca eski şifre silindi');
    assert.ok((await setClientPassword(w.store, fresh, YENI_SIFRE)).ok);
    assert.equal((await auth())?.failedAttempts, 0);

    w.clock.advance(60);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'invalid' });
    assert.ok((await loginWithPassword(w.store, client.id, YENI_SIFRE)).ok);
    assert.deepEqual(await setClientPassword(w.store, fresh, 'ucuncu-sifre-9'), { ok: false, reason: 'not_allowed' });
  });

  test('şifre yazılırken kayıt değişirse (PT düzenledi) bir kez taze okuyup tamamlar', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joinWithCode(w, client.id);
    w.gh.onNext('write', 'client.json', async () => {
      await updateClient(w.store, client.id, form(await w.record(client.id), { note: 'Diz ağrısı' }));
    }, 'Danışan şifre belirledi');
    assert.ok((await setClientPassword(w.store, session, SIFRE)).ok);
    const record = await w.record(client.id);
    assert.equal(record.note, 'Diz ağrısı');
    assert.equal(hasPassword(record.access), true);
  });
});

describe('erişimi kapalı ya da arşivdeki danışan şifreyle giremez', () => {
  test('"Erişimi kapat": eski şifre açmaz, deneme de sayılmaz, PT "şifresi yok" görür; yeni kare kod + yeni şifre açar', async () => {
    const { w, client, auth } = await withPassword();
    await revokeAccess(w.store, client.id);
    assert.equal(hasPassword((await w.record(client.id)).access), false);
    assert.equal(await w.badge(client.id), 'revoked');

    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
    assert.equal((await auth())?.failedAttempts, 0);

    w.clock.advance(60);
    const fresh = await joinWithCode(w, client.id);
    assert.equal(fresh.accessVersion, 2);
    assert.ok((await setClientPassword(w.store, fresh, YENI_SIFRE)).ok);
    const login = await loginWithPassword(w.store, client.id, YENI_SIFRE);
    assert.ok(login.ok);
    assert.equal(login.client.access.version, 2);
  });

  test('kapatmayla yarışan şifre belirleme: yazılan şifre yeni kuşakta açmaz', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joinWithCode(w, client.id);
    w.gh.onNext('write', 'auth.json', async () => {
      await revokeAccess(w.store, client.id);
    }, 'Danışan şifre belirledi');
    assert.deepEqual(await setClientPassword(w.store, session, SIFRE), { ok: false, reason: 'session' });
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
    assert.equal(hasPassword((await w.record(client.id)).access), false);
  });

  test('arşivdeki danışan doğru şifreyle de giremez; aktif olunca yeniden girer', async () => {
    const { w, client } = await withPassword();
    await updateClient(w.store, client.id, form(await w.record(client.id), { status: 'archived' }));
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
    await updateClient(w.store, client.id, form(await w.record(client.id), { status: 'active' }));
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok);
  });

  test('eski akışla katılmış (şifresiz) danışan şifreyle giremez; /me\'den belirleyince girer', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joinWithCode(w, client.id);
    w.clock.advance(3600);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'none' });
    // Hiç şifresi olmayanda izin katılımdan saatler sonra da açık (60 dk yalnız sıfırlamada).
    assert.equal(canSetPassword((await w.record(client.id)).access, {}, w.clock.now()), true);
    assert.ok((await setClientPassword(w.store, session, SIFRE)).ok);
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok);
  });
});

describe('güvenlik incelemesi: şifre belirleme izni oturuma bağlı (PoC A, A2, E, M11)', () => {
  test('A: yeni kare koddan sonra ESKİ oturum şifre belirleyemez; kodu kullanan oturum belirler', async () => {
    const { w, client, session: phoneA } = await withPassword();
    w.clock.advance(3600);
    const phoneB = await joinWithCode(w, client.id);
    assert.deepEqual(await setClientPassword(w.store, phoneA, 'saldirgan-sifre-9'), { ok: false, reason: 'not_allowed' });
    assert.ok((await setClientPassword(w.store, phoneB, YENI_SIFRE)).ok);
    assert.ok((await loginWithPassword(w.store, client.id, YENI_SIFRE)).ok);
    assert.equal((await loginWithPassword(w.store, client.id, 'saldirgan-sifre-9')).ok, false);
  });

  test('A2: şifreyle açılmış oturum, yeni kare koddan sonra da şifre belirleyemez', async () => {
    const { w, client } = await withPassword();
    const attacker = passwordSession(await loginWithPassword(w.store, client.id, SIFRE));
    w.clock.advance(3600);
    const phoneB = await joinWithCode(w, client.id);
    assert.deepEqual(await setClientPassword(w.store, attacker, 'saldirgan-kalici-9'), { ok: false, reason: 'not_allowed' });
    assert.ok((await setClientPassword(w.store, phoneB, YENI_SIFRE)).ok);
  });

  test('A2: yeni kare kod kullanılınca eski şifre açmaz (şifre belirlenmeden önce de)', async () => {
    const { w, client } = await withPassword();
    w.clock.advance(3600);
    await joinWithCode(w, client.id);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'none' });
    assert.equal(hasPassword((await w.record(client.id)).access), false, 'PT ekranı: şifresi yok');
  });

  test('E: kodu kullanan oturumun izni 60 dk; sonra kapanır (danışan adımı atlarsa pencere açık kalmaz)', async () => {
    const { w, client } = await withPassword();
    w.clock.advance(3600);
    const late = await joinWithCode(w, client.id);
    w.clock.advance(60 * 60);
    assert.deepEqual(await setClientPassword(w.store, late, YENI_SIFRE), { ok: false, reason: 'not_allowed' });

    const onTime = await joinWithCode(w, client.id);
    w.clock.advance(59 * 60);
    assert.ok((await setClientPassword(w.store, onTime, YENI_SIFRE)).ok);
  });

  test('M11: erişimi kapatılmış oturumla şifre belirlenemez (session), yazılmaz', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const stale = await joinWithCode(w, client.id);
    await revokeAccess(w.store, client.id);
    assert.deepEqual(await setClientPassword(w.store, stale, SIFRE), { ok: false, reason: 'session' });
    assert.equal(await w.store.readAuth(client.id), null);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'none' });
  });
});

describe('güvenlik incelemesi: bilinen kimlikle giriş GitHub kotasını tüketemez (PoC B)', () => {
  test('kilitliyken 100 deneme GitHub\'a hiç gitmez (ilk istek önbelleği doldurur); kilit saatle biter', async () => {
    const { w, client } = await withPassword();
    for (let deneme = 1; deneme <= 5; deneme += 1) await loginWithPassword(w.store, client.id, `yanlis-${deneme}`);
    assert.deepEqual(await loginWithPassword(w.store, client.id, 'yanlis-6'), { ok: false, reason: 'locked' });
    const before = w.gh.calls.length;
    for (let deneme = 0; deneme < 100; deneme += 1) {
      assert.deepEqual(await loginWithPassword(w.store, client.id, `tahmin-${deneme}`), { ok: false, reason: 'locked' });
    }
    assert.equal(w.gh.calls.length - before, 0, '100 kilitli deneme → 0 GitHub isteği');
    w.clock.advance(15 * 60);
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok, 'önbellek kilidin bitişini saatle bilir');
  });

  test('şifresiz, erişimi kapalı, arşivde: karar önbellekten; kayıt ya da şifre yazılınca önbellek düşer', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joinWithCode(w, client.id);
    await loginWithPassword(w.store, client.id, SIFRE);
    let before = w.gh.calls.length;
    for (let deneme = 0; deneme < 20; deneme += 1) await loginWithPassword(w.store, client.id, SIFRE);
    assert.equal(w.gh.calls.length - before, 0, 'şifresiz');

    assert.ok((await setClientPassword(w.store, session, SIFRE)).ok);
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok, 'şifre yazılınca önbellek düştü');

    await updateClient(w.store, client.id, form(await w.record(client.id), { status: 'archived' }));
    await loginWithPassword(w.store, client.id, SIFRE);
    before = w.gh.calls.length;
    for (let deneme = 0; deneme < 20; deneme += 1) {
      assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
    }
    assert.equal(w.gh.calls.length - before, 0, 'arşivde');
    await updateClient(w.store, client.id, form(await w.record(client.id), { status: 'active' }));
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok, 'kayıt yazılınca önbellek düştü');

    await revokeAccess(w.store, client.id);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
    before = w.gh.calls.length;
    for (let deneme = 0; deneme < 20; deneme += 1) {
      assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
    }
    assert.equal(w.gh.calls.length - before, 0, 'erişimi kapalı');
  });
});

describe('güvenlik incelemesi: artan ceza (PoC D)', () => {
  async function fiveWrong(w: ReturnType<typeof world>, id: string, tag: string) {
    for (let deneme = 1; deneme <= 5; deneme += 1) await loginWithPassword(w.store, id, `${tag}-${deneme}`);
  }

  test('kilit 15 dk, sonra 30 dk; üçüncü kilitte şifre girişi kapanır, yalnız yeni kare kod açar; PT rozeti', async () => {
    const { w, client, auth } = await withPassword();
    await fiveWrong(w, client.id, 'a');
    assert.equal((await auth())?.lockCount, 1);
    w.clock.advance(15 * 60);
    await fiveWrong(w, client.id, 'b');
    w.clock.advance(30 * 60 - 1);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'locked' }, 'ikinci kilit 30 dk');
    w.clock.advance(1);
    await fiveWrong(w, client.id, 'c');
    w.clock.advance(24 * 3600);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'locked' }, 'üçüncü kilit kalıcı');
    const record = await w.record(client.id);
    assert.ok(record.access.loginLockedAt, 'PT ekranı için an');
    assert.equal(passwordState(record.access), 'locked');

    const fresh = await joinWithCode(w, client.id);
    assert.ok((await setClientPassword(w.store, fresh, YENI_SIFRE)).ok);
    assert.ok((await loginWithPassword(w.store, client.id, YENI_SIFRE)).ok);
    assert.equal(passwordState((await w.record(client.id)).access), 'set');
  });

  test('bir günde en çok 15 tahmin karşılaştırılır (eskiden 480)', async () => {
    const { w, client } = await withPassword();
    for (let dakika = 0; dakika < 24 * 60; dakika += 1) {
      for (let k = 0; k < 10; k += 1) await loginWithPassword(w.store, client.id, `t-${dakika}-${k}`);
      w.clock.advance(60);
    }
    assert.equal(w.gh.count(`write ${clientRepo(client.id)}/auth.json Şifreyle giriş denendi`), 15);
  });

  test('doğru şifre sayacı da kilit sayısını da sıfırlar', async () => {
    const { w, client, auth } = await withPassword();
    await fiveWrong(w, client.id, 'a');
    w.clock.advance(15 * 60);
    assert.ok((await loginWithPassword(w.store, client.id, SIFRE)).ok);
    assert.deepEqual([(await auth())?.failedAttempts, (await auth())?.lockCount], [0, 0]);
  });

  test('yaygın ya da sıralı şifre sunucuda da reddedilir (form atlatılsa da)', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joinWithCode(w, client.id);
    for (const weak of ['12345678', 'Galatasaray1905', 'fenerbahçe1907', 'aaaaaaaa', 'abcdefgh', '1234567']) {
      const result = await setClientPassword(w.store, session, weak);
      assert.equal(result.ok, false, weak);
      assert.equal(!result.ok && result.reason, 'weak', weak);
    }
    assert.equal(await w.store.readAuth(client.id), null);
  });
});

describe('güvenlik incelemesi: iki dosyalı yazmalar (PoC F, G)', () => {
  test('G: katılım anı yazılamazsa giriş geçerli, sebep günlüğe (kod yazılmaz); şifre adımı oturumdan açılır', async () => {
    const { w, client } = await withPassword();
    w.clock.advance(3600);
    const { code } = await issueInvite(w.store, client.id);
    w.gh.failNext('write', 'client.json', 502, 'Danışan giriş yaptı');
    const joined = await redeemInvite(w.store, client.id, code);
    assert.ok(joined.ok);
    assert.equal(w.logs.length, 1);
    assert.match(w.logs[0] ?? '', /client\.json.*502/);
    assert.equal(w.logs[0]?.includes(code), false);
    const session = { clientId: client.id, accessVersion: 1, joinedAt: joined.joinedAt };
    assert.ok((await setClientPassword(w.store, session, YENI_SIFRE)).ok);
  });

  test('F: şifre yazılıp kayıt yazılamazsa günlüğe yazılır ve bir kez yeniden denenir', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const session = await joinWithCode(w, client.id);
    w.gh.failNext('write', 'client.json', 502, 'Danışan şifre belirledi');
    assert.ok((await setClientPassword(w.store, session, SIFRE)).ok);
    assert.equal(hasPassword((await w.record(client.id)).access), true, 'PT ekranı doğru');
    assert.equal(w.logs.length, 1);
    assert.match(w.logs[0] ?? '', /502/);
    assert.equal(w.logs[0]?.includes(SIFRE), false);
  });
});

describe('özet sürümü: eski kayıt başarılı girişte yeniden hesaplanır', () => {
  test('kdf 1 ile belirlenen şifre, kdf 2 kurulu sunucuda girişte kdf 2 olur ve açmaya devam eder', async () => {
    const gh = fakeGithub();
    const clock = fakeClock();
    gh.addRepo(APP_REPO);
    gh.put(APP_REPO, INDEX_PATH, []);
    const old = clientStore(gh, clock, undefined, { kdf: 1 });
    const client = seedClient(gh, clock);
    const { code } = await issueInvite(old.store, client.id);
    const joined = await redeemInvite(old.store, client.id, code);
    assert.ok(joined.ok);
    assert.ok((await setClientPassword(old.store, { clientId: client.id, accessVersion: 1, joinedAt: joined.joinedAt }, SIFRE)).ok);
    const read = async () => parseAuth(await old.store.readAuth(client.id))?.auth;
    assert.equal((await read())?.kdf, 1);
    const hashBefore = (await read())?.passwordHash;

    const current = clientStore(gh, clock, undefined, { kdf: 2 });
    assert.ok((await loginWithPassword(current.store, client.id, SIFRE)).ok);
    assert.equal((await read())?.kdf, 2);
    assert.notEqual((await read())?.passwordHash, hashBefore);
    assert.ok((await loginWithPassword(current.store, client.id, SIFRE)).ok);
    assert.equal((await loginWithPassword(current.store, client.id, 'yanlis-sifre-1')).ok, false);
  });
});

describe('önbellek bayatken taze okuma karar verir (60 sn içinde elle değişen dosya)', () => {
  /** Şifreli danışan; önbellekte "açık" karar (yazma olmadan dolduruldu). */
  async function primedOpen() {
    const setup = await withPassword();
    assert.equal(loginGateReason(await setup.w.store.readLoginGate(setup.client.id), setup.w.clock.now()), null);
    return { ...setup, record: await setup.w.record(setup.client.id) };
  }

  test('kuşak dışarıdan artmış: kapalı', async () => {
    const { w, client, record } = await primedOpen();
    w.gh.put(clientRepo(client.id), 'client.json', { ...record, access: { ...record.access, version: 2 } });
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
  });

  test('dışarıdan arşivlenmiş: kapalı', async () => {
    const { w, client, record } = await primedOpen();
    w.gh.put(clientRepo(client.id), 'client.json', { ...record, status: 'archived' });
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'closed' });
  });

  test('auth.json kilitli: doğru şifre de açmaz, deneme yazılmaz', async () => {
    const { w, client, auth } = await primedOpen();
    const locked = { ...(await auth()), lockedUntil: new Date(w.clock.now().getTime() + 60_000).toISOString() };
    w.gh.put(clientRepo(client.id), 'auth.json', locked);
    const writes = w.gh.count(`write ${clientRepo(client.id)}/auth.json`);
    assert.deepEqual(await loginWithPassword(w.store, client.id, SIFRE), { ok: false, reason: 'locked' });
    assert.equal(w.gh.count(`write ${clientRepo(client.id)}/auth.json`), writes);
  });
});

describe('sayacı yazamayan deneme özet hesaplamaz (M01: CPU ve bellek harcatılamaz)', () => {
  test('güncel özetle (N=2^17, ~0,4 s) çakışan deneme, tam denemenin üçte birinden kısa sürer', async () => {
    const gh = fakeGithub();
    const clock = fakeClock();
    gh.addRepo(APP_REPO);
    gh.put(APP_REPO, INDEX_PATH, []);
    const current = clientStore(gh, clock, undefined, { kdf: 2 });
    const client = seedClient(gh, clock);
    const { code } = await issueInvite(current.store, client.id);
    const joined = await redeemInvite(current.store, client.id, code);
    assert.ok(joined.ok);
    assert.ok((await setClientPassword(current.store, { clientId: client.id, accessVersion: 1, joinedAt: joined.joinedAt }, SIFRE)).ok);

    gh.failNext('write', 'auth.json', 409, 'Şifreyle giriş denendi');
    const lostStart = performance.now();
    await assert.rejects(loginWithPassword(current.store, client.id, SIFRE), (error) => error instanceof GithubError && error.status === 409);
    const lost = performance.now() - lostStart;

    const fullStart = performance.now();
    assert.equal((await loginWithPassword(current.store, client.id, 'yanlis-sifre-1')).ok, false);
    const full = performance.now() - fullStart;
    assert.ok(lost < full / 3, `çakışan ${lost.toFixed(0)} ms, tam ${full.toFixed(0)} ms`);
  });
});

describe('bildirimler okundu (Genel bakış, tasarım §4.6)', () => {
  test('inbox.seenAt yazılır, yalnız ileri gider; öteki alanlar değişmez; kayıt yoksa false', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    const first = new Date('2026-09-26T10:00:00.000Z');
    assert.equal(await markNoticesSeen(w.store, client.id, first), true);
    const seen = await w.record(client.id);
    assert.deepEqual(seen.inbox, { seenAt: first.toISOString() });
    assert.deepEqual({ ...seen, inbox: undefined }, { ...client, inbox: undefined });
    const writes = w.gh.count(`write ${clientRepo(client.id)}/client.json`);
    // Eski sekmeden gelen daha eski an okunmamış yapmaz, yazmaz da.
    assert.equal(await markNoticesSeen(w.store, client.id, new Date('2026-09-25T10:00:00.000Z')), true);
    assert.equal(w.gh.count(`write ${clientRepo(client.id)}/client.json`), writes);
    assert.deepEqual((await w.record(client.id)).inbox, { seenAt: first.toISOString() });
    assert.equal(await markNoticesSeen(w.store, 'c_yokyokyok', first), false);
  });

  test('aynı anda başka yazma (danışanın onayı) çakışırsa taze okuyup bir kez daha', async () => {
    const w = world();
    const client = seedClient(w.gh, w.clock);
    w.gh.failNext('write', 'client.json', 409, 'Bildirimler okundu');
    assert.equal(await markNoticesSeen(w.store, client.id, new Date('2026-09-26T10:00:00.000Z')), true);
    assert.equal((await w.record(client.id)).inbox?.seenAt, '2026-09-26T10:00:00.000Z');
  });
});
