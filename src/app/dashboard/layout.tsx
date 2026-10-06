import { CoachLauncher } from '@/components/coach/coach-launcher';
import { redirect } from 'next/navigation';
import { loadAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { DashboardDock } from './nav';
import { UserMenu } from './user-menu';

/**
 * PT kabuğu (SPEC §6).
 *
 * Her sayfa aynı ortalı içerik sütununda durur (`PAGE_WIDTH`); bileşenler bu genişliğe
 * göre yerleşir — masaüstünde yan yana, telefonda alt alta. Üst çubuk yok: kullanıcı
 * menüsü içerik sütununun sağ üst köşesinde, sayfanın ilk satırının hizasında durur ve
 * sayfayla birlikte kayar. Sabit (fixed) olduğunda kayan içeriğin (Kütüphane sekmeleri,
 * düzenleyicinin Kaydet'i) üstüne biniyordu. İlk satır sağda ona yer bırakır
 * (`USER_MENU_GUTTER` / `USER_MENU_SPOT`). Gezinme alttaki dock'ta.
 *
 * iOS ana ekran kipinde (`viewport-fit=cover`, saydam durum çubuğu) içerik üst güvenli
 * alanın altından başlar; menü ve ilk satır birlikte aşağı iner.
 */
const PAGE_WIDTH = 'mx-auto w-full max-w-5xl px-4 md:px-8';
/** Menünün üst kenarı: 12 px ya da güvenli alan. İçerik bundan 12 px aşağıda başlar (ilk satırın ortası = menünün ortası). */
const MENU_TOP = 'top-[max(0.75rem,env(safe-area-inset-top))]';
const CONTENT_TOP = 'pt-[calc(max(0.75rem,env(safe-area-inset-top))_+_0.75rem)]';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePt();
  // Dosya yoksa kurulum yapılmamış: sihirbaza. Okunamazsa hata fırlar (app/error.tsx):
  // PT varsayılanlarla dolu sihirbaza yollanmaz, orada "Kaydet" gerçek markayı ezerdi.
  const config = await loadAppConfig();
  if (!config.setupCompleted) redirect('/setup');

  return (
    <>
      <div className={`${PAGE_WIDTH} relative`}>
        <div data-reorder-hide className={`absolute ${MENU_TOP} right-4 z-30 md:right-8`}>
          <UserMenu login={session.subject} appName={config.appName} />
        </div>
        {/* Altta dock'a yer. */}
        <main className={`${CONTENT_TOP} pb-32`}>{children}</main>
      </div>

      <DashboardDock />
      <CoachLauncher role="pt" />
    </>
  );
}
