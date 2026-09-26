'use client';

import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumber } from '@/lib/format';
import type { LoadRow } from '@/lib/program-insights';
import { MUSCLE_LABELS, type Muscle } from '@/lib/schemas/exercise';

/**
 * Kas adları açıklama listesinde kırpılmaz, satıra kayar ("Ön kol bükücü…" değil): harita bileşeni
 * adı tek satıra sığdırır, dar sütunda (masaüstünde yarım kart) uzun ad kesilirdi.
 */
const WRAP_NAMES = '[&_dt]:whitespace-normal [&_dt]:[overflow-wrap:anywhere]';

/** Plan ve yapılan listesinde en çok bu kadar kas; gerisi "+n kas daha". */
const VERSUS_LIMIT = 12;

/**
 * Bu haftanın gerçekleşen yükü (`thisWeekLoad`): kas başına set, antrenman ve set sayısı, haftanın aralığı ve
 * planlanan haftalıkla karşılaştırma (`loadComparison`; sunucuda hesaplanır, sıklık yoksa null).
 */
export type DoneLoad = { load: Record<string, number>; sessions: number; sets: number; range: string; versus: LoadRow[] | null };

/**
 * Kas başına bu hafta yapılan set, planlanan haftalığın yanında: çubuk plana göre dolar, planı aşan kas dolu
 * kalır ve sayı yazar; planda olmayıp yapılan kas "planda yok".
 */
function LoadVersus({ rows }: { rows: readonly LoadRow[] }) {
  const shown = rows.slice(0, VERSUS_LIMIT);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2" aria-label="Kas başına yapılan ve planlanan set">
        {shown.map((row) => {
          const label = MUSCLE_LABELS[row.muscle as Muscle] ?? row.muscle;
          const text = row.planned > 0 ? `${formatNumber(row.done)} / ${formatNumber(row.planned)} set` : `${formatNumber(row.done)} set · planda yok`;
          return (
            <li key={row.muscle}>
              <Progress value={row.planned > 0 ? Math.min(100, (row.done / row.planned) * 100) : 100} getAriaValueText={() => text} className="gap-1.5">
                <ProgressLabel className="min-w-0 font-normal text-muted-foreground [overflow-wrap:anywhere]">{label}</ProgressLabel>
                <span className="ml-auto text-sm tabular-nums">{text}</span>
              </Progress>
            </li>
          );
        })}
      </ul>
      {rows.length > shown.length ? <p className="text-sm text-muted-foreground">+{rows.length - shown.length} kas daha</p> : null}
    </div>
  );
}

/**
 * Evrenin (evresizde programın) kas yükü. Sıklık varsa haftalık plan (bir tur × sıklık ÷ gün sayısı;
 * varsayılan) ve bir tur (bütün günler birer kez). `done` verilirse "Bu hafta" sekmesi: bu hafta yapılan
 * setlerin kas yükü (İlerleme sekmesiyle aynı hesap) ve haftalık planla yan yana, kas başına "yapılan / plan".
 */
export function PhaseLoad({
  cycle,
  weekly,
  factor,
  daysPerWeek,
  dayCount,
  label,
  done,
}: {
  cycle: Record<string, number>;
  weekly: Record<string, number> | null;
  factor: number | null;
  daysPerWeek?: number;
  dayCount: number;
  label: string;
  done?: DoneLoad | null;
}) {
  const cycleCaption = `Bir tur: ${formatNumber(dayCount)} gün birer kez; kas başına çalışma seti.`;
  const hasWeekly = Boolean(weekly && factor !== null && daysPerWeek !== undefined);
  const doneTab = done ? (
    <TabsContent value="done" className="flex flex-col gap-4 pt-3">
      {done.sessions > 0 ? (
        <TemplateMuscleMap variant="full" bodyClassName="h-56" load={done.load} label={`${label}: bu hafta yapılan`} />
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">Bu hafta henüz bitmiş antrenman yok.</p>
      )}
      {hasWeekly && done.versus ? <LoadVersus rows={done.versus} /> : null}
      <p className="text-center text-xs text-muted-foreground">
        Bu hafta ({done.range}): {formatNumber(done.sessions)} antrenman · {formatNumber(done.sets)} set. Bitmiş antrenmanların çalışma setleri;
        {hasWeekly ? ' çubuk planlanan haftalık yüke göre dolar.' : " planla karşılaştırmak için 'haftada kaç gün' ekle."}
      </p>
    </TabsContent>
  ) : null;

  if (!hasWeekly || !weekly || factor === null || daysPerWeek === undefined) {
    const cycleView = (
      <div className="flex flex-col gap-2">
        <TemplateMuscleMap variant="full" bodyClassName="h-56" load={cycle} label={`${label}: bir tur`} />
        <p className="text-center text-xs text-muted-foreground">
          {cycleCaption} Haftalık görünüm için &apos;haftada kaç gün&apos; ekle.
        </p>
      </div>
    );
    if (!doneTab) return <div className={WRAP_NAMES}>{cycleView}</div>;
    return (
      <Tabs defaultValue="cycle" className={WRAP_NAMES}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="cycle" className="flex-none">
            Bir tur
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-none">
            Bu hafta (yapılan)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cycle" className="pt-3">
          {cycleView}
        </TabsContent>
        {doneTab}
      </Tabs>
    );
  }
  return (
    <Tabs defaultValue="weekly" className={WRAP_NAMES}>
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="weekly" className="flex-none">
          Haftalık (plan)
        </TabsTrigger>
        {doneTab ? (
          <TabsTrigger value="done" className="flex-none">
            Bu hafta (yapılan)
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="cycle" className="flex-none">
          Bir tur
        </TabsTrigger>
      </TabsList>
      <TabsContent value="weekly" className="flex flex-col gap-2 pt-3">
        <TemplateMuscleMap variant="full" bodyClassName="h-56" load={weekly} label={`${label}: planlanan haftalık`} />
        <p className="text-center text-xs text-muted-foreground">
          Planlanan haftalık yük: haftada {formatNumber(daysPerWeek)} gün, {formatNumber(dayCount)} günlük döngü → her gün haftada{' '}
          {formatNumber(factor)} kez. Kas başına set; programdan hesaplanır, antrenman kayıtlarından değil.
        </p>
      </TabsContent>
      {doneTab}
      <TabsContent value="cycle" className="flex flex-col gap-2 pt-3">
        <TemplateMuscleMap variant="full" bodyClassName="h-56" load={cycle} label={`${label}: bir tur`} />
        <p className="text-center text-xs text-muted-foreground">{cycleCaption}</p>
      </TabsContent>
    </Tabs>
  );
}
