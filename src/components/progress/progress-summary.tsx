import { ChartLineUp, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { formatDay } from '@/lib/format';
import { PROGRESS_MAX_SESSIONS, type ProgressView } from '@/lib/progress';
import { progressCopy, type ProgressViewer } from '@/lib/progress-text';

/**
 * İlerleme sayfasının üst parçaları (danışan ve PT ortak): antrenman yokken tek boş durum, okunamayan ya da
 * sınırın dışında kalan antrenman uyarısı, üç sayı (antrenman · haftalık seri · rekor) ve ilk antrenmanın günü.
 */

export function ProgressEmpty({ viewer, name }: { viewer: ProgressViewer; name?: string }) {
  const copy = progressCopy(viewer, name);
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChartLineUp weight="fill" />
        </EmptyMedia>
        <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
        <EmptyDescription>{copy.emptyText}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Okunamayan antrenman dosyaları ve son `PROGRESS_MAX_SESSIONS` sınırı; ikisi de yoksa hiçbir şey. */
export function ProgressNotice({ view }: { view: Pick<ProgressView, 'skipped' | 'truncated'> }) {
  if (view.skipped === 0 && !view.truncated) return null;
  return (
    <Alert>
      <WarningCircle weight="fill" />
      <AlertDescription>
        {[
          view.skipped > 0 ? `${view.skipped} antrenmanın kaydı şu an okunamadı; grafikler ve rekorlar onlarsız.` : null,
          view.truncated ? `Grafikler ve rekorlar son ${PROGRESS_MAX_SESSIONS} antrenmandan.` : null,
        ]
          .filter(Boolean)
          .join(' ')}
      </AlertDescription>
    </Alert>
  );
}

export function ProgressStats({ viewer, view }: { viewer: ProgressViewer; view: Pick<ProgressView, 'workouts' | 'streak' | 'records' | 'firstDate'> }) {
  const copy = progressCopy(viewer);
  const stats = [
    { value: view.workouts, label: 'antrenman' },
    { value: view.streak.current, label: 'haftalık seri' },
    { value: view.records, label: 'rekor' },
  ];
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <dl className="grid grid-cols-3 divide-x text-center">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-0.5 px-1">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="font-heading text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
        {view.firstDate ? <p className="text-center text-xs text-muted-foreground">{copy.firstWorkout(formatDay(view.firstDate))}</p> : null}
      </CardContent>
    </Card>
  );
}
