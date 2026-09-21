'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, LayoutGrid, ListChecks, Settings, Users, type LucideIcon } from 'lucide-react';
import styles from './shell.module.css';

type NavEntry = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Henüz yapılmamış bölümler görünür ama tıklanamaz: PT neyin geleceğini bilsin. */
  soon?: boolean;
  /** Telefondaki alt çubukta da görünsün mü (en fazla 4). */
  mobile?: boolean;
};

export const NAV: NavEntry[] = [
  { href: '/dashboard', label: 'Genel bakış', icon: LayoutGrid, mobile: true },
  { href: '/dashboard/clients', label: 'Danışanlar', icon: Users, mobile: true, soon: true },
  { href: '/dashboard/templates', label: 'Şablonlar', icon: ListChecks, mobile: true, soon: true },
  { href: '/dashboard/exercises', label: 'Egzersizler', icon: Dumbbell, mobile: true },
  { href: '/dashboard/settings', label: 'Ayarlar', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  // Genel bakış yalnız tam eşleşmede aktif; diğerleri alt sayfalarında da.
  return href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Ana menü">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.navItem}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            aria-disabled={item.soon || undefined}
            tabIndex={item.soon ? -1 : undefined}>
            <Icon size={18} aria-hidden />
            {item.label}
            {item.soon ? <span className={styles.soon}>yakında</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.tabbar} aria-label="Ana menü">
      {NAV.filter((item) => item.mobile).map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.tab}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            aria-disabled={item.soon || undefined}
            tabIndex={item.soon ? -1 : undefined}>
            <Icon size={20} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
