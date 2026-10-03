import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { loadAppConfig } from '@/lib/config';
import { SetupForm } from '@/app/setup/setup-form';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Görünüm' };

/** Ayarlar → Görünüm. Kurulum sihirbazıyla aynı form; kaydedince sayfada kalır. */
export default async function SettingsPage() {
  await requirePt();
  // Sihirbazla aynı kural: okunamazsa varsayılanlarla dolu form gösterilmez.
  const config = await loadAppConfig();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Görünüm" description="Danışanların göreceği ad, logo, renk, köşeler ve tema." />
      <Link href="/dashboard/settings/updates" className="self-start text-sm text-primary underline">Uygulama sürümü ve güncellemeler</Link>
      <Link href="/dashboard/settings/ai" className="self-start text-sm text-primary underline">Yapay zekâ ve Gemini anahtarı</Link>
      <SetupForm
        firstRun={false}
        hasLogo={Boolean(config.logo)}
        afterSave="/dashboard/settings"
        initial={{
          appName: config.appName,
          accent: config.accent,
          theme: config.theme,
          radius: config.radius,
            palette: config.palette,
        }}
      />
    </div>
  );
}
