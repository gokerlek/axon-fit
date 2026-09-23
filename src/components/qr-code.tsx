import { encode } from 'uqr';
import { cn } from '@/lib/utils';

/**
 * Kare kod (SVG). Tema ne olursa olsun beyaz zemin üstüne siyah çizilir: koyu temada
 * ters renkli kod bazı telefon kameralarında okunmuyor. Kenar boşluğu kodun içinde.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  let path = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={cn('rounded-lg bg-white text-black', className)}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}
