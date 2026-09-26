import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import * as v from 'valibot';
import {
  LOGIN_LOCK_MAX_MINUTES,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_MAX_LOCKS,
  PASSWORD_MAX_LENGTH,
} from './client-status.ts';

/**
 * Danışanın şifresi (SPEC §5) — saf kurallar. Yalnız sunucuda (`node:crypto`); GitHub'a dokunmaz:
 * akış (okuma, `sha` kilidiyle yazma) `clients-core.ts`'te, Next'e bağlanması `clients.ts`'te.
 *
 * İlk giriş kare kodla (davet), sonrakiler şifreyle. Şifrenin kendisi hiçbir yerde durmaz:
 * danışan repo'sundaki `auth.json` yalnız tuzlu scrypt özetini, belirlendiği anı ve yanlış deneme
 * sayacını taşır. Sayaç istemcide (çerezde) olsaydı eski isteği yeniden gönderen sınırsız denerdi.
 */

/**
 * Özet sürümleri (`auth.json` → `kdf`). 1: scrypt N=2¹⁴ (ilk sürüm, ~35 ms); 2: N=2¹⁷ (OWASP önerisi,
 * 128 MB, ~0,4 s). Yeni şifre güncel sürümle yazılır; eski sürümlü kayıt başarılı girişte yeniden
 * hesaplanır (`loginWithPassword`). Sürümün ayarı değiştirilmez: yeni ayar yeni sürüm demektir.
 */
export const KDF = {
  1: { N: 2 ** 14, r: 8, p: 1, maxmem: 32 * 1024 * 1024 },
  2: { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
} as const;
export type KdfVersion = keyof typeof KDF;
export const CURRENT_KDF: KdfVersion = 2;
const KEY_BYTES = 64;
const SALT_BYTES = 16;

const timestamp = v.pipe(v.string(), v.isoTimestamp());

/** `client-<id>/auth.json`. */
export const authRecordSchema = v.object({
  /** Özet sürümü (`KDF`); yazılmamışsa ilk sürüm. */
  kdf: v.optional(v.picklist([1, 2] as const), 1),
  /** scrypt(şifre, tuz), onaltılık. */
  passwordHash: v.pipe(v.string(), v.regex(new RegExp(`^[a-f0-9]{${KEY_BYTES * 2}}$`))),
  salt: v.pipe(v.string(), v.regex(new RegExp(`^[a-f0-9]{${SALT_BYTES * 2}}$`))),
  /** Şifrenin belirlendiği an (deneme sayacı değişince değişmez). */
  updatedAt: timestamp,
  /**
   * Şifre belirlenirken kayıttaki oturum kuşağı. PT "Erişimi kapat" deyince kuşak artar ve bu şifre
   * de açmaz: kapatmadan önce ya da kapatmayla yarışan bir istekte belirlenmiş şifre yeni kuşakta
   * oturum açamaz. Danışan yeni kare kodla girip yenisini belirler.
   */
  accessVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  /** Art arda sayılmış denemeler; doğru şifre sıfırlar. Şifre karşılaştırılmadan ÖNCE yazılır. */
  failedAttempts: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /** Bu şifreyle kaç kez kilitlendi (artan ceza); doğru şifre sıfırlar. */
  lockCount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  /** Kilidin bittiği an; kilit yoksa null. */
  lockedUntil: v.nullable(timestamp),
  /** Şifre girişinin kapandığı an (`LOGIN_MAX_LOCKS`. kilit): yalnız yeni kare kod açar. */
  disabledAt: v.optional(v.nullable(timestamp), null),
});
export type AuthRecord = v.InferOutput<typeof authRecordSchema>;

/** Farklı klavyeler aynı harfi farklı bayt dizisiyle yazabilir ("ş"): özet NFC biçimden alınır. */
function normalize(password: string): string {
  return password.normalize('NFC');
}

/** Karakter sayısı (emoji iki değil bir sayılır). Şifrenin kuralları `password-rules.ts`'te. */
function length(password: string): number {
  return [...normalize(password)].length;
}

function derive(password: string, salt: Buffer, kdf: KdfVersion): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(normalize(password), salt, KEY_BYTES, KDF[kdf], (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Şifrenin özeti ve tuzu, verilen sürümle (yeni tuz). */
export async function hashPassword(
  password: string,
  kdf: KdfVersion = CURRENT_KDF,
): Promise<Pick<AuthRecord, 'kdf' | 'passwordHash' | 'salt'>> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, kdf);
  return { kdf, passwordHash: key.toString('hex'), salt: salt.toString('hex') };
}

/** Yeni şifrenin kaydı: yeni tuz, sayaçlar sıfır, kilit yok. */
export async function newAuthRecord(
  password: string,
  { accessVersion, now, kdf = CURRENT_KDF }: { accessVersion: number; now: Date; kdf?: KdfVersion },
): Promise<AuthRecord> {
  return {
    ...(await hashPassword(password, kdf)),
    updatedAt: now.toISOString(),
    accessVersion,
    failedAttempts: 0,
    lockCount: 0,
    lockedUntil: null,
    disabledAt: null,
  };
}

/** Şifre bu kayda uyuyor mu (sabit süreli karşılaştırma). */
export async function verifyPassword(record: Pick<AuthRecord, 'kdf' | 'passwordHash' | 'salt'>, password: string): Promise<boolean> {
  if (length(password) > PASSWORD_MAX_LENGTH) return false;
  const expected = Buffer.from(record.passwordHash, 'hex');
  const actual = await derive(password, Buffer.from(record.salt, 'hex'), record.kdf);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Dosya: yoksa null. Bozuk kayıt açılmaz (şifre yok sayılır); danışan yeni kare kodla yenisini belirler. */
export function parseAuth(stored: { content: unknown; sha: string } | null): { auth: AuthRecord; sha: string } | null {
  if (!stored) return null;
  const parsed = v.safeParse(authRecordSchema, stored.content);
  return parsed.success ? { auth: parsed.output, sha: stored.sha } : null;
}

/** Kilitli mi: süreli kilit sürüyor ya da şifre girişi kapandı. */
export function loginLocked(record: Pick<AuthRecord, 'lockedUntil' | 'disabledAt'>, now: Date): boolean {
  return Boolean(record.disabledAt) || Boolean(record.lockedUntil && Date.parse(record.lockedUntil) > now.getTime());
}

/** n. kilidin süresi (dk): 15, 30, 60…, en fazla 24 saat. */
export function lockMinutes(lockCount: number): number {
  return Math.min(LOGIN_LOCK_MINUTES * 2 ** Math.max(0, lockCount - 1), LOGIN_LOCK_MAX_MINUTES);
}

/**
 * Denemenin ilk yarısı, şifre KARŞILAŞTIRILMADAN (davet kodundaki kalıp): kilitli değilse sayacı
 * artmış kayıt döner. Çağıran bunu `sha` kilidiyle yazar ve yalnız yazabildiyse şifreyi karşılaştırır:
 * aynı anda gelen tahminlerden sayacı yazamayan hiç denenmez. Beşinci deneme kilidi de birlikte yazar
 * (doğruysa ardından kalkar); kilit her seferinde uzar, üçüncü kilitte şifre girişi kapanır (yalnız
 * yeni kare kod açar). Süresi dolmuş kilitten sonra deneme sayacı baştan başlar, kilit sayısı sürer.
 */
export function beginLoginAttempt(
  record: AuthRecord,
  now: Date,
): { ok: true; counted: AuthRecord } | { ok: false; reason: 'locked' } {
  if (loginLocked(record, now)) return { ok: false, reason: 'locked' };
  const failedAttempts = (record.lockedUntil ? 0 : record.failedAttempts) + 1;
  if (failedAttempts < LOGIN_MAX_ATTEMPTS) return { ok: true, counted: { ...record, failedAttempts, lockedUntil: null } };
  const lockCount = record.lockCount + 1;
  if (lockCount >= LOGIN_MAX_LOCKS) {
    return { ok: true, counted: { ...record, failedAttempts, lockCount, lockedUntil: null, disabledAt: now.toISOString() } };
  }
  const lockedUntil = new Date(now.getTime() + lockMinutes(lockCount) * 60 * 1000).toISOString();
  return { ok: true, counted: { ...record, failedAttempts, lockCount, lockedUntil } };
}

/** Doğru şifreden sonra: sayaçlar ve kilit kalkar. */
export function clearedAttempts(record: AuthRecord): AuthRecord {
  return { ...record, failedAttempts: 0, lockCount: 0, lockedUntil: null, disabledAt: null };
}
