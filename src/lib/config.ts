import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import * as v from 'valibot';
import { appRepo } from './github/client';
import { readJson, writeJson } from './github/files';
import { appConfigSchema, CONFIG_PATH, defaultConfig, type AppConfig } from './schemas/config';

export { appConfigSchema, CONFIG_PATH, defaultConfig, type AppConfig };

/**
 * Beyaz etiket ayarı (SPEC §10) — uygulama repo'sundaki `pulsecoach.config.json`.
 *
 * Her istekte GitHub'a gitmemek için kısa ömürlü bellek önbelleği var. Yazma anında
 * önbellek düşürülür, böylece PT ayarı değiştirince sonucu hemen görür.
 */

/**
 * Önbellek: Next'in veri önbelleği (sunucu örnekleri arasında paylaşılır).
 *
 * Bellek içi önbellek burada YANLIŞ olurdu: Next sayfaları ve API uçlarını ayrı
 * paketlerde çalıştırır, Vercel'de birden fazla örnek vardır; bir yerde düşürülen
 * önbellek diğerlerinde yaşamaya devam eder (ör. logo silinince kırık görsel).
 */
export const CONFIG_TAG = 'app-config';

/** Hata önbelleğe ALINMAZ: fırlatılır; `unstable_cache` fırlatılan sonucu saklamaz. */
const readFromGithub = unstable_cache(
  async (): Promise<{ config: AppConfig; sha: string | null }> => {
    const stored = await readJson<unknown>(appRepo(), CONFIG_PATH);
    if (!stored) return { config: defaultConfig, sha: null };
    const parsed = v.safeParse(appConfigSchema, stored.content);
    // Bozuk ayar uygulamayı düşürmez: varsayılana dönülür, kurulum sihirbazı devreye girer.
    return { config: parsed.success ? parsed.output : defaultConfig, sha: stored.sha };
  },
  ['app-config'],
  { tags: [CONFIG_TAG], revalidate: 300 },
);

/** Ayarı okur. GitHub'a ulaşılamazsa uygulama düşmez: varsayılanla açılır (ve bu önbelleğe girmez). */
export async function readAppConfig(): Promise<AppConfig> {
  try {
    return (await readFromGithub()).config;
  } catch {
    return defaultConfig;
  }
}

/**
 * Ayarı yazar. `sha` önbellekten değil TAZE okunur: önbellekteki sha eskiyse
 * GitHub yazmayı çakışma olarak reddeder.
 */
export async function writeAppConfig(config: AppConfig, message: string): Promise<void> {
  const current = await readJson<unknown>(appRepo(), CONFIG_PATH);
  await writeJson(appRepo(), CONFIG_PATH, config, { sha: current?.sha, message });
  revalidateTag(CONFIG_TAG, { expire: 0 });
}
