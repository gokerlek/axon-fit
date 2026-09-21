import * as v from 'valibot';

/**
 * Uygulama ayarı şeması — sunucu ve istemci ORTAK kullanır.
 *
 * Bilerek saf: `server-only` bağımlılığı yok. Okuma/yazma işi `@/lib/config`
 * içinde (yalnız sunucu); şema burada durur ki formlar da aynı kuralı uygulasın.
 */

export const CONFIG_PATH = 'pulsecoach.config.json';

export const appConfigSchema = v.object({
  /** Kurulum sihirbazında PT'nin verdiği ad; sekmede, giriş ekranında, PWA kısayolunda görünür. */
  appName: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Uygulama adı boş olamaz.'),
    v.maxLength(40, 'Uygulama adı en fazla 40 karakter.'),
  ),
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
