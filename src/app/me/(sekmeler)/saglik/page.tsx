import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Camera, FirstAidKit } from '@phosphor-icons/react/dist/ssr';
import { ScreeningRows } from '@/components/progress/screening-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canRecordHealth } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { clientConstraintView, constraintsOf, type ClientConstraintView } from '@/lib/constraints';
import { formatDay } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { readHealthIfAllowed } from '@/lib/health';
import { clientScreeningRows, newestFirst, SCREENING_PROTOCOL } from '@/lib/screening';
import { ClientHeader } from '../../client-header';
import { HealthConstraints } from './health-constraints';

export const metadata: Metadata = { title: 'Sağlık' };

/**
 * Danışanın Sağlık sayfası (tasarım `kisit-tarama.md` §5.2; avatar menüsünden, dock'ta etkin sekme yok). Yalnız
 * telefon, 375 px. Kısıtlar (onaylıysa): bildir, düzelt, geri çek, kötüleşti, düzeldi. Hareket taraması (onaylıysa):
 * sözcük, taraf, önceki taramaya göre ok ve odak; sayı ve toplam yok. Onay yoksa ilgili bölüm hiç yok, dosya
 * okunmaz.
 */
export default async function ClientHealthPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  const conditions = canRecordHealth(client, 'conditions');
  const screening = canRecordHealth(client, 'screening');
  const record = conditions || screening ? await readHealthIfAllowed(client, ['conditions', 'screening']).catch(() => null) : null;

  let open: ClientConstraintView[] = [];
  let closed: ClientConstraintView[] = [];
  if (conditions && record) {
    const views = constraintsOf(record).map(clientConstraintView);
    open = views.filter((view) => view.state === 'pending' || view.state === 'confirmed' || view.state === 'seen');
    closed = views.filter((view) => view.state === 'resolved' || view.state === 'declined');
  }
  const screenings = screening && record ? newestFirst(record.screenings ?? []).filter((item) => item.protocol === SCREENING_PROTOCOL) : [];
  const latest = screenings[0];

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title="Sağlık" back={{ href: '/me', label: 'Bugün' }} />

      {!conditions && !screening ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FirstAidKit weight="fill" className="size-5 text-muted-foreground" />
              Sağlık sayfası kapalı
            </CardTitle>
            <CardDescription>
              Kısıtlar ve hareket taraması için onayın yok. <Link href="/me/ayarlar" className="underline underline-offset-4">Ayarlar</Link>’dan
              bakabilirsin.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {conditions ? (
        record ? (
          <HealthConstraints open={open} closed={closed} />
        ) : (
          <p className="text-sm text-muted-foreground">Sağlık kaydın şu an açılamıyor. Antrenörüne haber ver.</p>
        )
      ) : null}

      {screening ? <Card size="sm"><CardHeader><CardTitle className="flex items-center gap-2"><Camera className="size-5 text-primary" />Kamera ölçümü</CardTitle><CardDescription>Yönlendirmeyi takip ederek duruş ve hareket açılarını ölç. Görüntü kaydedilmez.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href="/me/olcum" />} className="min-h-11 w-full">Kamerayla ölçüm al</Button></CardContent></Card> : null}

      {screening ? (
        <section aria-labelledby="screening-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="screening-heading" className="font-heading text-lg font-semibold">
              {latest ? `PT değerlendirmesi · ${formatDay(latest.date)}` : 'PT değerlendirmesi'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {latest ? 'Antrenörün temel hareketlerine baktı. Not değil; nereden başlayacağınızın haritası.' : 'Antrenörün henüz tarama yapmadı.'}
            </p>
          </div>
          {latest ? (
            <Card size="sm">
              <CardContent className="flex flex-col gap-2 px-0">
                <ScreeningRows rows={clientScreeningRows(latest, screenings[1] ?? null)} />
                {screenings[1] ? <p className="px-3 text-xs text-muted-foreground">↑ ↓: bir önceki taramaya göre ({formatDay(screenings[1].date)}).</p> : null}
              </CardContent>
            </Card>
          ) : null}
          {screenings.length > 1 ? (
            <details className="rounded-lg border p-3 text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium">Önceki taramalar ({screenings.length - 1})</summary>
              <div className="mt-2 flex flex-col gap-4">
                {screenings.slice(1).map((item, index) => (
                  <div key={item.date} className="flex flex-col gap-2">
                    <p className="font-medium">{formatDay(item.date)}</p>
                    <ScreeningRows rows={clientScreeningRows(item, screenings[index + 2] ?? null)} />
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
