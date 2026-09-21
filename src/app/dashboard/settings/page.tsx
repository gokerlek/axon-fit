import { readAppConfig } from '@/lib/config';
import { SetupForm } from '@/app/setup/setup-form';

/** Ayarlar → Görünüm. Kurulum sihirbazıyla aynı form; kaydedince sayfada kalır. */
export default async function SettingsPage() {
  const config = await readAppConfig();

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, marginBottom: 'var(--space-xs)' }}>Görünüm</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
        Danışanların göreceği ad, logo, renk ve tema.
      </p>
      <SetupForm
        firstRun={false}
        hasLogo={Boolean(config.logo)}
        afterSave="/dashboard/settings"
        initial={{ appName: config.appName, accent: config.accent ?? '#D4FF3F', theme: config.theme }}
      />
    </div>
  );
}
