import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { formatDate } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { CLIENT_ID_PATTERN, CLIENT_STATUS_LABELS } from '@/lib/schemas/client';
import { ClientTabs } from './client-tabs';

/**
 * Danışanın sayfaları tek bir çatı altında: üstte adı ve durumu, altında sekmeler (SPEC §6).
 * Program, ölçümler ve davet danışanın sayfasından çıkmadan açılır. Sayfalar yetkiyi yine
 * kendileri de denetler: layout'taki kontrol sayfanın RSC verisini durdurmaz.
 */
export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const [loaded, config] = await Promise.all([loadClient(id), readAppConfig()]);
  if (!loaded) notFound();

  const title = loaded.ok ? loaded.client.name : id;
  const description = loaded.ok
    ? `${CLIENT_STATUS_LABELS[loaded.client.status]} · ${formatDate(loaded.client.createdAt, config.timeZone)} tarihinde eklendi`
    : 'Kayıt okunamadı';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageHeader crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: title }]} title={title} description={description} />
        <ClientTabs clientId={id} />
      </div>
      {children}
    </div>
  );
}
