'use client';

import { useState } from 'react';
import { CaretLeft, CaretRight, WarningCircle } from '@phosphor-icons/react';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { ProgressChart } from '@/components/progress-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDay, formatKg, formatNumber } from '@/lib/format';
import { BODY_MUSCLES, summarizeMuscles, type BodyMuscle, type MuscleIntensity } from '@/lib/muscles';
import type { WeekView } from '@/lib/progress';
import { weekLabel } from '@/lib/progress-text';
import { MUSCLE_LABELS } from '@/lib/schemas/exercise';
import { weeklySetBand, type WeeklySetBand } from '@/lib/template-plan';

/** Listede en çok bu kadar kas; gerisi "+n kas daha". */
const LIST_LIMIT = 12;

const BAND_LABELS: Record<Exclude<WeeklySetBand, 'none'>, string> = { low: 'az', enough: 'yeterli', high: 'fazla' };

/**
 * Haritanın tonu kademeli (SPEC §7.4): az açık, yeterli ve fazla tam ton. "Fazla" haritada ayrı renk
 * almaz (temada uyarı rengi yok); listede ikon ve sözcükle yazılır, renk tek başına bilgi taşımaz.
 */
const BAND_INTENSITY: Record<WeeklySetBand, number> = { none: 0, low: 0.35, enough: 1, high: 1 };

function WeekMuscles({ load, label }: { load: Record<string, number>; label: string }) {
  const worked = BODY_MUSCLES.filter((muscle) => (load[muscle] ?? 0) > 0).sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0));
  const intensity: MuscleIntensity = Object.fromEntries(worked.map((muscle) => [muscle, BAND_INTENSITY[weeklySetBand(load[muscle] ?? 0)]]));
  const shown = worked.slice(0, LIST_LIMIT);
  const cardio = load.cardio ?? 0;
  const describe = (muscle: BodyMuscle) => {
    const sets = load[muscle] ?? 0;
    const band = weeklySetBand(sets);
    return `${MUSCLE_LABELS[muscle]} · ${formatNumber(sets)} set${band === 'none' ? '' : ` · ${BAND_LABELS[band]}`}`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <MuscleMap
        layout="split"
        tone="load"
        intensity={intensity}
        describe={describe}
        hint="Bir kasa dokun: set sayısı"
        bodyClassName="h-56"
        label={worked.length > 0 ? `${label}: ${summarizeMuscles(worked.slice(0, 6)).join(', ')}` : `${label}: kas yükü yok`}
      />
      {shown.length > 0 || cardio > 0 ? (
        <div className="flex w-full flex-col gap-2 text-sm">
          <dl className="grid w-full grid-cols-1 gap-y-1">
            {shown.map((muscle) => {
              const sets = load[muscle] ?? 0;
              const band = weeklySetBand(sets);
              return (
                <div key={muscle} className="flex min-h-7 items-baseline justify-between gap-3">
                  <dt className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{MUSCLE_LABELS[muscle]}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5 tabular-nums">
                    {formatNumber(sets)} set
                    {band === 'none' ? null : (
                      <span className={band === 'high' ? 'flex items-center gap-1 font-medium' : 'text-muted-foreground'}>
                        {band === 'high' ? <WarningCircle weight="fill" className="size-3.5" aria-hidden /> : null}· {BAND_LABELS[band]}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
            {cardio > 0 ? (
              <div className="flex min-h-7 items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Kardiyo</dt>
                <dd className="tabular-nums">{formatNumber(cardio)} set</dd>
              </div>
            ) : null}
          </dl>
          {worked.length > shown.length ? <p className="text-muted-foreground">+{worked.length - shown.length} kas daha</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Haftalık görünüm (tasarım §0): kas başına yapılan set (gerçekleşen yük; şablon haritasının hesabıyla,
 * hafta hafta geriye gidilir) ve son haftaların toplam ağırlığı (ölçüm grafikleriyle aynı bileşen).
 * Hafta pazartesi başlar.
 */
export function WeeklyProgress({ weeks }: { weeks: WeekView[] }) {
  const [index, setIndex] = useState(weeks.length - 1);
  const week = weeks[Math.min(index, weeks.length - 1)];
  if (!week) return null;
  const current = index >= weeks.length - 1;
  const range = weekLabel(week.weekStart, week.weekEnd);
  const heading = current ? 'Bu hafta' : range;
  const labels = new Map(weeks.map((item) => [item.weekStart, weekLabel(item.weekStart, item.weekEnd)]));
  const points = weeks.map((item) => ({ date: item.weekStart, value: item.volumeKg }));
  const lifted = points.some((point) => point.value > 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="font-heading text-lg font-semibold">Kaslar</h2>
          </CardTitle>
          <CardDescription>Haftada hangi kası kaç set çalıştırdığın.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              disabled={index <= 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              aria-label="Önceki hafta">
              <CaretLeft />
            </Button>
            <p className="flex min-w-0 flex-col items-center text-center" aria-live="polite">
              <span className="text-sm font-medium">{heading}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {current ? `${range} · ` : ''}
                {week.sessions} antrenman · {week.sets} set
                {week.volumeKg > 0 ? ` · ${formatKg(week.volumeKg)}` : ''}
              </span>
            </p>
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              disabled={current}
              onClick={() => setIndex((value) => Math.min(weeks.length - 1, value + 1))}
              aria-label="Sonraki hafta">
              <CaretRight />
            </Button>
          </div>

          {week.sessions === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              {current ? 'Bu hafta henüz antrenman yok.' : 'Bu hafta antrenman yok.'}
            </p>
          ) : (
            <WeekMuscles load={week.muscles} label={heading} />
          )}
          <p className="text-xs text-muted-foreground">
            Bir set hedef kasa 1, yardımcı kasa 0,5, dengeleyici kasa 0,25 sayılır; ısınma hareketleri sayılmaz. Kas başına haftada
            10–20 set yeterli aralıktır: altı az, üstü fazla.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="font-heading text-lg font-semibold">Haftalık toplam ağırlık</h2>
          </CardTitle>
          <CardDescription>Her setin ağırlığı × tekrarı, hafta başına; ısınma setleri hariç.</CardDescription>
        </CardHeader>
        <CardContent>
          {weeks.length > 1 && lifted ? (
            <ProgressChart
              title="Haftalık toplam ağırlık"
              unit="kg"
              series={[{ key: 'value', label: 'Toplam ağırlık', points }]}
              dateLabel={(date) => labels.get(date) ?? formatDay(date)}
              pointNoun="hafta"
              yAxisWidth={48}
            />
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              {lifted
                ? `Bu hafta ${formatKg(week.volumeKg)}. Grafik ikinci haftadan sonra çizilir.`
                : 'Henüz ağırlıklı set yok; vücut ağırlığı ve süreli setler bu toplama girmez.'}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
