'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';

type Tab = { key: string; label: string; href: string; active: (pathname: string) => boolean; ready: boolean };

/**
 * Danışanın sekmeleri: Genel · Program · Ölçümler · Antrenmanlar · Davet. Her sekme kendi
 * sayfasıdır (adres değişir, geri tuşu çalışır): gezinme, `tablist` değil (`TabsNav`). Alt sayfalar
 * (programı düzenle, ölçüm gir, antrenmanın detayı) kendi sekmesinde açık görünür. Henüz hazır olmayan
 * bir sekme (`ready: false`) pasif ve "yakında" yazar.
 *
 * Telefonda (375 px) beş sekme sığmaz: şerit yatay kayar, taşan kenar solar. Pasif sekme telefonda
 * görsel olarak sona alınır ki "Davet" ekran dışında kalmasın; okuma sırası (DOM) SPEC'teki gibi.
 */
export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/clients/${clientId}`;
  const under = (path: string) => (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);
  const tabs: Tab[] = [
    { key: 'genel', label: 'Genel', href: base, active: (p) => p === base || p === `${base}/edit`, ready: true },
    { key: 'program', label: 'Program', href: `${base}/program`, active: under(`${base}/program`), ready: true },
    { key: 'olcumler', label: 'Ölçümler', href: `${base}/measurements`, active: under(`${base}/measurements`), ready: true },
    { key: 'antrenmanlar', label: 'Antrenmanlar', href: `${base}/sessions`, active: under(`${base}/sessions`), ready: true },
    { key: 'davet', label: 'Davet', href: `${base}/invite`, active: under(`${base}/invite`), ready: true },
  ];
  const current = tabs.find((tab) => tab.active(pathname))?.key ?? 'genel';

  return (
    <TabsNav aria-label="Danışan bölümleri">
      {tabs.map((tab) =>
        tab.ready ? (
          <TabsNavLink key={tab.key} active={tab.key === current} render={<Link href={tab.href} />}>
            {tab.label}
          </TabsNavLink>
        ) : (
          <TabsNavLink key={tab.key} disabled note="yakında" className="max-sm:order-last">
            {tab.label}
          </TabsNavLink>
        ),
      )}
    </TabsNav>
  );
}
