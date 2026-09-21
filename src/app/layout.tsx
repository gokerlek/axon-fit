import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import { readAppConfig } from '@/lib/config';
import '@/styles/globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const config = await readAppConfig();
  return {
    title: config.appName,
    description: `${config.appName} — antrenman takibi`,
    applicationName: config.appName,
    appleWebApp: { capable: true, title: config.appName, statusBarStyle: 'black-translucent' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0c0b' },
    { media: '(prefers-color-scheme: light)', color: '#f3f4ef' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await readAppConfig();
  // 'system' seçiliyken data-theme yazılmaz: tokenlar işletim sistemi tercihine düşer.
  const themeAttr = config.theme === 'system' ? undefined : config.theme;
  // Özel vurgu rengi tokenları satır içinde ezer (SPEC §10).
  const accentStyle = config.accent
    ? ({ '--accent': config.accent, '--accent-text': config.accent, '--accent-indicator': config.accent } as React.CSSProperties)
    : undefined;

  return (
    <html lang="tr" data-theme={themeAttr} style={accentStyle}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
