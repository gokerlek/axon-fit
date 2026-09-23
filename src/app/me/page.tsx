import { Barbell, SignOut } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { healthConsentState } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { ConsentCard } from './consent-card';

/**
 * Danışan alanı. PT ekranlarıyla hiçbir adres paylaşmaz (SPEC §5). Telefon odaklı.
 * Yetki çerezden okunur ve her açılışta kayıtla karşılaştırılır: PT erişimi kapattıysa
 * ya da danışanı arşivlediyse buraya giremez.
 */
export default async function MePage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  const health = healthConsentState(client);
  const firstName = client.name.split(/\s+/)[0] ?? client.name;
  const asking = health === 'pending' || health === 'outdated';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{config.appName}</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Merhaba, {firstName}</h1>
        </div>
        {/* Çıkış POST'tur: bağlantı önizlemesi ya da yanlış dokunuş oturumu kapatmasın. */}
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            <SignOut data-icon="inline-start" weight="fill" />
            Çıkış
          </Button>
        </form>
      </header>

      {/* Onay bekliyorsa ilk iş o: karar verilmeden sağlık ekranları açılmaz. */}
      {asking ? <ConsentCard state={health} fields={client.modules.health.fields} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Bugünün antrenmanı</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Barbell weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Henüz program yok</EmptyTitle>
              <EmptyDescription>Antrenörün program atadığında bugünün antrenmanı burada görünecek.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>

      {health === 'granted' || health === 'declined' ? (
        <ConsentCard state={health} fields={client.modules.health.fields} />
      ) : null}
    </main>
  );
}
