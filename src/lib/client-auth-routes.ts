import * as v from 'valibot';
import { INVITE_CODE_LENGTH, normalizeInviteCode, PASSWORD_MAX_LENGTH } from './client-status.ts';
import type { loginWithPassword, redeemInvite, setClientPassword } from './clients-core.ts';
import { describeError } from './github/errors.ts';
import { setPasswordSchema } from './schemas/auth.ts';
import { clientIdSchema } from './schemas/client.ts';
import type { ClientSession } from './session-core.ts';

/**
 * Danışan giriş uçlarının ince çekirdeği (SPEC §5): `/api/join`, `/api/giris`, `/api/me/password`.
 * Uçlar yalnız isteği okuyup buraya verir ve sonucu yanıta çevirir; kararlar (tek tip yanıt,
 * bilinmeyen kimliğin GitHub'a gitmemesi, oturumun taşıdığı alanlar, köken denetimi) burada ve test
 * edilir. Şifre ne yanıta ne günlüğe yazılır.
 */

export type RouteResult = { status: number; body: Record<string, unknown> };

type Log = (message: string) => void;
type CreateSession = (session: ClientSession) => Promise<void>;

const UNAVAILABLE = 'Şu an giriş yapılamıyor. Biraz sonra tekrar dene.';

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Yalnız bu siteden: köken başlığı yoksa Referer'ın kökeni; ikisi de yoksa ya da başka bir kökense 403.
 * Gövdesiz durum değiştiren istekler (DELETE) yalnız buna bakar.
 */
export function originGuard(headers: Headers, expectedOrigin: string): RouteResult | null {
  const source = headers.get('origin') ?? refererOrigin(headers.get('referer'));
  return source === expectedOrigin ? null : { status: 403, body: { error: 'Bu istek bu siteden gelmedi.' } };
}

/**
 * Durum değiştiren danışan POST'ları yalnız bu siteden ve JSON'la (giriş CSRF'sine karşı; çerezin
 * SameSite=Lax'ı tek savunma kalmasın). Köken başlığı yoksa Referer'ın kökeni; ikisi de yoksa ya da
 * başka bir kökense 403. JSON değilse 415: `text/plain` form gönderimi de ayrıştırılmasın.
 */
export function postGuard(headers: Headers, expectedOrigin: string): RouteResult | null {
  const blocked = originGuard(headers, expectedOrigin);
  if (blocked) return blocked;
  const type = headers.get('content-type')?.trim().toLowerCase() ?? '';
  if (type !== 'application/json' && !type.startsWith('application/json;')) {
    return { status: 415, body: { error: 'İstek JSON olmalı.' } };
  }
  return null;
}

/* --- /api/join --- */

const JOIN_REASONS: Record<string, string> = {
  invalid: 'Kod yanlış. Antrenörünün verdiği kodu kontrol et.',
  locked: 'Çok fazla yanlış deneme oldu. Antrenöründen yeni bir kare kod iste.',
  used: 'Bu kod daha önce kullanılmış. Şifren varsa şifreyle gir; yoksa antrenöründen yeni bir kare kod iste.',
  expired: 'Kodun süresi dolmuş. Antrenöründen yeni bir kare kod iste.',
  none: 'Geçerli bir davet bulunamadı. Antrenöründen yeni bir kare kod iste.',
  archived: 'Bu hesap kapalı. Antrenörünle görüş.',
};

const joinBody = v.object({ clientId: v.string(), code: v.string() });

/**
 * Kare kodla giriş, birinci adım. Oturum kodun kullanıldığı anı taşır (`joinedAt`): yalnız bu oturum,
 * 60 dk içinde, şifre belirleyebilir. Bilinmeyen kimlik ile davetsiz danışan aynı yanıtı alır.
 */
export async function joinRoute(
  deps: {
    isKnownClient(id: string): Promise<boolean>;
    redeem(id: string, code: string): ReturnType<typeof redeemInvite>;
    createSession: CreateSession;
    log: Log;
  },
  input: unknown,
): Promise<RouteResult> {
  const body = v.safeParse(joinBody, input);
  if (!body.success || !v.is(clientIdSchema, body.output.clientId)) return { status: 400, body: { error: JOIN_REASONS.none } };
  const code = normalizeInviteCode(body.output.code);
  if (!new RegExp(`^\\d{${INVITE_CODE_LENGTH}}$`).test(code)) {
    const message = `Kod ${INVITE_CODE_LENGTH} haneli olmalı.`;
    return { status: 400, body: { error: message, fields: { code: message } } };
  }
  const { clientId } = body.output;
  try {
    // Listede olmayan kimlik GitHub'a hiç gitmez; davetsiz danışanla aynı yanıtı alır.
    if (!(await deps.isKnownClient(clientId))) return { status: 410, body: { error: JOIN_REASONS.none } };
    const result = await deps.redeem(clientId, code);
    if (!result.ok) return { status: result.reason === 'invalid' ? 401 : 410, body: { error: JOIN_REASONS[result.reason] } };
    await deps.createSession({
      role: 'client',
      clientId: result.client.id,
      accessVersion: result.client.access.version,
      joinedAt: result.joinedAt,
    });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    // GitHub'a ulaşılamadı ya da istek sınırı doldu: "kod yanlış" denmez. Kod günlüğe yazılmaz.
    deps.log(`[katil] ${clientId}: ${describeError(error)}`);
    return { status: 502, body: { error: UNAVAILABLE } };
  }
}

/* --- /api/giris --- */

/**
 * Kilitli, yanlış, şifresiz, erişimi kapalı, arşivde ya da bilinmeyen kimlik: hepsi aynı yanıt
 * (durum ve metin). Yanıttan hesabın durumu anlaşılmasın.
 */
export const LOGIN_DENIED = 'Şifre yanlış ya da hesap kısa süreliğine kilitli.';

const loginBody = v.object({ clientId: v.string(), password: v.string() });

/**
 * Şifreyle giriş. Doğruysa oturum kayıttaki kuşakla açılır ve kare kod anı TAŞIMAZ: şifreyle açılan
 * oturum şifre değiştiremez. Listede olmayan ya da bozuk kimlik, sınırı aşan şifre GitHub'a gitmez.
 */
export async function passwordLoginRoute(
  deps: {
    isKnownClient(id: string): Promise<boolean>;
    login(id: string, password: string): ReturnType<typeof loginWithPassword>;
    createSession: CreateSession;
    log: Log;
  },
  input: unknown,
): Promise<RouteResult> {
  const denied = { status: 401, body: { error: LOGIN_DENIED } };
  const body = v.safeParse(loginBody, input);
  if (!body.success) return { status: 400, body: { error: 'İstek geçersiz.' } };
  const { clientId, password } = body.output;
  if (!password) return { status: 400, body: { error: 'Şifreni yaz.', fields: { password: 'Şifreni yaz.' } } };
  // Sınırı aşan şifre doğru olamaz (UTF-16'da karakter başına en çok 2 birim): deneme de sayılmaz.
  if (!v.is(clientIdSchema, clientId) || password.length > PASSWORD_MAX_LENGTH * 2) return denied;
  try {
    if (!(await deps.isKnownClient(clientId))) return denied;
    const result = await deps.login(clientId, password);
    if (!result.ok) return denied;
    await deps.createSession({ role: 'client', clientId, accessVersion: result.client.access.version });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    // GitHub'a ulaşılamadı ya da aynı anda başka bir deneme sayacı yazdı: "şifre yanlış" denmez.
    deps.log(`[giris] ${clientId}: ${describeError(error)}`);
    return { status: 502, body: { error: UNAVAILABLE } };
  }
}

/* --- /api/me/password --- */

/**
 * Şifre belirleme: kimlik yalnız oturumdan. İzin oturuma bağlı (`canSetPassword`): izinsiz oturum 409,
 * geçersiz oturum 401. Kural hataları alanın altında (400, `fields`).
 */
export async function setPasswordRoute(
  deps: {
    session: ClientSession | null;
    setPassword(session: ClientSession, password: string): ReturnType<typeof setClientPassword>;
    log: Log;
  },
  input: unknown,
): Promise<RouteResult> {
  const { session } = deps;
  if (!session) return { status: 401, body: { error: 'Oturumun kapanmış. Yeniden giriş yap.' } };
  const body = v.safeParse(setPasswordSchema, input);
  if (!body.success) {
    const fields: Record<string, string> = {};
    for (const issue of body.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 400, body: { error: fields.password ?? fields.confirm ?? 'İstek geçersiz.', fields } };
  }
  try {
    const result = await deps.setPassword(session, body.output.password);
    if (result.ok) return { status: 200, body: { ok: true } };
    if (result.reason === 'weak') return { status: 400, body: { error: result.problem, fields: { password: result.problem } } };
    if (result.reason === 'session') {
      return { status: 401, body: { error: 'Oturumun kapanmış. Antrenöründen yeni bir kare kod iste.' } };
    }
    return {
      status: 409,
      body: { error: 'Bu oturumda şifre belirlenemez. Şifreni değiştirmek için antrenöründen yeni bir kare kod iste.' },
    };
  } catch (error) {
    // GitHub'a ulaşılamadı ya da iki sekme aynı anda yazdı: danışan yeniden dener.
    deps.log(`[sifre] ${session.clientId}: ${describeError(error)}`);
    return { status: 502, body: { error: 'Şifre kaydedilemedi. Biraz sonra tekrar dene.' } };
  }
}
