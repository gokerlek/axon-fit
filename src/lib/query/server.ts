import 'server-only';
import { cache } from 'react';
import { makeQueryClient } from './client';

/**
 * Sunucu tarafı istemci: her istek için bir tane (React `cache` ile).
 * Sayfa sunucuda ön yükleme yapıp `HydrationBoundary` ile aktardığında
 * tarayıcı aynı veriyi ikinci kez çekmez.
 */
export const getQueryClient = cache(makeQueryClient);
