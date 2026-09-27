import Link from 'next/link';
import { BellSimple } from '@phosphor-icons/react/dist/ssr';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { formatNumber, formatRecent } from '@/lib/format';
import { NOTICE_WINDOW_DAYS, noticeFeed, PT_NOTICE_LABELS } from '@/lib/notices';
import { cn } from '@/lib/utils';
import { clientOverviews } from './client-overviews';
import { MarkSeenButton } from './mark-seen-button';

/**
 * Genel bakış'ın "Bildirimler"i (tasarım §4.6): bütün danışanların son 14 gündeki bildirimleri tek
 * listede, en yeniden eskiye: başka gün seçildi, yarım bırakıldı, aşırı yük, hafifletildi, danışanın
 * program değişikliği (antrenman günleri), bekleyen öneriler, onay sürdükçe ağrı ayrıntısı. Satır
 * danışana ya da programına götürür. Okunmamışlar noktalı; "Tümünü okundu say" danışanların
 * `inbox.seenAt`'ini yazar (açık soru 7). Arşivdeki danışan listede yok.
 *
 * Maliyet: danışan başına özet Next'in veri önbelleğinden (`notices-store.ts`, "Dikkat gerektirenler"le ortak);
 * yalnız danışanın bildirim doğuran yazımından sonra (ya da 5 dk'da bir) o danışanın dosyaları yeniden okunur.
 */
export async function NoticesCard({ timeZone }: { timeZone: string }) {
  const { overviews, failed } = await clientOverviews();
  const feed = noticeFeed(overviews);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Bildirimler
          {feed.unread > 0 ? <Badge className="tabular-nums">{formatNumber(feed.unread)} yeni</Badge> : null}
        </CardTitle>
        <CardDescription>
          Son {NOTICE_WINDOW_DAYS} gün: danışanların antrenmanlarından ve program değişikliklerinden.
          {failed > 0 ? ` ${formatNumber(failed)} danışanın kaydı okunamadı.` : ''}
        </CardDescription>
        {feed.unreadClients.length > 0 ? (
          <CardAction>
            <MarkSeenButton clientIds={feed.unreadClients} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {feed.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellSimple weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Bildirim yok</EmptyTitle>
              <EmptyDescription>
                Danışan başka gün seçtiğinde, antrenmanı yarım bıraktığında ya da günlerini değiştirdiğinde burada görünür.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {feed.items.map((item) => (
              <li key={`${item.clientId}:${item.key}`}>
                <Item
                  size="sm"
                  render={
                    <Link
                      href={`/dashboard/clients/${item.clientId}${item.target === 'program' ? '/program' : item.target === 'constraints' ? '/constraints' : ''}`}
                    />
                  }
                  className="touch:min-h-11">
                  <ItemMedia>
                    <span
                      aria-hidden
                      className={cn('size-2 rounded-full', item.unread ? 'bg-primary' : 'bg-transparent ring-1 ring-border ring-inset')}
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className={cn(item.unread && 'font-semibold')}>
                      {item.clientName}
                      <Badge variant="outline">{PT_NOTICE_LABELS[item.kind]}</Badge>
                      {item.unread ? <span className="sr-only">(okunmadı)</span> : null}
                    </ItemTitle>
                    <ItemDescription>{item.text}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <time dateTime={item.at} className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatRecent(item.at, timeZone)}
                    </time>
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
