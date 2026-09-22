import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getDevice } from '@/lib/devices';
import { DeviceForm } from '../../device-form';

export default async function EditDevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const device = await getDevice(id);
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
        description={
          device.source === 'library'
            ? 'Hazır katalogdan bir cihaz: kaydettiğinde yalnız senin kurulumunda geçerli bir sürüm oluşur. İstediğin zaman varsayılana dönebilirsin.'
            : undefined
        }
      />
      <Card>
        <CardContent>
          <DeviceForm editing={editable} />
        </CardContent>
      </Card>
    </div>
  );
}
