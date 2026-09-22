import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { AttachmentForm } from '../attachment-form';

export default function NewAttachmentPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Aparatlar', href: '/dashboard/attachments' }, { label: 'Yeni aparat' }]}
        title="Yeni aparat"
        description="Havuza eklediğin aparatı cihazlarında seçebilirsin; fotoğrafı her yerde aynı görünür."
      />
      <Card>
        <CardContent>
          <AttachmentForm editing={null} />
        </CardContent>
      </Card>
    </div>
  );
}
