import { Badge } from '@/components/ui/badge';
import type { InviteStatus } from '@/lib/client-status';
import { formatDateTime } from '@/lib/format';
import type { Invite } from '@/lib/schemas/client';

const LABELS: Record<InviteStatus, string> = {
  none: 'Davet yok',
  pending: 'Davet bekliyor',
  used: 'Katıldı',
  expired: 'Davetin süresi doldu',
  locked: 'Davet kilitlendi',
};

/** Davetin durumu: listede, detayda ve davet ekranında aynı adla. */
export function InviteBadge({ status }: { status: InviteStatus }) {
  const variant = status === 'used' ? 'secondary' : status === 'pending' ? 'outline' : status === 'none' ? 'outline' : 'destructive';
  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}

export function inviteDetail(status: InviteStatus, invite: Invite | null, timeZone: string): string {
  switch (status) {
    case 'none':
      return 'Henüz davet üretilmedi.';
    case 'pending':
      return `Kullanılmadı. Son kullanma: ${formatDateTime(invite!.expiresAt, timeZone)}.`;
    case 'used':
      return invite?.usedAt ? `Danışan ${formatDateTime(invite.usedAt, timeZone)} tarihinde giriş yaptı.` : 'Danışan giriş yaptı.';
    case 'expired':
      return 'Kod kullanılmadan süresi doldu. Yeni kod üret.';
    case 'locked':
      return 'Çok fazla yanlış kod denendi, davet kilitlendi. Yeni kod üret.';
  }
}
