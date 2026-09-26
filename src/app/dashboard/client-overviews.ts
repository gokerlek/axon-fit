import 'server-only';
import { cache } from 'react';
import { cachedClientIndex } from '@/lib/clients';
import { readClientDigest, type ClientOverview } from '@/lib/notices-store';

/**
 * Genel bakış'ın danışan özetleri: arşivdekiler hariç, danışan başına önbellekten (`notices-store.ts`). Bir
 * istekte bir kez okunur: "Dikkat gerektirenler" ve "Bildirimler" aynı özetleri paylaşır. `failed`: kaydı
 * okunamayan danışanlar.
 */
export const clientOverviews = cache(async (): Promise<{ overviews: ClientOverview[]; failed: number }> => {
  const index = await cachedClientIndex().catch(() => []);
  const results = await Promise.all(
    index.filter((entry) => entry.status !== 'archived').map((entry) => readClientDigest(entry.id).catch(() => null)),
  );
  const overviews = results.filter((item): item is ClientOverview => item !== null);
  return { overviews, failed: results.length - overviews.length };
});
