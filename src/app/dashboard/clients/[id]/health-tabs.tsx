'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';
import type { HealthField } from '@/lib/schemas/client';
import { HEALTH_PARTS } from './health-parts';

/**
 * "Sağlık"ın ikinci şeridi (tasarım `kisit-tarama.md` §1): Kısıtlar · Ölçümler · Tarama. Yalnız modülde seçili
 * parçalar etkin; seçili olmayan pasif ve "seçili değil" notlu. Bekleyen danışan bildirimi ya da gözden
 * geçirilmemiş tarama ağrısı varsa parçanın yanında nokta (ekran okuyucuya "bekleyen var").
 */
export function HealthTabs({ clientId, selected, pending = [] }: { clientId: string; selected: readonly HealthField[]; pending?: readonly HealthField[] }) {
  const pathname = usePathname();
  const base = `/dashboard/clients/${clientId}`;
  return (
    <TabsNav aria-label="Sağlık bölümleri" className="w-full sm:w-fit" listClassName="h-8 touch:h-11">
      {HEALTH_PARTS.map((part) => {
        const href = `${base}/${part.path}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        // Etkin sayfa seçili olmasa da gezilebilir (kilit uyarısı neden ve ne yapılacağını söyler).
        if (!selected.includes(part.field) && !active) {
          return (
            <TabsNavLink key={part.field} disabled note="seçili değil">
              {part.label}
            </TabsNavLink>
          );
        }
        return (
          <TabsNavLink key={part.field} active={active} render={<Link href={href} />}>
            {part.label}
            {pending.includes(part.field) ? (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                <span className="sr-only">(bekleyen var)</span>
              </>
            ) : null}
          </TabsNavLink>
        );
      })}
    </TabsNav>
  );
}
