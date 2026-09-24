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
  { href: '/dashboard', label: 'Genel bakış', icon: <SquaresFour /> },
  { href: '/dashboard/clients', label: 'Danışanlar', icon: <UsersThree /> },
  // Şablonlar, egzersizler ve cihazlar tek bölüm; içinde sekmeler (training-tabs.tsx). Giriş ilk sekme.
  {
    href: '/dashboard/templates',
    label: 'Antrenman',
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

/** Hareket düzenleyicili sayfalar: şablon ekleme/düzenleme, program oluşturma/düzenleme. */
const EDITOR_PATHS = [/^\/dashboard\/templates\/(new|[^/]+\/edit)\/?$/, /^\/dashboard\/clients\/[^/]+\/program\/(new|edit)\/?$/];

/**
 * PT gezinmesi: masaüstünde büyüyen dock, telefonda aynı dock alt çubuk görevi görür.
 * Düzenleyici sayfalarında telefonda gizlenir: ekranın altında düzenleyicinin kendi çubuğu
 * (Hareket ekle, Kaydet) durur; geri dönüş sayfa yolundan.
 */
export function DashboardDock() {
  const pathname = usePathname();
  const editor = EDITOR_PATHS.some((pattern) => pattern.test(pathname));
  return (
    <div className={editor ? 'max-md:hidden' : undefined}>
      <Dock
        ariaLabel="Ana menü"
        items={ITEMS.map(({ sections, ...item }) => ({ ...item, active: isActive(pathname, { ...item, sections }) }))}
      />
    </div>
  );
}
