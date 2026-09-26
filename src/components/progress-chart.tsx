'use client';

import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis, type DotItemDotProps } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dateTicks, niceScale } from '@/lib/chart-scale';
import { formatDay, formatDayShort, formatNumber, formatWithUnit } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Zaman içinde ilerleme grafiği — ölçümler, danışanın İlerleme sekmesi (hareket başına en ağır set,
 * tahmini maksimum, toplam; Gelişim'de kasın hareketleri; hazır oluşluk, ağrı, seans zorluğu) bunu kullanır.
 *
 * Bir ya da iki seri (ör. sol/sağ), tek eksen. Tarih ekseni gerçek zamanlıdır: ölçümler
 * düzensiz aralıklarla alındığı için noktalar eşit aralıkla dizilmez. Renkler tema
 * tokenlarından; iki seride kimlik yalnız renge bırakılmaz (işaret şekli + açıklama).
 * Ekran okuyucu için grafik tek cümlelik özettir, değerlerin hepsi altındaki tablodadır.
 */

export type ProgressPoint = { date: string; value: number };
/** Tahmin noktası: çizgi değeri ve ≈%80 bant (`src/lib/trend.ts`). İlk nokta son ölçümdür. */
export type ForecastPoint = ProgressPoint & { low: number; high: number };
export type ProgressSeries = {
  /** CSS değişken adına girer (`--color-<key>`): harf, rakam, tire. */
  key: string;
  label: string;
  points: readonly ProgressPoint[];
};

/**
 * Seri renkleri, açık ve koyu temada ayrı adımlar. Grafik renk adımları tek tonlu bir rampa;
 * iki seri açıklıkla ayrışır (renk körlüğü benzetiminde ΔE ≥ 20) ve ikisi de yüzeyle ≥ 3:1.
 */
const SLOT_COLORS = [
  { light: 'var(--chart-3)', dark: 'var(--chart-2)' },
  { light: 'var(--chart-5)', dark: 'var(--chart-4)' },
] as const;

/** Açıklamadaki işaretler grafiğin dışında durur (seri değişkenleri yok): aynı adımlar sınıf olarak. */
const SLOT_TEXT = ['text-chart-3 dark:text-chart-2', 'text-chart-5 dark:text-chart-4'] as const;

const DAY_MS = 86_400_000;

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDay = (time: number) => new Date(time).toISOString().slice(0, 10);

type Row = { time: number; band?: [number, number] } & Record<string, number | [number, number] | undefined>;

/** Serileri tarihe göre tek tabloya birleştirir; bir seride olmayan gün boş kalır. */
function mergeRows(series: readonly ProgressSeries[], forecast?: readonly ForecastPoint[]): Row[] {
  const rows = new Map<number, Row>();
  for (const { key, points } of series) {
    for (const { date, value } of points) {
      const time = toTime(date);
      const row = rows.get(time) ?? { time };
      row[key] = value;
      rows.set(time, row);
    }
  }
  for (const { date, value, low, high } of forecast ?? []) {
    const time = toTime(date);
    const row = rows.get(time) ?? { time };
    row[FORECAST_KEY] = value;
    row.band = [low, high];
    rows.set(time, row);
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}

const FORECAST_KEY = 'forecast';

/** İkinci serinin işareti kare: renk ayrımı görülmese de seriler ayırt edilir. */
function square(size: number) {
  return function SquareDot({ cx, cy, index, dataKey }: Pick<DotItemDotProps, 'cx' | 'cy' | 'index' | 'dataKey'>) {
    if (cx == null || cy == null) return null;
    return (
      <rect
        key={`${String(dataKey)}-${index}`}
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        rx={1.5}
        fill={`var(--color-${String(dataKey)})`}
        stroke="var(--card)"
        strokeWidth={2}
      />
    );
  };
}
const SquareDot = square(8);
const ActiveSquareDot = square(10);

function SeriesMark({ slot, className }: { slot: number; className?: string }) {
  if (slot < 0) {
    // Tahmin: kesikli çizgi, işaretsiz.
    return (
      <svg viewBox="0 0 20 10" className={cn('h-2.5 w-5 shrink-0', className)} aria-hidden>
        <line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 10" className={cn('h-2.5 w-5 shrink-0', className)} aria-hidden>
      <line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="2" />
      {slot === 0 ? <circle cx="10" cy="5" r="3.5" fill="currentColor" /> : <rect x="6.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />}
    </svg>
  );
}

export function ProgressChart({
  title,
  unit,
  series,
  minSpan,
  forecast,
  dateLabel = formatDay,
  pointNoun = 'ölçüm günü',
  yAxisWidth = 40,
  chartClassName = 'h-52',
  className,
}: {
  /** Neyin çizildiği: ekran okuyucu özetinde ve tablo başlığında. */
  title: string;
  /** Görünen birim ("cm", "sn", "%"). */
  unit: string;
  /** Bir ya da iki seri; daha fazlası bilinçli olarak yok (ayrı grafik kullan). */
  series: readonly [ProgressSeries] | readonly [ProgressSeries, ProgressSeries];
  /**
   * Değer ekseninin en az kapsayacağı aralık (birimde). Ölçüm hatası bilinen ölçümde hata
   * payının iki katı verilir: gürültü içindeki oynama grafikte büyük görünmesin.
   */
  minSpan?: number;
  /**
   * Tek serili grafikte ileriye tahmin: kesikli çizgi ve belirsizlik bandı. Son ölçümden
   * başlar; gerçek değerlerden ayrı çizilir ve tabloda ayrı satırda yazılır.
   */
  forecast?: readonly ForecastPoint[];
  /**
   * Noktanın adı (ipucu, tablo, ekran okuyucu özeti). Varsayılan gün ("22 Eylül 2026"); haftalık
   * toplamda hafta ("21–27 Eyl"). Eksen etiketleri yine gündür.
   */
  dateLabel?: (date: string) => string;
  /** Ekran okuyucu özetinde noktaların adı: "6 ölçüm günü", "6 antrenman günü", "12 hafta". */
  pointNoun?: string;
  /** Değer ekseninin genişliği (px): binlik sayılarda ("12.500") 40 dar kalır. */
  yAxisWidth?: number;
  /** Çizim alanının yüksekliği; sheet'teki küçük grafiklerde `h-36`. */
  chartClassName?: string;
  className?: string;
}) {
  const projected = series.length === 1 && forecast && forecast.length > 1 ? forecast : undefined;
  const config: ChartConfig = {
    ...Object.fromEntries(
      series.map((item, slot) => [item.key, { label: item.label, theme: SLOT_COLORS[slot] ?? SLOT_COLORS[0] }]),
    ),
    ...(projected ? { [FORECAST_KEY]: { label: 'Tahmin', theme: SLOT_COLORS[0] } } : {}),
  };
  const rows = mergeRows(series, projected);
  const actualTimes = mergeRows(series).map((row) => row.time);
  const times = rows.map((row) => row.time);
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? 0;
  // Tek gün ya da çok kısa aralıkta eksen çökmesin; kenardaki noktalar da kırpılmasın.
  const pad = Math.max((last - first) * 0.04, DAY_MS);
  const withYear = new Date(first).getUTCFullYear() !== new Date(last).getUTCFullYear();
  const measured = series.flatMap((item) => item.points.map((point) => point.value));
  const values = [...measured, ...(projected ?? []).flatMap((point) => [point.low, point.high])];
  // Sıfır koruması veriye bakar, banda değil: negatif olmayan ölçümün ekseni tahmin yüzünden eksiye inmez.
  const scale = niceScale(Math.min(...values), Math.max(...values), { minSpan, nonNegative: Math.min(...measured) >= 0 });
  const format = (value: number) => formatWithUnit(value, unit);
  // Olası aralık birimiyle ("82,1–86,3 cm", "%8–%12"); ekranda tek sayıya çökmüşse ("0–0") yazılmaz.
  const band = (low: number, high: number) => {
    const [from, to] = [formatNumber(low), formatNumber(high)];
    if (from === to) return '';
    return unit === '%' ? ` (%${from}–%${to})` : ` (${from}–${to} ${unit})`;
  };
  const labelOf = (key: string) => series.find((item) => item.key === key)?.label ?? key;

  const latest = series.map((item) => ({ item, point: item.points.at(-1) }));
  const summary = `${title}: ${actualTimes.length} ${pointNoun}. ${latest
    .map(({ item, point }) =>
      point ? `${series.length > 1 ? `${item.label} son değer` : 'Son değer'} ${format(point.value)}, ${dateLabel(point.date)}` : '',
    )
    .filter(Boolean)
    .join('; ')}.${
    projected
      ? ` Tahmin ${dateLabel(projected.at(-1)!.date)}: ${format(projected.at(-1)!.value)}${band(projected.at(-1)!.low, projected.at(-1)!.high)}.`
      : ''
  }`;

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        {/* Eksen etiketleri yalnız sayı; birim eksenin üstünde bir kez. */}
        <span>{unit}</span>
        {series.length > 1 || projected ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {series.map((item, slot) => (
              <li key={item.key} className="flex items-center gap-1.5">
                <SeriesMark slot={slot} className={SLOT_TEXT[slot]} />
                {item.label}
              </li>
            ))}
            {projected ? (
              <li className="flex items-center gap-1.5">
                <SeriesMark slot={-1} className={SLOT_TEXT[0]} />
                Tahmin ve olası aralık
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <ChartContainer config={config} className={cn('aspect-auto w-full', chartClassName)} role="img" aria-label={summary}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={[first - pad, last + pad]}
            // Etiketler ölçüm günlerinde; tahmin varsa son tahmin günü de (`dateTicks`).
            ticks={dateTicks(actualTimes, { extra: projected ? last : undefined })}
            tickFormatter={(time: number) => formatDayShort(toDay(time), withYear)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            // Haftalık ölçümde telefonda da her gün yazılsın ("4 Ağu" ≈ 40 px, hafta ≈ 50 px); gerçekten
            // üst üste binen etiketi kütüphane gizler.
            minTickGap={4}
          />
          <YAxis
            domain={scale.domain}
            ticks={scale.ticks}
            allowDataOverflow={false}
            tickFormatter={(value: number) => formatNumber(value)}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={yAxisWidth}
          />
          <ChartTooltip
            cursor={{ strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length || typeof label !== 'number') return null;
              return (
                <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="font-medium">{dateLabel(toDay(label))}</div>
                  {payload.map((item) => {
                    const key = String(item.dataKey);
                    if (key === 'band') return null;
                    if (key === FORECAST_KEY) {
                      const range = (item.payload as Row | undefined)?.band;
                      return typeof item.value === 'number' ? (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <SeriesMark slot={-1} className={SLOT_TEXT[0]} />
                            Tahmin
                          </span>
                          <span className="font-medium text-foreground tabular-nums">
                            {format(item.value)}
                            {range ? <span className="font-normal text-muted-foreground">{band(range[0], range[1])}</span> : null}
                          </span>
                        </div>
                      ) : null;
                    }
                    const slot = series.findIndex((entry) => entry.key === key);
                    return typeof item.value === 'number' ? (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <SeriesMark slot={slot} className={SLOT_TEXT[slot]} />
                          {labelOf(key)}
                        </span>
                        <span className="font-medium text-foreground tabular-nums">{format(item.value)}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              );
            }}
          />
          {projected ? (
            <Area
              dataKey="band"
              stroke="none"
              fill={`var(--color-${FORECAST_KEY})`}
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={false}
              connectNulls
            />
          ) : null}
          {projected ? (
            <Line
              dataKey={FORECAST_KEY}
              name="Tahmin"
              type="linear"
              stroke={`var(--color-${FORECAST_KEY})`}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
          {series.map((item, slot) => (
            <Line
              key={item.key}
              dataKey={item.key}
              name={item.label}
              type="linear"
              stroke={`var(--color-${item.key})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls
              isAnimationActive={false}
              dot={slot === 0 ? { r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: `var(--color-${item.key})` } : SquareDot}
              activeDot={
                slot === 0 ? { r: 5, strokeWidth: 2, stroke: 'var(--card)', fill: `var(--color-${item.key})` } : ActiveSquareDot
              }
            />
          ))}
        </ComposedChart>
      </ChartContainer>

      <details className="group text-sm">
        <summary className="w-fit cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:underline touch:py-3.5">
          Değerleri tablo olarak göster
        </summary>
        <Table className="mt-2">
          <caption className="sr-only">{title}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Tarih</TableHead>
              {series.map((item) => (
                <TableHead key={item.key} className="text-right">
                  {series.length > 1 ? item.label : 'Değer'}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {projected
              ? projected.slice(1).reverse().map((point) => (
                  <TableRow key={`tahmin-${point.date}`} className="text-muted-foreground">
                    <TableCell>{dateLabel(point.date)} (tahmin)</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format(point.value)}
                      {band(point.low, point.high)}
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {[...rows].filter((row) => actualTimes.includes(row.time)).reverse().map((row) => (
              <TableRow key={row.time}>
                <TableCell>{dateLabel(toDay(row.time))}</TableCell>
                {series.map((item) => {
                  const value = row[item.key];
                  return (
                    <TableCell key={item.key} className="text-right tabular-nums">
                      {typeof value === 'number' ? format(value) : '—'}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </figure>
  );
}
