import { PageHeader } from '@/components/page-header';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { measurementDays } from '@/lib/measurement-log';
import { MeasurementForm } from '../measurement-form';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from '../measurement-page';

/** Ölçüm girişi: gün bugün (uygulamanın saat dilimi), yalnız doldurulan değerler kaydedilir. */
export default async function NewMeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const [loaded, config] = await Promise.all([measurementClient(id), readAppConfig()]);
  const name = loaded.ok ? loaded.client.name : id;
  const view = loaded.ok ? await loadMeasurements(loaded.client) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Danışanlar', href: '/dashboard/clients' },
          { label: name, href: `/dashboard/clients/${id}` },
          { label: 'Ölçümler', href: `/dashboard/clients/${id}/measurements` },
          { label: 'Ölçüm gir' },
        ]}
        title="Ölçüm gir"
        description="Yalnız doldurduğun alanlar kaydedilir. Ölçümler danışanın kendi repo'sunda, sağlık kaydında durur."
      />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
      {view?.state === 'ok' ? (
        <MeasurementForm
          clientId={id}
          mode={{
            kind: 'new',
            today: todayIn(config.timeZone),
            measuredDates: measurementDays(view.record.measurements).map((day) => day.date),
          }}
          initialValues={{}}
          askSex={!view.record.sex}
        />
      ) : null}
    </div>
  );
}
