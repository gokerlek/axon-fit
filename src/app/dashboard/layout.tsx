import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { SidebarNav, TabBar } from './nav';
import styles from './shell.module.css';

/**
 * PT kabuğu (SPEC §6): masaüstünde kenar menü, telefonda alt sekme çubuğu.
 * Kurulum tamamlanmadıysa hiçbir PT ekranı açılmaz, önce sihirbaz.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePt();
  const config = await readAppConfig();
  if (!config.setupCompleted) redirect('/setup');

  const initial = config.appName.trim().charAt(0).toUpperCase() || 'P';

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.mark}>
            {config.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/brand/logo" alt="" />
            ) : (
              initial
            )}
          </span>
          <span className={styles.brandName}>{config.appName}</span>
        </Link>

        <SidebarNav />

        <div className={styles.footer}>
          <span className={styles.who}>@{session.subject}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className={styles.logout}>
              <LogOut size={18} aria-hidden />
              Çıkış
            </button>
          </form>
        </div>
      </aside>

      <main className={styles.content}>
        <div className={styles.inner}>{children}</div>
      </main>

      <TabBar />
    </div>
  );
}
