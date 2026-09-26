'use client';

import { usePathname } from 'next/navigation';
import { Barbell, SquaresFour, UsersThree } from '@phosphor-icons/react';
import { Dock, type DockEntry } from '@/components/dock/dock';
import { TRAINING_SECTIONS } from './training-tabs';

type NavItem = Omit<DockEntry, 'active'> & {
  /** Bu adreslerin altındaki sayfalarda da aktif (bölüm sekmeleri). */
  sections?: readonly string[];
};

const ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Genel bakış', shortLabel: 'Genel', icon: <SquaresFour /> },
  { href: '/dashboard/clients', label: 'Danışanlar', icon: <UsersThree /> },
  // Şablonlar, egzersizler, cihazlar ve aparatlar tek bölüm: başvuru kütüphanesi, içinde sekmeler
  // (training-tabs.tsx). Giriş ilk sekme. "Antrenman" yalnız yapılan iş (seans) için kullanılır.
  {
    href: '/dashboard/templates',
    label: 'Kütüphane',
    icon: <Barbell />,
    sections: TRAINING_SECTIONS.map((section) => section.href),
  },
];
// Ayarlar ve çıkış dock'ta değil, sağ üstteki kullanıcı menüsünde (user-menu.tsx).

function matches(pathname: string, href: string): boolean {
  // Genel bakış yalnız tam eşleşmede aktif; diğerleri alt sayfalarında da.
  return href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(pathname: string, item: NavItem): boolean {
  return (item.sections ?? [item.href]).some((href) => matches(pathname, href));
}

/** PT gezinmesi: masaüstünde büyüyen dock, telefonda aynı dock etiketli alt çubuk görevi görür. */
export function DashboardDock() {
  const pathname = usePathname();
  return (
    <Dock
      ariaLabel="Ana menü"
      items={ITEMS.map(({ sections, ...item }) => ({ ...item, active: isActive(pathname, { ...item, sections }) }))}
    />
  );
}
