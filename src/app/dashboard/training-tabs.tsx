'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** Antrenman bölümünün sayfaları; dock'ta tek "Antrenman" öğesi bunlara açılır. */
export const TRAINING_SECTIONS = [
  { href: '/dashboard/templates', label: 'Şablonlar', ready: false },
  { href: '/dashboard/exercises', label: 'Egzersizler', ready: true },
  { href: '/dashboard/devices', label: 'Cihazlar', ready: true },
] as const;

/**
 * Antrenman bölümünün sekmeleri: Şablonlar · Egzersizler · Cihazlar. Her sekme kendi
 * sayfasıdır (adres değişir, geri tuşu çalışır). Şablonlar Faz 4'e kadar pasif.
 */
export function TrainingTabs() {
  const pathname = usePathname();
  const current = TRAINING_SECTIONS.find((section) => pathname.startsWith(section.href))?.href ?? '/dashboard/exercises';

  return (
    <Tabs value={current}>
      <TabsList aria-label="Antrenman bölümü">
        {TRAINING_SECTIONS.map((section) =>
          section.ready ? (
            <TabsTrigger
              key={section.href}
              value={section.href}
              nativeButton={false}
              render={<Link href={section.href} />}
              className="px-3">
              {section.label}
            </TabsTrigger>
          ) : (
            <TabsTrigger key={section.href} value={section.href} disabled className="px-3" title="Yakında">
              {section.label}
            </TabsTrigger>
          ),
        )}
      </TabsList>
    </Tabs>
  );
}
