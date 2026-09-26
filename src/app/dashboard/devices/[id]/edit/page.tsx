import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { listAttachments } from '@/lib/attachments';
import { getDevice } from '@/lib/devices';
import { DeviceActions } from '../device-actions';
import { DeviceForm } from '../../device-form';
import { requirePt } from '@/lib/guards';

/** Sayfa başlığı ile sayfa aynı okumayı paylaşır (istek başına bir kez). */
const loadDevice = cache((id: string) => getDevice(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const device = await loadDevice((await params).id);
  return { title: device ? `Düzenle: ${device.name}` : 'Cihaz bulunamadı' };
}

export default async function EditDevicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const [device, attachments] = await Promise.all([loadDevice(id), listAttachments()]);
  if (!device) notFound();
  const { source: _source, overridesLibrary: _override, ...editable } = device;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Cihazlar', href: '/dashboard/devices' },
          { label: device.name, href: `/dashboard/devices/${id}` },
          { label: 'Düzenle' },
        ]}
        title="Cihazı düzenle"
        actions={
          <DeviceActions
            id={id}
            title={device.name}
            source={device.source}
            overridesLibrary={device.overridesLibrary}
          />
        }
        description={
          device.source === 'library'
            ? 'Hazır katalogdan bir cihaz: kaydettiğinde yalnız senin kurulumunda geçerli bir sürüm oluşur. İstediğin zaman varsayılana dönebilirsin.'
            : undefined
        }
      />
      <Card>
        <CardContent>
          <DeviceForm editing={editable} attachments={attachments} />
        </CardContent>
      </Card>
    </div>
  );
}
