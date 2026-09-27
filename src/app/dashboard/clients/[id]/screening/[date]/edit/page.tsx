import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import { formatDay } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { isCalendarDate } from '@/lib/measurement-log';
import { HealthLockAlert } from '../../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../../../measurements/measurement-page';
import { ScreeningDelete } from '../../screening-actions';
import { ScreeningForm } from '../../screening-form';
import { initialScreeningState } from '../../screening-state';

/** Günün taraması; başlık ve sayfa aynı okumayı paylaşır. Okunabilen kayıtta o gün yoksa 404. */
const loadDay = cache(async (id: string, date: string) => {
  if (!isCalendarDate(date)) notFound();
  const loaded = await measurementClient(id);
  const view = loaded.ok ? await loadHealthPart(loaded.client, 'screening') : null;
  const screening = view?.state === 'ok' ? (view.record.screenings ?? []).find((item) => item.date === date) : undefined;
  if (view?.state === 'ok' && !screening) notFound();
  return { loaded, view, screening };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string; date: string }> }): Promise<Metadata> {
  await requirePt();
  const { id, date } = await params;
  await loadDay(id, date);
  return { title: `${formatDay(date)} taraması` };
}

/** Bir günün taramasını düzenleme; başlıkta "Sil" o günü kaldırır. */
export default async function EditScreeningPage({ params }: { params: Promise<{ id: string; date: string }> }) {
  await requirePt();
  const { id, date } = await params;
  const { loaded, view, screening } = await loadDay(id, date);
  const dateLabel = formatDay(date);

  if (view?.state === 'ok' && screening) {
    return (
      <ScreeningForm
        clientId={id}
        mode={{ kind: 'edit', date }}
        initial={initialScreeningState({ date, tests: screening.tests, ...(screening.note ? { note: screening.note } : {}) })}
        title={`${dateLabel} taraması`}
        description="Değiştir; boşalttığın test o günden çıkar."
        actions={<ScreeningDelete clientId={id} date={date} dateLabel={dateLabel} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/screening`, label: 'Tarama' }} title={`${dateLabel} taraması`} />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
    </div>
  );
}
