import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { listAttachments } from '@/lib/attachments';
import { DeviceForm } from '../device-form';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Yeni cihaz' };

export default async function NewDevicePage() {
  await requirePt();
  const attachments = await listAttachments();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Cihazlar', href: '/dashboard/devices' }, { label: 'Yeni cihaz' }]}
        title="Yeni cihaz"
        description="Eklediğin cihazlar ayrı saklanır; hazır katalog güncellense de silinmez."
      />
      <Card>
        <CardContent>
          <DeviceForm editing={null} attachments={attachments} />
        </CardContent>
      </Card>
    </div>
  );
}
