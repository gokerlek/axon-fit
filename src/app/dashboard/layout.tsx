import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { DashboardDock } from './nav';
import styles from './shell.module.css';

/**
 * PT kabuğu (SPEC §6): üstte marka ve hesap, altta dock.
 * Kurulum tamamlanmadıysa hiçbir PT ekranı açılmaz, önce sihirbaz.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePt();
  const config = await readAppConfig();
  if (!config.setupCompleted) redirect('/setup');

  const initial = config.appName.trim().charAt(0).toUpperCase() || 'P';

  return (
    <>
      <header className={styles.topbar}>
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

        <div className={styles.account}>
          <span className={styles.who}>@{session.subject}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className={styles.logout}>
              <LogOut size={15} aria-hidden />
              Çıkış
            </button>
          </form>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.inner}>{children}</div>
      </main>

      <DashboardDock />
    </>
  );
}
