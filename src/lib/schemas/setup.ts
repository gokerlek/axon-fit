import * as v from 'valibot';
import { appConfigSchema } from './config';

/**
 * Kurulum sihirbazı formu — şema hem formda hem sunucuda kullanılır.
 *
 * `setupCompleted`, `logo` ve `timeZone` formda yok: ilki sunucuda işaretlenir,
 * logo ayrı yükleme ucundan gelir, saat dilimi şimdilik sabit.
 */
export const setupFormSchema = v.object({
  appName: appConfigSchema.entries.appName,
  accent: v.pipe(
    v.string(),
    v.regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.'),
  ),
  theme: appConfigSchema.entries.theme,
});

export type SetupForm = v.InferOutput<typeof setupFormSchema>;

/** Hazır palet: hepsi koyu ve açık temada okunaklı kontrast verir. */
export const ACCENT_PRESETS = [
  { value: '#D4FF3F', label: 'Volt' },
  { value: '#7DF9C7', label: 'Nane' },
  { value: '#63B6FF', label: 'Gökyüzü' },
  { value: '#B79BFF', label: 'Lavanta' },
  { value: '#FF9BB5', label: 'Gül' },
  { value: '#FFB86B', label: 'Kehribar' },
  { value: '#F5F5F5', label: 'Kireç' },
  { value: '#3EDC8A', label: 'Çimen' },
] as const;
