import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import * as v from 'valibot';

/**
 * PT girişinin saf kuralları (SPEC §2, §5): GitHub'a ve çerezlere dokunmaz. Akış (okuma, yazma,
 * çerez) `session-core.ts`'te, Next'e bağlanması `session.ts`'te; kurallar burada, test edilebilir.
 *
 * 1. PT oturumunun yükü hangi koşulda geçerli (`ptSessionFromPayload`).
 * 2. Yedek e-posta girişinin kodu. Durumu sunucuda, uygulama repo'sunda tek dosyada tutulur
 *    (`data/login-code.json`): sayaç istemcinin elindeki bir çerezde olsaydı, eski çerezi
 *    yeniden gönderen sınırsız denerdi. Dosya kişisel veri taşımaz: kodun ve adresin yalnız
 *    anahtarlı özeti (HMAC-SHA256, anahtar `AUTH_SECRET`), zamanlar ve sayaçlar.
 */

/**
 * PT oturumu iki yoldan açılabilir ve doğrulaması yola göre değişir:
 * - `github`: `subject` = GitHub kullanıcı adı, `GITHUB_OWNER` ile karşılaştırılır (asıl yol)
 * - `email`:  `subject` = e-posta adresi, `PT_EMAIL` ile karşılaştırılır (yedek yol; yalnız
 *   `RESEND_API_KEY` tanımlıyken)
 */
export type PtSession = { role: 'pt'; via: 'github' | 'email'; subject: string };

/**
 * PT oturumunun yükü hâlâ geçerli mi. Yetki oturumun açıldığı yola göre doğrulanır: GitHub
 * girişinde repoların sahibi (`GITHUB_OWNER`), yedek e-posta yolunda `PT_EMAIL` — ama yalnız o
 * yol açıkken: `RESEND_API_KEY` kaldırılınca e-postayla açılmış oturumlar da düşer (SPEC §2
 * "Girilmezse e-posta yolu kapalıdır"). Ayarlar sonradan değişirse eski oturum geçersiz olur.
 */
export function ptSessionFromPayload(
  payload: Record<string, unknown>,
  env: { owner: string; ptEmail: string; emailLogin: boolean },
): PtSession | null {
  if (payload.role !== 'pt' || typeof payload.subject !== 'string') return null;
  const via = payload.via === 'email' ? 'email' : payload.via === 'github' ? 'github' : null;
  if (!via) return null;
  const expected = via === 'github' ? env.owner : env.emailLogin ? env.ptEmail : '';
  if (!expected || payload.subject.toLowerCase() !== expected.toLowerCase()) return null;
  return { role: 'pt', via, subject: payload.subject };
}

/** Formdaki uzunlukla aynı (`schemas/auth.ts` → `OTP_LENGTH`). */
export const LOGIN_CODE_LENGTH = 6;
/** Kod 5 dakika geçerli. */
export const LOGIN_CODE_TTL_SECONDS = 5 * 60;
/** Bu kadar denemeden sonra kod kilitlenir (doğru kod da açmaz); yeni kod istenir. */
export const LOGIN_CODE_MAX_ATTEMPTS = 3;
/** Yeni kod en erken bu kadar saniye sonra üretilir… */
export const LOGIN_CODE_MIN_INTERVAL_SECONDS = 60;
/** …ve bir saatte en çok bu kadar. */
export const LOGIN_CODE_MAX_PER_HOUR = 5;

const HOUR_MS = 60 * 60 * 1000;
const hex64 = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/));
const timestamp = v.pipe(v.string(), v.isoTimestamp());

/** `data/login-code.json`: aynı anda tek etkin kod ve son bir saatte kod üretilen anlar. */
export const loginCodeSchema = v.object({
  /** Kodun istendiği adresin özeti: `PT_EMAIL` değişirse eski kod yeni adrese açılmaz. */
  emailHash: hex64,
  codeHash: hex64,
  createdAt: timestamp,
  expiresAt: timestamp,
  /** Denemeler (doğru kod dahil); kod karşılaştırılmadan önce yazılır. */
  attempts: v.pipe(v.number(), v.integer(), v.minValue(0)),
  used: v.boolean(),
  usedAt: v.optional(timestamp),
  /** Son bir saatte kod üretilen anlar (oran sınırı). */
  issuedAt: v.array(timestamp),
});
export type LoginCode = v.InferOutput<typeof loginCodeSchema>;

/** Kodun anahtarlı özeti. Ön ek, aynı sırla üretilen başka özetlerle (davet kodu) karışmasın diye. */
export function hashLoginCode(secret: string, code: string): string {
  return createHmac('sha256', secret).update(`login-code:${code}`).digest('hex');
}

export function hashLoginEmail(secret: string, email: string): string {
  return createHmac('sha256', secret).update(`login-email:${email.trim().toLowerCase()}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export type LoginCodeRequest =
  | { ok: true; code: string; state: LoginCode }
  /** Oran sınırı: kod üretilmez ve gönderilmez; varsa etkin kod geçerli kalır. */
  | { ok: false; reason: 'too_soon' | 'hourly_limit' };

/**
 * Yeni kod isteği: en çok dakikada bir ve saatte beş. Sınır içindeyse yeni kod eskisinin yerine
 * geçer (aynı anda tek etkin kod); kodun kendisi yalnız dönen değerde var, durumda özeti.
 */
export function requestLoginCode(
  current: LoginCode | null,
  { secret, email, now }: { secret: string; email: string; now: Date },
): LoginCodeRequest {
  const recent = (current?.issuedAt ?? []).filter((at) => Date.parse(at) > now.getTime() - HOUR_MS);
  const latest = Math.max(...recent.map((at) => Date.parse(at)));
  if (now.getTime() - latest < LOGIN_CODE_MIN_INTERVAL_SECONDS * 1000) return { ok: false, reason: 'too_soon' };
  if (recent.length >= LOGIN_CODE_MAX_PER_HOUR) return { ok: false, reason: 'hourly_limit' };

  const code = String(randomInt(0, 10 ** LOGIN_CODE_LENGTH)).padStart(LOGIN_CODE_LENGTH, '0');
  return {
    ok: true,
    code,
    state: {
      emailHash: hashLoginEmail(secret, email),
      codeHash: hashLoginCode(secret, code),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_SECONDS * 1000).toISOString(),
      attempts: 0,
      used: false,
      issuedAt: [...recent, now.toISOString()],
    },
  };
}

export type LoginCodeStatus = 'none' | 'used' | 'locked' | 'expired' | 'pending';

export function loginCodeStatus(state: LoginCode | null, now: Date): LoginCodeStatus {
  if (!state) return 'none';
  if (state.used) return 'used';
  if (state.attempts >= LOGIN_CODE_MAX_ATTEMPTS) return 'locked';
  if (Date.parse(state.expiresAt) <= now.getTime()) return 'expired';
  return 'pending';
}

export type LoginCodeFailure = 'expired' | 'invalid' | 'too_many';

/**
 * Denemenin ilk yarısı, kod KARŞILAŞTIRILMADAN: bu adrese etkin bir kod varsa sayacı artmış
 * durum döner. Çağıran bunu `sha` kilidiyle yazar ve yalnız yazabildiyse
 * `finishLoginCodeAttempt` ile kodu karşılaştırır: aynı anda gelen tahminlerden sayacı
 * yazamayan hiç denenmez, eski bir çerezi ya da isteği yeniden göndermek sayacı atlatamaz.
 */
export function beginLoginCodeAttempt(
  state: LoginCode | null,
  { secret, email, now }: { secret: string; email: string; now: Date },
): { ok: true; counted: LoginCode } | { ok: false; reason: Exclude<LoginCodeFailure, 'invalid'> } {
  const status = loginCodeStatus(state, now);
  if (status === 'locked') return { ok: false, reason: 'too_many' };
  // Kullanılmış, süresi dolmuş, hiç üretilmemiş ya da başka adrese üretilmiş kod: "yeni kod iste".
  if (!state || status !== 'pending' || !sameHash(state.emailHash, hashLoginEmail(secret, email))) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, counted: { ...state, attempts: state.attempts + 1 } };
}

/** Sayılmış denemenin sonucu: doğru kodda kullanılmış durum; yanlışta neden (son hak gittiyse kilit). */
export function finishLoginCodeAttempt(
  counted: LoginCode,
  { secret, code, now }: { secret: string; code: string; now: Date },
): { ok: true; used: LoginCode } | { ok: false; reason: Exclude<LoginCodeFailure, 'expired'> } {
  if (sameHash(counted.codeHash, hashLoginCode(secret, code))) {
    return { ok: true, used: { ...counted, used: true, usedAt: now.toISOString() } };
  }
  return { ok: false, reason: counted.attempts >= LOGIN_CODE_MAX_ATTEMPTS ? 'too_many' : 'invalid' };
}
