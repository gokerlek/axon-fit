import type { Metadata } from 'next';
import { ChartLineUp } from '@phosphor-icons/react/dist/ssr';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { ClientHeader } from '../../client-header';

export const metadata: Metadata = { title: 'İlerleme' };

/**
 * Danışanın İlerleme sekmesi (tasarım §0). Şimdilik boş durum: antrenman kaydı (Faz 3) gelince hareket
 * başına grafik (üst ağırlık, tahmini 1RM), haftalık toplam ağırlık ve kas yükü, rekorlar ve başarılar
 * (Faz 10). Danışanın dilinde yazılır: "e1RM", "tonaj" gibi kısaltmalar yok (SPEC §6). Sayfa yetkiyi
 * kendisi denetler (SPEC §5).
 */
export default async function ProgressPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title="İlerleme" />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartLineUp weight="fill" />
          </EmptyMedia>
          <EmptyTitle>İlerlemen burada görünecek</EmptyTitle>
          <EmptyDescription>
            Antrenman kaydettikçe her hareket için kaldırdığın ağırlığın grafiği, haftalık toplam ağırlık, hangi kasları ne
            kadar çalıştırdığın, rekorların ve başarıların burada birikecek.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
