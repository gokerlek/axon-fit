import { cn } from '@/lib/utils';

/** "Şu an antrenmanda" noktası: canlı olduğunu nabızla gösterir (hareket azaltmada durağan). Yalnız süs; metin ayrıca yazılır. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('relative flex size-2.5 shrink-0', className)}>
      <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
    </span>
  );
}
