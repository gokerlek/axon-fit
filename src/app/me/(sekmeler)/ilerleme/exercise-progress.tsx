'use client';

import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react';
import { ProgressChart } from '@/components/progress-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fold } from '@/lib/exercise-search';
import { formatDay, formatDayShort, formatWithUnit } from '@/lib/format';
import type { RecordMark } from '@/lib/personal-records';
import type { ExerciseView } from '@/lib/progress';
import {
  describeTrend,
  E1RM_NOTE,
  highRepDaysSince,
  highRepDaysText,
  METRICS,
  METRICS_OF,
  metricForecast,
  metricMinSpan,
  metricPoints,
  recordLabel,
  recordValue,
  type Metric,
} from '@/lib/progress-text';
import { forecastAsOf, rangeStart, type RangePreset } from '@/lib/trend';
import { cn } from '@/lib/utils';

/** Telefonda alttan açılan, ekran boyu sheet (antrenman ekranının kütüphanesiyle aynı; Gelişim'in kas sheet'i de). */
export const TALL_SHEET =
  'h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]';

/** Grafiğin tarih aralıkları; 375 px'te tek satıra sığan kısa adlar. */
const RANGES = [
  ['3a', '3 ay'],
  ['6a', '6 ay'],
  ['1y', '1 yıl'],
  ['tumu', 'Tümü'],
] as const satisfies readonly (readonly [RangePreset, string])[];
type Range = (typeof RANGES)[number][0];

/** Bir aralıkta en az bu kadar gün yoksa varsayılan "Tümü". */
const MIN_POINTS_IN_RANGE = 2;

/** Ağırlığa göre en çok tekrarın en çok bu kadar satırı (en ağırdan). */
const REPS_AT_WEIGHT_ROWS = 4;

function subtitle(exercise: ExerciseView, today: string): string {
  const parts = [
    exercise.deviceName ?? null,
    `${exercise.sessions} antrenman`,
    `son ${formatDayShort(exercise.lastDate, exercise.lastDate.slice(0, 4) !== today.slice(0, 4))}`,
    exercise.inLibrary ? null : 'kütüphanede yok',
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Aralıklar yalnız seri 3 aydan eskiye uzanıyorsa; bir aralık ancak öncekinden fazlasını gösteriyorsa. */
function rangesFor(exercise: ExerciseView, today: string): Range[] {
  const useful = RANGES.map(([range]) => range).filter((range) => {
    const from = rangeStart(range, today);
    return from === undefined || exercise.firstDate < from;
  });
  return useful.length > 1 ? useful : [];
}

function defaultRange(exercise: ExerciseView, today: string): Range {
  const from = rangeStart('3a', today);
  const inRange = exercise.points.filter((point) => !from || point.date >= from).length;
  return rangesFor(exercise, today).includes('3a') && inRange >= MIN_POINTS_IN_RANGE ? '3a' : 'tumu';
}

/**
 * Hareket başına ilerleme (tasarım §0, §8 satır 10): yapılan hareketlerden biri seçilir (aranabilir
 * liste, en son yapılan önce), altında kayıt türüne göre grafik — ağırlıklıda en ağır set, tahmini
 * maksimum ve toplam ağırlık; vücut ağırlığında tekrar; sürelide süre. Grafik ölçümlerinkiyle aynı
 * bileşen (dokununca değer, "tablo olarak göster"); ilerleme değerlerinde eğilim ve tahmin (Theil–Sen).
 * Altında o hareketin rekorları. Seçim adreste (`?hareket=`): sayfa yenilenince aynı hareket açılır.
 */
export function ExerciseProgress({ exercises, initialKey, today }: { exercises: ExerciseView[]; initialKey: string | null; today: string }) {
  const [key, setKey] = useState(() => (exercises.some((item) => item.key === initialKey) ? initialKey! : (exercises[0]?.key ?? '')));
  const exercise = exercises.find((item) => item.key === key) ?? exercises[0];
  const [metric, setMetric] = useState<Metric>(() => METRICS_OF[exercise?.trackingType ?? 'weight_reps'][0]!);
  const [range, setRange] = useState<Range>(() => (exercise ? defaultRange(exercise, today) : 'tumu'));
  const [open, setOpen] = useState(false);

  if (!exercise) return null;
  const metrics = METRICS_OF[exercise.trackingType];
  const shown: Metric = metrics.includes(metric) ? metric : metrics[0]!;
  const ranges = rangesFor(exercise, today);
  const activeRange: Range = ranges.includes(range) ? range : 'tumu';

  function pick(next: ExerciseView) {
    setKey(next.key);
    setRange(defaultRange(next, today));
    if (!METRICS_OF[next.trackingType].includes(metric)) setMetric(METRICS_OF[next.trackingType][0]!);
    setOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('hareket', next.key);
      window.history.replaceState(null, '', url);
    } catch {
      // Adres güncellenemezse seçim yine ekranda.
    }
  }

  const from = rangeStart(activeRange, today);
  const points = metricPoints(exercise.points, shown).filter((point) => !from || point.date >= from);
  const info = METRICS[shown];
  const outlook = points.length > 1 ? metricForecast(shown, points) : null;
  const drawn = outlook ? forecastAsOf(outlook, today) : null;
  // Son günlerin bütün setleri 12'den çok tekrarlıysa grafik orada biter: "son kayıt … gün önce" yanıltır.
  const highRep = shown === 'e1rm' && points.length > 0 ? highRepDaysSince(exercise.points, from) : 0;
  const title = `${exercise.title} · ${info.label}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="hareketler" className="font-heading text-lg font-semibold">
            Hareketler
          </h2>
        </CardTitle>
        <CardDescription>Bir hareket seç: ağırlığının, tekrarlarının ve rekorlarının gidişatı.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-medium">{exercise.title}</span>
            <span className="truncate text-xs text-muted-foreground">{subtitle(exercise, today)}</span>
          </span>
          <CaretDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">, hareketi değiştir</span>
        </button>

        {exercise.stage ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{exercise.stage}</Badge>
            <span>bu hareketteki deneyimin</span>
          </p>
        ) : null}

        {metrics.length > 1 ? (
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[shown]}
            onValueChange={(value) => {
              const next = value[0] as Metric | undefined;
              if (next) setMetric(next);
            }}
            aria-label="Grafikte ne gösterilsin"
            className="w-full">
            {metrics.map((item) => (
              <ToggleGroupItem key={item} value={item} className="h-10 flex-1" aria-label={METRICS[item].label}>
                {METRICS[item].short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}

        <section aria-label={title} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-medium">{info.label}</h3>
            {ranges.length > 0 ? (
              <ToggleGroup
                size="sm"
                spacing={2}
                value={[activeRange]}
                onValueChange={(value) => {
                  const next = value[0] as Range | undefined;
                  if (next) setRange(next);
                }}
                aria-label="Tarih aralığı">
                {RANGES.filter(([item]) => ranges.includes(item)).map(([item, label]) => (
                  <ToggleGroupItem key={item} value={item} className="px-2">
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : null}
          </div>

          {points.length > 1 ? (
            <ProgressChart
              title={title}
              unit={info.unit}
              series={[{ key: 'value', label: info.label, points }]}
              minSpan={metricMinSpan(shown, points.map((point) => point.value))}
              forecast={drawn?.kind === 'current' ? drawn.forecast.points : undefined}
              pointNoun="antrenman günü"
              yAxisWidth={shown === 'volume' ? 48 : 40}
            />
          ) : points.length === 1 ? (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm">
              İlk kayıt: <span className="font-medium tabular-nums">{formatWithUnit(points[0]!.value, info.unit)}</span> ·{' '}
              {formatDay(points[0]!.date)}. Grafik ikinci antrenman gününden sonra çizilir.
            </p>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              {shown === 'e1rm'
                ? 'Bu dönemde 1–12 tekrarlı set yok; tahmini maksimum hesaplanamıyor.'
                : 'Bu dönemde bu değer için kayıt yok.'}
            </p>
          )}
          {highRep > 0 ? <p className="text-sm text-muted-foreground">{highRepDaysText(highRep)}</p> : null}
          {outlook && !(highRep > 0 && drawn?.kind === 'stale') ? (
            <p className="text-sm text-muted-foreground">{describeTrend(outlook, info.unit, today)}</p>
          ) : null}
          {shown === 'e1rm' ? <p className="text-xs text-muted-foreground">{E1RM_NOTE}</p> : null}
          {shown === 'volume' ? (
            <p className="text-xs text-muted-foreground">Toplam ağırlık: ısınma hariç her setin ağırlığı × tekrarı, gün başına.</p>
          ) : null}
        </section>

        <ExerciseRecords exercise={exercise} />
      </CardContent>

      <ExercisePicker open={open} onOpenChange={setOpen} exercises={exercises} selected={exercise.key} today={today} onPick={pick} />
    </Card>
  );
}

/** Seçili hareketin en iyileri: tür başına bir satır; ağırlıkta tekrarda en ağır birkaç ağırlık. */
function ExerciseRecords({ exercise }: { exercise: ExerciseView }) {
  const singles = exercise.best.filter((mark) => mark.kind !== 'reps_at_weight');
  const atWeight = exercise.best.filter((mark) => mark.kind === 'reps_at_weight').slice(0, REPS_AT_WEIGHT_ROWS);
  // Hareket başına bir kutlama: aynı antrenmandaki rekorlar bir sayılır.
  const broken = new Set(exercise.events.map((event) => event.sessionId)).size;
  return (
    <section aria-labelledby="hareket-rekorlari" className="flex flex-col gap-2 border-t pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="hareket-rekorlari" className="text-sm font-medium">
          En iyilerin
        </h3>
        <span className="text-xs text-muted-foreground">{broken > 0 ? `${broken} antrenmanda rekor kırdın` : 'İlk kayıt başlangıç noktası'}</span>
      </div>
      <dl className="flex flex-col divide-y">
        {singles.map((mark) => (
          <RecordRow key={mark.kind} label={recordLabel(mark.kind, exercise.trackingType)} mark={mark} />
        ))}
        {atWeight.length > 0 ? (
          <div className="flex flex-col gap-1 py-2">
            <dt className="text-xs text-muted-foreground">{recordLabel('reps_at_weight', exercise.trackingType)}</dt>
            <dd>
              <ul className="flex flex-col gap-1">
                {atWeight.map((mark) => (
                  <li key={mark.kg} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium tabular-nums">{recordValue(mark)}</span>
                    <span className="text-xs text-muted-foreground">{formatDayShort(mark.date)}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function RecordRow({ label, mark }: { label: string; mark: RecordMark }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-col items-end text-right">
        <span className="text-sm font-medium tabular-nums">{recordValue(mark)}</span>
        <span className="text-xs text-muted-foreground">{formatDay(mark.date)}</span>
      </dd>
    </div>
  );
}

/**
 * Hareket seçici: yapılan hareketler, ada (ve cihaza) göre arama; Türkçe harfler katlanır ("gogus" →
 * "Göğüs"). Sıra en son yapılan önce. Seçili satırda ✓.
 */
function ExercisePicker({
  open,
  onOpenChange,
  exercises,
  selected,
  today,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: ExerciseView[];
  selected: string;
  today: string;
  onPick: (exercise: ExerciseView) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const results = useMemo(() => {
    const tokens = fold(deferred).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return exercises;
    return exercises.filter((item) => {
      const text = fold(`${item.title} ${item.deviceName ?? ''}`);
      return tokens.every((token) => text.includes(token));
    });
  }, [exercises, deferred]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(next) => (next ? undefined : setSearch(''))}>
      <SheetContent side="bottom" showCloseButton={false} className={TALL_SHEET} initialFocus={title}>
        <SheetHeader className="gap-1 pt-5 pb-3">
          <SheetTitle ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">
            Hareket seç
          </SheetTitle>
          <SheetDescription>Yaptığın hareketler, en son yaptığın önce.</SheetDescription>
          <InputGroup className="mt-2 h-11">
            <InputGroupAddon>
              <MagnifyingGlass />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              className="h-11 text-base"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
              }}
              placeholder="Hareket ara"
              aria-label="Hareket ara"
              autoComplete="off"
              enterKeyHint="search"
            />
          </InputGroup>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {results.length === 0 ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyTitle>Sonuç yok</EmptyTitle>
                <EmptyDescription>Başka bir ad dene.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div role="list" aria-label="Yaptığın hareketler">
              {results.map((item) => {
                const current = item.key === selected;
                return (
                  <div role="listitem" key={item.key}>
                    <Item
                      size="sm"
                      className="min-h-14 flex-nowrap rounded-none border-0 border-t border-border px-0 text-left hover:bg-muted"
                      render={<button type="button" aria-current={current ? 'true' : undefined} onClick={() => onPick(item)} />}>
                      <ItemContent className="min-w-0">
                        <ItemTitle className={cn('w-full truncate text-[0.9375rem]', current && 'text-primary-text')}>{item.title}</ItemTitle>
                        <ItemDescription className="truncate text-[0.8125rem]">{subtitle(item, today)}</ItemDescription>
                      </ItemContent>
                      <ItemActions className="text-primary-text">
                        {current ? (
                          <>
                            <Check weight="bold" className="size-4" aria-hidden />
                            <span className="sr-only">seçili</span>
                          </>
                        ) : null}
                      </ItemActions>
                    </Item>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
