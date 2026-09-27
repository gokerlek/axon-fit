'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Dekoratif bardak; miktarı yanındaki metin verir, doluluk günlük hedef anlamına gelmez. */
export function WaterGlass({ count, className }: { count: number; className?: string }) {
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 88 104" className={cn('size-24 h-24 w-20 shrink-0', className)} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-glass`}><path d="M18 20h52l-6 67q-1 7-8 7H32q-7 0-8-7Z" /></clipPath>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#38bdf8" /><stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path d="M18 20h52l-6 67q-1 7-8 7H32q-7 0-8-7Z" fill="#38bdf8" fillOpacity=".08" />
      <g clipPath={`url(#${id}-glass)`}>
        <motion.g key={count} initial={reduced ? false : { y: 9 }} animate={{ y: 0 }} transition={{ duration: .4, ease: [.22, 1, .36, 1] }}>
          <motion.path
            d="M-70 53q22-10 44 0t44 0t44 0t44 0t44 0v60H-70Z"
            fill="#7dd3fc" fillOpacity=".45"
            initial={false} animate={reduced ? { x: 0 } : { x: [0, -22, 0] }}
            transition={{ duration: 2.4, ease: 'easeInOut', repeat: 1 }}
          />
          <motion.path
            d="M-70 58q22-9 44 0t44 0t44 0t44 0t44 0v60H-70Z"
            fill={`url(#${id}-water)`}
            initial={false} animate={reduced ? { x: 0 } : { x: [0, 22, 0] }}
            transition={{ duration: 2, ease: 'easeInOut', repeat: 1 }}
          />
          <circle cx="34" cy="77" r="2.5" fill="#e0f2fe" fillOpacity=".65" />
          <circle cx="52" cy="85" r="1.5" fill="#e0f2fe" fillOpacity=".5" />
        </motion.g>
      </g>
      <path d="M18 20h52l-6 67q-1 7-8 7H32q-7 0-8-7Z" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
      <path d="m25 29 3 30" stroke="#bae6fd" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="44" cy="20" rx="26" ry="5" fill="none" stroke="#7dd3fc" strokeWidth="2" />
    </svg>
  );
}
