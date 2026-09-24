import 'server-only';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { serverEnv } from './env';

/**
 * Oturumlar ve giriş kodu — depolama YOK.
 *
 * Giriş kodu sunucuda saklanmaz: gönderilirken kodun özeti kısa ömürlü, imzalı, httpOnly
 * bir çerezde taşınır. Böylece sunucusuz ortamda durum tutmaya gerek kalmaz ve kodun
 * kendisi hiçbir yere yazılmaz. Oturum da aynı şekilde imzalı çerezdir (SPEC §5).
 */

/**
 * PT ve danışan AYRI çerezde: aynı tarayıcıda (ör. PT bir sekmede danışan olarak denerken)
 * biri ötekinin oturumunu ezmez. PT'nin çerez adı eskisiyle aynı, açık oturumlar düşmesin.
 */
const PT_COOKIE = 'pc_oturum';
const CLIENT_COOKIE = 'pc_danisan';
const OTP_COOKIE = 'pc_kod';
const SESSION_DAYS = 30;
const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_LENGTH = 6;

/**
 * PT oturumu iki yoldan açılabilir ve doğrulaması yola göre değişir:
 * - `github`: `subject` = GitHub kullanıcı adı, `GITHUB_OWNER` ile karşılaştırılır (asıl yol)
 * - `email`:  `subject` = e-posta adresi, `PT_EMAIL` ile karşılaştırılır (yedek yol)
 */
export type PtSession = { role: 'pt'; via: 'github' | 'email'; subject: string };
export type ClientSession = {
  role: 'client';
  clientId: string;
  /**
   * Danışan kaydındaki `access.version` ile eşleşmezse oturum geçersizdir (PT erişimi
   * kapattı); bu kontrol kaydı okuyan `sessionClient` içinde yapılır.
   */
  accessVersion: number;
};

/** Danışan oturumunda yetki her zaman buradan okunur, adresteki kimlikten değil (SPEC §5). */
export type Session = PtSession | ClientSession;

function key(): Uint8Array {
  return new TextEncoder().encode(serverEnv().authSecret);
}

function digest(value: string): string {
  return createHash('sha256').update(`${serverEnv().authSecret}:${value}`).digest('hex');
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function sign(payload: Record<string, unknown>, seconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .sign(key());
}

async function verify<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as T;
  } catch {
    return null;
  }
}

// ---- oturum ----------------------------------------------------------------

function cookieOf(role: Session['role']): string {
  return role === 'pt' ? PT_COOKIE : CLIENT_COOKIE;
}

/** Oturumu kendi rolünün çerezine yazar; diğer rolün oturumuna dokunmaz. */
export async function createSession(session: Session): Promise<void> {
  const seconds = SESSION_DAYS * 24 * 60 * 60;
  const token = await sign({ ...session }, seconds);
  (await cookies()).set(cookieOf(session.role), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: seconds,
  });
}

async function payloadOf(name: string): Promise<(Record<string, unknown> & { role?: unknown }) | null> {
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  return verify<Record<string, unknown>>(token);
}

/** PT oturumu (yalnız PT çerezinden). */
export async function readPtSession(): Promise<PtSession | null> {
  const payload = await payloadOf(PT_COOKIE);
  if (!payload || payload.role !== 'pt' || typeof payload.subject !== 'string') return null;
  const via = payload.via === 'email' ? 'email' : payload.via === 'github' ? 'github' : null;
  if (!via) return null;
  const env = serverEnv();
  // Yetki, oturumun açıldığı yola göre doğrulanır: GitHub girişinde repoların sahibi,
  // yedek e-posta yolunda PT_EMAIL. Ayarlar sonradan değişirse eski oturum geçersiz olur.
  const expected = via === 'github' ? env.owner : env.ptEmail;
  if (expected && payload.subject.toLowerCase() === expected.toLowerCase()) {
    return { role: 'pt', via, subject: payload.subject };
  }
  return null;
}

/**
 * Danışan oturumu (yalnız danışan çerezinden). Çerezi ayırmadan önce danışan oturumu PT
 * çerezinde tutuluyordu; o eski çerez de okunur ki açık danışan oturumları düşmesin.
 */
export async function readClientSession(): Promise<ClientSession | null> {
  for (const name of [CLIENT_COOKIE, PT_COOKIE]) {
    const payload = await payloadOf(name);
    if (
      payload?.role === 'client' &&
      typeof payload.clientId === 'string' &&
      typeof payload.accessVersion === 'number'
    ) {
      return { role: 'client', clientId: payload.clientId, accessVersion: payload.accessVersion };
    }
  }
  return null;
}

/** PT ya da danışan: ikisine de açık okuma uçları (ör. cihaz fotoğrafı, egzersiz listesi). */
export async function readAnySession(): Promise<Session | null> {
  return (await readPtSession()) ?? (await readClientSession());
}

/** Yalnız o rolün oturumunu kapatır. */
export async function endSession(role: Session['role']): Promise<void> {
  const store = await cookies();
  store.delete(cookieOf(role));
  // Eski düzende PT çerezinde kalmış danışan oturumu da temizlensin.
  if (role === 'client' && (await payloadOf(PT_COOKIE))?.role === 'client') store.delete(PT_COOKIE);
}

// ---- giriş kodu ------------------------------------------------------------

export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

export async function issueOtpChallenge(email: string, code: string): Promise<void> {
  const token = await sign({ e: digest(email), c: digest(code), a: 0 }, OTP_TTL_SECONDS);
  (await cookies()).set(OTP_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OTP_TTL_SECONDS,
  });
}

export type OtpResult = { ok: true; email: string } | { ok: false; reason: 'expired' | 'invalid' | 'too_many' };

export async function consumeOtp(code: string, email: string): Promise<OtpResult> {
  const store = await cookies();
  const token = store.get(OTP_COOKIE)?.value;
  if (!token) return { ok: false, reason: 'expired' };

  const payload = await verify<{ e: string; c: string; a: number; exp: number }>(token);
  if (!payload) return { ok: false, reason: 'expired' };
  if (payload.a >= OTP_MAX_ATTEMPTS) {
    store.delete(OTP_COOKIE);
    return { ok: false, reason: 'too_many' };
  }
  if (!equal(payload.e, digest(email))) return { ok: false, reason: 'invalid' };

  if (!equal(payload.c, digest(code))) {
    // Deneme sayacı çerezde taşınır; kalan süre korunur.
    const remaining = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
    const next = await sign({ e: payload.e, c: payload.c, a: payload.a + 1 }, remaining);
    store.set(OTP_COOKIE, next, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: remaining,
    });
    return { ok: false, reason: 'invalid' };
  }

  store.delete(OTP_COOKIE);
  return { ok: true, email };
}
