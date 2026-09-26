import type { Metadata } from 'next';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { AchievementsCard } from '@/components/progress/achievements-card';
import { ExerciseProgress } from '@/components/progress/exercise-progress';
import { AdherenceCard, EffortCard, PainCard, ReadinessCard, WaterCard, WeeklyLoadCard } from '@/components/progress/insight-charts';
import { ProgressEmpty, ProgressNotice, ProgressStats } from '@/components/progress/progress-summary';
import { RecordsCard } from '@/components/progress/records-card';
import { StrengthProgress } from '@/components/progress/strength-progress';
import { WeeklyProgress } from '@/components/progress/weekly-progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { defaultStrengthWindow, STRENGTH_WINDOWS, type StrengthWindow } from '@/lib/muscle-progress';
import { loadProgress } from '@/lib/progress-data';
import { LOW_READINESS } from '@/lib/session-check';
import { ClientHeader } from '../../client-header';

export const metadata: Metadata = { title: 'İlerleme' };

/**
 * Danışanın İlerleme sekmesi (tasarım §0, §8 satır 10; SPEC §6, §7.6): en üstte Gelişim (hangi kasında
 * güç kazandın: kas haritası, listeler, kasın hareketleri), üç sayı (antrenman, seri, rekor), hareket
 * başına grafik (en ağır set, tahmini maksimum, toplam; seçici aranabilir), grafikler (haftalık yük,
 * antrenman düzeni, haftalık kas yükü, onay varsa hazır oluşluk ve ağrı, zorluk, su), son rekorlar,
 * başarılar. Veri `sessions-index.json`, özetleri önbellekli antrenman dosyaları, `water.json` ve onay
 * varsa `health.json`'dan (`progress-data.ts`). Danışanın dilinde: "e1RM", "tonaj" yok. Yalnız telefon,
 * 375 px. Bölümler PT'nin danışan sayfasındaki İlerleme sekmesiyle ortak (`src/components/progress`,
 * `viewer="client"`). Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ hareket?: string | string[]; donem?: string | string[] }>;
}) {
  const [client, config, params] = await Promise.all([currentClient(), readAppConfig(), searchParams]);
  const now = new Date();
  const today = todayIn(config.timeZone, now);
  const load = await loadProgress(client, now, today, config.timeZone);
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

  const { view, insights } = load;
  if (view.workouts === 0) {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <ProgressEmpty viewer="client" />
      </main>
    );
  }

  const requested = typeof params.hareket === 'string' ? params.hareket : null;
  const period: StrengthWindow =
    typeof params.donem === 'string' && Object.hasOwn(STRENGTH_WINDOWS, params.donem)
      ? (params.donem as StrengthWindow)
      : defaultStrengthWindow(view.exercises, today);

  return (
    <main className="flex flex-col gap-6">
      {header}
      <ProgressNotice view={view} />
      <StrengthProgress viewer="client" exercises={view.exercises} today={today} initialWindow={period} circumference={insights.circumference} />
      <ProgressStats viewer="client" view={view} />
      {view.exercises.length > 0 ? <ExerciseProgress viewer="client" exercises={view.exercises} initialKey={requested} today={today} /> : null}
      <WeeklyLoadCard viewer="client" weeks={view.weeks} today={today} />
      <AdherenceCard viewer="client" adherence={insights.adherence} />
      <WeeklyProgress viewer="client" weeks={view.weeks} />
      <ReadinessCard viewer="client" readiness={insights.readiness} today={today} low={LOW_READINESS} />
      <PainCard viewer="client" pain={insights.pain} />
      <EffortCard viewer="client" rpe={insights.rpe} today={today} />
      <WaterCard viewer="client" water={insights.water} today={today} />
      <RecordsCard viewer="client" items={view.recentRecords} total={view.records} today={today} />
      <AchievementsCard viewer="client" achievements={view.achievements} streak={view.streak} />
    </main>
  );
}
