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

const SESSION_COOKIE = 'pc_oturum';
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
export type Session =
  | { role: 'pt'; via: 'github' | 'email'; subject: string }
  /** Danışan oturumu: yetki her zaman buradan okunur, adresteki kimlikten değil (SPEC §5). */
  | { role: 'client'; clientId: string };

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

export async function createSession(session: Session): Promise<void> {
  const seconds = SESSION_DAYS * 24 * 60 * 60;
  const token = await sign({ ...session }, seconds);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: seconds,
  });
}

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verify<Session & { exp: number }>(token);
  if (!payload) return null;

  if (payload.role === 'pt' && typeof payload.subject === 'string') {
    const env = serverEnv();
    // Yetki, oturumun açıldığı yola göre doğrulanır: GitHub girişinde repoların sahibi,
    // yedek e-posta yolunda PT_EMAIL. Ayarlar sonradan değişirse eski oturum geçersiz olur.
    const expected = payload.via === 'github' ? env.owner : env.ptEmail;
    if (expected && payload.subject.toLowerCase() === expected.toLowerCase()) {
      return { role: 'pt', via: payload.via, subject: payload.subject };
    }
    return null;
  }

  if (payload.role === 'client' && typeof payload.clientId === 'string') {
    return { role: 'client', clientId: payload.clientId };
  }
  return null;
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
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
