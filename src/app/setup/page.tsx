import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { SetupForm } from './setup-form';

/**
 * Kurulum sihirbazı (SPEC §10). İlk girişte buraya düşülür; kurulumdan sonra
 * aynı form Ayarlar → Görünüm'de çalışır.
 */
export default async function SetupPage() {
  await requirePt();
  const config = await readAppConfig();
  const firstRun = !config.setupCompleted;

  return (
    <main className="min-h-dvh px-4 py-10">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {firstRun ? 'Uygulamanı kur' : 'Görünüm'}
          </h1>
          <p className="text-muted-foreground">
            {firstRun
              ? 'Danışanların göreceği ad, renk ve temayı seç. Hepsi sonradan değiştirilebilir.'
              : 'Uygulamanın adını, rengini ve temasını buradan değiştirebilirsin.'}
          </p>
        </header>

        <SetupForm
          firstRun={firstRun}
          hasLogo={Boolean(config.logo)}
          initial={{
            appName: config.appName,
            accent: config.accent,
            theme: config.theme,
            radius: config.radius,
          }}
        />
      </div>
    </main>
  );
}
