import 'server-only';
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

const CACHE_TTL_MS = 30_000;
let cache: { value: AppConfig; sha: string | null; at: number } | null = null;

export function invalidateConfigCache(): void {
  cache = null;
}

/** Ayarı okur. GitHub'a ulaşılamazsa uygulama düşmez: varsayılanla açılır. */
export async function readAppConfig(): Promise<AppConfig> {
  return (await readAppConfigWithSha()).config;
}

export async function readAppConfigWithSha(): Promise<{ config: AppConfig; sha: string | null }> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { config: cache.value, sha: cache.sha };
  }

  try {
    const stored = await readJson<unknown>(appRepo(), CONFIG_PATH);
    if (!stored) return { config: defaultConfig, sha: null };

    const parsed = v.safeParse(appConfigSchema, stored.content);
    // Bozuk ayar uygulamayı düşürmez: varsayılana dönülür, kurulum sihirbazı devreye girer.
    const config = parsed.success ? parsed.output : defaultConfig;
    cache = { value: config, sha: stored.sha, at: Date.now() };
    return { config, sha: stored.sha };
  } catch {
    return { config: defaultConfig, sha: null };
  }
}

export async function writeAppConfig(config: AppConfig, message: string): Promise<void> {
  const { sha } = await readAppConfigWithSha();
  await writeJson(appRepo(), CONFIG_PATH, config, { sha: sha ?? undefined, message });
  invalidateConfigCache();
}
