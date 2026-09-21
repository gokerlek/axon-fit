'use client';

/**
 * Dock — React Bits "Dock" bileşeninden uyarlandı.
 * Kaynak: https://reactbits.dev/components/dock · Lisans: MIT + Commons Clause, © 2026 David Haz.
 * Bu bildirim lisans gereği korunur.
 *
 * Uyarlamalar (gezinme için):
 * - Öğeler `div role="button"` yerine gerçek bağlantı (Next `Link`): Cmd+tık, sağ tık, ön yükleme çalışır.
 * - Aktif sayfa `aria-current="page"` + altta nokta.
 * - Renkler tasarım tokenlarından; PT'nin vurgu rengi dock'a da yansır.
 * - Hareket azaltma tercihinde büyüme kapalı.
 * - Hatalı `aria-haspopup` kaldırıldı; etiket klavye odağında da görünür.
 */

import Link from 'next/link';
import { Fragment, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from 'motion/react';
import { cn } from '@/lib/utils';

export type DockEntry = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  /** Henüz yapılmamış bölüm: görünür ama tıklanamaz. */
  disabled?: boolean;
  /** Bu öğeden önce ayırıcı çiz (ör. ayarları gezinmeden ayırmak için). */
  separatorBefore?: boolean;
};

type DockProps = {
  items: DockEntry[];
  ariaLabel: string;
  baseItemSize?: number;
  magnification?: number;
  distance?: number;
  spring?: SpringOptions;
};

const LinkMotion = motion.create(Link);

function DockItem({
  item,
  mouseX,
  baseItemSize,
  magnification,
  distance,
  spring,
  reduced,
}: {
  item: DockEntry;
  mouseX: MotionValue<number>;
  baseItemSize: number;
  magnification: number;
  distance: number;
  spring: SpringOptions;
  reduced: boolean;
}) {
  const ref = useRef<HTMLAnchorElement | HTMLSpanElement>(null);
  const [showLabel, setShowLabel] = useState(false);

  const offset = useTransform(mouseX, (x) => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseItemSize };
    return x - rect.x - baseItemSize / 2;
  });
  const target = useTransform(offset, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const animated = useSpring(target, spring);
  const size = reduced ? baseItemSize : animated;

  const label = item.disabled ? `${item.label} · yakında` : item.label;

  const content = (
    <>
      <span className="flex size-[46%] items-center justify-center [&_svg]:size-full" aria-hidden>
        {item.icon}
      </span>
      <AnimatePresence>
        {showLabel ? (
          <motion.span
            className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 rounded-md border bg-popover px-2.5 py-1 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-md"
            role="tooltip"
            initial={{ opacity: 0, y: 4, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 4, x: '-50%' }}
            transition={{ duration: reduced ? 0 : 0.16 }}>
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </>
  );

  const shared = {
    className: cn(
      'relative inline-flex shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground outline-none transition-colors',
      'hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
      // Aktif sayfa: ana renk tonu + altta nokta (macOS dock'taki gibi).
      'aria-[current=page]:border-primary/40 aria-[current=page]:bg-primary/15 aria-[current=page]:text-primary',
      'aria-[current=page]:after:absolute aria-[current=page]:after:-bottom-[7px] aria-[current=page]:after:left-1/2 aria-[current=page]:after:size-1 aria-[current=page]:after:-translate-x-1/2 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-primary',
      'aria-disabled:cursor-default aria-disabled:opacity-40',
    ),
    style: { width: size, height: size },
    onHoverStart: () => setShowLabel(true),
    onHoverEnd: () => setShowLabel(false),
    onFocus: () => setShowLabel(true),
    onBlur: () => setShowLabel(false),
    'aria-label': label,
  };

  if (item.disabled) {
    return (
      <motion.span ref={ref as React.Ref<HTMLSpanElement>} {...shared} aria-disabled="true" tabIndex={0}>
        {content}
      </motion.span>
    );
  }

  return (
    <LinkMotion
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={item.href}
      {...shared}
      aria-current={item.active ? 'page' : undefined}>
      {content}
    </LinkMotion>
  );
}

export function Dock({
  items,
  ariaLabel,
  baseItemSize = 46,
  magnification = 64,
  distance = 140,
  spring = { mass: 0.1, stiffness: 170, damping: 14 },
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <motion.nav
        className="pointer-events-auto flex items-end gap-2 rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-xl supports-backdrop-filter:bg-background/85"
        aria-label={ariaLabel}
        onMouseMove={({ pageX }) => mouseX.set(pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}>
        {items.map((item) => (
          <Fragment key={item.href}>
            {item.separatorBefore ? <span className="mx-0.5 my-1 w-px self-stretch bg-border" aria-hidden /> : null}
            <DockItem
              item={item}
              mouseX={mouseX}
              baseItemSize={baseItemSize}
              magnification={magnification}
              distance={distance}
              spring={spring}
              reduced={reduced}
            />
          </Fragment>
        ))}
      </motion.nav>
    </div>
  );
}
