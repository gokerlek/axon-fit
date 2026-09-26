import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { loadClient } from '@/lib/clients';
import { requirePt } from '@/lib/guards';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { StatusDot } from '../status-dot';
import { ClientTabs } from './client-tabs';
import { clientTitle } from './client-title';

/**
 * Sekmenin başlığı: Genel'de danışanın adı, alt sayfalarda "Ölçümler · Ayşe · Uygulama" (`clientTitle`):
 * iki danışanın sekmeleri ayırt edilir.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  // Ad yalnız PT'ye: oturumsuz istekte başlık da kayıt okumadan önce girişe yönlenir.
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) return {};
  // `loadClient` istek başına önbellekli: sayfa aynı kaydı yeniden okumaz.
  const [loaded, resolved] = await Promise.all([loadClient(id).catch(() => null), parent]);
  return { title: clientTitle(loaded?.ok ? loaded.client.name : 'Danışan', resolved.title?.template) };
}

/**
 * Danışanın sayfaları tek bir çatı altında: üstte adı ve durumu, altında sekmeler (SPEC §6).
 * Program, ölçümler ve davet danışanın sayfasından çıkmadan açılır. Sayfalar yetkiyi yine
 * kendileri de denetler: layout'taki kontrol sayfanın RSC verisini durdurmaz.
 */
export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();

  const name = loaded.ok ? loaded.client.name : id;
  // Durum adın sağ üstünde nokta; eklenme tarihi Genel sekmesinin profil tablosunda.
  const title = loaded.ok ? (
    <span className="inline-flex items-start gap-1.5">
      {name}
      <StatusDot status={loaded.client.status} className="mt-1" />
    </span>
  ) : (
    name
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: name }]}
          title={title}
          description={loaded.ok ? undefined : 'Kayıt okunamadı'}
        />
        <ClientTabs clientId={id} />
      </div>
      {children}
    </div>
  );
}
