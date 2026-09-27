import type { Metadata } from 'next';
import Link from 'next/link';
import { CaretRight, FirstAidKit, PencilSimple, Plus, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { SectionHeader } from '@/components/section-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { conditionLabel, parseCondition } from '@/lib/conditions';
import { readAppConfig } from '@/lib/config';
import { careInputOf, evaluateCare, type CareInput } from '@/lib/constraint-filter';
import {
  avoidFromTriggers,
  avoidText,
  CLEARANCE_BASIS_LABELS,
  constraintLogOf,
  constraintMeta,
  constraintsOf,
  DIAGNOSIS_SOURCE_LABELS,
  EMERGENCY_TEXT,
  isActive,
  isEmergency,
  isPendingReport,
  overridesOf,
  redFlagStep,
  regionText,
  SEVERITY_LABELS,
  severeUnreviewed,
  triggersText,
} from '@/lib/constraints';
import { listExercises, type ExerciseWithSource } from '@/lib/exercises';
import { formatDateTime, formatDay, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { canRecordHealth } from '@/lib/client-status';
import { currentPhaseOf } from '@/lib/program-plan';
import { readProgramFile } from '@/lib/programs';
import type { Client } from '@/lib/schemas/client';
import type { Constraint, HealthRecord } from '@/lib/schemas/health';
import type { Program } from '@/lib/schemas/program';
import { cn } from '@/lib/utils';
import { HealthLockAlert, HealthStrip } from '../health-page';
import { MeasurementProblemAlert, measurementClient } from '../measurements/measurement-page';
import { ChangeActions, OverrideRemove, RedFlagActions, ReportActions } from './constraint-actions';

export const metadata: Metadata = { title: 'Kısıtlar' };

/** Şu anki evrede bu kısıtın yaptırma ve dikkat sayısı ("Programda: 1 yaptırma · 2 dikkat"). */
function programCounts(constraint: Constraint, program: Program | null, exercises: ReadonlyMap<string, ExerciseWithSource>, input: CareInput) {
  if (!program) return null;
  const phase = currentPhaseOf(program)?.phase;
  if (!phase) return null;
  const own: CareInput = { ...input, active: [constraint], reports: [], overrides: input.overrides.filter((item) => item.source === constraint.id) };
  let blocked = 0;
  let warned = 0;
  for (const day of phase.days) {
    for (const block of day.blocks) {
      for (const row of block.rows) {
        const exercise = exercises.get(row.exerciseId);
        if (!exercise) continue;
        const result = evaluateCare(exercise, own);
        if (result.decision === 'block') blocked += 1;
        else if (result.decision) warned += 1;
      }
    }
  }
  return { blocked, warned };
}

function diagnosisLine(constraint: Constraint): string | null {
  const parsed = constraint.conditionId ? parseCondition(constraint.conditionId) : null;
  if (!parsed) return null;
  return `${conditionLabel(parsed)} · ${constraint.diagnosisSource ? DIAGNOSIS_SOURCE_LABELS[constraint.diagnosisSource].toLocaleLowerCase('tr') : 'kaynak yok'}`;
}

function findingLine(constraint: Constraint): string | null {
  const parsed = constraint.findingId ? parseCondition(constraint.findingId) : null;
  return parsed ? `Gözlem: ${conditionLabel(parsed)}` : null;
}

function ConstraintCard({
  client,
  constraint,
  counts,
  today,
}: {
  client: Client;
  constraint: Constraint;
  counts: { blocked: number; warned: number } | null;
  today: string;
}) {
  const base = `/dashboard/clients/${client.id}`;
  const step = redFlagStep(constraint);
  const change = constraint.clientChange;
  const severe = severeUnreviewed(constraint);
  const diagnosis = diagnosisLine(constraint);
  const finding = findingLine(constraint);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{regionText(constraint)}</CardTitle>
        <CardDescription className="flex flex-col gap-0.5">
          {diagnosis ? <span className="text-foreground">{diagnosis}</span> : null}
          <span>{constraintMeta(constraint)}</span>
          {finding ? <span>{finding}</span> : null}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`${base}/constraints/${constraint.id}/edit`} />}>
            <PencilSimple data-icon="inline-start" />
            Düzenle
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {change ? (
          <div className={cn('flex flex-col gap-2 rounded-lg border p-3', severe ? 'border-destructive/40' : 'border-primary/40 bg-primary/5')}>
            <p className={cn(severe && 'flex items-start gap-2')}>
              {severe ? (
                <>
                  <WarningCircle weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span className="sr-only">Acil: </span>
                </>
              ) : null}
              <span>
                {change.resolved
                  ? `Danışan düzeldi dedi${change.severity === 'severe' ? ' (önce şiddetli demişti)' : ''}.`
                  : `Danışan güncelledi · ${change.previousSeverity ? `${SEVERITY_LABELS[change.previousSeverity].toLocaleLowerCase('tr')} → ` : ''}${change.severity ? SEVERITY_LABELS[change.severity].toLocaleLowerCase('tr') : 'kötüleşti'} dedi`}
                {' · '}
                {formatDay(change.at.slice(0, 10))}
              </span>
            </p>
            {severe ? (
              <p className="text-muted-foreground">
                Sen karar verene kadar bu bölgeyi çalıştıran hareketler dikkat alır, danışan kartta not görür.
              </p>
            ) : null}
            <ChangeActions clientId={client.id} id={constraint.id} baseUpdatedAt={constraint.updatedAt} kind={change.resolved ? 'better' : 'worse'} />
          </div>
        ) : null}
        {step && step !== 'cleared' ? (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3">
            <p className="flex items-start gap-2 font-medium">
              <FirstAidKit weight="fill" className="mt-0.5 size-4 shrink-0 text-destructive-text" />
              {isEmergency(constraint)
                ? EMERGENCY_TEXT
                : step === 'refer'
                  ? 'Kırmızı bayrak: sağlık profesyoneline yönlendir.'
                  : `Yönlendirildi · ${formatDay(constraint.referredAt as string)} · görüş bekleniyor`}
            </p>
            <p className="text-muted-foreground">
              Görüş alınana kadar bu bölgeyi çalıştıran hareketler dikkat alır, bu kısıtın yasaklarına izin verilemez; danışan kartta not görür.
            </p>
            <RedFlagActions clientId={client.id} id={constraint.id} baseUpdatedAt={constraint.updatedAt} step={step} today={today} />
          </div>
        ) : null}
        {step === 'cleared' && constraint.clearance ? (
          <p className="text-muted-foreground">
            Görüş alındı · {formatDay(constraint.clearance.at)} · {CLEARANCE_BASIS_LABELS[constraint.clearance.basis].toLocaleLowerCase('tr')}
            {constraint.clearance.scope ? ` · “${constraint.clearance.scope}”` : ''}
          </p>
        ) : null}
        <p>{constraint.avoid.length > 0 ? `Kaçın: ${avoidText(constraint.avoid)}` : 'Kaçınılacak hareket seçilmedi.'}</p>
        {counts ? (
          <Link href={`${base}/program`} className="flex w-fit items-center gap-1 text-muted-foreground underline-offset-4 hover:underline">
            Programda:{' '}
            {counts.blocked + counts.warned === 0
              ? 'sorun yok'
              : [counts.blocked ? `${counts.blocked} yaptırma` : null, counts.warned ? `${counts.warned} dikkat` : null].filter(Boolean).join(' · ')}
            <CaretRight className="size-3.5" />
          </Link>
        ) : null}
        {constraint.clientNote ? <p className="text-muted-foreground">Danışana: “{constraint.clientNote}”</p> : null}
        {constraint.note ? <p className="text-muted-foreground">Notun: {constraint.note}</p> : null}
      </CardContent>
    </Card>
  );
}

function Overview({
  client,
  record,
  program,
  exercises,
  timeZone,
}: {
  client: Client;
  record: HealthRecord;
  program: Program | null;
  exercises: readonly ExerciseWithSource[];
  timeZone: string;
}) {
  const today = todayIn(timeZone);
  const list = constraintsOf(record);
  const pending = list.filter(isPendingReport);
  const active = list.filter(isActive);
  const closed = list.filter((item) => !isActive(item) && !isPendingReport(item));
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const input = careInputOf(record, { today, painConsent: canRecordHealth(client, 'check_in') });
  const overrides = overridesOf(record);
  const log = constraintLogOf(record);

  if (list.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FirstAidKit weight="fill" />
          </EmptyMedia>
          <EmptyTitle>Kayıtlı kısıt yok</EmptyTitle>
          <EmptyDescription>Sakatlık, rahatsızlık ya da hekimin kaçınmasını söylediği bir hareket varsa ekle; danışan da kendi ekranından bildirebilir.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pending.map((report) => {
        const suggested = avoidFromTriggers(report.triggers);
        return (
          <Card key={report.id} className="border-primary/40">
            <CardHeader>
              <CardTitle>Karar bekliyor</CardTitle>
              <CardDescription>Danışan bildirdi · {formatDateTime(report.createdAt, timeZone)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="font-medium">
                {regionText(report)} · {constraintMeta(report)}
              </p>
              {report.triggers?.length ? <p>Zorlayanlar: {triggersText(report.triggers)} (şimdiden dikkat olarak işliyor)</p> : null}
              {severeUnreviewed(report) ? (
                <p className="flex items-start gap-2">
                  <WarningCircle weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    <span className="sr-only">Acil: </span>
                    Şiddetli: karar verene kadar bu bölgeyi çalıştıran hareketler de dikkat alır.
                  </span>
                </p>
              ) : null}
              {report.reportNote ? <p className="text-muted-foreground">“{report.reportNote}”</p> : null}
              <p className="text-muted-foreground">
                {suggested.length > 0 ? `Olduğu gibi onaylarsan kaçınılır: ${avoidText(suggested)}.` : 'Zorlayan seçilmedi: olduğu gibi kaydedersen hiçbir hareket değişmez.'}
              </p>
            </CardContent>
            <CardFooter>
              <ReportActions clientId={client.id} id={report.id} baseUpdatedAt={report.updatedAt} avoidPreview={suggested.length > 0 ? avoidText(suggested) : null} />
            </CardFooter>
          </Card>
        );
      })}

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h3 id="active-heading" className="font-heading text-base font-medium">
          Etkin ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Etkin kısıt yok.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {active.map((constraint) => (
              <ConstraintCard key={constraint.id} client={client} constraint={constraint} counts={programCounts(constraint, program, byId, input)} today={today} />
            ))}
          </div>
        )}
      </section>

      {overrides.length > 0 ? (
        <section aria-labelledby="overrides-heading" className="flex flex-col gap-3">
          <h3 id="overrides-heading" className="font-heading text-base font-medium">
            İzin verilen hareketler ({overrides.length})
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {overrides.map((item) => {
              const source = list.find((constraint) => constraint.id === item.source);
              const title = byId.get(item.exerciseId)?.title ?? 'Silinmiş egzersiz';
              return (
                <li key={`${item.exerciseId}:${item.source}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="font-medium">{title}</span>
                  <span className="text-muted-foreground">
                    {source ? regionText(source) : 'Kısıt'} · {formatDay(item.at.slice(0, 10))}
                    {item.note ? ` · “${item.note}”` : ''}
                    {source && !isActive(source) ? ' · kısıt kapalı, etkisiz' : ''}
                  </span>
                  <span className="ml-auto">
                    <OverrideRemove clientId={client.id} exerciseId={item.exerciseId} source={item.source} title={title} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {closed.length > 0 ? (
        <details className="group rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium touch:py-2">Kapananlar ({closed.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {closed.map((constraint) => (
              <li key={constraint.id} className="flex flex-wrap items-center gap-2">
                <span>{regionText(constraint)}</span>
                <Badge variant="outline">{constraint.declined ? 'Kısıt olarak alınmadı' : 'Kapandı'}</Badge>
                <Link href={`/dashboard/clients/${client.id}/constraints/${constraint.id}/edit`} className="text-muted-foreground underline-offset-4 hover:underline">
                  Aç
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {log.length > 0 ? (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium touch:py-2">Değişiklik kaydı</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {log.slice(0, 50).map((row) => (
              <li key={`${row.at}:${row.id}:${row.kind}`} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground tabular-nums">{formatDateTime(row.at, timeZone)}</span>
                <span>{row.text}</span>
                {row.by === 'client' ? <Badge variant="secondary">danışan</Badge> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Danışanın kısıtları (tasarım `kisit-tarama.md` §2.3): karar bekleyen bildirimler, etkin kısıtlar (kırmızı bayrakta
 * yönlendirme ve görüş, danışanın güncellemesi, programdaki etkisi), izinler, kapananlar, değişiklik kaydı. Onay
 * yoksa dosya okunmaz; kilit uyarısı nedenini söyler.
 */
export default async function ConstraintsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const loaded = await measurementClient(id);
  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Kısıtlar" />
        <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} />
      </div>
    );
  }
  const { client } = loaded;
  const [view, config] = await Promise.all([loadHealthPart(client, 'conditions'), readAppConfig()]);
  const [programFile, exercises] =
    view.state === 'ok' ? await Promise.all([readProgramFile(id).catch(() => undefined), listExercises()]) : [undefined, [] as ExerciseWithSource[]];

  return (
    <div className="flex flex-col gap-6">
      <HealthStrip client={client} record={view.state === 'ok' ? view.record : null} />
      <SectionHeader
        title="Kısıtlar"
        description="Sakatlık, rahatsızlık ve kaçınılacak hareketler. Program düzenleyicisi ve antrenmandaki “Değiştir” bunlara göre süzer."
        actions={
          view.state === 'ok' ? (
            <Button nativeButton={false} render={<Link href={`/dashboard/clients/${id}/constraints/new`} />}>
              <Plus data-icon="inline-start" weight="fill" />
              Kısıt ekle
            </Button>
          ) : null
        }
      />
      {view.state === 'locked' ? <HealthLockAlert field="conditions" lock={view.lock} clientId={id} /> : null}
      {view.state === 'broken' ? (
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>Sağlık kaydı okunamadı</AlertTitle>
          <AlertDescription>{view.problem} Kayıt uygulama dışında değiştirilmiş olabilir; düzeltilene kadar kısıt yazılmaz.</AlertDescription>
        </Alert>
      ) : null}
      {view.state === 'ok' ? (
        <Overview client={client} record={view.record} program={programFile?.program ?? null} exercises={exercises} timeZone={config.timeZone} />
      ) : null}
    </div>
  );
}
