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
import styles from './dock.module.css';

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
      <span className={styles.icon} aria-hidden>
        {item.icon}
      </span>
      <AnimatePresence>
        {showLabel ? (
          <motion.span
            className={styles.label}
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
    className: styles.item,
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
    <div className={styles.layer}>
      <motion.nav
        className={styles.panel}
        aria-label={ariaLabel}
        onMouseMove={({ pageX }) => mouseX.set(pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}>
        {items.map((item) => (
          <Fragment key={item.href}>
            {item.separatorBefore ? <span className={styles.separator} aria-hidden /> : null}
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
