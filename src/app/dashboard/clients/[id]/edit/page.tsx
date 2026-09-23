import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadClient } from '@/lib/clients';
import { requirePt } from '@/lib/guards';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { ClientForm } from '../../client-form';
import { ClientActions } from './client-actions';

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();

  // Kaydı okunamayan danışan: düzenlenecek bir şey yok, yalnız listeden silinebilir.
  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: id, href: `/dashboard/clients/${id}` }, { label: 'Düzenle' }]}
          title="Danışanı düzenle"
          actions={<ClientActions id={id} name={null} />}
        />
        <Card>
          <CardHeader>
            <CardTitle>Kayıt okunamadı</CardTitle>
            <CardDescription>
              {loaded.problem} Repo'yu GitHub'da geri yüklediysen sayfayı yenile; yoksa “Sil” ile kimliği listeden çıkar.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { client } = loaded;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Danışanlar', href: '/dashboard/clients' },
          { label: client.name, href: `/dashboard/clients/${id}` },
          { label: 'Düzenle' },
        ]}
        title="Danışanı düzenle"
        actions={<ClientActions id={id} name={client.name} />}
      />
      <ClientForm editing={client} />
    </div>
  );
}
