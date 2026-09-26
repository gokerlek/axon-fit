'use client';

import { useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { ProgressBars } from '@/components/progress-bars';
import { ProgressChart, type ProgressSeries } from '@/components/progress-chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDay, formatKg, formatNumber } from '@/lib/format';
import type { WeekView } from '@/lib/progress';
import type { Gated, ProgressInsights } from '@/lib/progress-insights';
import { adherenceText, progressCopy, recentAverage, waterSummary, weekLabel, type ProgressViewer } from '@/lib/progress-text';
import { ProgressCard } from './progress-card';

/**
 * İlerleme'nin grafik bölümü (SPEC §7.6): haftalık toplam ağırlık ve çalışma seti, antrenman düzeni
 * (haftada gün ve plan), onay varsa hazır oluşluk ve ağrı, seans zorluğu, son 30 günün suyu. Noktalar
 * sunucuda hesaplanır (`progress-insights.ts`); sağlık grafikleri onay yoksa hiç gelmez (`off`). Her
 * grafiğin boş durumu ne kadar veri gerektiğini söyler. Dokununca değer, altında tablo. Danışan ve PT
 * aynı kartları kullanır (`viewer`, metinler `progressCopy`'den).
 */

/** Grafik için en az bu kadar nokta (`CHART_MIN_POINTS`; sunucu modülü tarayıcıya taşınmasın diye burada da). */
const MIN_POINTS = 2;

type Audience = { viewer: ProgressViewer; name?: string };

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

function Unavailable({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

const weekName = (weeks: readonly Pick<WeekView, 'weekStart' | 'weekEnd'>[]) => {
  const labels = new Map(weeks.map((week) => [week.weekStart, weekLabel(week.weekStart, week.weekEnd)]));
  return (date: string) => labels.get(date) ?? formatDay(date);
};

type LoadMetric = 'volume' | 'sets';

/** Haftalık yük: toplam ağırlık ya da çalışma seti, son 12 hafta; bu hafta sürüyor. */
export function WeeklyLoadCard({ viewer, weeks, today }: Audience & { weeks: WeekView[]; today: string }) {
  const copy = progressCopy(viewer);
  const [metric, setMetric] = useState<LoadMetric>('volume');
  const current = weeks.at(-1);
  if (!current) return null;
  const lifted = weeks.some((week) => week.volumeKg > 0);
  const bars = weeks.map((week) => ({ date: week.weekStart, value: metric === 'volume' ? week.volumeKg : week.sets, partial: week.weekEnd >= today }));
  const label = metric === 'volume' ? 'Toplam ağırlık' : 'Çalışma seti';

  return (
    <ProgressCard viewer={viewer} title="Haftalık yük" description={copy.weeklyLoadIntro}>
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[metric]}
        onValueChange={(value) => {
          const next = value[0] as LoadMetric | undefined;
          if (next) setMetric(next);
        }}
        aria-label="Grafikte ne gösterilsin"
        className="w-full">
        <ToggleGroupItem value="volume" className="h-11 flex-1">
          Toplam ağırlık
        </ToggleGroupItem>
        <ToggleGroupItem value="sets" className="h-11 flex-1">
          Çalışma seti
        </ToggleGroupItem>
      </ToggleGroup>
      {weeks.length < MIN_POINTS ? (
        <Note>
          Bu hafta {current.sessions} antrenman · {current.sets} set{current.volumeKg > 0 ? ` · ${formatKg(current.volumeKg)}` : ''}. Grafik
          ikinci haftadan sonra çizilir.
        </Note>
      ) : metric === 'volume' && !lifted ? (
        <Note>Henüz ağırlıklı set yok; vücut ağırlığı ve süreli setler bu toplama girmez. Çalışma setine bakabilirsin.</Note>
      ) : (
        <ProgressBars
          title={`Haftalık ${label.toLocaleLowerCase('tr')}`}
          unit={metric === 'volume' ? 'kg' : 'set'}
          bars={bars}
          dateLabel={weekName(weeks)}
          pointNoun="hafta"
          yAxisWidth={metric === 'volume' ? 48 : 32}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {metric === 'volume'
          ? 'Toplam ağırlık: her çalışma setinin ağırlığı × tekrarı. Set sayısıyla da artar; güç gelişimini Gelişim bölümü gösterir.'
          : copy.workingSetsNote}{' '}
        Bu hafta sürüyor: soluk sütun.
      </p>
    </ProgressCard>
  );
}

/** Antrenman düzeni: haftada antrenman günü ve plan (kesikli çizgi). */
export function AdherenceCard({ viewer, adherence }: Audience & { adherence: ProgressInsights['adherence'] }) {
  const copy = progressCopy(viewer);
  const weeks = adherence.weeks;
  if (weeks.length === 0) return null;
  const target = adherence.planned === null ? undefined : { value: adherence.planned, label: `Plan: haftada ${adherence.planned} gün` };
  return (
    <ProgressCard viewer={viewer} title="Antrenman düzeni" description={copy.adherenceIntro}>
      {adherence.recent ? <p className="text-sm font-medium tabular-nums">{adherenceText(adherence.recent)}</p> : null}
      {weeks.length < MIN_POINTS ? (
        <Note>
          Bu hafta {weeks.at(-1)!.days} gün{adherence.planned ? ` (plan ${adherence.planned})` : ''}. Grafik ikinci haftadan sonra
          çizilir.
        </Note>
      ) : (
        <ProgressBars
          title="Haftada antrenman günü"
          unit="gün"
          bars={weeks.map((week) => ({ date: week.weekStart, value: week.days, partial: week.current }))}
          dateLabel={weekName(weeks)}
          target={target}
          pointNoun="hafta"
          showValues
          valueLabel={(value) => `${formatNumber(value)} gün`}
          yAxisWidth={24}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {adherence.planned === null ? copy.adherenceNoPlan : copy.adherencePlanNote} {copy.adherenceWeeksNote}
      </p>
    </ProgressCard>
  );
}

function healthNote<T>(section: Gated<T>, text: string): React.ReactNode | null {
  return section.state === 'unavailable' ? <Unavailable text={text} /> : null;
}

/** Hazır oluşluk puanı (20–100), onay varsa. */
export function ReadinessCard({ viewer, readiness, today, low }: Audience & { readiness: ProgressInsights['readiness']; today: string; low: number }) {
  const copy = progressCopy(viewer);
  if (readiness.state === 'off') return null;
  const points = readiness.state === 'ok' ? readiness.points : [];
  const recent = recentAverage(points, today);
  return (
    <ProgressCard
      viewer={viewer}
      title="Hazır oluşluk"
      description="Antrenman başındaki dört sorudan (uyku, enerji, kas ağrısı, stres) puan: 20 en düşük, 100 en iyi.">
      {healthNote(readiness, copy.unavailable(copy.readinessWhat)) ??
        (points.length < MIN_POINTS ? (
          <Note>Grafik iki cevaptan sonra çizilir{points.length === 1 ? `; ${copy.readinessFirst(points[0]!.value)}` : ''}.</Note>
        ) : (
          <>
            {recent ? (
              <p className="text-sm tabular-nums">
                Son 4 haftada ortalama <span className="font-medium">{formatNumber(recent.average)}</span> ({recent.count} cevap).
              </p>
            ) : null}
            <ProgressChart
              title="Hazır oluşluk puanı"
              unit="puan"
              series={[{ key: 'value', label: 'Hazır oluşluk', points }]}
              minSpan={40}
              pointNoun="antrenman günü"
            />
          </>
        ))}
      <p className="text-xs text-muted-foreground">Düşük gün sınırı {low}: altında o günün antrenmanını hafifletmek önerilir.</p>
    </ProgressCard>
  );
}

/** Ağrı (0–10): antrenman öncesi son 24 saat ve antrenmandaki en yüksek; onay varsa. */
export function PainCard({ viewer, name, pain }: Audience & { pain: ProgressInsights['pain'] }) {
  const copy = progressCopy(viewer, name);
  if (pain.state === 'off') return null;
  const before = pain.state === 'ok' ? pain.before : [];
  const peak = pain.state === 'ok' ? pain.peak : [];
  const series = [
    ...(before.length > 0 ? [{ key: 'before', label: 'Antrenman öncesi', points: before }] : []),
    ...(peak.length > 0 ? [{ key: 'peak', label: 'Antrenmanda en yüksek', points: peak }] : []),
  ] as ProgressSeries[];
  const enough = before.length >= MIN_POINTS || peak.length >= MIN_POINTS;
  return (
    <ProgressCard viewer={viewer} title="Ağrı" description={copy.painIntro}>
      {healthNote(pain, copy.unavailable(copy.painWhat)) ??
        (!enough || series.length === 0 ? (
          <Note>Ağrı soruları antrenman başında ve sonunda sorulur; grafik iki cevaptan sonra çizilir.</Note>
        ) : (
          <ProgressChart
            title="Ağrı"
            unit="puan"
            series={series.length === 2 ? [series[0]!, series[1]!] : [series[0]!]}
            minSpan={4}
            pointNoun="antrenman günü"
          />
        ))}
      <p className="text-xs text-muted-foreground">{copy.painFootnote}</p>
    </ProgressCard>
  );
}

/** Seans zorluğu (CR-10): antrenman verisi, onaya bağlı değil. */
export function EffortCard({ viewer, name, rpe, today }: Audience & { rpe: ProgressInsights['rpe']; today: string }) {
  const copy = progressCopy(viewer, name);
  const recent = recentAverage(rpe, today);
  return (
    <ProgressCard viewer={viewer} title="Antrenman zorluğu" description="Antrenmandan yaklaşık 10 dakika sonra sorulan zorluk: 0 dinlenme, 10 en zor.">
      {rpe.length < MIN_POINTS ? (
        <Note>{copy.effortEmpty}</Note>
      ) : (
        <>
          {recent ? (
            <p className="text-sm tabular-nums">
              Son 4 haftada ortalama <span className="font-medium">{formatNumber(recent.average)}</span> / 10 ({recent.count} antrenman).
            </p>
          ) : null}
          <ProgressChart
            title="Antrenman zorluğu"
            unit="puan"
            series={[{ key: 'value', label: 'Zorluk', points: rpe }]}
            minSpan={4}
            pointNoun="antrenman günü"
          />
        </>
      )}
    </ProgressCard>
  );
}

/** Su: son 30 gün, günde bardak; bugün sürüyor. */
export function WaterCard({ viewer, name, water, today }: Audience & { water: ProgressInsights['water']; today: string }) {
  const copy = progressCopy(viewer, name);
  const days = water.state === 'ok' ? water.days : [];
  const summary = waterSummary(days);
  return (
    <ProgressCard viewer={viewer} title="Su" description={copy.waterIntro}>
      {water.state === 'unavailable' ? (
        <Unavailable text={copy.unavailable(copy.waterWhat)} />
      ) : summary.recorded === 0 ? (
        <Note>{copy.waterEmpty}</Note>
      ) : (
        <>
          <p className="text-sm tabular-nums">
            {copy.waterDays(summary.recorded)} <span className="font-medium">{formatNumber(summary.average ?? 0)} bardak</span>.
          </p>
          <ProgressBars
            title="Günlük su"
            unit="bardak"
            bars={days.map((day) => ({ date: day.date, value: day.glasses, partial: day.date === today }))}
            dateLabel={formatDay}
            pointNoun="gün"
            valueLabel={(value) => `${formatNumber(value)} bardak`}
            yAxisWidth={24}
          />
        </>
      )}
    </ProgressCard>
  );
}
