import Link from 'next/link';
import { ChartLineUp, Plus } from '@phosphor-icons/react/dist/ssr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDay, formatSignedWithUnit } from '@/lib/format';
import type { MeasurementsView } from '@/lib/health';
import { MEASUREMENT_LOCK_INFO, measurementDays, SIDE_LABELS } from '@/lib/measurement-log';
import { measurementAlerts, type MeasurementAlert } from '@/lib/measurement-trends';
import { MEASUREMENTS } from '@/lib/measurements';
import { UNIT_LABELS } from './measurements/measurement-text';

const ALERT_TEXT: Record<MeasurementAlert['kind'], string> = {
  declining: 'gerileme',
  plateau: 'durağan',
  improving: 'gerçek gelişme',
};

/**
 * Danışan sayfasında ölçümlerin özeti: son ölçüm, gün sayısı ve son 4 haftanın kararı
 * verilebilen eğilimleri (gerileme ve durağan önde). Ölçüm girişi ve grafikler kendi sayfasında.
 * `undefined`: GitHub'dan okunamadı.
 */
export function MeasurementsCard({ clientId, view }: { clientId: string; view: MeasurementsView | undefined }) {
  const href = `/dashboard/clients/${clientId}/measurements`;

  if (!view || view.state !== 'ok') {
    const description = !view
      ? 'Ölçümler şu an okunamadı. Sayfayı yenile.'
      : view.state === 'locked'
        ? MEASUREMENT_LOCK_INFO[view.lock].title
        : `Sağlık kaydı okunamadı: ${view.problem}`;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ölçümler</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {view ? (
          <CardFooter>
            <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
              <ChartLineUp data-icon="inline-start" weight="fill" />
              Ayrıntı
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  const days = measurementDays(view.record.measurements);
  const last = days[0];
  const alerts = measurementAlerts(view.record.measurements).slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ölçümler</CardTitle>
        <CardDescription>
          {last ? `${days.length} ölçüm günü · son ${formatDay(last.date)}` : 'Henüz ölçüm yok. İlk ölçüm başlangıç değerleri olur.'}
        </CardDescription>
      </CardHeader>
      {alerts.length > 0 ? (
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm" aria-label="Son 4 haftanın eğilimleri">
            {alerts.map((alert) => {
              const def = MEASUREMENTS[alert.id];
              const side = alert.key === 'value' ? '' : ` (${SIDE_LABELS[alert.key].toLocaleLowerCase('tr')})`;
              return (
                <li key={`${alert.id}-${alert.key}`} className="flex items-center justify-between gap-3">
                  <span>
                    {def.label}
                    {side}
                    <span className="text-muted-foreground tabular-nums">
                      {' '}
                      · {formatSignedWithUnit(Math.round(alert.change * 10) / 10, UNIT_LABELS[def.unit])}
                    </span>
                  </span>
                  <Badge variant={alert.kind === 'declining' ? 'destructive' : alert.kind === 'plateau' ? 'outline' : 'default'}>
                    {ALERT_TEXT[alert.kind]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : null}
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
          <ChartLineUp data-icon="inline-start" weight="fill" />
          Grafikler
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={`${href}/new`} />}>
          <Plus data-icon="inline-start" weight="fill" />
          Ölçüm gir
        </Button>
      </CardFooter>
    </Card>
  );
}
