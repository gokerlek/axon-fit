import type { Metadata } from 'next';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { ClientHeader } from '../../client-header';

export const metadata: Metadata = { title: 'Geçmiş' };

/**
 * Danışanın Geçmiş sekmesi (tasarım §0, §2.10). Şimdilik boş durum: antrenman kaydı (Faz 3) gelince
 * bitmiş antrenmanlar tarih sırasıyla listelenir, detayı açılır ve onaylı silinir (Faz 9). Sayfa
 * yetkiyi kendisi denetler (SPEC §5).
 */
export default async function HistoryPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title="Geçmiş" />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClockCounterClockwise weight="fill" />
          </EmptyMedia>
          <EmptyTitle>Henüz antrenman yok</EmptyTitle>
          <EmptyDescription>
            Bitirdiğin antrenmanlar burada tarih sırasıyla listelenecek: süresi, set sayısı, kaldırdığın toplam ağırlık ve
            rekorların. Birine dokunup setlerini açabilecek, istemediğin kaydı silebileceksin.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
