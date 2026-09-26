import { Archive, PauseCircle } from '@phosphor-icons/react/dist/ssr';
import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/lib/schemas/client';
import { cn } from '@/lib/utils';

/**
 * Danışanın durumu, adın sağ üstünde: aktif yeşil nokta, duraklatılmış daire içinde duraklatma
 * işareti, arşivde kutu. Renk tek başına anlam taşımaz (WCAG 1.4.1): şekil de farklı, ekran okuyucu
 * ve üzerine gelince durumun adı okunur. Renkler token'dan (`--success`, `--destructive`; ikisi de
 * yüzeylerden ≥3:1).
 */
export function StatusDot({ status, className }: { status: ClientStatus; className?: string }) {
  const label = CLIENT_STATUS_LABELS[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn('inline-flex size-3.5 shrink-0 items-center justify-center', className)}>
      {status === 'active' ? (
        <span className="size-2.5 rounded-full bg-success ring-2 ring-background" aria-hidden />
      ) : status === 'paused' ? (
        <PauseCircle weight="fill" className="size-3.5 text-destructive-text" aria-hidden />
      ) : (
        <Archive weight="fill" className="size-3.5 text-destructive-text" aria-hidden />
      )}
    </span>
  );
}
