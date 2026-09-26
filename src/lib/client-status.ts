import type { Client, ClientIndexEntry, ClientStatus, HealthField, Invite } from './schemas/client.ts';
import { HEALTH_CONSENT_VERSION } from './schemas/client.ts';

/**
 * Danışanın davet ve sağlık onayı durumları — tarayıcıda da çalışır (kripto yok).
 * Kodu üreten ve doğrulayan taraf `client-access.ts` (yalnız sunucu).
 */

export const INVITE_CODE_LENGTH = 8;
export const INVITE_TTL_DAYS = 7;
/** Bu kadar yanlış denemeden sonra davet kilitlenir; PT yenisini üretir. */
export const INVITE_MAX_ATTEMPTS = 5;

/**
 * Danışan şifresi (SPEC §5): ilk giriş kare kodla, sonrakiler şifreyle. En az 8 karakter; üst
 * sınır, çok uzun girdiyle sunucudaki özet hesabı yorulmasın diye.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** Bu kadar yanlış şifreden sonra giriş kısa süreliğine kilitlenir… */
export const LOGIN_MAX_ATTEMPTS = 5;
/** …ilk kilitte bu kadar dakika; her yeni kilitte iki katı (en fazla 24 saat)… */
export const LOGIN_LOCK_MINUTES = 15;
export const LOGIN_LOCK_MAX_MINUTES = 24 * 60;
/** …ve bu kadarıncı kilitte şifre girişi kapanır: yalnız yeni kare kod açar. */
export const LOGIN_MAX_LOCKS = 3;
/**
 * Kare kodu kullanan oturum şifreyi bu kadar dakika içinde belirleyebilir (SPEC §5). Sonra izin
 * kapanır: danışan şifre adımını atlarsa pencere açık kalmaz.
 */
export const PASSWORD_SET_WINDOW_MINUTES = 60;

/** Elle girilen kodda boşluk ve tire olabilir: "1234 5678" → "12345678". */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/** Okunaklı gösterim: "12345678" → "1234 5678". */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

export type InviteStatus = 'none' | 'pending' | 'used' | 'expired' | 'locked';

export function inviteStatus(invite: Invite | null, now: Date): InviteStatus {
  if (!invite) return 'none';
  if (invite.used) return 'used';
  if (invite.attempts >= INVITE_MAX_ATTEMPTS) return 'locked';
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

/**
 * Danışanın giriş durumu: davetin durumu tek başına yetmez — PT katılmış bir danışana yeni
 * cihaz için kod üretince davet dosyası "bekliyor"a döner, ama danışan zaten içeride.
 * - `joined`: en az bir kez girdi ve sonrasında erişimi kapatılmadı
 * - `revoked`: erişimi kapatıldı ve henüz yeni kod üretilmedi
 * - aksi halde davetin durumu (hiç girmemiş ya da kapatıldıktan sonra yeniden davet edilmiş)
 */
export type AccessState = 'joined' | 'revoked' | InviteStatus;

type Access = {
  lastJoinAt?: string | undefined;
  revokedAt?: string | undefined;
  passwordSetAt?: string | undefined;
  loginLockedAt?: string | undefined;
};

/**
 * Erişim kapatılmadan önce (ya da aynı anda) üretilmiş davet geçersizdir: "Erişimi kapat"
 * bekleyen daveti de iptal eder (SPEC §5). Sunucu (`redeemInvite`) böyle bir daveti silinmiş
 * sayar — davet dosyası silinememiş olsa da — ve PT ekranındaki "Erişim kapalı" rozeti de aynı
 * kuralla hesaplanır. Kapatmadan sonra üretilen davet geçerlidir.
 */
export function revokedInvite(access: Access, invite: Pick<Invite, 'createdAt'>): boolean {
  return Boolean(access.revokedAt && invite.createdAt <= access.revokedAt);
}

export function accessState(access: Access, invite: Invite | null, now: Date): AccessState {
  const status = inviteStatus(invite, now);
  const revokedAfterJoin = Boolean(access.revokedAt && (!access.lastJoinAt || access.revokedAt > access.lastJoinAt));
  if (access.lastJoinAt && !revokedAfterJoin) return 'joined';
  if (revokedAfterJoin && (!invite || revokedInvite(access, invite))) return 'revoked';
  // Eski kayıtlar: katılım tarihi yok ama kullanılmış davet var.
  return status;
}

/**
 * Danışan oturumu bu kayıtla hâlâ geçerli mi (SPEC §5): kayıt var (danışan silinmedi), arşivde
 * değil ve oturumun kuşağı kayıttakiyle aynı (PT "Erişimi kapat" demedi). `/me` de iki role açık
 * okuma uçları da bu kuralla oturumu düşürür.
 */
export function clientSessionValid(client: Pick<Client, 'status' | 'access'> | null, accessVersion: number): boolean {
  return Boolean(client && client.status !== 'archived' && client.access.version === accessVersion);
}

/**
 * Danışan listesinde (`data/clients.json`) satırın durumu farklıysa güncellenmiş liste; aynıysa
 * ya da satır yoksa null (yazmaya gerek yok). Karşılaştırma listedeki satırla yapılır, kaydın
 * eski durumuyla değil: kayıt yazılıp liste yazılamadıysa aynı formu yeniden kaydetmek listeyi
 * de düzeltir.
 */
export function indexWithStatus(items: ClientIndexEntry[], id: string, status: ClientStatus): ClientIndexEntry[] | null {
  const row = items.find((item) => item.id === id);
  if (!row || row.status === status) return null;
  return items.map((item) => (item.id === id ? { ...item, status } : item));
}

/**
 * Danışanın açan bir şifresi var mı (PT ekranı, `/me`'deki çıkış uyarısı). Kayıttaki an yalnız
 * bilgi: özeti danışan repo'sundaki `auth.json`'da. Şifreden SONRA kare kodla girilmişse o şifre
 * artık açmaz (kod kullanılınca `auth.json` silinir); "Erişimi kapat" anı zaten siler.
 */
export function hasPassword(access: Access): boolean {
  return passwordState(access) === 'set';
}

/**
 * Şifrenin PT ekranındaki durumu: `none` (hiç yok, ya da sonradan kare kodla girildi: eskisi açmaz),
 * `locked` (çok sayıda yanlış deneme; şifre girişi kapandı, yalnız yeni kare kod açar), `set`.
 */
export function passwordState(access: Access): 'none' | 'set' | 'locked' {
  if (!access.passwordSetAt || (access.lastJoinAt && access.lastJoinAt > access.passwordSetAt)) return 'none';
  if (access.loginLockedAt && access.loginLockedAt >= access.passwordSetAt) return 'locked';
  return 'set';
}

/** Oturumun kare kodla açıldığı an (`/api/join` yazar); şifreyle açılan oturumda yok. */
export type PasswordSession = { joinedAt?: string | undefined };

/**
 * Bu oturum şimdi şifre belirleyebilir mi (SPEC §5). İzin kayda değil OTURUMA bağlı:
 * - danışan hiç şifre belirlemediyse (ilk katılım, eski akış, erişim kapatıldıktan sonra): evet;
 * - yoksa yalnız şifreden SONRA kare kodu kullanan oturum ve yalnız o andan sonraki 60 dk.
 * Şifreyle açılan oturum (`joinedAt` yok) ve yeni kare koddan önce açılmış eski oturumlar
 * (başka cihaz, çalınmış telefon) şifreyi değiştiremez.
 */
export function canSetPassword(access: Access, session: PasswordSession, now: Date): boolean {
  if (!access.passwordSetAt) return true;
  if (!session.joinedAt || session.joinedAt <= access.passwordSetAt) return false;
  const elapsed = now.getTime() - Date.parse(session.joinedAt);
  return elapsed >= 0 && elapsed < PASSWORD_SET_WINDOW_MINUTES * 60 * 1000;
}

/** Katılmış danışana yeni cihaz için üretilmiş, henüz kullanılmamış kod var mı. */
export function hasNewDeviceCode(access: Access, invite: Invite | null, now: Date): boolean {
  return Boolean(access.lastJoinAt && invite && inviteStatus(invite, now) === 'pending' && invite.createdAt > access.lastJoinAt);
}

export type HealthConsentState =
  /** Modül kapalı: hiçbir sağlık kaydı tutulmaz (onay silinmez, geçmiş kalır). */
  | 'off'
  /** Modül açık, danışan henüz karar vermedi. */
  | 'pending'
  | 'granted'
  | 'declined'
  /**
   * Onay eski metne ya da daha az parçaya verilmiş, ya da modül yeniden açılmadan / kapsamı
   * genişlemeden önce verilmiş: yeniden sorulur.
   */
  | 'outdated';

type HealthModule = Client['modules']['health'];

/**
 * Kayıt modülün kapsamını genişletiyor mu: modül açılıyor ya da daha önce modülde olmayan bir parça
 * ekleniyor (hiç eklenmemiş ya da çıkarılıp geri eklenen). Parça çıkarmak kapsamı daraltır: onay
 * kalan parçaları zaten kapsar.
 */
export function healthScopeGrows(previous: HealthModule | null, fields: readonly HealthField[]): boolean {
  if (!previous?.enabled) return true;
  return fields.some((field) => !previous.fields.includes(field));
}

/**
 * PT'nin kaydından modülün yeni hali (SPEC §4, §9.4). `enabledAt` onayın taban anıdır: modül açılınca
 * ya da kapsamı genişleyince o an olur ve ondan önce verilmiş onay güncel sayılmaz (`healthConsentState`).
 * Böylece kapatıp açmak ya da bir parçayı çıkarıp geri eklemek danışana yeniden sorar. Kapanan modül
 * parça tutmaz; onay kayıtta kalır. Kapsam aynı ya da daraldıysa taban anı korunur; eski kayıtta hiç
 * yoksa uydurulmaz (yoksa PT'nin sıradan bir kaydı geçerli onayı bozardı).
 */
export function nextHealthModule(
  previous: HealthModule | null,
  input: { enabled: boolean; fields: readonly HealthField[] },
  now: string,
): HealthModule {
  if (!input.enabled) return { enabled: false, fields: [] };
  const fields = [...new Set(input.fields)];
  if (healthScopeGrows(previous, fields)) return { enabled: true, fields, enabledAt: now };
  return { enabled: true, fields, ...(previous?.enabledAt ? { enabledAt: previous.enabledAt } : {}) };
}

export function healthConsentState(client: Pick<Client, 'modules' | 'consents'>): HealthConsentState {
  const module = client.modules.health;
  if (!module.enabled) return 'off';
  const consent = client.consents.health;
  if (!consent) return 'pending';
  if (!consent.granted) return 'declined';
  const covers = (field: HealthField) => consent.fields.includes(field);
  if (consent.version !== HEALTH_CONSENT_VERSION || !module.fields.every(covers)) return 'outdated';
  // Modül yeniden açıldı ya da kapsamı genişledi: ondan önceki onay yetmez (SPEC §9.4).
  if (module.enabledAt && Date.parse(consent.at) < Date.parse(module.enabledAt)) return 'outdated';
  return 'granted';
}

/** Sağlık kaydı yazılabilir mi: modül açık VE danışanın güncel onayı var (SPEC §9.4). */
export function canRecordHealth(client: Pick<Client, 'modules' | 'consents'>, field: HealthField): boolean {
  return healthConsentState(client) === 'granted' && client.modules.health.fields.includes(field);
}
