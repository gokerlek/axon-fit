import type { Metadata } from 'next';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { loadHistory } from '@/lib/history-store';
import { ClientHeader } from '../../client-header';
import { HistoryList } from './history-list';

export const metadata: Metadata = { title: 'Geçmiş' };

/**
 * Danışanın Geçmiş sekmesi (tasarım §2.10): bitmiş antrenmanlar en yeniden eskiye, aylara bölünmüş; satırda
 * gün, süre, set, toplam ağırlık ve rekor, "başka gün" ve "yarım" rozetleri; üstte son 30 günün özeti. Liste
 * `sessions-index.json`'dan tek okumayla gelir (her okumada `sessions/` ağacıyla onarılır). Satır detayı açar
 * (`/me/gecmis/[id]`: setler, silme). Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function HistoryPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  const list = await loadHistory(client.id, config.timeZone).catch(() => null);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <ClientHeader client={client} appName={config.appName} title="Geçmiş" />
        {list?.recent ? <p className="text-sm text-muted-foreground tabular-nums">{list.recent}</p> : null}
      </div>
      {list === null ? (
        <Card>
          <CardHeader>
            <CardTitle>Geçmişin şu an açılamıyor</CardTitle>
            <CardDescription>Bağlantında ya da kayıt deposunda bir sorun var. Biraz sonra yeniden dene.</CardDescription>
          </CardHeader>
        </Card>
      ) : list.count === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockCounterClockwise weight="fill" />
            </EmptyMedia>
            <EmptyTitle>Henüz antrenman yok</EmptyTitle>
            <EmptyDescription>
              Bitirdiğin antrenmanlar burada tarih sırasıyla görünür: süresi, set sayısı, kaldırdığın toplam ağırlık ve
              rekorların. Birine dokunup setlerini açabilir, istemediğin kaydı silebilirsin.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <HistoryList months={list.months} />
      )}
    </main>
  );
}
