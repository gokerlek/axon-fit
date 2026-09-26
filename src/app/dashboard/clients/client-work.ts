// Göreli ve uzantılı içe aktarma: `node --test` ile de sınanır (`client-work.test.ts`).
import { accessState, healthConsentState, type AccessState, type HealthConsentState } from '../../../lib/client-status.ts';
import type { Client, Invite } from '../../../lib/schemas/client.ts';

/**
 * Danışan listesinde satırın durumu: giriş (`AccessBadge`, şifre bilgisiyle) ve sağlık onayından
 * bekleyen iş (SPEC §6; kullanılabilirlik taraması 12). Veri listede zaten okunanlardan: danışan
 * kaydı ve davet dosyası. Program listede okunmadığı için "programı yok" burada yok (her danışan
 * için ek bir okuma gerekirdi).
 *
 * Sağlık rozeti yalnız bir şey beklenirken: onay bekliyor / yenilenecek (danışandan), onay
 * verilmedi (bilgi). Takip açıksa ya da modül kapalıysa rozet yok; arşivdeki danışanda iş yok.
 */
export type HealthWork = { label: string; tone: 'waiting' | 'info' };

const HEALTH_WORK: Partial<Record<HealthConsentState, HealthWork>> = {
  pending: { label: 'Sağlık onayı bekliyor', tone: 'waiting' },
  outdated: { label: 'Sağlık onayı yenilenecek', tone: 'waiting' },
  declined: { label: 'Sağlık onayı verilmedi', tone: 'info' },
};

/** Girişi henüz olmayan (davet edilmemiş ya da daveti kullanılmamış) danışan. */
const INVITE_OPEN: readonly AccessState[] = ['none', 'pending', 'expired', 'locked'];

export type ClientWork = { access: AccessState; health: HealthConsentState; healthWork: HealthWork | null };

export function clientWork(
  client: Pick<Client, 'status' | 'access' | 'modules' | 'consents'>,
  invite: Invite | null,
  now: Date,
): ClientWork {
  const access = accessState(client.access, invite, now);
  const health = healthConsentState(client);
  return { access, health, healthWork: client.status === 'archived' ? null : (HEALTH_WORK[health] ?? null) };
}

/**
 * Başlıktaki özet: "3 danışan · 2 aktif · 1 henüz giriş yapmadı · 1 sağlık onayı bekliyor" (bekleyenler
 * yalnız aktiflerde). Giriş yapmamış: davet yok, bekliyor, süresi dolmuş ya da kilitli.
 */
export function clientsSummary(rows: readonly { status: Client['status']; work: ClientWork | null }[]): string {
  const active = rows.filter((row) => row.status === 'active');
  const invites = active.filter((row) => row.work && INVITE_OPEN.includes(row.work.access)).length;
  const consents = active.filter((row) => row.work?.healthWork?.tone === 'waiting').length;
  return [
    `${rows.length} danışan`,
    `${active.length} aktif`,
    invites > 0 ? `${invites} henüz giriş yapmadı` : null,
    consents > 0 ? `${consents} sağlık onayı bekliyor` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
