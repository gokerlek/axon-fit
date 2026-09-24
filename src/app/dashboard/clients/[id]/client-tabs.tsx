'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = { key: string; label: string; href: string; active: (pathname: string) => boolean; ready: boolean };

/**
 * Danışanın sekmeleri: Genel · Program · Ölçümler · Antrenmanlar · Davet. Her sekme kendi
 * sayfasıdır (adres değişir, geri tuşu çalışır); alt sayfalar (programı düzenle, ölçüm gir)
 * kendi sekmesinde açık görünür. Antrenmanlar antrenman ekranı gelene kadar pasif.
 */
export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/clients/${clientId}`;
  const under = (path: string) => (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);
  const tabs: Tab[] = [
    { key: 'genel', label: 'Genel', href: base, active: (p) => p === base || p === `${base}/edit`, ready: true },
    { key: 'program', label: 'Program', href: `${base}/program`, active: under(`${base}/program`), ready: true },
    { key: 'olcumler', label: 'Ölçümler', href: `${base}/measurements`, active: under(`${base}/measurements`), ready: true },
    { key: 'antrenmanlar', label: 'Antrenmanlar', href: `${base}/sessions`, active: under(`${base}/sessions`), ready: false },
    { key: 'davet', label: 'Davet', href: `${base}/invite`, active: under(`${base}/invite`), ready: true },
  ];
  const current = tabs.find((tab) => tab.active(pathname))?.key ?? 'genel';

  return (
    // Telefonda sekmeler sığmazsa yatay kayar; sayfa taşmaz.
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <Tabs value={current}>
        <TabsList aria-label="Danışan bölümleri">
          {tabs.map((tab) =>
            tab.ready ? (
              <TabsTrigger key={tab.key} value={tab.key} nativeButton={false} render={<Link href={tab.href} />} className="px-3">
                {tab.label}
              </TabsTrigger>
            ) : (
              <TabsTrigger key={tab.key} value={tab.key} disabled className="px-3" title="Antrenman ekranıyla gelecek">
                {tab.label}
              </TabsTrigger>
            ),
          )}
        </TabsList>
      </Tabs>
    </div>
  );
}
