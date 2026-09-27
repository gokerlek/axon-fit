import type { MetadataRoute } from 'next';
import { readAppConfig } from '@/lib/config';

// Marka ayarları değişince yeni kurulumlar güncel adı görür.
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const config = await readAppConfig();
  return {
    id: '/',
    name: config.appName,
    short_name: config.appName,
    description: `${config.appName} — antrenman takibi`,
    lang: 'tr',
    start_url: '/me',
    scope: '/',
    display: 'standalone',
    background_color: '#171717',
    theme_color: '#171717',
    icons: [192, 512].flatMap((size) => (['any', 'maskable'] as const).map((purpose) => ({
      src: `/api/brand/app-icon?size=${size}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose,
    }))),
  };
}
