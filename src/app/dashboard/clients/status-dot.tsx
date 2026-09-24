import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/lib/schemas/client';
import { cn } from '@/lib/utils';

/**
 * Danışanın durumu, adın sağ üstünde nokta: aktif yeşil, duraklatılmış ya da arşivde kırmızı.
 * Renk tek başına anlam taşımaz: ekran okuyucu ve üzerine gelince durumun adı okunur.
 */
export function StatusDot({ status, className }: { status: ClientStatus; className?: string }) {
  const label = CLIENT_STATUS_LABELS[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full ring-2 ring-background',
        status === 'active' ? 'bg-emerald-500' : 'bg-destructive',
        className,
      )}
    />
  );
}
