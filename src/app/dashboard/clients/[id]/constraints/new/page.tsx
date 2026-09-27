import type { Metadata } from 'next';
import { SectionHeader } from '@/components/section-header';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { HealthLockAlert } from '../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../../measurements/measurement-page';
import { ConstraintFormView } from '../constraint-form';

const TITLE = 'Kısıt ekle';

export const metadata: Metadata = { title: TITLE };

/** Yeni kısıt (tasarım `kisit-tarama.md` §2.3): sayfa, modal değil. PT'nin kaydı onaylı başlar. */
export default async function NewConstraintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const [loaded, config] = await Promise.all([measurementClient(id), readAppConfig()]);
  const view = loaded.ok ? await loadHealthPart(loaded.client, 'conditions') : null;

  if (view?.state === 'ok') {
    const library = await listExercises();
    return (
      <ConstraintFormView
        clientId={id}
        mode={{ kind: 'new' }}
        initial={{ avoid: [] }}
        library={library}
        today={todayIn(config.timeZone)}
        title={TITLE}
        description="Bölge, tür ve kaçınılacak hareketler; tanı ve notlar isteğe bağlı."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/constraints`, label: 'Kısıtlar' }} title={TITLE} />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="conditions" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
    </div>
  );
}
