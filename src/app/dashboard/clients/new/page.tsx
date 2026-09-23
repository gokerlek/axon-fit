import { PageHeader } from '@/components/page-header';
import { ClientForm } from '../client-form';
import { requirePt } from '@/lib/guards';
import { templateChoices } from '@/lib/templates';

export default async function NewClientPage() {
  await requirePt();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: 'Yeni danışan' }]}
        title="Yeni danışan"
        description="Kaydettiğinde hesabında bu danışana özel, gizli bir repo açılır. Repo adında isim geçmez, yalnız kimlik."
      />
      <ClientForm editing={null} templates={await templateChoices()} />
    </div>
  );
}
