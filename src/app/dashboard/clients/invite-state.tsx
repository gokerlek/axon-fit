import { Badge } from '@/components/ui/badge';
import { accessState, hasNewDeviceCode, type AccessState } from '@/lib/client-status';
import { formatDateTime } from '@/lib/format';
import type { Client, Invite } from '@/lib/schemas/client';

const LABELS: Record<AccessState, string> = {
  joined: 'Katıldı',
  revoked: 'Erişim kapalı',
  used: 'Katıldı',
  none: 'Davet yok',
  pending: 'Davet bekliyor',
  expired: 'Davetin süresi doldu',
  locked: 'Davet kilitlendi',
};

/** Danışanın giriş durumu: listede, detayda ve davet ekranında aynı adla. */
export function AccessBadge({ state }: { state: AccessState }) {
  const variant =
    state === 'joined' || state === 'used'
      ? 'secondary'
      : state === 'pending' || state === 'none'
        ? 'outline'
        : 'destructive';
  return <Badge variant={variant}>{LABELS[state]}</Badge>;
}

export function accessOf(client: Client, invite: Invite | null, now = new Date()): AccessState {
  return accessState(client.access, invite, now);
}

export function accessDetail(client: Client, invite: Invite | null, timeZone: string, now = new Date()): string {
  const { access } = client;
  const state = accessState(access, invite, now);
  switch (state) {
    case 'joined': {
      const first = formatDateTime(access.joinedAt ?? access.lastJoinAt!, timeZone);
      const last = access.lastJoinAt && access.lastJoinAt !== access.joinedAt ? ` Son giriş: ${formatDateTime(access.lastJoinAt, timeZone)}.` : '';
      const extra = hasNewDeviceCode(access, invite, now)
        ? ` Yeni cihaz için üretilen kod bekliyor (son kullanma ${formatDateTime(invite!.expiresAt, timeZone)}).`
        : '';
      return `İlk giriş: ${first}.${last}${extra}`;
    }
    case 'revoked':
      return `Erişim ${formatDateTime(access.revokedAt!, timeZone)} tarihinde kapatıldı. Yeniden girmesi için yeni kod üret.`;
    case 'used':
      return invite?.usedAt ? `Danışan ${formatDateTime(invite.usedAt, timeZone)} tarihinde giriş yaptı.` : 'Danışan giriş yaptı.';
    case 'none':
      return 'Henüz davet üretilmedi.';
    case 'pending':
      return `Kod henüz kullanılmadı. Son kullanma: ${formatDateTime(invite!.expiresAt, timeZone)}.`;
    case 'expired':
      return 'Kod kullanılmadan süresi doldu. Yeni kod üret.';
    case 'locked':
      return 'Çok fazla yanlış kod denendi, davet kilitlendi. Yeni kod üret.';
  }
}
