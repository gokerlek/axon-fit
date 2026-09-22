import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { DEVICE_KIND_LABELS, describeDeviceLoads, deviceLoads, effectiveLoadKg } from '@/lib/device-loads';
import { getDevice } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { formatKg } from '@/lib/format';
import { summarizeMuscles } from '@/lib/muscles';
import { DeviceActions } from './device-actions';

/** Cihaz detayı — kendi sayfası (modal değil). */
export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [device, exercises] = await Promise.all([getDevice(id), listExercises()]);
  if (!device) notFound();

  const used = exercises.filter((exercise) => exercise.deviceId === id);
  const loads = deviceLoads(device) ?? [];
  const shown = loads.slice(0, 40);
  const ratio = device.kind === 'cable' ? (device.pulleyRatio ?? 1) : 1;

  const rows: [string, string][] = [
    ['Tür', DEVICE_KIND_LABELS[device.kind]],
    ...(device.baseKg !== undefined
      ? ([[device.kind === 'barbell' ? 'Bar' : device.kind === 'plate_loaded' ? 'Kızak' : 'İlk blok', formatKg(device.baseKg)]] as [string, string][])
      : []),
    ...(device.stepKg ? ([[device.kind === 'barbell' || device.kind === 'plate_loaded' ? 'En küçük artış' : 'Blok adımı', formatKg(device.stepKg)]] as [string, string][]) : []),
    ...(device.maxKg ? ([['En çok', formatKg(device.maxKg)]] as [string, string][]) : []),
    ...(device.addOnsKg?.length ? ([['Ara ağırlıklar', device.addOnsKg.map((kg) => `+${formatKg(kg)}`).join(', ')]] as [string, string][]) : []),
    ...(device.kind === 'cable'
      ? ([['Makara', ratio === 1 ? 'Tek makara (1:1)' : `${ratio}:1 — 20 kg seçince kolda ${formatKg(effectiveLoadKg(device, 20))}`]] as [string, string][])
      : []),
  ];

  const origin = device.source === 'library' ? 'Hazır katalog' : device.overridesLibrary ? 'Senin sürümün' : 'Senin cihazın';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Cihazlar', href: '/dashboard/devices' }, { label: device.name }]}
        title={device.name}
        description={describeDeviceLoads(device)}
        actions={<DeviceActions id={device.id} title={device.name} source={device.source} overridesLibrary={device.overridesLibrary} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ağırlık ayarı</CardTitle>
            <CardDescription>{origin}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <Table>
              <TableBody>
                {rows.map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell className="w-36 text-muted-foreground">{label}</TableCell>
                    <TableCell className="whitespace-normal tabular-nums">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {loads.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground">Ayarlanabilen ağırlıklar (öneriler bunlardan seçilir)</span>
                <div className="flex flex-wrap gap-1.5">
                  {shown.map((kg) => (
                    <Badge key={kg} variant="secondary" className="tabular-nums">
                      {kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                    </Badge>
                  ))}
                  {loads.length > shown.length ? (
                    <Badge variant="outline" className="tabular-nums">
                      +{loads.length - shown.length} ağırlık daha
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Ağırlık ayarı yok; ilerleme tekrar ya da süreyle olur.</p>
            )}
            {device.notes ? <p className="text-muted-foreground">{device.notes}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bu cihazla yapılan egzersizler</CardTitle>
            <CardDescription>
              {used.length > 0
                ? 'Şablonda cihaz değişince egzersiz, o cihazdaki muadiline geçer.'
                : 'Henüz bağlı egzersiz yok. Egzersizi düzenleyip cihazını seçebilirsin.'}
            </CardDescription>
          </CardHeader>
          {used.length > 0 ? (
            <CardContent>
              <ItemGroup className="gap-2">
                {used.map((exercise) => (
                  <Item key={exercise.id} variant="outline" size="sm" render={<Link href={`/dashboard/exercises/${exercise.id}`} />}>
                    <ItemContent>
                      <ItemTitle>{exercise.title}</ItemTitle>
                      <ItemDescription>{summarizeMuscles(exercise.primaryMuscles).join(', ')}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
