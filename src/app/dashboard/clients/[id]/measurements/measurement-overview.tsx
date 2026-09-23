import Link from 'next/link';
import { ArrowDown, ArrowUp, CheckCircle, Equals, Ruler, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { ProgressChart, type ProgressSeries } from '@/components/progress-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { formatDay, formatNumber, formatSignedWithUnit, formatWithUnit } from '@/lib/format';
import { measurementDays, SIDE_LABELS } from '@/lib/measurement-log';
import {
  latestSideBridgeAsymmetry,
  latestSitToStand,
  latestWaistHip,
  measurementTrends,
  type ChangeKind,
  type LineKey,
  type MeasurementLine,
  type MeasurementTrend,
} from '@/lib/measurement-trends';
import { MEASUREMENTS, type MeasurementDef } from '@/lib/measurements';
import type { HealthRecord } from '@/lib/schemas/health';
import {
  CHANGE_LABELS,
  describeRule,
  describeSideBridge,
  describeSitToStand,
  describeWaistHip,
  GROUP_INFO,
  NO_RULE_TEXT,
  UNIT_LABELS,
} from './measurement-text';

/**
 * Ölçümlerin genel bakışı: katalog grubuna göre ölçüm başına grafik kartı (seyir, son değer,
 * değişimin gerçek olup olmadığı, yorum satırları) ve tam genişlikte ölçüm günleri.
 */
export function MeasurementOverview({ record, base }: { record: HealthRecord; base: string }) {
  if (record.measurements.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Ruler weight="fill" />
          </EmptyMedia>
          <EmptyTitle>Henüz ölçüm yok</EmptyTitle>
          <EmptyDescription>
            İlk ölçümle başlangıç değerleri oluşur; sonraki her ölçüm bir öncekiyle karşılaştırılır.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const trends = measurementTrends(record.measurements);
  const groups = (Object.keys(GROUP_INFO) as MeasurementDef['group'][])
    .map((group) => ({ group, trends: trends.filter((trend) => MEASUREMENTS[trend.id].group === group) }))
    .filter((entry) => entry.trends.length > 0);
  const days = measurementDays(record.measurements);

  return (
    <>
      {groups.map(({ group, trends: items }) => (
        <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
          <h2 id={`group-${group}`} className="font-heading text-lg font-semibold">
            {GROUP_INFO[group].title}
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {items.map((trend) => (
              <TrendCard key={trend.id} trend={trend} record={record} />
            ))}
          </div>
        </section>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Ölçüm günleri</CardTitle>
          <CardDescription>Bir güne girip değerlerini düzeltebilir ya da o günü silebilirsin.</CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup className="gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {days.map((day) => {
              const labels = day.ids.map((measurement) => MEASUREMENTS[measurement].label);
              const shown = labels.slice(0, 3).join(', ');
              return (
                <Item key={day.date} variant="outline" size="sm" render={<Link href={`${base}/${day.date}/edit`} />}>
                  <ItemContent>
                    <ItemTitle>{formatDay(day.date)}</ItemTitle>
                    <ItemDescription>
                      {labels.length > 3 ? `${shown} ve ${labels.length - 3} ölçüm daha` : shown}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              );
            })}
          </ItemGroup>
        </CardContent>
      </Card>
    </>
  );
}

const LINE_LABELS: Record<LineKey, string> = { value: 'Değer', ...SIDE_LABELS };

/**
 * Grafiğin değer ekseni en az hata payının iki katını kapsar: gürültü içindeki oynama
 * (kalça 100 → 99 cm) uçurum gibi görünmesin. Eşiği olmayan ölçümde veri aralığı.
 */
function noiseSpan(trend: MeasurementTrend): number | undefined {
  const rule = trend.rule;
  if (!rule) return undefined;
  if (!rule.relative) return rule.threshold * 2;
  const values = trend.lines.flatMap((line) => line.points.map((point) => point.value));
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return rule.threshold * 2 * mean;
}

function TrendCard({ trend, record }: { trend: MeasurementTrend; record: HealthRecord }) {
  const def = MEASUREMENTS[trend.id];
  const unit = UNIT_LABELS[def.unit];
  const sided = trend.lines.some((line) => line.key !== 'value');
  const charted = trend.lines.some((line) => line.points.length > 1);
  const series = trend.lines.slice(0, 2).map(
    (line): ProgressSeries => ({ key: line.key, label: LINE_LABELS[line.key], points: line.points }),
  ) as [ProgressSeries] | [ProgressSeries, ProgressSeries];

  const notes: string[] = [trend.rule ? describeRule(trend.rule, unit) : NO_RULE_TEXT];
  if (trend.id === 'waist_girth') {
    const waistHip = latestWaistHip(record.measurements, record.sex);
    if (waistHip) notes.push(describeWaistHip(waistHip));
  }
  if (trend.id === 'sit_to_stand_5x') {
    const sitToStand = latestSitToStand(record.measurements);
    if (sitToStand) notes.push(describeSitToStand(sitToStand));
  }
  if (trend.id === 'side_bridge_endurance') {
    const bridge = latestSideBridgeAsymmetry(record.measurements);
    if (bridge) notes.push(describeSideBridge(bridge));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{def.label}</CardTitle>
        <CardDescription>Son ölçüm {formatDay(trend.lastDate)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className={sided ? 'grid gap-3 sm:grid-cols-2' : 'flex flex-col gap-3'}>
          {trend.lines.map((line) => (
            <LatestValue
              key={line.key}
              line={line}
              unit={unit}
              relative={trend.rule?.relative ?? false}
              label={sided ? LINE_LABELS[line.key] : 'Son değer'}
            />
          ))}
        </dl>

        {/* Tek ölçümde grafik yok: "ilk ölçüm" notu yeterli. */}
        {charted ? <ProgressChart title={def.label} unit={unit} series={series} minSpan={noiseSpan(trend)} /> : null}

        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LatestValue({
  line,
  unit,
  relative,
  label,
}: {
  line: MeasurementLine;
  unit: string;
  /** Eşik göreliyse (dayanıklılık) yüzde değişim de yazılır. */
  relative: boolean;
  label: string;
}) {
  const latest = line.points.at(-1);
  if (!latest) return null;
  const change = line.change;
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-1.5">
        <span className="text-2xl font-semibold">{formatWithUnit(latest.value, unit)}</span>
        {change ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {change.kind ? <ChangeBadge kind={change.kind} /> : null}
            <span className="tabular-nums">
              {formatSignedWithUnit(change.delta, unit)}
              {relative && change.ratio !== null
                ? ` (${change.ratio < 0 ? '−' : '+'}%${formatNumber(Math.abs(Math.round(change.ratio * 100)))})`
                : ''}
            </span>
            <span>önceki ölçüm {formatDay(change.previous.date)}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">İlk ölçüm; karşılaştırma bir sonrakinde.</span>
        )}
      </dd>
    </div>
  );
}

function ChangeBadge({ kind }: { kind: ChangeKind }) {
  const icon =
    kind === 'improved' ? (
      <CheckCircle weight="fill" data-icon="inline-start" />
    ) : kind === 'declined' ? (
      <WarningCircle weight="fill" data-icon="inline-start" />
    ) : kind === 'increased' ? (
      <ArrowUp weight="fill" data-icon="inline-start" />
    ) : kind === 'decreased' ? (
      <ArrowDown weight="fill" data-icon="inline-start" />
    ) : (
      <Equals weight="fill" data-icon="inline-start" />
    );
  const variant = kind === 'improved' ? 'default' : kind === 'declined' ? 'destructive' : kind === 'no_real_change' ? 'outline' : 'secondary';
  return (
    <Badge variant={variant}>
      {icon}
      {CHANGE_LABELS[kind]}
    </Badge>
  );
}
