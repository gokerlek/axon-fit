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
  /** null = temanın kendi ana rengi (koyu ve açık mod için ayrı ayarlı); hiçbir şey ezilmez. */
  accent: v.nullable(v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.'))),
  theme: appConfigSchema.entries.theme,
  radius: appConfigSchema.entries.radius,
});

export type SetupForm = v.InferOutput<typeof setupFormSchema>;

/**
 * Hazır palet. İlk seçenek (`null`) temanın kendi rengidir; diğerleri onu ezer.
 * Üstündeki yazı rengi her seçimde kontrasta göre hesaplanır (src/lib/color.ts).
 */
export const ACCENT_PRESETS: readonly { value: string | null; label: string }[] = [
  { value: null, label: 'Tema' },
  { value: '#7DF9C7', label: 'Nane' },
  { value: '#38BDF8', label: 'Gökyüzü' },
  { value: '#A78BFA', label: 'Lavanta' },
  { value: '#FB7185', label: 'Gül' },
  { value: '#FBBF24', label: 'Kehribar' },
  { value: '#F97316', label: 'Turuncu' },
  { value: '#E5E5E5', label: 'Kireç' },
];
