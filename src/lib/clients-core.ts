import * as v from 'valibot';
import { checkInvite, newInvite, type InviteCheck } from './client-access.ts';
import {
  beginLoginAttempt,
  clearedAttempts,
  CURRENT_KDF,
  hashPassword,
  loginLocked,
  newAuthRecord,
  parseAuth,
  verifyPassword,
  type AuthRecord,
  type KdfVersion,
} from './client-auth.ts';
import {
  canSetPassword,
  clientSessionValid,
  indexWithStatus,
  INVITE_MAX_ATTEMPTS,
  inviteStatus,
  nextHealthModule,
  revokedInvite,
  type PasswordSession,
} from './client-status.ts';
import { describeError, GithubError } from './github/errors.ts';
import { passwordProblem } from './password-rules.ts';
import {
  clientIndexSchema,
  HEALTH_CONSENT_VERSION,
  inviteSchema,
  type Client,
  type ClientIndexEntry,
  type ClientInput,
  type HealthField,
  type Invite,
} from './schemas/client.ts';

/**
 * Danışan kaydı, davet, şifre ve erişim akışları (SPEC §3, §5) — saf çekirdek. GitHub işleri ve saat
 * dışarıdan verilir (`ClientStore`): `clients.ts` GitHub'a ve Next'e bağlar, testler sahtesini verir.
 * Kararların kendisi (davetin durumu, oturum kuşağı, sağlık onayı, şifre ve kilit) `client-status.ts`,
 * `client-access.ts` ve `client-auth.ts`'te.
 */

export const CLIENT_INDEX_PATH = 'data/clients.json';

export type StoredFile = { content: unknown; sha: string };

export type ClientStore = {
  /** `AUTH_SECRET`: davet kodunun özetinin anahtarı. */
  secret: string;
  /** Şifre özetinin sürümü (yeni şifre ve girişte yeniden hesap); yoksa güncel sürüm. Testler hızlısını verir. */
  kdf?: KdfVersion;
  now(): Date;
  /** Danışan kaydı ve `sha`: yoksa null; okunamazsa ya da bozuksa fırlatır. */
  readClient(id: string): Promise<{ client: Client; sha: string } | null>;
  writeClient(client: Client, sha: string | undefined, message: string): Promise<void>;
  /** `invite.json`, ham: yoksa null. */
  readInvite(id: string): Promise<StoredFile | null>;
  writeInvite(id: string, invite: Invite, sha: string | undefined, message: string): Promise<{ sha: string }>;
  deleteInvite(id: string, sha: string, message: string): Promise<void>;
  /** `auth.json` (şifrenin özeti ve deneme sayacı), ham: yoksa null. Yalnız danışan repo'sunda. */
  readAuth(id: string): Promise<StoredFile | null>;
  writeAuth(id: string, auth: AuthRecord, sha: string | undefined, message: string): Promise<{ sha: string }>;
  /** Kare kod kullanılınca eski şifre açmasın diye. */
  deleteAuth(id: string, sha: string, message: string): Promise<void>;
  /**
   * Şifreyle girişin ön kararı için özet (`loginGateOf`), ÖNBELLEKLİ: GitHub'a gitmeyebilir. Kayıt ya
   * da `auth.json` her yazıldığında (ya da silindiğinde) o danışanınki düşer (`clients.ts`: `auth-<id>`
   * etiketi). Özette şifrenin özeti yok.
   */
  readLoginGate(id: string): Promise<LoginGate>;
  /** Uygulama repo'sundaki `data/clients.json`, ham ve taze: yoksa null. */
  readIndex(): Promise<StoredFile | null>;
  writeIndex(items: ClientIndexEntry[], sha: string | undefined, message: string): Promise<void>;
  /** Önbellekli kimlik listesini düşürür: liste her yazıldığında. */
  invalidateIndex(): void;
  deleteRepo(id: string): Promise<void>;
  /** Sunucu günlüğü: yutulan hataların sebebi. */
  log(message: string): void;
};

/* --- uygulama repo'sundaki kimlik listesi --- */

export async function readIndex(store: Pick<ClientStore, 'readIndex'>): Promise<{ items: ClientIndexEntry[]; sha: string | null }> {
  const stored = await store.readIndex();
  if (!stored) return { items: [], sha: null };
  const parsed = v.safeParse(clientIndexSchema, stored.content);
  if (!parsed.success) throw new GithubError(`${CLIENT_INDEX_PATH} beklenen biçimde değil.`, 500);
  return { items: parsed.output, sha: stored.sha };
}

/**
 * Listeyi günceller; değişiklik null dönerse (değişecek bir şey yok) yazmaz. Aynı dosyaya iki
 * yazma çakışırsa (409) taze okuyup bir kez yeniden dener: değişiklik kimlik bazında olduğu için
 * yeniden uygulamak güvenli.
 */
export async function updateIndex(
  store: Pick<ClientStore, 'readIndex' | 'writeIndex' | 'invalidateIndex'>,
  change: (items: ClientIndexEntry[]) => ClientIndexEntry[] | null,
  message: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const { items, sha } = await readIndex(store);
    const next = change(items);
    if (!next) return;
    try {
      await store.writeIndex(next, sha ?? undefined, message);
      store.invalidateIndex();
      return;
    } catch (error) {
      if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
      throw error;
    }
  }
}

/** Davet dosyası. Bozuk davet açılmaz ama listeyi de düşürmez: PT yenisini üretir. */
export function parseInvite(stored: StoredFile | null): { invite: Invite; sha: string } | null {
  if (!stored) return null;
  const parsed = v.safeParse(inviteSchema, stored.content);
  return parsed.success ? { invite: parsed.output, sha: stored.sha } : null;
}

/* --- güncelleme, silme --- */

/**
 * PT'nin düzenlemesi. Sağlık modülü kapatılıp açılınca ya da kapsamı genişleyince onay yeniden
 * sorulur (`nextHealthModule`). Kayıttaki durum değiştiyse liste de güncellenir, yazılamazsa hata
 * PT'ye döner. Durum değişmediyse liste yalnız önceki yarım bir kaydı onarmak için yoklanır: bu
 * en iyi çabadır, düşerse düzenleme yine kaydedilmiş sayılır ve sebep günlüğe yazılır.
 */
export async function updateClient(store: ClientStore, id: string, input: ClientInput): Promise<void> {
  const stored = await store.readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  const { client, sha } = stored;
  const { note: _note, ...rest } = client;
  const next: Client = {
    ...rest,
    name: input.name,
    ...(input.note ? { note: input.note } : {}),
    status: input.status,
    modules: {
      ...client.modules,
      health: nextHealthModule(
        client.modules.health,
        { enabled: input.healthEnabled, fields: input.healthFields },
        store.now().toISOString(),
      ),
    },
  };
  await store.writeClient(next, sha, 'Danışan güncellendi');

  // Liste, kayıttaki eski duruma göre değil listedeki satıra göre güncellenir: önceki bir denemede
  // kayıt yazılıp liste yazılamadıysa (ör. 403), aynı formu yeniden kaydetmek listeyi de düzeltir.
  const syncIndex = () => updateIndex(store, (items) => indexWithStatus(items, id, next.status), 'Danışan durumu değişti');
  if (next.status !== client.status) {
    await syncIndex();
    return;
  }
  try {
    await syncIndex();
  } catch (error) {
    store.log(`[danisan] ${CLIENT_INDEX_PATH} düzeltilemedi (${id}): ${describeError(error)}`);
  }
}

/**
 * Danışanı ve bütün verisini kalıcı siler: repo gider (GitHub 90 gün geri alınabilir tutar),
 * listeden kimlik satırı çıkar. Repo zaten yoksa yalnız satır temizlenir.
 */
export async function deleteClient(store: ClientStore, id: string): Promise<void> {
  try {
    await store.deleteRepo(id);
  } catch (error) {
    if (!(error instanceof GithubError && error.status === 404)) throw error;
  }
  await updateIndex(store, (items) => items.filter((item) => item.id !== id), 'Danışan silindi');
}

/* --- davet ve erişim --- */

/** Yeni davet: eskisinin üzerine yazar, yani eski kod anında geçersiz olur. Kod yalnız bu yanıtta var. */
export async function issueInvite(store: ClientStore, id: string): Promise<{ code: string; expiresAt: string }> {
  const stored = await store.readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  if (stored.client.status === 'archived') throw new GithubError('Arşivdeki danışana davet üretilemez.', 409);

  const { invite, code } = newInvite(store.secret, id, store.now());
  const current = await store.readInvite(id);
  await store.writeInvite(id, invite, current?.sha, 'Yeni davet kodu');
  return { code, expiresAt: invite.expiresAt };
}

/**
 * Daveti kullanır. Deneme, kod karşılaştırılmadan ÖNCE `sha` kilidiyle sayılır: aynı anda
 * gelen tahminlerden yalnız sayacı yazabilen karşılaştırılır, yazamayan hiç denenmez (hata
 * yukarı çıkar, "biraz sonra tekrar dene"). GitHub istek sınırında da sayaç yazılamadığı
 * için tahmin bedava olmaz. Doğru kodda davet aynı kilitle `used: true` olur — aynı kod iki
 * cihazdan denense de yalnız biri oturum açar. Erişim kapatılmadan önce üretilmiş davet
 * silinmiş sayılır (`revokedInvite`): dosyası silinememiş olsa da yeni kuşakla oturum açmaz.
 */
export async function redeemInvite(
  store: ClientStore,
  id: string,
  code: string,
): Promise<
  | { ok: true; client: Client; joinedAt: string }
  | { ok: false; reason: Exclude<InviteCheck, { ok: true }>['reason'] | 'archived' }
> {
  const stored = parseInvite(await store.readInvite(id));
  const now = store.now();
  const status = inviteStatus(stored?.invite ?? null, now);
  if (!stored || status !== 'pending') return { ok: false, reason: stored && status !== 'pending' ? status : 'none' };

  // Dışarıya "davet yok": kapatılmış davet, silinmiş davetten ayırt edilemez (deneme de sayılmaz).
  const record = await store.readClient(id);
  if (!record || revokedInvite(record.client.access, stored.invite)) return { ok: false, reason: 'none' };

  const attempts = stored.invite.attempts + 1;
  const counted = { ...stored.invite, attempts };
  const reserved = await store.writeInvite(id, counted, stored.sha, 'Davet kodu denendi');

  const check = checkInvite(stored.invite, { secret: store.secret, clientId: id, code, now });
  if (!check.ok) return attempts >= INVITE_MAX_ATTEMPTS ? { ok: false, reason: 'locked' } : check;

  if (record.client.status === 'archived') return { ok: false, reason: 'archived' };

  // Kod doğru: eski şifre artık açmaz (sıfırlama). Davet kullanıldı sayılmadan ÖNCE: silinemezse
  // hata yukarı çıkar, kod geçerli kalır ve danışan yeniden dener.
  await dropPassword(store, id);

  try {
    await store.writeInvite(id, { ...counted, used: true, usedAt: now.toISOString() }, reserved.sha, 'Davet kullanıldı');
  } catch (error) {
    // Başka bir cihaz aynı anda kullandı.
    if (error instanceof GithubError && error.status === 409) return { ok: false, reason: 'used' };
    throw error;
  }

  // Katılım kayda yazılır: davet dosyası bir sonraki kodda ezilir. Yazılamazsa giriş yine
  // geçerli (oturum kuşağı değişmedi, şifre adımının izni oturumdaki andan); yalnız PT ekranındaki
  // tarih eksik kalır. Sebep günlüğe (kod değil).
  const { revokedAt: _revoked, loginLockedAt: _locked, ...access } = record.client.access;
  const joined: Client = {
    ...record.client,
    access: { ...access, joinedAt: access.joinedAt ?? now.toISOString(), lastJoinAt: now.toISOString() },
  };
  await store.writeClient(joined, record.sha, 'Danışan giriş yaptı').catch((error: unknown) => {
    store.log(`[katil] ${id}: katılım anı kayda yazılamadı: ${describeError(error)}`);
  });
  return { ok: true, client: joined, joinedAt: now.toISOString() };
}

/**
 * `auth.json`'u siler (kare kod kullanıldı: eski şifre açmasın). Arada bir giriş denemesi sayacı
 * yazarsa (409) taze okuyup yeniden dener; dosya yoksa ya da arada silindiyse amaç zaten olmuş.
 */
async function dropPassword(store: ClientStore, id: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const current = await store.readAuth(id);
    if (!current) return;
    try {
      await store.deleteAuth(id, current.sha, 'Kare kodla girildi: eski şifre geçersiz');
      return;
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) return;
      if (attempt >= 2 || !(error instanceof GithubError && error.status === 409)) throw error;
    }
  }
}

/**
 * Açık bütün oturumları düşürür, bekleyen daveti iptal eder ve şifreyi geçersiz kılar. Sıra önemli:
 * önce davet silinir, sonra kuşak artar. Davet silinemezse kuşak da artmaz, hata yukarı çıkar ve PT
 * yeniden dener (hiçbir şey değişmemiştir). Ters sırada, arada kalan davet yeni kuşakla oturum
 * açabiliyordu. Şifre için dosyaya dokunulmaz: `auth.json` eski kuşağı taşır ve artık açmaz
 * (`loginWithPassword`); kayıttaki şifre anı silinir ki PT ekranı "şifresi yok" desin.
 */
export async function revokeAccess(store: ClientStore, id: string): Promise<void> {
  const stored = await store.readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  const invite = await store.readInvite(id);
  if (invite) {
    try {
      await store.deleteInvite(id, invite.sha, 'Davet iptal edildi');
    } catch (error) {
      // Arada başka bir istek silmişse amaç zaten olmuş.
      if (!(error instanceof GithubError && error.status === 404)) throw error;
    }
  }
  const { client, sha } = stored;
  const { passwordSetAt: _password, ...access } = client.access;
  await store.writeClient(
    { ...client, access: { ...access, version: access.version + 1, revokedAt: store.now().toISOString() } },
    sha,
    'Danışanın erişimi kapatıldı',
  );
}

/* --- şifre --- */

/**
 * Şifreyle girişin önbelleğe giren özeti: yalnız karar alanları (durum, kuşak, kilit), özet ve tuz
 * yok. JSON'a çevrilebilir (Next veri önbelleği).
 */
export type LoginGate = {
  client: { status: Client['status']; version: number } | null;
  auth: Pick<AuthRecord, 'accessVersion' | 'lockedUntil' | 'disabledAt'> | null;
};

export function loginGateOf(client: Client | null, auth: StoredFile | null): LoginGate {
  const parsed = parseAuth(auth)?.auth;
  return {
    client: client ? { status: client.status, version: client.access.version } : null,
    auth: parsed ? { accessVersion: parsed.accessVersion, lockedUntil: parsed.lockedUntil, disabledAt: parsed.disabledAt } : null,
  };
}

/**
 * Önbellekteki özetle ön karar (PT kod akışındaki kalıp, `session-core.ts` `consumeOtp`): şifresiz,
 * erişimi kapalı, arşivde ya da kilitli hesap GitHub'a gitmeden reddedilir. Kilidin bitişi saatle
 * bilinir, önbelleğin düşmesi beklenmez. null: taze okumayla devam.
 */
export function loginGateReason(gate: LoginGate, now: Date): 'none' | 'closed' | 'locked' | null {
  if (!gate.client || !gate.auth) return 'none';
  if (!clientSessionValid({ status: gate.client.status, access: { version: gate.client.version } }, gate.auth.accessVersion)) {
    return 'closed';
  }
  return loginLocked(gate.auth, now) ? 'locked' : null;
}

export type SetPasswordResult =
  | { ok: true; client: Client }
  /** Oturum geçersiz (erişim kapatıldı, arşiv, silindi) ya da bu oturum şifre belirleyemez. */
  | { ok: false; reason: 'session' | 'not_allowed' }
  /** Kurala uymuyor (kısa, yaygın, sıralı): form atlatılsa da sunucu yazmaz. */
  | { ok: false; reason: 'weak'; problem: string };

/**
 * Oturumdaki danışan şifresini belirler: kare kodla girişin ikinci adımı, ya da eski akışla katılmış
 * danışanın `/me`'deki kartı. İzin oturuma bağlı (`canSetPassword`): hiç şifre yoksa her geçerli
 * oturum; varsa yalnız şifreden sonra kare kodu kullanan oturum, 60 dk içinde. Şifreyle açılmış ya da
 * eski oturum var olan şifreyi değiştiremez.
 *
 * Önce `auth.json` (danışan repo'su, `sha` kilidiyle: iki sekme aynı anda yazarsa biri 409 alır),
 * sonra kayıttaki an. Sıra önemli: an yazılıp şifre yazılamasaydı PT "şifre belirledi" görür,
 * danışan da yeniden deneyemezdi. An yazılamazsa sebep günlüğe yazılır ve kayıt taze okunup bir kez
 * daha denenir; yine olmazsa hata yukarı çıkar, danışan yeniden dener. Şifre kayıttaki kuşağı
 * taşır: "Erişimi kapat" onu da geçersiz kılar.
 */
export async function setClientPassword(
  store: ClientStore,
  session: { clientId: string; accessVersion: number } & PasswordSession,
  password: string,
): Promise<SetPasswordResult> {
  const problem = passwordProblem(password);
  if (problem) return { ok: false, reason: 'weak', problem };
  const id = session.clientId;
  const now = store.now();
  let stored = await store.readClient(id);
  if (!stored || !clientSessionValid(stored.client, session.accessVersion)) return { ok: false, reason: 'session' };
  if (!canSetPassword(stored.client.access, session, now)) return { ok: false, reason: 'not_allowed' };

  const record = await newAuthRecord(password, { accessVersion: stored.client.access.version, now, kdf: store.kdf ?? CURRENT_KDF });
  const current = await store.readAuth(id);
  await store.writeAuth(id, record, current?.sha, 'Danışan şifre belirledi');

  for (let attempt = 0; ; attempt += 1) {
    const { loginLockedAt: _locked, ...access } = stored.client.access;
    const next: Client = { ...stored.client, access: { ...access, passwordSetAt: now.toISOString() } };
    try {
      await store.writeClient(next, stored.sha, 'Danışan şifre belirledi');
      return { ok: true, client: next };
    } catch (error) {
      // Kayıt arada değişti (PT düzenledi, onay verildi) ya da yazılamadı: taze okuyup bir kez daha.
      // Erişim bu arada kapatıldıysa yazılan şifre eski kuşağı taşır, açmaz.
      store.log(`[sifre] ${id}: şifre anı kayda yazılamadı (${attempt + 1}. deneme): ${describeError(error)}`);
      if (attempt > 0) throw error;
      stored = await store.readClient(id);
      if (!stored || !clientSessionValid(stored.client, session.accessVersion)) return { ok: false, reason: 'session' };
    }
  }
}

export type PasswordLoginResult =
  | { ok: true; client: Client }
  /**
   * Nedenler yalnız testler ve sunucu için: uç hepsine aynı genel yanıtı verir (bilgi sızmasın).
   * - `none`: kayıt ya da şifre yok (eski akışla katılmış, şifre belirlememiş)
   * - `closed`: erişim kapatıldı (şifre eski kuşakta) ya da arşivde
   * - `locked`: kilitli ya da bu deneme beşinci yanlıştı
   */
  | { ok: false; reason: 'none' | 'closed' | 'locked' | 'invalid' };

/**
 * Şifreyle giriş. Kayıt ve `auth.json` birlikte okunur. Şifresi olmayan, erişimi kapatılmış
 * (şifrenin kuşağı eskide kaldı) ya da arşivlenmiş danışan karşılaştırmaya hiç gelmez; kilitliyse
 * deneme de yazılmaz. Aksi halde deneme, şifre karşılaştırılmadan ÖNCE `sha` kilidiyle sayılır:
 * aynı anda gelen tahminlerden sayacı yazamayan hiç denenmez (hata yukarı çıkar, "biraz sonra
 * tekrar dene"), GitHub'a ulaşılamazsa da tahmin bedava olmaz. Beşinci yanlışta 15 dk kilit.
 * Doğru şifrede sayaç sıfırlanır; sıfırlama yazılamazsa giriş yine geçerli (sebep günlüğe, şifre değil).
 */
export async function loginWithPassword(store: ClientStore, id: string, password: string): Promise<PasswordLoginResult> {
  // Karar önce önbellekten: bilinen bir kimlikle istek yağdırmak GitHub'ın saatlik sınırını tüketemez.
  const early = loginGateReason(await store.readLoginGate(id), store.now());
  if (early) return { ok: false, reason: early };

  const [record, stored] = await Promise.all([store.readClient(id), store.readAuth(id)]);
  const current = parseAuth(stored);
  if (!record || !current) return { ok: false, reason: 'none' };
  if (!clientSessionValid(record.client, current.auth.accessVersion)) return { ok: false, reason: 'closed' };

  const begun = beginLoginAttempt(current.auth, store.now());
  if (!begun.ok) return begun;
  const reserved = await store.writeAuth(id, begun.counted, current.sha, 'Şifreyle giriş denendi');

  if (!(await verifyPassword(current.auth, password))) {
    if (begun.counted.disabledAt) await markLoginLocked(store, record, begun.counted.disabledAt);
    return { ok: false, reason: begun.counted.lockedUntil || begun.counted.disabledAt ? 'locked' : 'invalid' };
  }
  // Eski sürümle özetlenmiş şifre, düz hâli elimizdeyken güncel sürümle yeniden hesaplanır.
  const kdf = store.kdf ?? CURRENT_KDF;
  const upgraded = current.auth.kdf === kdf ? {} : await hashPassword(password, kdf);
  try {
    await store.writeAuth(id, { ...clearedAttempts(begun.counted), ...upgraded }, reserved.sha, 'Şifreyle giriş yapıldı');
  } catch (error) {
    store.log(`[giris] ${id}: deneme sayacı sıfırlanamadı: ${describeError(error)}`);
  }
  return { ok: true, client: record.client };
}

/** Şifre girişi kapandı: PT ekranı rozet göstersin diye kayda yalnız an yazılır (en iyi çaba, günlükle). */
async function markLoginLocked(store: ClientStore, record: { client: Client; sha: string }, at: string): Promise<void> {
  try {
    await store.writeClient({ ...record.client, access: { ...record.client.access, loginLockedAt: at } }, record.sha, 'Şifre girişi kapandı: çok sayıda yanlış deneme');
  } catch (error) {
    store.log(`[giris] ${record.client.id}: kilit anı kayda yazılamadı: ${describeError(error)}`);
  }
}

/**
 * Danışanın sağlık onayı ya da onayı geri çekmesi. Onay, danışanın EKRANDA GÖRDÜĞÜ
 * parçaları ve metin sürümünü taşır; PT bu arada listeyi değiştirdiyse onay reddedilir
 * (409) ve danışan güncel listeyi görüp yeniden karar verir. Görmediği bir parçaya
 * onay yazılmaz.
 */
export async function setHealthConsent(
  store: ClientStore,
  id: string,
  decision: { granted: boolean; fields: HealthField[]; version: string },
): Promise<Client> {
  const stored = await store.readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  const { client, sha } = stored;
  const module = client.modules.health;
  if (!module.enabled) throw new GithubError('Sağlık modülü kapalı.', 409);
  if (decision.granted) {
    const shown = new Set(decision.fields);
    const same = shown.size === module.fields.length && module.fields.every((field) => shown.has(field));
    if (!same || decision.version !== HEALTH_CONSENT_VERSION) {
      throw new GithubError('Antrenörün sorulan bilgileri değiştirdi. Sayfayı yenileyip yeniden bak.', 409);
    }
  }
  const next: Client = {
    ...client,
    consents: {
      ...client.consents,
      health: {
        granted: decision.granted,
        version: HEALTH_CONSENT_VERSION,
        fields: decision.granted ? module.fields : [],
        at: store.now().toISOString(),
      },
    },
  };
  await store.writeClient(next, sha, decision.granted ? 'Sağlık verisi onayı verildi' : 'Sağlık verisi onayı geri çekildi');
  return next;
}
