import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { readAppConfig } from '@/lib/config';
import { CONSTRAINT_ID_PATTERN, constraintsOf, isActive, isPendingReport, regionText, triggersText } from '@/lib/constraints';
import { listExercises } from '@/lib/exercises';
import { formatDateTime, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { HealthLockAlert } from '../../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../../../measurements/measurement-page';
import { ConstraintEditActions } from '../../constraint-actions';
import { ConstraintFormView, draftOf } from '../../constraint-form';

/** Kısıt; başlık ve sayfa aynı okumayı paylaşır. Okunabilen kayıtta yoksa (silinmiş, yanlış adres) 404. */
const loadConstraint = cache(async (id: string, kid: string) => {
  if (!CONSTRAINT_ID_PATTERN.test(kid)) notFound();
  const loaded = await measurementClient(id);
  const view = loaded.ok ? await loadHealthPart(loaded.client, 'conditions') : null;
  const constraint = view?.state === 'ok' ? constraintsOf(view.record).find((item) => item.id === kid) : undefined;
  if (view?.state === 'ok' && !constraint) notFound();
  return { loaded, view, constraint };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string; kid: string }> }): Promise<Metadata> {
  await requirePt();
  const { id, kid } = await params;
  const { constraint } = await loadConstraint(id, kid);
  return { title: constraint ? `${regionText(constraint)} · kısıt` : 'Kısıt' };
}

/**
 * Kısıtı düzenle (tasarım `kisit-tarama.md` §2.3). Danışanın bekleyen bildiriminde "Onayla ve düzenle": form
 * danışanın cevaplarıyla ve zorlayanlardan gelen öneriyle dolu, kaydetmek onaylar. Başlıkta Kapat / Yeniden aç ve Sil.
 */
export default async function EditConstraintPage({ params }: { params: Promise<{ id: string; kid: string }> }) {
  await requirePt();
  const { id, kid } = await params;
  const [{ loaded, view, constraint }, config] = await Promise.all([loadConstraint(id, kid), readAppConfig()]);

  if (view?.state === 'ok' && constraint) {
    const confirming = isPendingReport(constraint);
    const label = regionText(constraint);
    const library = await listExercises();
    const status = confirming ? 'pending' : isActive(constraint) ? 'active' : 'closed';
    return (
      <ConstraintFormView
        clientId={id}
        mode={{ kind: 'edit', id: kid, baseUpdatedAt: constraint.updatedAt, confirming }}
        initial={draftOf(constraint, confirming)}
        library={library}
        today={todayIn(config.timeZone)}
        title={confirming ? `${label} · bildirimi onayla` : `${label} · kısıt`}
        description={confirming ? 'Danışanın cevapları ve zorlayanlardan gelen öneri dolu; kaydedince onaylanır.' : 'Değiştir; değişiklik kısıtın kaydına yazılır.'}
        actions={<ConstraintEditActions clientId={id} id={kid} baseUpdatedAt={constraint.updatedAt} status={status} label={label} />}
        reportSummary={
          confirming ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Danışanın bildirimi</CardTitle>
                <CardDescription>{formatDateTime(constraint.createdAt, config.timeZone)}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {constraint.triggers?.length ? <p>Zorlayanlar: {triggersText(constraint.triggers)}</p> : <p>Zorlayan seçmedi.</p>}
                {constraint.reportNote ? <p className="text-muted-foreground">“{constraint.reportNote}”</p> : null}
              </CardContent>
            </Card>
          ) : null
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/constraints`, label: 'Kısıtlar' }} title="Kısıt" />
      {!loaded.ok ? <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="conditions" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title="Sağlık kaydı okunamadı" problem={view.problem} /> : null}
    </div>
  );
}
