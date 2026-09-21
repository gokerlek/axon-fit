import { redirect } from 'next/navigation';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { DashboardDock } from './nav';
import { UserMenu } from './user-menu';

/**
 * PT kabuğu (SPEC §6).
 *
 * Her sayfa aynı ortalı içerik sütununda durur (`PAGE_WIDTH`); bileşenler bu genişliğe
 * göre yerleşir — masaüstünde yan yana, telefonda alt alta. Üst çubuk yok: kullanıcı
 * menüsü içerik sütununun sağ üst köşesine hizalıdır. Gezinme alttaki dock'ta.
 */
const PAGE_WIDTH = 'mx-auto w-full max-w-5xl px-4 md:px-8';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePt();
  const config = await readAppConfig();
  if (!config.setupCompleted) redirect('/setup');

  return (
    <>
      {/* Menü sabit durur ama içerik sütununa hizalıdır; boş alan tıklamayı engellemez. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30">
        <div className={`${PAGE_WIDTH} flex justify-end pt-4`}>
          <div className="pointer-events-auto">
            <UserMenu login={session.subject} appName={config.appName} />
          </div>
        </div>
      </div>

      {/* Başlık satırı menünün soluna düşsün diye sağda pay; altta dock'a yer. */}
      <main className={`${PAGE_WIDTH} pt-6 pb-32 [&>*:first-child>header]:pr-14`}>{children}</main>

      <DashboardDock />
    </>
  );
}
