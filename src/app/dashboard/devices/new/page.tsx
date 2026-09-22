import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { DeviceForm } from '../device-form';

export default function NewDevicePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Cihazlar', href: '/dashboard/devices' }, { label: 'Yeni cihaz' }]}
        title="Yeni cihaz"
        description="Kendi cihazların repo'nda ayrı durur; hazır katalog güncellense de silinmez."
      />
      <Card>
        <CardContent>
          <DeviceForm editing={null} />
        </CardContent>
      </Card>
    </div>
  );
}
