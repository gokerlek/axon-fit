import type { Metadata } from 'next';
import Link from 'next/link';
import { loadHealthPart } from '@/lib/health';
import { CameraWizard } from '@/components/measurements/camera-wizard';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { ClientHeader } from '../../client-header';

export const metadata: Metadata = { title: 'Kamera ölçümü' };

export default async function ClientCameraPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  const view = await loadHealthPart(client, 'screening');
  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title="Kamera ölçümü" back={{ href: '/me/saglik', label: 'Sağlık' }} />
      {view.state === 'ok' ? <CameraWizard clientName={client.name} clientId={client.id} backHref="/me/saglik" backLabel="Sağlığa dön" manualHref="/me/saglik" manualLabel="PT sonuçlarını gör" timeZone={config.timeZone} records={view.record.cameraMeasurements ?? []} /> : <Card><CardHeader><CardTitle>{view.state === 'broken' ? 'Ölçüm kaydı okunamadı' : 'Hareket taraması kapalı'}</CardTitle><CardDescription>Modül ve onay durumunu <Link className="underline underline-offset-4" href="/me/ayarlar">ayarlarından</Link> kontrol edebilirsin. Kamera açılmadı.</CardDescription></CardHeader></Card>}
    </main>
  );
}
