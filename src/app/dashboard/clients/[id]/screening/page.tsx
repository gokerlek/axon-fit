import type { Metadata } from 'next';
import Link from 'next/link';
import { CaretRight, PersonSimpleTaiChi, Plus, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { SectionHeader } from '@/components/section-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canRecordHealth } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { careInputOf, evaluateCare, hasCare } from '@/lib/constraint-filter';
import { AVOID_TAGS, constraintsOf, isPaired, regionText } from '@/lib/constraints';
import { listExercises } from '@/lib/exercises';
import { formatDay, formatNumber, formatWithUnit, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import type { Client } from '@/lib/schemas/client';
import type { ConstraintForm } from '@/lib/schemas/constraint';
import type { HealthRecord, Screening } from '@/lib/schemas/health';
import {
  cellTitle,
  compareCell,
  constraintSuppress,
  effectiveMissed,
  majorAsymmetry,
  newestFirst,
  OUTCOME_LABELS,
  outcomeOf,
  painHistory,
  previousOutcome,
  reachOf,
  SCREENING_PROTOCOL,
  SCREENING_TEST_IDS,
  SCREENING_TESTS,
  screeningHints,
  screeningSummary,
  sideEntry,
  sidesOf,
  testName,
  type Change,
  type ScreeningTestId,
  type SideKey,
} from '@/lib/screening';
import { HealthLockAlert, HealthStrip } from '../health-page';
import { MeasurementProblemAlert, measurementClient } from '../measurements/measurement-page';
import { CompareSelect } from './compare-select';
import { PainActions } from './screening-actions';

export const metadata: Metadata = { title: 'Tarama' };

const CHANGE_TEXT: Record<Change, string> = { up: '↑', down: '↓', same: '=', new: 'yeni', pain_new: 'yeni ağrı', pain_gone: 'ağrı geçti' };

/** Ön uzanma: ham cm ve bacak boyu girildiyse yüzdesi ("64 cm (%71,1)"; Plisky 2006). */
function reachText(reach: { cm: number; percent?: number }): string {
  return `${formatNumber(reach.cm)} cm${reach.percent !== undefined ? ` (${formatWithUnit(reach.percent, '%')})` : ''}`;
}

/** Hücrenin metni: sözcük; telafide kaçan noktalar; dengede süre ve uzanma (bacak boyuna göre yüzdesiyle). */
function cellText(testId: ScreeningTestId, screening: Screening, side: SideKey): string {
  const entry = sideEntry(screening.tests, testId, side);
  const outcome = outcomeOf(testId, entry);
  if (!entry || !outcome) return '—';
  const parts: string[] = [outcome === 'pain' ? `⚑ ${OUTCOME_LABELS.pain}` : OUTCOME_LABELS[outcome]];
  if (outcome === 'not_tested' && entry.reason === 'constraint') parts[0] = 'Yapılmadı (kısıt)';
  if (outcome === 'compensated' || outcome === 'easier') {
    const missed = effectiveMissed(testId, entry).map((id) => SCREENING_TESTS[testId].points.find((point) => point.id === id)?.label.toLocaleLowerCase('tr') ?? id);
    if (missed.length > 0) parts.push(missed.join(', '));
  }
  if (entry.seconds !== undefined) parts.push(`${formatNumber(entry.seconds)} sn`);
  const reach = side !== 'center' && testId === 'single_leg_balance' ? reachOf(screening.tests, side) : null;
  if (reach) parts.push(reachText(reach));
  const leg = side !== 'center' && testId === 'single_leg_balance' && entry.legCm !== undefined ? entry.legCm : undefined;
  if (leg !== undefined) parts.push(`bacak ${formatNumber(leg)} cm`);
  return parts.join(' · ');
}

/** Ön uzanmanın önceki taramaya göre değişimi ("uzanma 61 → 64 cm (%68,5 → %71,9)"); ikisinde de yoksa boş. */
function reachChange(current: Screening, previous: Screening, side: 'left' | 'right'): string {
  const now = reachOf(current.tests, side);
  const before = previous.protocol === SCREENING_PROTOCOL ? reachOf(previous.tests, side) : null;
  if (!now || !before) return '';
  const percent = now.percent !== undefined && before.percent !== undefined ? ` (${formatWithUnit(before.percent, '%')} → ${formatWithUnit(now.percent, '%')})` : '';
  return `uzanma ${formatNumber(before.cm)} → ${formatNumber(now.cm)} cm${percent}`;
}

function changeText(testId: ScreeningTestId, current: Screening, previous: Screening | null): string {
  if (!previous) return '';
  const parts = sidesOf(testId).flatMap((side) => {
    const compared = compareCell(outcomeOf(testId, sideEntry(current.tests, testId, side)), previousOutcome(previous, testId, side));
    const reach = testId === 'single_leg_balance' && side !== 'center' ? reachChange(current, previous, side) : '';
    if (!compared && !reach) return [];
    const text = [compared ? `${CHANGE_TEXT[compared.change]}${compared.significant ? ' (belirgin)' : ''}` : '', reach].filter(Boolean).join(', ');
    return [side === 'center' ? text : `${side === 'left' ? 'sol' : 'sağ'} ${text}`];
  });
  return parts.join(' · ');
}

/** "Kısıt olarak ekle"nin kısıtı: testin bölgesi ve tarafı, hareket kısıtı, testin kaçınma önerisi; tanı yok. */
function constraintFromCell(testId: ScreeningTestId, side: SideKey): ConstraintForm {
  const test = SCREENING_TESTS[testId];
  const paired = isPaired(test.constraintRegion);
  return {
    region: test.constraintRegion,
    ...(paired ? { side: side === 'center' ? ('both' as const) : side } : {}),
    type: 'limitation',
    avoid: test.avoid ? [test.avoid] : [],
    note: undefined,
    clientNote: undefined,
  };
}

function weeksAgo(date: string, today: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / (7 * 86_400_000));
}

async function Overview({ client, record, today, query }: { client: Client; record: HealthRecord; today: string; query: { gun?: string; onceki?: string } }) {
  const base = `/dashboard/clients/${client.id}/screening`;
  const list = newestFirst(record.screenings ?? []);
  const legacy = record.movementScreens?.length ?? 0;
  const legacyNote =
    legacy > 0 ? (
      <p className="text-sm text-muted-foreground">
        Eski biçimde tarama kaydı ({formatNumber(legacy)} gün); yeni protokolle karşılaştırılmaz.
      </p>
    ) : null;

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PersonSimpleTaiChi weight="fill" />
            </EmptyMedia>
            <EmptyTitle>Henüz tarama yok</EmptyTitle>
            <EmptyDescription>Başlangıçta ve 6–8 haftada bir önerilir. Sekiz test yaklaşık 15 dakika; yalnız doldurduğun testler kaydedilir.</EmptyDescription>
          </EmptyHeader>
        </Empty>
        {legacyNote}
      </div>
    );
  }

  const current = list.find((item) => item.date === query.gun) ?? list[0]!;
  const older = list.filter((item) => item.date < current.date && item.protocol === current.protocol);
  const previous = query.onceki === 'yok' ? null : (older.find((item) => item.date === query.onceki) ?? older[0] ?? null);
  const conditionsConsent = canRecordHealth(client, 'conditions');
  // Kısıtlar yalnız onaylıysa asimetriyi bastırır ve "Kısıt olarak ekle" çıkar.
  const constraints = conditionsConsent ? constraintsOf(record) : [];
  const suppress = constraintSuppress(constraints);
  // Ağrı taramalar boyunca (`painHistory`, §4.4): bu günün ağrıları durumlarıyla; en yeni taramada, sonra test
  // edilmediği için açık kalan eski ağrılar da; bu taramada ağrısız test edilip kapanan eski ağrılar "ağrı geçti".
  const history = painHistory(record.screenings ?? []);
  const newest = current.date === list[0]!.date;
  const pains = [...history.rows.filter((row) => row.date === current.date), ...(newest ? history.open.filter((row) => row.date !== current.date) : [])];
  const gone = history.rows.filter((row) => row.state === 'resolved' && row.laterDate === current.date);
  const asymmetry = majorAsymmetry(current, suppress);
  const exercises = await listExercises();
  const titles = new Map(exercises.map((exercise) => [exercise.id, exercise.title]));
  // Kısıtın izinsiz yasakladığı hareket ipucunda önerilmez (düzenleyici de yaptırmaz; tek bacak hareketinde iki taraf).
  const care = conditionsConsent ? careInputOf(record, { today, painConsent: canRecordHealth(client, 'check_in') }) : null;
  const blocked = new Set(care && hasCare(care) ? exercises.filter((exercise) => evaluateCare(exercise, care).blockedBy.length > 0).map((exercise) => exercise.id) : []);
  const hints = screeningHints(current, (id) => (blocked.has(id) ? undefined : titles.get(id)), suppress);
  const own = exercises.filter((exercise) => exercise.source === 'custom');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Son tarama {formatDay(list[0]!.date)}
          {weeksAgo(list[0]!.date, today) >= 1 ? ` · ${formatNumber(weeksAgo(list[0]!.date, today))} hafta önce` : ''}. Başlangıçta ve 6–8 haftada bir önerilir.
        </p>
        <CompareSelect dates={list.map((item) => item.date)} current={current.date} previous={previous?.date ?? null} />
      </div>

      {pains.length > 0 || gone.length > 0 || asymmetry ? (
        <Card>
          <CardHeader>
            <CardTitle>Uyarılar</CardTitle>
            <CardDescription>
              Ağrılı test öneri üretmez: önce değerlendirme. Ağrı, o test sonra ağrısız yapılana ya da &quot;Gördüm&quot; diyene kadar açık kalır. Asimetri
              risk değil, öncelik içindir.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {pains.map((cell) => {
              const test = SCREENING_TESTS[cell.testId];
              const draft = constraintFromCell(cell.testId, cell.side);
              const suggestion = `${regionText(draft)}${draft.avoid[0] ? ` · kaçın: ${AVOID_TAGS[draft.avoid[0]].label.toLocaleLowerCase('tr')}` : ''}`;
              const carried = cell.date !== current.date;
              return (
                <div key={`${cell.date}:${cell.key}`} className="flex flex-col gap-2 rounded-lg border p-3">
                  <p>
                    <span className="font-medium">⚑ Ağrı · {cellTitle(cell.testId, cell.side)}</span>
                    {carried ? ` · ${formatDay(cell.date)} taramasından; sonra test edilmedi` : ''}
                    {cell.note ? ` · “${cell.note}”` : ''}
                    {cell.state === 'open' || cell.state === 'reviewed' ? ': önce değerlendirme.' : '.'}
                    {cell.state === 'reviewed' ? <span className="text-muted-foreground"> Gözden geçirildi.</span> : null}
                    {cell.state === 'resolved' && cell.laterDate ? (
                      <span className="text-muted-foreground"> {formatDay(cell.laterDate)} taramasında ağrı geçti.</span>
                    ) : null}
                    {cell.state === 'superseded' && cell.laterDate ? (
                      <span className="text-muted-foreground"> {formatDay(cell.laterDate)} taramasında da ağrılı; o günün uyarısına bak.</span>
                    ) : null}
                  </p>
                  {cell.state === 'open' ? (
                    <PainActions
                      clientId={client.id}
                      date={cell.date}
                      cellKey={cell.key}
                      title={cellTitle(cell.testId, cell.side)}
                      constraint={conditionsConsent ? draft : null}
                      suggestion={test ? suggestion : null}
                    />
                  ) : null}
                </div>
              );
            })}
            {gone.map((cell) => (
              <p key={`gone:${cell.date}:${cell.key}`}>
                <span className="font-medium">✓ Ağrı geçti · {cellTitle(cell.testId, cell.side)}</span>: {formatDay(cell.date)} taramasında ağrılıydı, bu taramada
                ağrısız.
              </p>
            ))}
            {asymmetry ? (
              <p>
                <span className="font-medium">◐ Büyük asimetri · {testName(asymmetry.testId)}</span>: sol {OUTCOME_LABELS[asymmetry.left].toLocaleLowerCase('tr')} · sağ{' '}
                {OUTCOME_LABELS[asymmetry.right].toLocaleLowerCase('tr')}
                {asymmetry.reachDiff !== undefined ? ` · ön uzanma farkı ${formatNumber(asymmetry.reachDiff)} cm` : ''}
                {asymmetry.reachPercentDiff !== undefined ? ` (bacak boyuna göre ${formatWithUnit(asymmetry.reachPercentDiff, '%')})` : ''}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{formatDay(current.date)}</CardTitle>
          <CardDescription>
            {current.protocol === SCREENING_PROTOCOL ? 'Protokol 1' : `Protokol ${current.protocol}`}
            {current.note ? ` · ${current.note}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {/* Masaüstünde tablo, telefonda test başına kart. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Sol</TableHead>
                  <TableHead>Sağ</TableHead>
                  <TableHead>{previous ? `${formatDay(previous.date)} tarihine göre` : 'Değişim'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SCREENING_TEST_IDS.map((testId) => (
                  <TableRow key={testId}>
                    <TableCell className="font-medium">{testName(testId)}</TableCell>
                    {SCREENING_TESTS[testId].sided ? (
                      <>
                        <TableCell className="whitespace-normal">{cellText(testId, current, 'left')}</TableCell>
                        <TableCell className="whitespace-normal">{cellText(testId, current, 'right')}</TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={2} className="whitespace-normal">
                        {cellText(testId, current, 'center')}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{changeText(testId, current, previous)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {SCREENING_TEST_IDS.map((testId) => (
              <li key={testId} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{testName(testId)}</p>
                {sidesOf(testId).map((side) => (
                  <p key={side}>
                    {side === 'center' ? '' : `${side === 'left' ? 'Sol' : 'Sağ'}: `}
                    {cellText(testId, current, side)}
                  </p>
                ))}
                {previous ? <p className="text-muted-foreground">{changeText(testId, current, previous)}</p> : null}
              </li>
            ))}
          </ul>
          {previous ? <p className="text-xs text-muted-foreground">Tek basamaklık değişim gözlem farkı olabilir.</p> : null}
        </CardContent>
      </Card>

      {hints.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Programa ipuçları (yalnız sana)</CardTitle>
            <CardDescription>Sıra: ağrı → en düşük sonuç → asimetri. Sonrası senin hedefine göre.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              {hints.map((hint) => {
                const mine = own.filter((exercise) => exercise.pattern && SCREENING_TESTS[hint.testId].patterns.includes(exercise.pattern));
                return (
                  <li key={hint.key}>
                    {hint.text}
                    {mine.length > 0 && hint.outcome !== 'pain' ? (
                      <span className="text-muted-foreground"> Kütüphanende aynı kalıptan: {mine.map((exercise) => exercise.title).join(', ')}.</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="days-heading" className="flex flex-col gap-3">
        <h3 id="days-heading" className="font-heading text-base font-medium">
          Tarama günleri
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((item) => {
            const summary = screeningSummary(item);
            return (
              <li key={item.date}>
                <Link href={`${base}/${item.date}/edit`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                  <span>
                    <span className="font-medium">{formatDay(item.date)}</span> · {formatNumber(summary.tests)} test
                    {summary.pain > 0 ? ` · ${formatNumber(summary.pain)} ağrı` : ''}
                  </span>
                  <CaretRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
        {legacyNote}
      </section>
    </div>
  );
}

/**
 * Hareket taraması (tasarım `kisit-tarama.md` §4.5): son tarama ve karşılaştırma, uyarılar (ağrı; tek büyük
 * asimetri), test başına sözcükle sonuç, PT'ye ipuçları, tarama günleri. Toplam ve puan yok. Onay yoksa dosya
 * okunmaz.
 */
export default async function ScreeningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gun?: string; onceki?: string }>;
}) {
  await requirePt();
  const { id } = await params;
  const loaded = await measurementClient(id);
  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Hareket taraması" />
        <MeasurementProblemAlert title="Danışan kaydı okunamadı" problem={loaded.problem} />
      </div>
    );
  }
  const { client } = loaded;
  const [view, config] = await Promise.all([loadHealthPart(client, 'screening'), readAppConfig()]);

  return (
    <div className="flex flex-col gap-6">
      <HealthStrip client={client} record={view.state === 'ok' ? view.record : null} />
      <SectionHeader
        title="Hareket taraması"
        description="Sekiz temel hareket; sonuç gözlenen noktalardan. Toplam ve puan yok."
        actions={
          view.state === 'ok' ? (
            <Button nativeButton={false} render={<Link href={`/dashboard/clients/${id}/screening/new`} />}>
              <Plus data-icon="inline-start" weight="fill" />
              Tarama yap
            </Button>
          ) : null
        }
      />
      {view.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view.state === 'broken' ? (
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>Sağlık kaydı okunamadı</AlertTitle>
          <AlertDescription>{view.problem} Kayıt uygulama dışında değiştirilmiş olabilir; düzeltilene kadar tarama yazılmaz.</AlertDescription>
        </Alert>
      ) : null}
      {view.state === 'ok' ? <Overview client={client} record={view.record} today={todayIn(config.timeZone)} query={await searchParams} /> : null}
    </div>
  );
}
