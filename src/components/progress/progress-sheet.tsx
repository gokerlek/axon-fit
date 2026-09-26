'use client';

import { SheetContent } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { ProgressViewer } from '@/lib/progress-text';
import { cn } from '@/lib/utils';

/** Telefonda alttan açılan, ekran boyu sheet (antrenman ekranının kütüphanesiyle aynı). */
const TALL_SHEET =
  'h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]';

/** PT'nin geniş ekranında sağdan açılan sheet. */
const SIDE_SHEET = 'gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg';

/**
 * İlerleme sheet'lerinin (kasın hareketleri, hareket seçici) kabı. Danışanda her zaman alttan, ekran boyu
 * (danışan yalnız telefon kullanır); PT'de ≥40rem sağdan, telefonda alttan ekran boyu (şablon düzenleyicinin
 * kütüphane sheet'iyle aynı kural).
 */
export function ProgressSheetContent({
  viewer,
  className,
  ...props
}: Omit<React.ComponentProps<typeof SheetContent>, 'side'> & { viewer: ProgressViewer }) {
  const wide = useMediaQuery('(min-width: 40rem)');
  const side = viewer === 'pt' && wide ? 'right' : 'bottom';
  return <SheetContent side={side} className={cn(side === 'right' ? SIDE_SHEET : TALL_SHEET, className)} {...props} />;
}
