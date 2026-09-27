import Link from 'next/link';
import { Bandaids, CalendarX, ChatCircleText, CheckCircle, Flag, PersonSimpleTaiChi, QrCode, Ruler, TrendDown, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ATTENTION_LABELS, attentionFeed, type AttentionKind, type AttentionTarget } from '@/lib/attention';
import { formatNumber } from '@/lib/format';
import { clientOverviews } from './client-overviews';

const ICONS: Record<AttentionKind, typeof CalendarX> = {
  constraint: Bandaids,
  missed: CalendarX,
  screening: PersonSimpleTaiChi,
  stalled: TrendDown,
  phase: Flag,
  proposals: ChatCircleText,
  measurement: Ruler,
  invite: QrCode,
};

/** Maddenin götürdüğü yer: danışanın ilgili sekmesi. */
const TARGET_PATHS: Record<AttentionTarget, string> = {
  client: '',
  sessions: '/sessions',
  program: '/program',
  measurements: '/measurements',
  constraints: '/constraints',
  screening: '/screening',
  invite: '/invite',
};

/**
 * Genel bakış'ın "Dikkat gerektirenler"i (tasarım §2.11, §8 satır 12; SPEC §6): danışan başına kaçan antrenman
 * günü, ilerlemeyen hareket, süresi dolan evre, bekleyen öneriler, ölçümde gerileme ve kullanılmamış davet;
 * aciliyete göre sıralı (`attention.ts`). Her satır danışanın ilgili sekmesine götürür.
 *
 * Maliyet: "Bildirimler"le aynı danışan özetlerinden (`client-overviews.ts`; önbellekli, danışanın yazımlarında
 * düşer); sayfa açılışında danışan başına GitHub okuması yok. Hareket adları sayfanın zaten okuduğu kütüphaneden
 * (`titles`). Zamana bağlı kararlar (kaçan gün, evrenin bitişi) her açılışta şimdiye göre verilir.
 */
export async function AttentionCard({ timeZone, titles }: { timeZone: string; titles: ReadonlyMap<string, string> }) {
  const { overviews, failed } = await clientOverviews();
  const feed = attentionFeed(
    overviews.map((overview) => ({ id: overview.id, name: overview.name, facts: overview.attention })),
    { now: new Date(), timeZone, titleOf: (exerciseId) => titles.get(exerciseId) ?? exerciseId },
  );
  const hidden = feed.total - feed.items.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Dikkat gerektirenler
          {feed.total > 0 ? <Badge variant="secondary" className="tabular-nums">{formatNumber(feed.total)}</Badge> : null}
        </CardTitle>
        <CardDescription>
          En acili üstte; kırmızı ünlemliler sağlık güvenliği (kırmızı bayrak, danışanın &quot;şiddetli&quot; dediği kısıt). Sonra kaçan antrenman günleri,
          ilerlemeyen hareketler, süresi dolan evreler, bekleyen öneriler, ölçümde gerileme ve davetler.
          {failed > 0 ? ` ${formatNumber(failed)} danışanın kaydı okunamadı.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {feed.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Şu an dikkat gerektiren bir şey yok</EmptyTitle>
              <EmptyDescription>
                Danışan antrenman gününü kaçırdığında, bir hareket ilerlemediğinde ya da bir karar beklediğinde burada görünür.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {feed.items.map((item) => {
              const ItemIcon = ICONS[item.kind];
              return (
                <li key={`${item.clientId}:${item.key}`}>
                  <Item size="sm" render={<Link href={`/dashboard/clients/${item.clientId}${TARGET_PATHS[item.target]}`} />} className="touch:min-h-11">
                    <ItemMedia variant="icon">
                      <ItemIcon weight="fill" className="text-muted-foreground" aria-hidden />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="line-clamp-none flex-wrap gap-1.5">
                        {item.clientName}
                        <Badge variant="outline">{ATTENTION_LABELS[item.kind]}</Badge>
                      </ItemTitle>
                      {item.tone === 'danger' ? (
                        // Sağlık güvenliği (kırmızı bayrak, danışanın "şiddetli"si): renk tek başına bilgi taşımaz, ekran okuyucu "Acil" duyar.
                        <ItemDescription className="text-foreground">
                          <WarningCircle weight="fill" aria-hidden className="mr-1 inline size-4 align-[-0.1875rem] text-destructive" />
                          <span className="sr-only">Acil: </span>
                          {item.text}
                        </ItemDescription>
                      ) : (
                        <ItemDescription>{item.text}</ItemDescription>
                      )}
                    </ItemContent>
                  </Item>
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 ? <p className="text-sm text-muted-foreground">+{formatNumber(hidden)} madde daha; danışanların sayfalarında.</p> : null}
      </CardContent>
    </Card>
  );
}
