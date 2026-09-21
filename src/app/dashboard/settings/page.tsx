import { readAppConfig } from '@/lib/config';
import { SetupForm } from '@/app/setup/setup-form';

/** Ayarlar → Görünüm. Kurulum sihirbazıyla aynı form; kaydedince sayfada kalır. */
export default async function SettingsPage() {
  const config = await readAppConfig();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Görünüm</h1>
        <p className="text-muted-foreground">Danışanların göreceği ad, logo, renk, köşeler ve tema.</p>
      </header>
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
