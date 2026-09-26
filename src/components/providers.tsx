'use client';

import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { IconContext } from '@phosphor-icons/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeQueryClient } from '@/lib/query/client';
import { GlobalLoading } from './global-loading';

/**
 * İstemci sağlayıcıları.
 * - Tema: `next-themes`, `.dark` sınıfıyla (shadcn teması bu sınıfı okur). Varsayılan PT'nin ayarı.
 * - QueryClient bir kez kurulur (her render'da kurulursa önbellek sıfırlanır).
 * - Bildirimler tek bir Toaster'dan çıkar.
 * - Hareket azaltma tercihinde `motion` dönüş/konum animasyonlarını atlar (yalnız saydamlık kalır).
 * - İkonlar Phosphor'un dolu (fill) sürümü; tek yerden. Sunucuda çizilen ikonlar (`dist/ssr`)
 *   bu bağlamı görmez, onlara `weight="fill"` ayrıca verilir.
 */
const ICONS = { weight: 'fill' } as const;

/**
 * next-themes temayı ilk boyamadan önce koyan satır içi bir `<script>` çizer. Sunucu HTML'inde
 * çalışır; istemcide yeniden çizilirse çalışmaz ve React 19 "Encountered a script tag" hatası verir.
 * Bu, sunucu çizimi kabukta düştüğünde olur: Next hata kabuğu (`<html id="__next_error__">`)
 * gönderip bütün uygulamayı istemcide sıfırdan çizer (ör. Suspense sınırı olmayan bir sayfada
 * `notFound()`; panelde bunu `loading.tsx` sınırları önler). İstemcide betik bir veri bloğudur
 * (`application/json`): hiç çalıştırılmaz, uyarı çıkmaz. Hidrasyonda türün farkı
 * `suppressHydrationWarning` ile (kütüphane koyar) sessizdir; sunucunun betiği yerinde kalır.
 */
const THEME_SCRIPT = { type: typeof window === 'undefined' ? 'text/javascript' : 'application/json' };

export function Providers({
  children,
  defaultTheme,
}: {
  children: React.ReactNode;
  defaultTheme: 'dark' | 'light' | 'system';
}) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
      scriptProps={THEME_SCRIPT}>
      <QueryClientProvider client={queryClient}>
        <IconContext.Provider value={ICONS}>
          <MotionConfig reducedMotion="user">
            <TooltipProvider>
              <GlobalLoading />
              {children}
              <Toaster position="top-center" richColors closeButton />
            </TooltipProvider>
          </MotionConfig>
        </IconContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
