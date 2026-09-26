import type { Metadata } from 'next';
import { ChartLineUp, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { readAppConfig } from '@/lib/config';
import { formatDay, todayIn } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { PROGRESS_MAX_SESSIONS } from '@/lib/progress';
import { loadProgress } from '@/lib/progress-data';
import { ClientHeader } from '../../client-header';
import { AchievementsCard } from './achievements-card';
import { ExerciseProgress } from './exercise-progress';
import { RecordsCard } from './records-card';
import { WeeklyProgress } from './weekly-progress';

export const metadata: Metadata = { title: 'İlerleme' };

/**
 * Danışanın İlerleme sekmesi (tasarım §0, §8 satır 10; SPEC §6, §7.6): üstte üç sayı (antrenman, seri,
 * rekor), hareket başına grafik (en ağır set, tahmini maksimum, toplam; seçici aranabilir), haftalık kas
 * yükü (kas haritası) ve toplam ağırlık, son rekorlar, başarılar. Veri `sessions-index.json` ve özetleri
 * önbellekli antrenman dosyalarından (`progress-data.ts`). Danışanın dilinde: "e1RM", "tonaj" yok.
 * Yalnız telefon, 375 px. Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ hareket?: string | string[] }> }) {
  const [client, config, params] = await Promise.all([currentClient(), readAppConfig(), searchParams]);
  const now = new Date();
  const today = todayIn(config.timeZone, now);
  const load = await loadProgress(client, now, today);
  const header = <ClientHeader client={client} appName={config.appName} title="İlerleme" />;

  if (load.status === 'error') {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>İlerleme açılamadı</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const view = load.view;
  if (view.workouts === 0) {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartLineUp weight="fill" />
            </EmptyMedia>
            <EmptyTitle>İlerlemen burada görünecek</EmptyTitle>
            <EmptyDescription>
              İlk antrenmanını bitirdiğinde her hareket için kaldırdığın ağırlığın grafiği, hangi kasları ne kadar çalıştırdığın,
              rekorların ve başarıların burada birikmeye başlar.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  const requested = typeof params.hareket === 'string' ? params.hareket : null;
  const stats = [
    { value: view.workouts, label: 'antrenman' },
    { value: view.streak.current, label: 'haftalık seri' },
    { value: view.records, label: 'rekor' },
  ];

  return (
    <main className="flex flex-col gap-6">
      {header}

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
          {view.firstDate ? <p className="text-center text-xs text-muted-foreground">İlk antrenmanın {formatDay(view.firstDate)}</p> : null}
        </CardContent>
      </Card>

      {view.skipped > 0 || view.truncated ? (
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
      ) : null}

      {view.exercises.length > 0 ? <ExerciseProgress exercises={view.exercises} initialKey={requested} today={today} /> : null}
      <WeeklyProgress weeks={view.weeks} />
      <RecordsCard items={view.recentRecords} total={view.records} today={today} />
      <AchievementsCard achievements={view.achievements} streak={view.streak} />
    </main>
  );
}
