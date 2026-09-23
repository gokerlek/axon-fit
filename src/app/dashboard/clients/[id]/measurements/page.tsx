import Link from 'next/link';
import { Plus } from '@phosphor-icons/react/dist/ssr';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { MeasurementOverview } from './measurement-overview';
import { parseRange, RangeFilter } from './range-filter';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from './measurement-page';

/**
 * Danışanın ölçümleri — yalnız gösterir; tek eylem "Ölçüm gir" (SPEC §6, §7.5). Her ölçülen
 * şey için bir grafik kartı: seyir, son değer, son iki ölçüm arasındaki değişimin gerçek olup
 * olmadığı ve yorum satırları. Altta tam genişlikte ölçüm günleri; güne dokununca düzenleme.
 */
export default async function MeasurementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aralik?: string; bas?: string; bit?: string }>;
}) {
  await requirePt();
  const { id } = await params;
  const loaded = await measurementClient(id);
  const base = `/dashboard/clients/${id}/measurements`;

  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          crumbs={[{ label: 'Danışanlar', href: '/dashboard/clients' }, { label: id, href: `/dashboard/clients/${id}` }, { label: 'Ölçümler' }]}
          title="Ölçümler"
        />
        <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} />
      </div>
    );
  }

  const { client } = loaded;
  const [view, config] = await Promise.all([loadMeasurements(client), readAppConfig()]);
  const range = parseRange(await searchParams, todayIn(config.timeZone));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Danışanlar', href: '/dashboard/clients' },
          { label: client.name, href: `/dashboard/clients/${id}` },
          { label: 'Ölçümler' },
        ]}
        title="Ölçümler"
        description="Periyodik ölçümlerin seyri. Ölçüm hatasının altındaki değişim gelişme sayılmaz."
        actions={
          view.state === 'ok' ? (
            <Button nativeButton={false} render={<Link href={`${base}/new`} />}>
              <Plus data-icon="inline-start" weight="fill" />
              Ölçüm gir
            </Button>
          ) : null
        }
      />

      {view.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view.state === 'broken' ? (
        <MeasurementProblemAlert
          title="Sağlık kaydı okunamadı"
          problem={`${view.problem} Danışanın repo'sundaki dosya elle değiştirilmiş olabilir; düzeltilene kadar ölçüm yazılmaz.`}
        />
      ) : null}
      {view.state === 'ok' && view.record.measurements.length > 0 ? <RangeFilter base={base} range={range} /> : null}
      {view.state === 'ok' ? <MeasurementOverview record={view.record} base={base} from={range.from} to={range.to} /> : null}
    </div>
  );
}
