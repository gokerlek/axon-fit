import type { Client, HealthField, Invite } from './schemas/client.ts';
import { HEALTH_CONSENT_VERSION } from './schemas/client.ts';

/**
 * Danışanın davet ve sağlık onayı durumları — tarayıcıda da çalışır (kripto yok).
 * Kodu üreten ve doğrulayan taraf `client-access.ts` (yalnız sunucu).
 */

export const INVITE_CODE_LENGTH = 8;
export const INVITE_TTL_DAYS = 7;
/** Bu kadar yanlış denemeden sonra davet kilitlenir; PT yenisini üretir. */
export const INVITE_MAX_ATTEMPTS = 5;

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

export type HealthConsentState =
  /** Modül kapalı: hiçbir sağlık kaydı tutulmaz. */
  | 'off'
  /** Modül açık, danışan henüz karar vermedi. */
  | 'pending'
  | 'granted'
  | 'declined'
  /** Onay eski metne ya da daha az parçaya verilmiş: yeniden sorulur. */
  | 'outdated';

export function healthConsentState(client: Pick<Client, 'modules' | 'consents'>): HealthConsentState {
  const module = client.modules.health;
  if (!module.enabled) return 'off';
  const consent = client.consents.health;
  if (!consent) return 'pending';
  if (!consent.granted) return 'declined';
  const covers = (field: HealthField) => consent.fields.includes(field);
  if (consent.version !== HEALTH_CONSENT_VERSION || !module.fields.every(covers)) return 'outdated';
  return 'granted';
}

/** Sağlık kaydı yazılabilir mi: modül açık VE danışanın güncel onayı var (SPEC §9.4). */
export function canRecordHealth(client: Pick<Client, 'modules' | 'consents'>, field: HealthField): boolean {
  return healthConsentState(client) === 'granted' && client.modules.health.fields.includes(field);
}
