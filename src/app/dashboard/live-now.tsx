'use client';

import Link from 'next/link';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';
import { LIVE_OVERVIEW_POLL_MS, liveDetailText, type LiveOverviewResponse } from '@/lib/live-text';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { LiveDot } from './live-dot';

/**
 * Genel bakış'ın "Şu an antrenmanda" kartı (tasarım §4.6, §8 satır 12): açık antrenmanı olan danışanlar, her biri
 * "Gün A · 7/17 set · son set 2 dk önce" ve danışanın Antrenmanlar sekmesine bağlantı. Sayfa görünürken 60 sn'de
 * bir tazelenir (SPEC §7: genel görünüm daha seyrek; açık antrenman danışanın sayfasında 10 sn'de bir), gizliyken
 * durur. İlk değer sunucudan; göreli zaman sunucunun anına göre (`checkedAt`).
 */
export function LiveNow({ initial }: { initial: LiveOverviewResponse | null }) {
  const { data } = useServiceQuery<LiveOverviewResponse>({
    key: ['live-overview'],
    fn: ({ signal }) => fetchJson<LiveOverviewResponse>('/api/live', { signal }),
    ...(initial ? { initialData: initial, initialDataUpdatedAt: Date.parse(initial.checkedAt) } : {}),
    refetchInterval: LIVE_OVERVIEW_POLL_MS,
    notify: 'none',
  });
  const items = data?.items ?? [];
  const now = data ? new Date(data.checkedAt) : null;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Şu an antrenmanda</CardDescription>
        <CardTitle className="tabular-nums text-4xl">{data ? formatNumber(items.length) : '—'}</CardTitle>
        {items.length > 0 ? (
          <CardAction>
            <LiveDot className="mt-1.5" />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {!data ? (
          <p className="text-muted-foreground">Danışanların antrenmanları okunuyor…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">Şu an antrenman yapan yok. Danışan set kaydettikçe burada canlı görünür.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.clientId} className="flex flex-col">
                <Link
                  href={`/dashboard/clients/${item.clientId}/sessions`}
                  className="w-fit font-medium underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                  {item.name}
                </Link>
                <span className="text-muted-foreground tabular-nums">{now ? liveDetailText(item, now) : null}</span>
              </li>
            ))}
          </ul>
        )}
        {data && data.failed > 0 ? <p className="text-xs text-muted-foreground">{formatNumber(data.failed)} danışanın durumu okunamadı.</p> : null}
      </CardContent>
    </Card>
  );
}
