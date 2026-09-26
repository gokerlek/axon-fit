import type { Metadata } from 'next';
import { SectionHeader } from '@/components/section-header';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { measurementDays } from '@/lib/measurement-log';
import { MeasurementForm } from '../measurement-form';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from '../measurement-page';

const TITLE = 'Ölçüm gir';

export const metadata: Metadata = { title: TITLE };

/** Ölçüm girişi: gün bugün (uygulamanın saat dilimi), yalnız doldurulan değerler kaydedilir. */
export default async function NewMeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const [loaded, config] = await Promise.all([measurementClient(id), readAppConfig()]);
  const view = loaded.ok ? await loadMeasurements(loaded.client) : null;

  // Başlık ve Kaydet formun içinde (masaüstünde başlıkta Kaydet); form yoksa yalnız başlık ve nedeni.
  if (view?.state === 'ok') {
    return (
      <MeasurementForm
        clientId={id}
        title={TITLE}
        description="Tarih dışında bütün alanlar isteğe bağlı; yalnız doldurduğun değerler kaydedilir."
        mode={{
          kind: 'new',
          today: todayIn(config.timeZone),
          measuredDates: measurementDays(view.record.measurements).map((day) => day.date),
        }}
        initialValues={{}}
        askSex={!view.record.sex}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/measurements`, label: 'Ölçümler' }} title={TITLE} />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
    </div>
  );
}
