import type { ReactNode } from 'react';
import { cn } from 'cn';

/**
 * Görseli olmayan kartlarda görselin yerini tutan alan: kesik çizgili çerçeve ve
 * içinde bir ikon. Kartların boyu görselli görselsiz aynı kalsın diye.
 */
export function ImagePlaceholder({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex items-center justify-center rounded-lg border border-dashed bg-muted/40 text-muted-foreground',
        className,
      )}>
      {children}
    </div>
  );
}
