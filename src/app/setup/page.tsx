import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { SetupForm } from './setup-form';
import styles from './setup.module.css';

/**
 * Kurulum sihirbazı (SPEC §10).
 *
 * İlk girişte buraya düşülür. Kurulum tamamlandıktan sonra aynı ekran
 * "Görünüm ayarları" olarak çalışmaya devam eder.
 */
export default async function SetupPage() {
  await requirePt();
  const config = await readAppConfig();
  const firstRun = !config.setupCompleted;

  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <header className={styles.header}>
          <h1>{firstRun ? 'Uygulamanı kur' : 'Görünüm'}</h1>
          <p>
            {firstRun
              ? 'Danışanların göreceği ad, renk ve temayı seç. Hepsi sonradan değiştirilebilir.'
              : 'Uygulamanın adını, rengini ve temasını buradan değiştirebilirsin.'}
          </p>
        </header>

        <SetupForm
          firstRun={firstRun}
          initial={{
            appName: config.appName,
            accent: config.accent ?? '#D4FF3F',
            theme: config.theme,
          }}
        />
      </div>
    </main>
  );
}
