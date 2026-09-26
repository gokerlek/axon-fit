import { Badge } from '@/components/ui/badge';
import { accessState, hasNewDeviceCode, passwordState, type AccessState } from '@/lib/client-status';
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

const PASSWORD_LABELS: Record<ReturnType<typeof passwordState>, string> = {
  set: 'şifre belirledi',
  none: 'şifresi yok',
  locked: 'çok sayıda yanlış deneme',
};

/**
 * Danışanın giriş durumu: listede, detayda ve davet ekranında aynı adla. `password` verilirse
 * katılmış danışanda tek satırda şifre de söylenir ("Katıldı · şifre belirledi" / "Katıldı ·
 * şifresi yok" / "Katıldı · çok sayıda yanlış deneme"): şifresi olmayan ya da şifre girişi kapanan
 * danışan çıkış yaparsa yeniden girmek için yeni kare kod gerekir (SPEC §5).
 */
export function AccessBadge({ state, password }: { state: AccessState; password?: ReturnType<typeof passwordState> }) {
  const joined = state === 'joined' || state === 'used';
  const variant =
    joined && password === 'locked'
      ? 'destructive'
      : joined
        ? 'secondary'
        : state === 'pending' || state === 'none'
          ? 'outline'
          : 'destructive';
  const label = joined && password ? `${LABELS[state]} · ${PASSWORD_LABELS[password]}` : LABELS[state];
  return <Badge variant={variant}>{label}</Badge>;
}

export function accessOf(client: Client, invite: Invite | null, now = new Date()): AccessState {
  return accessState(client.access, invite, now);
}

/** Rozetin şifre bilgisi: kayıttaki anlardan (şifrenin kendisi değil). */
export function passwordOf(client: Client): ReturnType<typeof passwordState> {
  return passwordState(client.access);
}

export function accessDetail(client: Client, invite: Invite | null, timeZone: string, now = new Date()): string {
  const { access } = client;
  const state = accessState(access, invite, now);
  switch (state) {
    case 'joined': {
      const secret = passwordState(access);
      const password =
        secret === 'set'
          ? 'Şifreyle giriyor.'
          : secret === 'locked'
            ? `Şifresiyle çok sayıda yanlış deneme yapıldı (${formatDateTime(access.loginLockedAt!, timeZone)}); şifre girişi kapandı. Yeni kare kod üret, danışan yeni şifre belirlesin.`
            : 'Şifresi yok: çıkış yaparsa yeniden girmek için yeni kare kod gerekir.';
      const first = formatDateTime(access.joinedAt ?? access.lastJoinAt!, timeZone);
      const extra = hasNewDeviceCode(access, invite, now)
        ? ` Yeni kare kod bekliyor (son kullanma ${formatDateTime(invite!.expiresAt, timeZone)}); danışan onunla girip yeni şifre belirler.`
        : '';
      return `${password} İlk giriş: ${first}.${extra}`;
    }
    case 'revoked':
      return `Erişim ${formatDateTime(access.revokedAt!, timeZone)} tarihinde kapatıldı; eski şifresi de açmaz. Yeniden girmesi için yeni kare kod üret.`;
    case 'used':
      return invite?.usedAt ? `Danışan ${formatDateTime(invite.usedAt, timeZone)} tarihinde kare kodla girdi.` : 'Danışan kare kodla girdi.';
    case 'none':
      return 'Henüz kare kod üretilmedi.';
    case 'pending':
      return `Kare kod henüz kullanılmadı. Son kullanma: ${formatDateTime(invite!.expiresAt, timeZone)}.`;
    case 'expired':
      return 'Kare kod kullanılmadan süresi doldu. Yenisini üret.';
    case 'locked':
      return 'Çok fazla yanlış kod denendi, kare kod kilitlendi. Yenisini üret.';
  }
}
