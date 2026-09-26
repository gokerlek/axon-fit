'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis, type BarShapeProps } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { niceScale } from '@/lib/chart-scale';
import { formatDayShort, formatNumber, formatWithUnit } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Dönem başına sütun grafiği — İlerleme'nin haftalık toplam ağırlık, çalışma seti, antrenman düzeni ve
 * günlük su grafikleri. `ProgressChart`'ın kardeşi: renkler aynı tema adımlarından, dokununca değer,
 * altında "tablo olarak göster", ekran okuyucuya tek cümle.
 *
 * Süren dönem (bu hafta, bugün) soluk ve kesik kenarlı çizilir, tabloda ve ipucunda "sürüyor" yazar:
 * renk tek başına bilgi taşımaz. Hedef çizgisi (ör. haftada planlanan gün) kesikli ve adıyla.
 */

export type ProgressBar = {
  /** Dönemin ilk günü ("YYYY-AA-GG"). */
  date: string;
  value: number;
  /** Dönem henüz bitmedi (bu hafta, bugün). */
  partial?: boolean;
};

const COLOR = { light: 'var(--chart-3)', dark: 'var(--chart-2)' } as const;
const config: ChartConfig = { value: { label: 'Değer', theme: COLOR } };

type Row = ProgressBar & { label: string };

function BarShape(props: BarShapeProps) {
  const { x, y, width, height, payload } = props;
  if (!(height > 0) || !(width > 0)) return null;
  const partial = Boolean((payload as Row | undefined)?.partial);
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={Math.min(3, width / 3)}
      fill="var(--color-value)"
      fillOpacity={partial ? 0.35 : 1}
      stroke={partial ? 'var(--color-value)' : 'none'}
      strokeDasharray={partial ? '3 2' : undefined}
      strokeWidth={partial ? 1.5 : 0}
    />
  );
}

export function ProgressBars({
  title,
  unit,
  bars,
  dateLabel,
  target,
  pointNoun,
  showValues = false,
  valueLabel,
  yAxisWidth = 40,
  className,
}: {
  /** Neyin çizildiği: ekran okuyucu özetinde ve tablo başlığında. */
  title: string;
  /** Eksenin üstündeki birim ("kg", "set", "gün", "bardak"). */
  unit: string;
  bars: readonly ProgressBar[];
  /** Dönemin adı (ipucu, tablo, özet): "21–27 Eyl", "27 Eylül 2026". */
  dateLabel: (date: string) => string;
  /** Kesikli hedef çizgisi ve adı ("Plan: 3 gün"). */
  target?: { value: number; label: string } | undefined;
  /** Özette dönemlerin adı: "12 hafta", "30 gün". */
  pointNoun: string;
  /** Küçük tam sayılarda (gün) değer sütunun üstünde de yazılır. */
  showValues?: boolean;
  /** Değerin metni (ipucu, tablo); varsayılan birimli sayı. */
  valueLabel?: (value: number) => string;
  yAxisWidth?: number;
  className?: string;
}) {
  const rows: Row[] = bars.map((bar) => ({ ...bar, label: dateLabel(bar.date) }));
  const format = valueLabel ?? ((value: number) => formatWithUnit(value, unit));
  const values = rows.map((row) => row.value);
  const scale = niceScale(0, Math.max(1, ...values, target?.value ?? 0), { nonNegative: true });
  const withYear = rows.length > 0 && rows[0]!.date.slice(0, 4) !== rows.at(-1)!.date.slice(0, 4);
  // Telefonda etiketler seyrek: en çok ~6 etiket, ilk ve son kalır.
  const interval = rows.length > 8 ? Math.ceil(rows.length / 6) - 1 : 0;

  const complete = rows.filter((row) => !row.partial);
  const last = rows.at(-1);
  const average = complete.length > 0 ? complete.reduce((sum, row) => sum + row.value, 0) / complete.length : null;
  const summary = [
    `${title}: ${rows.length} ${pointNoun}.`,
    last ? `Son: ${last.label} ${format(last.value)}${last.partial ? ' (sürüyor)' : ''}.` : '',
    average !== null ? `Ortalama ${format(Math.round(average * 10) / 10)}.` : '',
    target ? `${target.label}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <span>{unit}</span>
        {target ? (
          <span className="flex items-center gap-1.5">
            <svg viewBox="0 0 20 10" className="h-2.5 w-5 shrink-0">
              <line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            {target.label}
          </span>
        ) : null}
      </div>

      <ChartContainer config={config} className="aspect-auto h-44 w-full" role="img" aria-label={summary}>
        <BarChart data={rows} margin={{ top: showValues ? 16 : 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false} barCategoryGap="18%">
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => formatDayShort(date, withYear)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={interval}
          />
          <YAxis
            domain={scale.domain}
            ticks={scale.ticks}
            tickFormatter={(value: number) => formatNumber(value)}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={yAxisWidth}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined;
              if (!active || !row) return null;
              return (
                <div className="grid min-w-32 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="font-medium">{row.label}</div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{row.partial ? 'Sürüyor' : 'Toplam'}</span>
                    <span className="font-medium text-foreground tabular-nums">{format(row.value)}</span>
                  </div>
                  {target ? <div className="text-muted-foreground">{target.label}</div> : null}
                </div>
              );
            }}
          />
          {target ? (
            <ReferenceLine y={target.value} stroke="var(--foreground)" strokeOpacity={0.55} strokeDasharray="4 3" strokeWidth={1.5} ifOverflow="extendDomain" />
          ) : null}
          <Bar dataKey="value" shape={BarShape} isAnimationActive={false}>
            {showValues ? (
              <LabelList dataKey="value" position="top" offset={4} className="fill-muted-foreground" fontSize={11} formatter={(value) => (typeof value === 'number' ? formatNumber(value) : '')} />
            ) : null}
          </Bar>
        </BarChart>
      </ChartContainer>

      <details className="group text-sm">
        <summary className="w-fit cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:underline touch:py-3.5">
          Değerleri tablo olarak göster
        </summary>
        <Table className="mt-2">
          <caption className="sr-only">{title}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Dönem</TableHead>
              <TableHead className="text-right">Değer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rows].reverse().map((row) => (
              <TableRow key={row.date}>
                <TableCell>
                  {row.label}
                  {row.partial ? <span className="text-muted-foreground"> (sürüyor)</span> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {format(row.value)}
                  {target ? <span className="text-muted-foreground"> / {formatNumber(target.value)}</span> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </figure>
  );
}
