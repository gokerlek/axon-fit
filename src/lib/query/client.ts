import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from './errors';

/**
 * Tek merkez: yükleniyor / hata / başarılı yönetimi.
 *
 * Ekranlar `try/catch` ve `toast` çağrısı taşımaz. Her çağrı ne kadar konuşacağını
 * `notify` ile söyler; gösterme işini burası yapar:
 *
 *   notify="none"                     → sessiz (ör. arka planda otomatik kaydetme)
 *   notify="error"                    → yalnız hata (varsayılan)
 *   notify={{ success: 'Kaydedildi' }} → hata + verilen başarı mesajı
 */
export type NotifyOption = 'none' | 'error' | { success?: string; error?: boolean };

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    mutationMeta: { notify?: NotifyOption };
    queryMeta: { notify?: NotifyOption };
  }
}

function showError(error: unknown, notify: NotifyOption | undefined) {
  if (notify === 'none') return;
  if (typeof notify === 'object' && notify.error === false) return;
  toast.error(error instanceof ApiError ? error.message : 'Beklenmeyen bir hata oldu.');
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // GitHub yavaş ve saatlik istek sınırı var: aynı veriyi 30 sn tekrar çekme.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (deneme, error) => {
          // Yetki/bulunamadı gibi hatalarda tekrar denemek anlamsız; sunucu hatası geçici olabilir.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return deneme < 2;
        },
      },
      mutations: {
        // Çakışma (409) yeniden denenebilir: veri katmanı güncel sha ile tekrar yazar.
        retry: (deneme, error) => error instanceof ApiError && error.conflict && deneme < 1,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => showError(error, query.meta?.notify),
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => showError(error, mutation.meta?.notify),
      onSuccess: (_data, _vars, _ctx, mutation) => {
        const notify = mutation.meta?.notify;
        if (typeof notify === 'object' && notify.success) toast.success(notify.success);
      },
    }),
  });
}
