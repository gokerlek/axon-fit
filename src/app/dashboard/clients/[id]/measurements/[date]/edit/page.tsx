import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import { formatDay } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { isCalendarDate, measurementsOn, slotsFromValues } from '@/lib/measurement-log';
import { MeasurementForm } from '../../measurement-form';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from '../../measurement-page';
import { MeasurementActions } from './measurement-actions';

/** Bir günün ölçümlerini düzenleme; başlıkta "Sil" o günü tamamen kaldırır (SPEC §6). */
export default async function EditMeasurementPage({ params }: { params: Promise<{ id: string; date: string }> }) {
  await requirePt();
  const { id, date } = await params;
  if (!isCalendarDate(date)) notFound();
  const loaded = await measurementClient(id);
  const name = loaded.ok ? loaded.client.name : id;
  const view = loaded.ok ? await loadMeasurements(loaded.client) : null;
  const entries = view?.state === 'ok' ? measurementsOn(view.record.measurements, date) : [];
  // Kayıt okunabiliyor ama o gün yok: silinmiş ya da yanlış adres.
  if (view?.state === 'ok' && entries.length === 0) notFound();
  const dateLabel = formatDay(date);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        back={{ href: `/dashboard/clients/${id}/measurements`, label: 'Ölçümler' }}
        title={`${dateLabel} ölçümleri`}
        description="Değerleri düzelt; boşalttığın alan o günden çıkar."
        actions={view?.state === 'ok' ? <MeasurementActions clientId={id} date={date} dateLabel={dateLabel} /> : null}
      />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
      {view?.state === 'ok' ? (
        <MeasurementForm
          clientId={id}
          mode={{ kind: 'edit', date }}
          initialValues={slotsFromValues(entries)}
          askSex={!view.record.sex}
        />
      ) : null}
    </div>
  );
}
