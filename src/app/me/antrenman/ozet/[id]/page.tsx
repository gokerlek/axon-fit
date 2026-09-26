import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { loadSummary } from '@/lib/history-store';
import { SummaryCarousel } from './summary-carousel';

export const metadata: Metadata = { title: 'Özet' };

/**
 * Antrenman özeti (tasarım §2.8): bitişten hemen sonra ve geçmişten ("Özeti aç", `?from=gecmis`) açılır.
 * Tam ekran, dock yok (`/me/antrenman` gibi sekmeler grubunun dışında). Sayfa yetkiyi kendisi denetler
 * (SPEC §5); hesaplar `history-store.ts` → `workout-summary.ts`. Bitmemiş antrenman antrenman ekranına döner;
 * silinmiş ya da olmayan antrenmanda dönüş bağlantısı.
 */
export default async function SummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [client, config, { id }, query] = await Promise.all([currentClient(), readAppConfig(), params, searchParams]);
  const from = query.from === 'gecmis' ? 'history' : 'finish';
  const loaded = await loadSummary(client.id, id, config.timeZone);
  if (loaded.status === 'active') redirect('/me/antrenman');
  if (loaded.status !== 'ok') {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-4 pt-[env(safe-area-inset-top)] pb-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockCounterClockwise weight="fill" />
            </EmptyMedia>
            <EmptyTitle>{loaded.status === 'deleted' ? 'Bu antrenman silinmiş' : 'Antrenman bulunamadı'}</EmptyTitle>
            <EmptyDescription>
              {loaded.status === 'deleted' ? 'Silinen antrenmanın özeti açılamaz.' : 'Adres yanlış olabilir ya da antrenman henüz kaydedilmemiş.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="h-11" nativeButton={false} render={<Link href={from === 'history' ? '/me/gecmis' : '/me'} />}>
              {from === 'history' ? 'Geçmişe dön' : "Bugün'e dön"}
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    );
  }
  const firstName = client.name.split(/\s+/)[0] ?? client.name;
  return <SummaryCarousel summary={loaded.value} firstName={firstName} from={from} />;
}
