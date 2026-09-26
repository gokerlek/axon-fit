'use client';

import { useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { ProgressBars } from '@/components/progress-bars';
import { ProgressChart, type ProgressSeries } from '@/components/progress-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDay, formatKg, formatNumber } from '@/lib/format';
import type { WeekView } from '@/lib/progress';
import type { Gated, ProgressInsights } from '@/lib/progress-insights';
import { adherenceText, recentAverage, waterSummary, weekLabel } from '@/lib/progress-text';

/**
 * İlerleme'nin grafik bölümü (SPEC §7.6): haftalık toplam ağırlık ve çalışma seti, antrenman düzeni
 * (haftada gün ve plan), onay varsa hazır oluşluk ve ağrı, seans zorluğu, son 30 günün suyu. Noktalar
 * sunucuda hesaplanır (`progress-insights.ts`); sağlık grafikleri onay yoksa hiç gelmez (`off`). Her
 * grafiğin boş durumu ne kadar veri gerektiğini söyler. Telefon, 375 px: dokununca değer, altında tablo.
 */

/** Grafik için en az bu kadar nokta (`CHART_MIN_POINTS`; sunucu modülü telefona taşınmasın diye burada da). */
const MIN_POINTS = 2;

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

function Unavailable({ what }: { what: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
      {what} şu an okunamadı. Biraz sonra yeniden dene; sürerse antrenörüne haber ver.
    </p>
  );
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

const weekName = (weeks: readonly Pick<WeekView, 'weekStart' | 'weekEnd'>[]) => {
  const labels = new Map(weeks.map((week) => [week.weekStart, weekLabel(week.weekStart, week.weekEnd)]));
  return (date: string) => labels.get(date) ?? formatDay(date);
};

type LoadMetric = 'volume' | 'sets';

/** Haftalık yük: toplam ağırlık ya da çalışma seti, son 12 hafta; bu hafta sürüyor. */
export function WeeklyLoadCard({ weeks, today }: { weeks: WeekView[]; today: string }) {
  const [metric, setMetric] = useState<LoadMetric>('volume');
  const current = weeks.at(-1);
  if (!current) return null;
  const lifted = weeks.some((week) => week.volumeKg > 0);
  const bars = weeks.map((week) => ({ date: week.weekStart, value: metric === 'volume' ? week.volumeKg : week.sets, partial: week.weekEnd >= today }));
  const label = metric === 'volume' ? 'Toplam ağırlık' : 'Çalışma seti';

  return (
    <ChartCard title="Haftalık yük" description="Hafta başına kaldırdığın toplam ağırlık ya da yaptığın çalışma seti; ısınma setleri hariç.">
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
          : 'Çalışma seti: ısınma hariç yaptığın bütün setler (fazladan setler dahil).'}{' '}
        Bu hafta sürüyor: soluk sütun.
      </p>
    </ChartCard>
  );
}

/** Antrenman düzeni: haftada antrenman günü ve plan (kesikli çizgi). */
export function AdherenceCard({ adherence }: { adherence: ProgressInsights['adherence'] }) {
  const weeks = adherence.weeks;
  if (weeks.length === 0) return null;
  const target = adherence.planned === null ? undefined : { value: adherence.planned, label: `Plan: haftada ${adherence.planned} gün` };
  return (
    <ChartCard title="Antrenman düzeni" description="Haftada kaç gün antrenman yaptığın ve planın.">
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
        {adherence.planned === null
          ? 'Programında haftalık gün sayısı yok; yalnız yaptığın günler gösteriliyor.'
          : 'Plan bugünkü planındır, geçmiş haftalara da uygulanır. Aynı gün iki antrenman bir gün sayılır.'}{' '}
        Bu hafta sürüyor; ilk haftan (başlangıç) özete girmez.
      </p>
    </ChartCard>
  );
}

function healthNote<T>(section: Gated<T>, what: string): React.ReactNode | null {
  return section.state === 'unavailable' ? <Unavailable what={what} /> : null;
}

/** Hazır oluşluk puanı (20–100), onay varsa. */
export function ReadinessCard({ readiness, today, low }: { readiness: ProgressInsights['readiness']; today: string; low: number }) {
  if (readiness.state === 'off') return null;
  const points = readiness.state === 'ok' ? readiness.points : [];
  const recent = recentAverage(points, today);
  return (
    <ChartCard
      title="Hazır oluşluk"
      description="Antrenman başındaki dört sorudan (uyku, enerji, kas ağrısı, stres) puan: 20 en düşük, 100 en iyi.">
      {healthNote(readiness, 'Hazır oluşluk cevapların') ??
        (points.length < MIN_POINTS ? (
          <Note>Grafik iki cevaptan sonra çizilir{points.length === 1 ? `; ilk puanın ${formatNumber(points[0]!.value)}` : ''}.</Note>
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
    </ChartCard>
  );
}

/** Ağrı (0–10): antrenman öncesi son 24 saat ve antrenmandaki en yüksek; onay varsa. */
export function PainCard({ pain }: { pain: ProgressInsights['pain'] }) {
  if (pain.state === 'off') return null;
  const before = pain.state === 'ok' ? pain.before : [];
  const peak = pain.state === 'ok' ? pain.peak : [];
  const series = [
    ...(before.length > 0 ? [{ key: 'before', label: 'Antrenman öncesi', points: before }] : []),
    ...(peak.length > 0 ? [{ key: 'peak', label: 'Antrenmanda en yüksek', points: peak }] : []),
  ] as ProgressSeries[];
  const enough = before.length >= MIN_POINTS || peak.length >= MIN_POINTS;
  return (
    <ChartCard title="Ağrı" description="0 ağrı yok, 10 dayanılmaz. Antrenman öncesi: son 24 saatteki ağrın; antrenmanda: en yüksek ağrın.">
      {healthNote(pain, 'Ağrı cevapların') ??
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
      <p className="text-xs text-muted-foreground">Ağrın artıyorsa ya da geçmiyorsa antrenörüne söyle.</p>
    </ChartCard>
  );
}

/** Seans zorluğu (CR-10): antrenman verisi, onaya bağlı değil. */
export function EffortCard({ rpe, today }: { rpe: ProgressInsights['rpe']; today: string }) {
  const recent = recentAverage(rpe, today);
  return (
    <ChartCard title="Antrenman zorluğu" description="Antrenmandan yaklaşık 10 dakika sonra sorulan zorluk: 0 dinlenme, 10 en zor.">
      {rpe.length < MIN_POINTS ? (
        <Note>Antrenman sonrası “Nasıl geçti?” sorusunu cevapladıkça burada birikir; grafik iki cevaptan sonra çizilir.</Note>
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
    </ChartCard>
  );
}

/** Su: son 30 gün, günde bardak; bugün sürüyor. */
export function WaterCard({ water, today }: { water: ProgressInsights['water']; today: string }) {
  const days = water.state === 'ok' ? water.days : [];
  const summary = waterSummary(days);
  return (
    <ChartCard title="Su" description="Son 30 günde günde kaç bardak içtiğin: Bugün'deki bardaklar ve antrenmandakiler.">
      {water.state === 'unavailable' ? (
        <Unavailable what="Su kaydın" />
      ) : summary.recorded === 0 ? (
        <Note>Bugün ekranındaki su düğmesiyle ya da antrenmanda eklediğin bardaklar burada günlük birikir.</Note>
      ) : (
        <>
          <p className="text-sm tabular-nums">
            Su girdiğin {summary.recorded} günde ortalama <span className="font-medium">{formatNumber(summary.average ?? 0)} bardak</span>.
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
    </ChartCard>
  );
}
