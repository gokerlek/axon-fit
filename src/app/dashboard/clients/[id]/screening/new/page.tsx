import type { Metadata } from 'next';
import { Info } from '@phosphor-icons/react/dist/ssr';
import { SectionHeader } from '@/components/section-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { canRecordHealth } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { awaitsOpinion, constraintTitle, constraintsOf, isActive } from '@/lib/constraints';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import type { Constraint } from '@/lib/schemas/health';
import { presetFromConstraints } from '@/lib/screening';
import { HealthLockAlert } from '../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../../measurements/measurement-page';
import { initialScreeningState, ScreeningForm } from '../screening-form';

const TITLE = 'Tarama yap';

export const metadata: Metadata = { title: TITLE };

/** Etkin kısıtlar başlıkta (tasarım §4.5): görüşü alınmamış kırmızı bayrak bölgesine değen testler "Yapılmadı (kısıt)" hazır. */
function ConstraintsNote({ constraints }: { constraints: Constraint[] }) {
  if (constraints.length === 0) return null;
  const waiting = constraints.filter(awaitsOpinion);
  return (
    <Alert>
      <Info weight="fill" />
      <AlertTitle>Etkin kısıtlar</AlertTitle>
      <AlertDescription>
        <p>{constraints.map((item) => `${constraintTitle(item)}${awaitsOpinion(item) ? ' (görüş bekleniyor)' : ''}`).join(' · ')}</p>
        <p>
          {waiting.length > 0
            ? 'Görüşü alınmamış bölgeye değen testler “Yapılmadı (kısıt)” olarak hazır; istersen değiştir.'
            : 'Kısıtlı bölgeye değen testlerde ağrı olursa testi bırak; kısıtlı taraf asimetriye girmez.'}
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** Tarama girişi: gün bugün (uygulamanın saat dilimi), yalnız doldurulan testler kaydedilir. */
export default async function NewScreeningPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const [loaded, config] = await Promise.all([measurementClient(id), readAppConfig()]);
  const view = loaded.ok ? await loadHealthPart(loaded.client, 'screening') : null;

  if (loaded.ok && view?.state === 'ok') {
    const today = todayIn(config.timeZone);
    // Kısıtlar yalnız onaylıysa okunur.
    const constraints = canRecordHealth(loaded.client, 'conditions') ? constraintsOf(view.record).filter(isActive) : [];
    return (
      <ScreeningForm
        clientId={id}
        mode={{ kind: 'new', today, screenedDates: (view.record.screenings ?? []).map((item) => item.date) }}
        initial={initialScreeningState({ date: today, preset: presetFromConstraints(constraints) })}
        title={TITLE}
        description="Her testte önce ağrıyı, sonra yapılan sürümü ve kaçan noktaları işaretle; sonuç kendiliğinden yazılır."
        constraintsNote={<ConstraintsNote constraints={constraints} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/screening`, label: 'Tarama' }} title={TITLE} />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
    </div>
  );
}
