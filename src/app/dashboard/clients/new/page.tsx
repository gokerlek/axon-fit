import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { ClientForm } from '../client-form';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Yeni danışan' };

export default async function NewClientPage() {
  await requirePt();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: 'Yeni danışan' }]}
        title="Yeni danışan"
        description="Kaydettiğinde danışanın verisi senin hesabında, yalnız ona ayrılmış gizli bir kayıtta tutulur; kaydın adında isim geçmez."
      />
      <ClientForm editing={null} />
    </div>
  );
}
