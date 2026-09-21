'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { ApiError } from './errors';
import type { NotifyOption } from './client';

/**
 * Veri erişiminin tek kapısı (client-dashboard'daki `useService` deseni).
 *
 * Ekranlar `queryKey`/`queryFn` kurmaz, `invalidateQueries` çağırmaz, `toast` çağırmaz:
 * - `key` + `fn` ile okuma,
 * - `fn` + `invalidate` ile yazma ve sonrasında tazeleme,
 * - `notify` ile o çağrının ne kadar konuşacağı.
 */

type ServiceQueryContext = { signal: AbortSignal };

type ServiceQueryConfig<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData, QueryKey>,
  'queryKey' | 'queryFn' | 'meta'
> & {
  key: QueryKey;
  /** React Query'nin iptal sinyalini alır: anahtar değişince süren istek iptal edilir. */
  fn: (context: ServiceQueryContext) => Promise<TData>;
  notify?: NotifyOption;
};

export function useServiceQuery<TData>({
  key,
  fn,
  notify = 'error',
  ...options
}: ServiceQueryConfig<TData>): UseQueryResult<TData, ApiError> {
  return useQuery({
    ...options,
    queryKey: key,
    queryFn: ({ signal }) => fn({ signal }),
    meta: { notify },
  });
}

type ServiceMutationConfig<TData, TVariables, TContext> = Omit<
  UseMutationOptions<TData, ApiError, TVariables, TContext>,
  'mutationFn' | 'meta'
> & {
  fn: (variables: TVariables) => Promise<TData>;
  /** Başarıdan sonra tazelenecek anahtarlar; elle invalidate çağrısı gerekmez. */
  invalidate?: QueryKey[];
  notify?: NotifyOption;
};

export function useServiceMutation<TData = unknown, TVariables = void, TContext = unknown>({
  fn,
  invalidate,
  notify = 'error',
  onSuccess,
  ...options
}: ServiceMutationConfig<TData, TVariables, TContext>): UseMutationResult<
  TData,
  ApiError,
  TVariables,
  TContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: fn,
    meta: { notify },
    // Argümanlar olduğu gibi aktarılır: React Query sürümleri geri çağrı imzasına
    // yeni parametre eklediğinde bu sarmalayıcı kırılmasın.
    onSuccess: async (...args: Parameters<NonNullable<typeof onSuccess>>) => {
      if (invalidate?.length) {
        await Promise.all(invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
      }
      await onSuccess?.(...args);
    },
  });
}
