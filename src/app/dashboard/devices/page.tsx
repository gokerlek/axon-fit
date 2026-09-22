import Link from 'next/link';
import { Plus } from '@phosphor-icons/react/dist/ssr';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DEVICE_KIND_LABELS, DEVICE_KINDS, describeDeviceLoads } from '@/lib/device-loads';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';

/**
 * Cihazlar: hazır katalog + PT'nin cihazları, türe göre gruplu. Egzersizler cihaza
 * bağlanır; ağırlık önerileri cihazın ayarlanabilen ağırlıklarından seçilir.
 */
export default async function DevicesPage() {
  const [devices, exercises] = await Promise.all([listDevices(), listExercises()]);
  const usage = new Map<string, number>();
  for (const exercise of exercises) {
    if (exercise.deviceId) usage.set(exercise.deviceId, (usage.get(exercise.deviceId) ?? 0) + 1);
  }
  const custom = devices.filter((device) => device.source === 'custom').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cihazlar"
        description={
          <>
            <span className="tabular-nums">{devices.length}</span> cihaz · <span className="tabular-nums">{custom}</span> tanesi
            senin
          </>
        }
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/devices/new" />}>
            <Plus data-icon="inline-start" />
            Yeni cihaz
          </Button>
        }
      />

      {DEVICE_KINDS.map((kind) => {
        const group = devices.filter((device) => device.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} className="flex flex-col gap-3" aria-label={DEVICE_KIND_LABELS[kind]}>
            <h2 className="text-sm font-medium text-muted-foreground">{DEVICE_KIND_LABELS[kind]}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((device) => (
                <li key={device.id}>
                  <Link
                    href={`/dashboard/devices/${device.id}`}
                    className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                      <CardHeader>
                        <CardTitle>{device.name}</CardTitle>
                        <CardDescription>{describeDeviceLoads(device)}</CardDescription>
                        {device.source === 'custom' ? (
                          <CardAction>
                            <Badge variant="secondary">senin</Badge>
                          </CardAction>
                        ) : null}
                      </CardHeader>
                      <CardFooter className="text-xs text-muted-foreground">
                        <span className="tabular-nums">{usage.get(device.id) ?? 0}</span>&nbsp;egzersiz
                      </CardFooter>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
