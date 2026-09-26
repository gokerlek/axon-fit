import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Outfit } from 'next/font/google';
import { Providers } from '@/components/providers';
import { readAppConfig } from '@/lib/config';
import { RADIUS_OPTIONS } from '@/lib/schemas/config';
import { brandStyle as accentStyle } from '@/lib/color';
import { cn } from '@/lib/utils';
import './globals.css';

// latin-ext şart: ğ ş ı İ bu alt kümede. Yalnız 'latin' yüklenirse bu harfler
// sistem yazı tipine düşer ve kelimelerin ortasında farklı görünür.
const outfit = Outfit({ subsets: ['latin', 'latin-ext'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin', 'latin-ext'], variable: '--font-mono' });

export async function generateMetadata(): Promise<Metadata> {
  const config = await readAppConfig();
  return {
    // Her sayfa kendi adını verir (`metadata.title`): sekme, geçmiş ve ekran okuyucunun geçiş
    // duyurusu (Next yalnız `document.title` değişince duyurur) sayfayı ayırt eder.
    title: { default: config.appName, template: `%s · ${config.appName}` },
    description: `${config.appName} — antrenman takibi`,
    applicationName: config.appName,
    appleWebApp: { capable: true, title: config.appName, statusBarStyle: 'black-translucent' },
    // Logo yüklendiyse sekme ve telefon kısayol ikonu da ondan üretilir; yoksa markanın nabız
    // çizgisi (`public/favicon.ico`).
    icons: config.logo ? { icon: '/api/brand/logo', apple: '/api/brand/logo' } : { icon: '/favicon.ico' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await readAppConfig();

  // PT'nin seçtiği ana renk temanın --primary değişkenini ezer; üzerindeki yazı rengi ve yüzey
  // üstünde okunan türevleri (--primary-text, --primary-strong) kontrasta göre hesaplanır.
  const brandStyle = {
    '--radius': RADIUS_OPTIONS[config.radius].value,
    ...(config.accent ? accentStyle(config.accent) : {}),
  } as React.CSSProperties;

  return (
    <html
      lang="tr"
      suppressHydrationWarning
      style={brandStyle}
      className={cn('font-sans antialiased', outfit.variable, geistMono.variable)}>
      <body className="min-h-dvh bg-background text-foreground">
        <Providers defaultTheme={config.theme}>{children}</Providers>
      </body>
    </html>
  );
}
