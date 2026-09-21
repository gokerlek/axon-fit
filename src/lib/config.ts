import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as v from 'valibot';

/**
 * Beyaz etiket ayarı (SPEC §10).
 *
 * Faz 0'da yerel dosyadan okunur; Faz 1'de uygulama repo'sundaki
 * `pulsecoach.config.json` dosyasından okunacak (aynı şema).
 */

export const appConfigSchema = v.object({
  /** Kurulum sihirbazında PT'nin verdiği ad; sekmede, giriş ekranında, PWA kısayolunda görünür. */
  appName: v.pipe(v.string(), v.trim(), v.minLength(1, 'Uygulama adı boş olamaz.'), v.maxLength(40, 'Uygulama adı en fazla 40 karakter.')),
  /** Uygulama repo'sundaki logo yolu; yoksa harf işareti kullanılır. */
  logo: v.nullable(v.string()),
  /** Vurgu rengi; null ise tokenlardaki volt kalır. */
  accent: v.nullable(v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.'))),
  theme: v.picklist(['dark', 'light', 'system']),
  timeZone: v.pipe(v.string(), v.minLength(1)),
  setupCompleted: v.boolean(),
});

export type AppConfig = v.InferOutput<typeof appConfigSchema>;

export const defaultConfig: AppConfig = {
  appName: 'PulseCoach',
  logo: null,
  accent: null,
  theme: 'dark',
  timeZone: 'Europe/Istanbul',
  setupCompleted: false,
};

export async function readAppConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'pulsecoach.config.json'), 'utf8');
    const parsed = v.safeParse(appConfigSchema, JSON.parse(raw));
    // Bozuk ayar uygulamayı düşürmez: varsayılana dönüp kurulum sihirbazına yönlendirir.
    return parsed.success ? parsed.output : defaultConfig;
  } catch {
    return defaultConfig;
  }
}
