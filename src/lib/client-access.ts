import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { INVITE_CODE_LENGTH, INVITE_TTL_DAYS, inviteStatus, normalizeInviteCode, type InviteStatus } from './client-status.ts';
import type { Invite } from './schemas/client.ts';

/**
 * Danışan erişimi: kimlik ve davet kodu (SPEC §5). Yalnız sunucuda (`node:crypto`);
 * tarayıcının da gördüğü durum hesapları `client-status.ts`'te.
 *
 * Saf mantık — GitHub'a dokunmaz; `src/lib/clients.ts` okur/yazar, burası karar verir.
 * Böylece davetin kuralları (tek kullanım, süre, deneme sınırı) test edilebilir.
 */

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const CLIENT_ID_LENGTH = 8;

/** `c_` + 8 rastgele karakter (36⁸ ≈ 2,8 × 10¹²). İsimden türetilmez: repo adında isim geçmez. */
export function newClientId(): string {
  let id = 'c_';
  for (let i = 0; i < CLIENT_ID_LENGTH; i += 1) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return id;
}

export function generateInviteCode(): string {
  return String(randomInt(0, 10 ** INVITE_CODE_LENGTH)).padStart(INVITE_CODE_LENGTH, '0');
}

/**
 * Kodun anahtarlı özeti (HMAC-SHA256, anahtar `AUTH_SECRET`). Danışan kimliği de
 * karışır: aynı kod iki danışanda aynı özeti vermez. Repo sızsa bile 10⁸'lik kod
 * uzayı anahtar olmadan çevrimdışı denenemez.
 */
export function hashInviteCode(secret: string, clientId: string, code: string): string {
  return createHmac('sha256', secret).update(`${clientId}:${code}`).digest('hex');
}

export function newInvite(secret: string, clientId: string, now: Date): { invite: Invite; code: string } {
  const code = generateInviteCode();
  const expires = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  return {
    code,
    invite: {
      codeHash: hashInviteCode(secret, clientId, code),
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      used: false,
      attempts: 0,
    },
  };
}

export type InviteCheck = { ok: true } | { ok: false; reason: Exclude<InviteStatus, 'pending'> | 'invalid' };

/** Kod bu davete uyuyor mu? Sıra önemli: kullanılmış/kilitli davet doğru kodla da açılmaz. */
export function checkInvite(
  invite: Invite | null,
  { secret, clientId, code, now }: { secret: string; clientId: string; code: string; now: Date },
): InviteCheck {
  const status = inviteStatus(invite, now);
  if (status !== 'pending' || !invite) return { ok: false, reason: status === 'pending' ? 'none' : status };
  const expected = Buffer.from(invite.codeHash, 'hex');
  const actual = Buffer.from(hashInviteCode(secret, clientId, normalizeInviteCode(code)), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

