import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getAttachment } from '@/lib/attachments';
import { AttachmentActions } from '../../attachment-actions';
import { AttachmentForm } from '../../attachment-form';

export default async function EditAttachmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachment = await getAttachment(id);
  if (!attachment) notFound();
  const { source, overridesLibrary, ...editable } = attachment;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Aparatlar', href: '/dashboard/attachments' },
          { label: attachment.name, href: `/dashboard/attachments/${id}` },
          { label: 'Düzenle' },
        ]}
        title="Aparatı düzenle"
        actions={<AttachmentActions id={id} title={attachment.name} source={source} overridesLibrary={overridesLibrary} />}
        description={
          source === 'library'
            ? 'Hazır havuzdan bir aparat: kaydettiğinde yalnız senin kurulumunda geçerli bir sürüm oluşur.'
            : undefined
        }
      />
      <Card>
        <CardContent>
          <AttachmentForm editing={editable} />
        </CardContent>
      </Card>
    </div>
  );
}
