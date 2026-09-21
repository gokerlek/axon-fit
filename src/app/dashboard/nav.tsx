'use client';

import { usePathname } from 'next/navigation';
import { Barbell, GearSix, ListChecks, SquaresFour, UsersThree } from '@phosphor-icons/react';
import { Dock, type DockEntry } from '@/components/dock/dock';

const ITEMS: Omit<DockEntry, 'active'>[] = [
  { href: '/dashboard', label: 'Genel bakış', icon: <SquaresFour /> },
  { href: '/dashboard/clients', label: 'Danışanlar', icon: <UsersThree />, disabled: true },
  { href: '/dashboard/templates', label: 'Şablonlar', icon: <ListChecks />, disabled: true },
  { href: '/dashboard/exercises', label: 'Egzersizler', icon: <Barbell /> },
  { href: '/dashboard/settings', label: 'Ayarlar', icon: <GearSix />, separatorBefore: true },
];

function isActive(pathname: string, href: string): boolean {
  // Genel bakış yalnız tam eşleşmede aktif; diğerleri alt sayfalarında da.
  return href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** PT gezinmesi: masaüstünde büyüyen dock, telefonda aynı dock alt çubuk görevi görür. */
export function DashboardDock() {
  const pathname = usePathname();
  return (
    <Dock
      ariaLabel="Ana menü"
      items={ITEMS.map((item) => ({ ...item, active: isActive(pathname, item.href) }))}
    />
  );
}
