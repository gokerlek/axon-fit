'use client';

/**
 * Dock — React Bits "Dock" bileşeninden uyarlandı.
 * Kaynak: https://reactbits.dev/components/dock · Lisans: MIT + Commons Clause, © 2026 David Haz.
 * Bu bildirim lisans gereği korunur.
 *
 * Uyarlamalar (gezinme için):
 * - Öğeler `div role="button"` yerine gerçek bağlantı (Next `Link`): Cmd+tık, sağ tık, ön yükleme çalışır.
 * - Aktif sayfa `aria-current="page"` + altta nokta; renk değişimi `fast` (160 ms, `src/lib/motion.ts`).
 * - Renkler tasarım tokenlarından; PT'nin vurgu rengi dock'a da yansır. Etkin sayfanın ikonu, kenarı
 *   ve noktası vurgunun yüzey üstünde okunan tonunda (`*-primary-text`, .omc/research/ui-fix/TOKENS.md).
 * - Hareket azaltma tercihinde büyüme kapalı.
 * - Hatalı `aria-haspopup` kaldırıldı; etiket klavye odağında da görünür.
 * - Telefonda (`touch:`) ikonun altında kısa etiket durur (üstüne gelme yok); ipucu ve nokta orada gizli.
 * - Dokunulan öğe, sayfa gelene kadar bekleme halkası taşır (`useLinkStatus`); üstteki ilerleme
 *   çubuğuyla birlikte dokunuşa anında tepki.
 */

import Link, { useLinkStatus } from 'next/link';
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
  /** Erişilebilir ad ve masaüstündeki ipucu. */
  label: string;
  /** Telefonda ikonun altındaki görünür etiket (erişilebilir adın içinde geçmeli); yoksa `label`. */
  shortLabel?: string;
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

/** Bu öğenin açtığı sayfa yüklenirken ikon kutusunda yanıp sönen halka (yalnız `Link`'in içinde). */
function PendingRing() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute -inset-px rounded-lg ring-2 ring-primary-text opacity-0 transition-opacity duration-160',
        pending && 'animate-pulse opacity-100 delay-100',
      )}
    />
  );
}

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
  const ref = useRef<HTMLSpanElement>(null);
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
      {/* Büyüyen kare: masaüstünde öğenin kendisi, telefonda etiketin üstündeki ikon kutusu. */}
      <motion.span
        ref={ref}
        style={{ width: size, height: size }}
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground transition-colors duration-160',
          'group-hover/dock-item:text-foreground',
          // Aktif sayfa: ana renk tonu + altta nokta (macOS dock'taki gibi). Telefonda nokta yerine etiket.
          'group-aria-[current=page]/dock-item:border-primary-text group-aria-[current=page]/dock-item:bg-primary/15 group-aria-[current=page]/dock-item:text-primary-text',
          'group-aria-[current=page]/dock-item:after:absolute group-aria-[current=page]/dock-item:after:-bottom-[7px] group-aria-[current=page]/dock-item:after:left-1/2 group-aria-[current=page]/dock-item:after:size-1 group-aria-[current=page]/dock-item:after:-translate-x-1/2 group-aria-[current=page]/dock-item:after:rounded-full group-aria-[current=page]/dock-item:after:bg-primary-text touch:after:hidden',
        )}>
        <span className="flex size-[46%] items-center justify-center [&_svg]:size-full" aria-hidden>
          {item.icon}
        </span>
        {item.disabled ? null : <PendingRing />}
      </motion.span>
      <span
        aria-hidden
        className="hidden text-[0.6875rem] leading-none font-medium whitespace-nowrap text-muted-foreground transition-colors duration-160 touch:block group-aria-[current=page]/dock-item:font-semibold group-aria-[current=page]/dock-item:text-foreground">
        {item.shortLabel ?? item.label}
      </span>
      <AnimatePresence>
        {showLabel ? (
          <motion.span
            className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 rounded-md border bg-popover px-2.5 py-1 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-md touch:hidden"
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
      'group/dock-item relative inline-flex shrink-0 flex-col items-center justify-end gap-1 rounded-lg outline-none',
      'focus-visible:ring-3 focus-visible:ring-ring/50',
      // Telefonda sütun: ikon kutusu + etiket; dokunma alanı 64 px genişlik.
      'touch:w-16',
      'aria-disabled:cursor-default aria-disabled:opacity-40',
    ),
    onHoverStart: () => setShowLabel(true),
    onHoverEnd: () => setShowLabel(false),
    onFocus: () => setShowLabel(true),
    onBlur: () => setShowLabel(false),
    'aria-label': label,
  };

  if (item.disabled) {
    return (
      <motion.span {...shared} aria-disabled="true" tabIndex={0}>
        {content}
      </motion.span>
    );
  }

  return (
    <LinkMotion
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
    <div
      data-reorder-hide
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <motion.nav
        className="pointer-events-auto flex items-end gap-2 rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-xl supports-backdrop-filter:bg-background/85"
        aria-label={ariaLabel}
        // Büyüme yalnız farede: dokunuşun ardından gelen uyumluluk olayları öğeyi büyük bırakmasın.
        onPointerMove={({ pageX, pointerType }) => mouseX.set(pointerType === 'mouse' ? pageX : Infinity)}
        onPointerLeave={() => mouseX.set(Infinity)}>
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
