import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadClient } from '@/lib/clients';
import { requirePt } from '@/lib/guards';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { ClientForm } from '../../client-form';
import { ClientActions } from './client-actions';

export const metadata: Metadata = { title: 'Danışanı düzenle' };

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
        <SectionHeader
          back={{ href: `/dashboard/clients/${id}`, label: 'Genel' }}
          title="Kişisel bilgiler ve izinler"
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
      <SectionHeader
        back={{ href: `/dashboard/clients/${id}`, label: 'Genel' }}
        title="Kişisel bilgiler ve izinler"
        description="Ad, not, durum ve sağlık modülü. Program ve ölçümler kendi sekmelerinde."
        actions={<ClientActions id={id} name={client.name} />}
      />
      <ClientForm editing={client} />
    </div>
  );
}
