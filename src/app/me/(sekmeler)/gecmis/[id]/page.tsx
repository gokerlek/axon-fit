import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { loadDetail } from '@/lib/history-store';
import { sessionDetail } from '@/lib/session-history';
import { ClientHeader } from '../../../client-header';
import { HistoryDetail } from './history-detail';

export const metadata: Metadata = { title: 'Antrenman' };

const BACK = { href: '/me/gecmis', label: 'Geçmiş' };

/**
 * Geçmişteki bir antrenman (tasarım §2.10): hareketler yapılış sırasıyla, setler zorluklarıyla, ayar notu,
 * program değişiklikleri; "Özeti aç" karuseli açar. Düzenle kipinde set, hareket ve antrenmanın tamamı onaylı
 * silinir, su ±1 (açık soru 6: geçmişte set düzeltme yok). Dock Geçmiş'te kalır. Sayfa yetkiyi kendisi
 * denetler (SPEC §5); bitmemiş antrenman antrenman ekranına döner.
 */
export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [client, config, { id }] = await Promise.all([currentClient(), readAppConfig(), params]);
  const loaded = await loadDetail(client.id, id).catch(() => null);
  if (loaded?.status === 'active') redirect('/me/antrenman');

  if (loaded === null) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title="Antrenman" back={BACK} />
        <Card>
          <CardHeader>
            <CardTitle>Antrenman şu an açılamıyor</CardTitle>
            <CardDescription>Bağlantında ya da kayıt deposunda bir sorun var. Biraz sonra yeniden dene.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }
  if (loaded.status !== 'ok') {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title="Antrenman" back={BACK} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockCounterClockwise weight="fill" />
            </EmptyMedia>
            <EmptyTitle>{loaded.status === 'deleted' ? 'Bu antrenman silinmiş' : 'Antrenman bulunamadı'}</EmptyTitle>
            <EmptyDescription>
              {loaded.status === 'deleted' ? 'Silinen antrenman uygulamada görünmez.' : 'Adres yanlış olabilir ya da antrenman silinmiş olabilir.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="h-11" nativeButton={false} render={<Link href="/me/gecmis" />}>
              Geçmişe dön
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    );
  }

  const { doc, changes } = loaded.value;
  return (
    <main className="flex flex-col gap-4">
      <ClientHeader client={client} appName={config.appName} title={sessionDetail(doc, config.timeZone).title} back={BACK} />
      <HistoryDetail initialDoc={doc} changes={changes} timeZone={config.timeZone} />
    </main>
  );
}
