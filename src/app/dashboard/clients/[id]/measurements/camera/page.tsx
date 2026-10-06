import { POSE_TASKS,type PoseTask } from '@/lib/pose/protocols';
import type { Metadata } from 'next';
import { CameraWizard } from '@/components/measurements/camera-wizard';
import { SectionHeader } from '@/components/section-header';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { HealthLockAlert, HealthStrip } from '../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../measurement-page';

export const metadata: Metadata = { title: 'Kamera ölçümü' };

export default async function CameraMeasurementPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{analysis?:string}> }) {
  await requirePt();
  const { id } = await params;
  const {analysis}=await searchParams;
  const initialTask=POSE_TASKS.includes(analysis as PoseTask)?analysis as PoseTask:'front';
  const base = `/dashboard/clients/${id}/measurements`;
  const loaded = await measurementClient(id);
  const [view, config] = await Promise.all([loaded.ok ? loadHealthPart(loaded.client, 'screening') : null, readAppConfig()]);
  return (
    <div className="flex flex-col gap-6">
      {loaded.ok ? <HealthStrip client={loaded.client} record={view?.state === 'ok' ? view.record : null} /> : null}
      <SectionHeader title="Kamera ölçümü" description="Duruş ve hareket ölçümü, sayısal kayıt ve geçmiş karşılaştırması." back={{ href: base, label: 'Ölçümler' }} />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
      {view?.state === 'ok' ? <CameraWizard initialTask={initialTask} clientName={loaded.ok?loaded.client.name:undefined} clientId={id} backHref={base} manualHref={`${base}/new`} timeZone={config.timeZone} records={view.record.cameraMeasurements ?? []} /> : null}
    </div>
  );
}
