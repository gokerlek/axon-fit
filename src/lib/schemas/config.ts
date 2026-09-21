import * as v from 'valibot';

/**
 * Uygulama ayarı şeması — sunucu ve istemci ORTAK kullanır.
 *
 * Bilerek saf: `server-only` bağımlılığı yok. Okuma/yazma işi `@/lib/config`
 * içinde (yalnız sunucu); şema burada durur ki formlar da aynı kuralı uygulasın.
 */

export const CONFIG_PATH = 'pulsecoach.config.json';

/**
 * Köşe yuvarlaklığı seçenekleri. Tema tek bir `--radius` değişkeni kullanır;
 * bütün bileşenlerin köşeleri bundan türer (sm = ×0.6, xl = ×1.4 ...).
 */
export const RADIUS_OPTIONS = {
  sharp: { label: 'Keskin', value: '0rem' },
  subtle: { label: 'Hafif', value: '0.45rem' },
  round: { label: 'Yuvarlak', value: '0.75rem' },
  soft: { label: 'Yumuşak', value: '1rem' },
} as const;

export type RadiusKey = keyof typeof RADIUS_OPTIONS;
const RADIUS_KEYS = Object.keys(RADIUS_OPTIONS) as [RadiusKey, ...RadiusKey[]];

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
  /** Eski kurulumlarda yok: varsayılan temanınki (hafif). */
  radius: v.optional(v.picklist(RADIUS_KEYS, 'Geçerli bir köşe seçeneği seç.'), 'subtle'),
  timeZone: v.pipe(v.string(), v.minLength(1)),
  setupCompleted: v.boolean(),
});

export type AppConfig = v.InferOutput<typeof appConfigSchema>;

export const defaultConfig: AppConfig = {
  appName: 'PulseCoach',
  logo: null,
  accent: null,
  theme: 'dark',
  radius: 'subtle',
  timeZone: 'Europe/Istanbul',
  setupCompleted: false,
};
