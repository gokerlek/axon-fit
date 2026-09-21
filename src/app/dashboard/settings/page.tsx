import { PageHeader } from '@/components/page-header';
import { readAppConfig } from '@/lib/config';
import { SetupForm } from '@/app/setup/setup-form';

/** Ayarlar → Görünüm. Kurulum sihirbazıyla aynı form; kaydedince sayfada kalır. */
export default async function SettingsPage() {
  const config = await readAppConfig();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Görünüm" description="Danışanların göreceği ad, logo, renk, köşeler ve tema." />
      <SetupForm
        firstRun={false}
        hasLogo={Boolean(config.logo)}
        afterSave="/dashboard/settings"
        initial={{
          appName: config.appName,
          accent: config.accent,
          theme: config.theme,
          radius: config.radius,
        }}
      />
    </div>
  );
}
