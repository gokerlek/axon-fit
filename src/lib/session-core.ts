import { createHash, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import * as v from 'valibot';
import { clientSessionValid } from './client-status.ts';
import { GithubError, writeToFreshRepo } from './github/errors.ts';
import {
  beginLoginCodeAttempt,
  finishLoginCodeAttempt,
  LOGIN_CODE_TTL_SECONDS,
  loginCodeSchema,
  ptSessionFromPayload,
  requestLoginCode,
  type LoginCode,
  type LoginCodeFailure,
  type PtSession,
} from './pt-login.ts';
import type { Client } from './schemas/client.ts';

/**
 * Oturumlar ve yedek girişin kodu (SPEC §5) — saf çekirdek. Çerezler, ortam, zaman ve GitHub dışarıdan
 * verilir (`SessionStore`): `session.ts` bunları Next'e (`cookies`, veri önbelleği) ve GitHub'a bağlar,
 * testler sahtesini verir. Kodun durum kuralları ve PT yükünün doğrulaması `pt-login.ts`'te.
 *
 * Oturum imzalı, httpOnly bir çerezdir; sunucuda saklanmaz. Giriş kodunun durumu ise sunucuda,
 * uygulama repo'sundaki `data/login-code.json`'da: deneme sayacı ve tek kullanımlık çerezde olsaydı,
 * eski çerezi yeniden gönderen sınırsız denerdi. Dosyada kod ve adres yok, yalnız anahtarlı özetleri.
 * Kod isteyen tarayıcıdaki çerez yalnız hangi adres için kod istendiğini taşır.
 */

export type { PtSession };
export type ClientSession = {
  role: 'client';
  clientId: string;
  /**
   * Danışan kaydındaki `access.version` ile eşleşmezse oturum geçersizdir (PT erişimi
   * kapattı); bu kontrol kaydı okuyan `sessionClient` içinde yapılır.
   */
  accessVersion: number;
  /**
   * Oturum kare kodla açıldıysa kodun kullanıldığı an (`/api/join`). Şifre belirleme izni buna
   * bağlı (`canSetPassword`): şifreyle açılan oturumda yok, o oturum şifre değiştiremez.
   */
  joinedAt?: string;
};

/** Danışan oturumunda yetki her zaman buradan okunur, adresteki kimlikten değil (SPEC §5). */
export type Session = PtSession | ClientSession;

/**
 * PT ve danışan AYRI çerezde: aynı tarayıcıda (ör. PT bir sekmede danışan olarak denerken)
 * biri ötekinin oturumunu ezmez. PT'nin çerez adı eskisiyle aynı, açık oturumlar düşmesin.
 */
export const PT_COOKIE = 'pc_oturum';
export const CLIENT_COOKIE = 'pc_danisan';
export const OTP_COOKIE = 'pc_kod';
export const SESSION_DAYS = 30;

export type CookieOptions = { httpOnly: true; sameSite: 'lax'; secure: boolean; path: '/'; maxAge: number };

/** İsteğin çerezleri (Next: `cookies()`). */
export type CookieJar = {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  delete(name: string): void;
};

export type AuthEnv = {
  /** `AUTH_SECRET`: çerezleri imzalar, kodun ve adresin özetinin anahtarı. */
  secret: string;
  /** `GITHUB_OWNER`: GitHub girişinde PT. */
  owner: string;
  /** `PT_EMAIL` (küçük harf; tanımlı değilse boş): yedek yolda PT. */
  ptEmail: string;
  /** Yedek e-posta yolu açık mı (`RESEND_API_KEY`). */
  emailLogin: boolean;
  /** Çerezler yalnız HTTPS'te (üretim). */
  secureCookies: boolean;
};

export type StoredFile = { content: unknown; sha: string };

/**
 * `data/login-code.json`'un işleri. Kimliksiz istekler (PT adresini bilen biri) GitHub'ın saatlik
 * istek sınırını tüketemesin diye karar ÖNCE önbellekten verilir; taze, `sha`'lı okuma yalnız
 * yazmak gerektiğinde yapılır. Önbellek sunucu örnekleri arasında ortaktır (Next veri önbelleği) ve
 * her yazmadan sonra düşürülür.
 */
export type LoginCodeStore = {
  /** Karar için okuma: önbellekli, GitHub'a gitmeyebilir. Dosya yoksa null. */
  readCached(): Promise<StoredFile | null>;
  /** Yazmadan hemen önce taze okuma: içerik ve `sha`. Dosya (ya da repo) yoksa null. */
  readFresh(): Promise<StoredFile | null>;
  write(state: LoginCode, sha: string | undefined, message: string): Promise<{ sha: string }>;
  /** Önbelleği düşürür: her yazmadan sonra. */
  invalidate(): void;
  /**
   * Veri repo'sunun önbellekli denetimi: açık ya da fork olduğu biliniyorsa sebebi, yoksa null.
   * Yanlış kurulumda kimliksiz her istek repo'ya bakmasın diye.
   */
  repoProblem(): Promise<string | null>;
  /** `createAppRepo`: repo yoksa özel açar; açık ya da fork ise fırlatır. */
  ensureRepo(): Promise<{ created: boolean }>;
  /** Yeni repo'ya ilk yazmayı yeniden denerken bekleme (testte anında). */
  wait?: (ms: number) => Promise<void>;
};

export type SessionStore = {
  cookies: CookieJar;
  env: AuthEnv;
  now(): Date;
  /** Danışan kaydı, taze: yoksa (silinmiş) null, okunamazsa fırlatır. */
  readClient(id: string): Promise<Client | null>;
  loginCode: LoginCodeStore;
};

type Clock = Pick<SessionStore, 'env' | 'now'>;

function signingKey(env: AuthEnv): Uint8Array {
  return new TextEncoder().encode(env.secret);
}

/** Kod isteyen tarayıcının çerezinde adres açık durmaz: anahtarlı özeti. */
function emailDigest(env: AuthEnv, email: string): string {
  return createHash('sha256').update(`${env.secret}:${email}`).digest('hex');
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function sign(store: Clock, payload: Record<string, unknown>, seconds: number): Promise<string> {
  const issuedAt = Math.floor(store.now().getTime() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + seconds)
    .sign(signingKey(store.env));
}

async function verify<T>(store: Clock, token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(store.env), { currentDate: store.now() });
    return payload as T;
  } catch {
    return null;
  }
}

// ---- oturum ----------------------------------------------------------------

type CookieStore = Pick<SessionStore, 'cookies' | 'env' | 'now'>;

function cookieOf(role: Session['role']): string {
  return role === 'pt' ? PT_COOKIE : CLIENT_COOKIE;
}

function cookieOptions(env: AuthEnv, seconds: number): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.secureCookies, path: '/', maxAge: seconds };
}

/** Oturumu kendi rolünün çerezine yazar; diğer rolün oturumuna dokunmaz. */
export async function createSession(store: CookieStore, session: Session): Promise<void> {
  const seconds = SESSION_DAYS * 24 * 60 * 60;
  if (session.role === 'pt' && !store.cookies.get(CLIENT_COOKIE)) {
    // Ayırmadan önce danışan oturumu PT çerezinde tutuluyordu. PT girerken o eski danışan
    // oturumu kendi çerezine taşınır; yoksa aynı tarayıcıdaki danışan sekmesi bir kez düşerdi.
    const legacy = store.cookies.get(PT_COOKIE);
    const payload = legacy ? await verify<{ role?: unknown; exp?: number }>(store, legacy) : null;
    if (legacy && payload?.role === 'client') {
      const remaining = Math.max(1, (payload.exp ?? 0) - Math.floor(store.now().getTime() / 1000));
      store.cookies.set(CLIENT_COOKIE, legacy, cookieOptions(store.env, remaining));
    }
  }
  store.cookies.set(cookieOf(session.role), await sign(store, { ...session }, seconds), cookieOptions(store.env, seconds));
}

async function payloadOf(store: CookieStore, name: string): Promise<(Record<string, unknown> & { role?: unknown }) | null> {
  const token = store.cookies.get(name);
  if (!token) return null;
  return verify<Record<string, unknown>>(store, token);
}

/** PT oturumu (yalnız PT çerezinden). */
export async function readPtSession(store: CookieStore): Promise<PtSession | null> {
  const payload = await payloadOf(store, PT_COOKIE);
  if (!payload) return null;
  const { owner, ptEmail, emailLogin } = store.env;
  // Yetki, oturumun açıldığı yola göre doğrulanır: GitHub girişinde repoların sahibi, yedek
  // e-posta yolunda PT_EMAIL — o yol kapalıysa (anahtar yok) e-postayla açılmış oturum da yok.
  return ptSessionFromPayload(payload, { owner, ptEmail, emailLogin });
}

/**
 * Danışan oturumu (yalnız danışan çerezinden). Çerezi ayırmadan önce danışan oturumu PT
 * çerezinde tutuluyordu; o eski çerez de okunur ki açık danışan oturumları düşmesin.
 */
export async function readClientSession(store: CookieStore): Promise<ClientSession | null> {
  for (const name of [CLIENT_COOKIE, PT_COOKIE]) {
    const payload = await payloadOf(store, name);
    if (
      payload?.role === 'client' &&
      typeof payload.clientId === 'string' &&
      typeof payload.accessVersion === 'number'
    ) {
      return {
        role: 'client',
        clientId: payload.clientId,
        accessVersion: payload.accessVersion,
        ...(typeof payload.joinedAt === 'string' ? { joinedAt: payload.joinedAt } : {}),
      };
    }
  }
  return null;
}

/**
 * Oturumun hâlâ geçerli olduğu danışan kaydı ya da null. Çerez imzalı olsa da tek başına
 * yetmez: PT erişimi kapattıysa (kuşak arttı), danışanı arşivlediyse ya da sildiyse
 * oturum düşer. GitHub'a ulaşılamazsa hata fırlar — "erişimin kapandı" denmez.
 */
export async function sessionClient(store: Pick<SessionStore, 'readClient'>, session: ClientSession): Promise<Client | null> {
  const client = await store.readClient(session.clientId);
  return client && clientSessionValid(client, session.accessVersion) ? client : null;
}

/**
 * PT ya da danışan: ikisine de açık okuma uçları (ör. cihaz fotoğrafı, egzersiz listesi).
 * Danışan çerezi `/me`'deki gibi kayıtla doğrulanır: erişimi kapatılmış, arşivlenmiş ya da
 * silinmiş danışanın oturumu burada da düşer (SPEC §5). PT çerezi geçerliyse kayıt okunmaz.
 * Kayıt okunamazsa hata fırlar; uç onu kendi `try`'ında yanıta çevirir.
 */
export async function readAnySession(store: CookieStore & Pick<SessionStore, 'readClient'>): Promise<Session | null> {
  const pt = await readPtSession(store);
  if (pt) return pt;
  const client = await readClientSession(store);
  if (!client) return null;
  return (await sessionClient(store, client)) ? client : null;
}

/** Yalnız o rolün oturumunu kapatır. */
export async function endSession(store: CookieStore, role: Session['role']): Promise<void> {
  store.cookies.delete(cookieOf(role));
  // Eski düzende PT çerezinde kalmış danışan oturumu da temizlensin.
  if (role === 'client' && (await payloadOf(store, PT_COOKIE))?.role === 'client') store.cookies.delete(PT_COOKIE);
}

// ---- giriş kodu ------------------------------------------------------------

function parseLoginCode(stored: StoredFile | null): LoginCode | null {
  if (!stored) return null;
  const parsed = v.safeParse(loginCodeSchema, stored.content);
  // Bozuk dosya açılmaz; bir sonraki kod üzerine yazar.
  return parsed.success ? parsed.output : null;
}

/**
 * Kod isteğinin yanıttan ÖNCEKİ kısmı: çerez her adrese kurulur ve yalnız adresin özetini taşır.
 * Yanıttan, Set-Cookie'den ve yanıtın süresinden adresin yönetici adresi olup olmadığı anlaşılmasın:
 * GitHub ve e-posta işi (`issueLoginCode`) yanıttan sonra çalışır.
 */
export async function startOtpChallenge(store: CookieStore, email: string): Promise<void> {
  const token = await sign(store, { e: emailDigest(store.env, email) }, LOGIN_CODE_TTL_SECONDS);
  store.cookies.set(OTP_COOKIE, token, cookieOptions(store.env, LOGIN_CODE_TTL_SECONDS));
}

/**
 * Kod üretimi (yanıttan sonra). İstek kimliksiz olduğu için GitHub'a yalnız yönetici adresinde ve
 * oran sınırı geçilince gidilir; sınır önce önbellekteki durumla denetlenir. Kod dosyası veri
 * repo'suna yazıldığı için önce repo hazırlanır (SPEC §2): yoksa özel açılır (taze kurulumda OAuth
 * yanlışken de PT girebilsin), açık ya da fork ise hiçbir şey yazılmaz ve gönderilmez — hata yukarı
 * çıkar, çağıran sebebini günlüğe yazar. Yazma taze okumanın `sha`'sıyla: aynı anda gelen iki istekten
 * yalnız biri yazar. Yeni kod eskisini geçersiz kılar. Kod yalnız dönen değerde var; gönderimi çağıran yapar.
 */
export async function issueLoginCode(store: Pick<SessionStore, 'env' | 'now' | 'loginCode'>, email: string): Promise<string | null> {
  const { env, loginCode } = store;
  if (!env.ptEmail || email !== env.ptEmail) return null;
  const context = { secret: env.secret, email, now: store.now() };
  // Erken ya da saatlik sınırı dolmuş istek: GitHub'a hiç gidilmez.
  if (!requestLoginCode(parseLoginCode(await loginCode.readCached()), context).ok) return null;

  const problem = await loginCode.repoProblem();
  if (problem) throw new GithubError(problem, 409);
  const { created } = await loginCode.ensureRepo();

  const fresh = await loginCode.readFresh();
  const request = requestLoginCode(parseLoginCode(fresh), context);
  if (!request.ok) return null;
  const write = () => loginCode.write(request.state, fresh?.sha, 'Yeni giriş kodu');
  await (created ? writeToFreshRepo(write, loginCode.wait) : write());
  loginCode.invalidate();
  return request.code;
}

export type OtpResult = { ok: true; email: string } | { ok: false; reason: LoginCodeFailure };

/**
 * Kodu dener; davet kodunun kalıbıyla (`redeemInvite`). Kod yok, kullanılmış, süresi dolmuş ya da
 * kilitliyse karar önbellekten verilir, GitHub'a gidilmez. Bekleyen kodda deneme, kod
 * karşılaştırılmadan ÖNCE taze okumanın `sha` kilidiyle sayılır: aynı anda gelen tahminlerden sayacı
 * yazamayan hiç denenmez, eski çerezi yeniden göndermek sayacı atlatamaz. Doğru kod aynı kilitle
 * `used` olur. GitHub'a ulaşılamazsa hata fırlar ("kod hatalı" denmez).
 */
export async function consumeOtp(store: SessionStore, code: string, email: string): Promise<OtpResult> {
  const payload = await payloadOf(store, OTP_COOKIE);
  if (typeof payload?.e !== 'string') return { ok: false, reason: 'expired' };
  if (!equal(payload.e, emailDigest(store.env, email))) return { ok: false, reason: 'invalid' };

  const { env, loginCode } = store;
  // Sunucuda kodu olan tek adres yöneticininki; öteki adresler hiçbir koşulda açılmaz.
  if (!env.ptEmail || email !== env.ptEmail) return { ok: false, reason: 'invalid' };

  const now = store.now();
  const context = { secret: env.secret, email, now };
  const cached = beginLoginCodeAttempt(parseLoginCode(await loginCode.readCached()), context);
  if (!cached.ok) return cached;

  const fresh = await loginCode.readFresh();
  const begun = beginLoginCodeAttempt(parseLoginCode(fresh), context);
  if (!begun.ok) return begun;
  const reserved = await loginCode.write(begun.counted, fresh?.sha, 'Giriş kodu denendi');
  loginCode.invalidate();

  const result = finishLoginCodeAttempt(begun.counted, { secret: env.secret, code, now });
  if (!result.ok) return result;
  try {
    await loginCode.write(result.used, reserved.sha, 'Giriş kodu kullanıldı');
  } catch (error) {
    // Aynı anda başka bir deneme ya da yeni kod dosyayı değiştirdi.
    if (error instanceof GithubError && error.status === 409) return { ok: false, reason: 'expired' };
    throw error;
  }
  loginCode.invalidate();
  store.cookies.delete(OTP_COOKIE);
  return { ok: true, email };
}
