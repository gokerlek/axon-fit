import type { Metadata } from 'next';
import Link from 'next/link';
import { Camera, Plus } from '@phosphor-icons/react/dist/ssr';
import { CameraHistory } from '@/components/measurements/camera-history';
import { SectionHeader } from '@/components/section-header';
import { Button } from '@/components/ui/button';
import { requirePt } from '@/lib/guards';
import { loadHealthPart, loadMeasurements } from '@/lib/health';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { HealthStrip } from '../health-page';
import { MeasurementOverview } from './measurement-overview';
import { parseRange, RangeFilter } from './range-filter';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from './measurement-page';

export const metadata: Metadata = { title: 'Ölçümler' };

/**
 * Danışanın ölçüm merkezi; manuel kayıt, kamera hazırlığı ve PT taramasına geçiş. Her ölçülen
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
        <SectionHeader title="Ölçümler" />
        <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} />
      </div>
    );
  }

  const { client } = loaded;
  const [view, config, cameraView] = await Promise.all([loadMeasurements(client), readAppConfig(), loadHealthPart(client, 'screening')]);
  const today = todayIn(config.timeZone);
  const range = parseRange(await searchParams, today);

  return (
    <div className="flex flex-col gap-6">
      <HealthStrip client={client} record={view.state === 'ok' ? view.record : null} />
      <SectionHeader
        title="Ölçümler"
        description="Kamerayla alınan açı ölçümleri ve elle girilen ölçümler aşağıda ayrı gösterilir."
      />
      {cameraView.state === 'ok' || view.state === 'ok' ? (
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Yeni ölçüm">
          {cameraView.state === 'ok' ? (
            <Button
              nativeButton={false}
              render={<Link href={`${base}/camera`} />}
              className="h-auto min-h-24 w-full justify-start gap-4 rounded-xl px-5 py-4 text-left whitespace-normal">
              <Camera aria-hidden className="size-8" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-lg font-semibold">Kamerayla ölçüm al</span>
                <span className="text-sm font-normal">Duruş ve hareket açılarını adım adım ölç.</span>
              </span>
            </Button>
          ) : null}
          {view.state === 'ok' ? (
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href={`${base}/new`} />}
              className="h-auto min-h-24 w-full justify-start gap-4 rounded-xl border-border px-5 py-4 text-left whitespace-normal">
              <Plus aria-hidden weight="fill" className="size-8" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-lg font-semibold">Manuel ölçüm gir</span>
                <span className="text-sm font-normal">Aldığın ölçüm ve test değerlerini kaydet.</span>
              </span>
            </Button>
          ) : null}
        </div>
      ) : null}

      {view.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view.state === 'broken' ? (
        <MeasurementProblemAlert
          title="Sağlık kaydı okunamadı"
          problem={`${view.problem} Kayıt uygulama dışında değiştirilmiş olabilir; düzeltilene kadar ölçüm yazılmaz.`}
        />
      ) : null}
      {cameraView.state === 'ok' ? <CameraHistory clientId={id} timeZone={config.timeZone} records={cameraView.record.cameraMeasurements ?? []} /> : null}
      {view.state === 'ok' ? <h3 className="font-heading text-lg font-semibold">Manuel ölçüm geçmişi</h3> : null}
      {view.state === 'ok' && view.record.measurements.length > 0 ? <RangeFilter base={base} range={range} /> : null}
      {view.state === 'ok' ? <MeasurementOverview record={view.record} base={base} from={range.from} to={range.to} today={today} /> : null}
    </div>
  );
}
