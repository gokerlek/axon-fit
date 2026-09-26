'use client';

import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { LIVE_IDLE_POLL_MS, LIVE_POLL_MS, liveDetailText, type LiveResponse } from '@/lib/live-text';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { cn } from '@/lib/utils';
import { LiveDot } from '../../live-dot';

/**
 * Danışanın açık antrenmanı (tasarım §4.6, §8 satır 12): "Şu an antrenmanda · Gün A · 7/17 set · son set 2 dk
 * önce". Antrenmanlar sekmesinde ve Genel'in Antrenmanlar kartında. Sekme görünürken 10 sn'de bir tazelenir,
 * kimse çalışmıyorken 60 sn'de bir (yeni başlayan antrenman için); sekme gizliyken durur (React Query
 * `refetchIntervalInBackground: false`). İlk değer sunucudan gelir; göreli zaman sunucunun anına göredir
 * (`checkedAt`): sunucu ve tarayıcı aynı metni çizer, her tazelemede ilerler.
 *
 * Satır ekran okuyucuya canlı bölge değildir: 10 sn'de bir değişen "dk önce" sürekli duyurulurdu.
 */
export function LiveSession({ clientId, initial, className }: { clientId: string; initial: LiveResponse | null; className?: string }) {
  const { data } = useServiceQuery<LiveResponse>({
    key: ['live', clientId],
    fn: ({ signal }) => fetchJson<LiveResponse>(`/api/clients/${clientId}/live`, { signal }),
    ...(initial ? { initialData: initial, initialDataUpdatedAt: Date.parse(initial.checkedAt) } : {}),
    refetchInterval: (query) => (query.state.data?.live ? LIVE_POLL_MS : LIVE_IDLE_POLL_MS),
    // Tazeleme arka planda: düşen bir istek bildirim çıkarmaz, sonraki tazelemede düzelir.
    notify: 'none',
  });
  const live = data?.live;
  if (!data || !live) return null;

  return (
    <Item variant="outline" size="sm" className={cn('border-primary/30 bg-primary/5', className)}>
      <ItemMedia>
        <LiveDot />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Şu an antrenmanda</ItemTitle>
        <ItemDescription className="tabular-nums">{liveDetailText(live, new Date(data.checkedAt))}</ItemDescription>
      </ItemContent>
    </Item>
  );
}
