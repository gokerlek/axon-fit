'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { makeQueryClient } from '@/lib/query/client';
import { GlobalLoading } from './global-loading';

/**
 * İstemci sağlayıcıları. QueryClient bir kez kurulur (her render'da yeniden
 * kurulursa önbellek sıfırlanır), bildirimler tek bir Toaster'dan çıkar.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalLoading />
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
