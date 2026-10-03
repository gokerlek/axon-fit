import 'server-only';
import { environmentStatus } from './installation/readiness';
import { revalidateTag, unstable_cache } from 'next/cache';
import { appRepo } from './github/client';
import { sleep } from './github/errors';
import { readJson, writeJson } from './github/files';
import { checkAppRepo, createAppRepo } from './github/repos';
import { configAccess, type ConfigStore } from './config-update';
import { appConfigSchema, CONFIG_PATH, defaultConfig, type AppConfig } from './schemas/config';

export { appConfigSchema, CONFIG_PATH, defaultConfig, type AppConfig };

/**
 * Beyaz etiket ayarı (SPEC §10) — uygulama repo'sundaki `pulsecoach.config.json`. Hangi okumanın
 * önbellekli, hangisinin taze olduğu ve yazmanın sırası `config-update.ts`'te (orada test edilir);
 * burası yalnız GitHub'ı ve Next'in veri önbelleğini bağlar. Her istekte GitHub'a gitmemek için
 * önbellek var; yazma anında düşürülür, böylece PT ayarı değiştirince sonucu hemen görür.
 */
export const CONFIG_TAG = 'app-config';

const access = configAccess(
  {
    read: () => readJson<unknown>(appRepo(), CONFIG_PATH),
    write: async (config, sha, message) => {
      await writeJson(appRepo(), CONFIG_PATH, config, { sha: sha ?? undefined, message });
    },
    createRepo: createAppRepo,
    checkRepo: checkAppRepo,
  },
  {
    // Hata önbelleğe ALINMAZ: fırlatılır; `unstable_cache` fırlatılan sonucu saklamaz.
    wrap: (read) => unstable_cache(read, ['app-config'], { tags: [CONFIG_TAG], revalidate: 300 }),
    invalidate: () => revalidateTag(CONFIG_TAG, { expire: 0 }),
  },
  { log: (message) => console.error(message), wait: sleep },
);

/**
 * Ayarı GÖRÜNTÜ için okur: GitHub'a ulaşılamazsa uygulama düşmez, varsayılanla açılır (ve bu
 * önbelleğe girmez). Yazmanın tabanı ya da kurulum kapısı olamaz.
 */
export function readAppConfig(): Promise<AppConfig> {
  if (environmentStatus(process.env) !== 'ready') return Promise.resolve(defaultConfig);
  return access.display();
}

/**
 * Kurulum kapısı ve ayar formları için. Dosya yoksa varsayılan (kurulum yapılmamış);
 * okunamazsa fırlatır: PT varsayılanlarla dolu sihirbaza yollanmaz.
 */
export function loadAppConfig(): Promise<AppConfig> {
  return access.load();
}

/** Ayar yazan uçların işleri. Taban önbellekten değil TAZE okunur. */
export function configStore(): ConfigStore {
  return access.store;
}
