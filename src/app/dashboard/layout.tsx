import { redirect } from 'next/navigation';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { DashboardDock } from './nav';
import { UserMenu } from './user-menu';

/**
 * PT kabuğu (SPEC §6): üst çubuk yok. Sağ üstte kullanıcı menüsü (ayarlar, çıkış),
 * altta dock (gezinme). Kurulum tamamlanmadıysa hiçbir PT ekranı açılmaz, önce sihirbaz.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePt();
  const config = await readAppConfig();
  if (!config.setupCompleted) redirect('/setup');

  return (
    <>
      <div className="fixed top-3 right-4 z-30 md:top-5 md:right-6">
        <UserMenu login={session.subject} appName={config.appName} />
      </div>

      {/* Üstte menüye, altta dock'a yer: dar ekranda içerik menünün altından başlar,
          geniş ekranda menü içerik sütununun dışında kalır. */}
      <main className="px-4 pt-16 pb-32 md:px-8 xl:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <DashboardDock />
    </>
  );
}
