'use client';

import { useRouter } from 'next/navigation';
import { Checks } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/**
 * "Tümünü okundu say" (Genel bakış'taki Bildirimler): okunmamış bildirimi olan danışanların
 * `inbox.seenAt`'i şimdiye çekilir; sayfa tazelenir. Bazıları yazılamazsa onların bildirimleri okunmamış
 * kalır ve söylenir.
 */
export function MarkSeenButton({ clientIds }: { clientIds: string[] }) {
  const router = useRouter();
  const seen = useServiceMutation({
    fn: () => fetchJson<{ ok: true; failed?: string[] }>('/api/notices/seen', { method: 'POST', body: JSON.stringify({ clientIds }) }),
    notify: 'error',
    onSuccess: () => router.refresh(),
  });
  const failed = seen.data?.failed?.length ?? 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" className="touch:h-11" disabled={seen.isPending} onClick={() => seen.mutate()}>
        {seen.isPending ? <Spinner data-icon="inline-start" /> : <Checks data-icon="inline-start" />}
        Tümünü okundu say
      </Button>
      {failed > 0 ? <span className="text-xs text-muted-foreground">{failed} danışanda yazılamadı; biraz sonra tekrar dene.</span> : null}
    </div>
  );
}
