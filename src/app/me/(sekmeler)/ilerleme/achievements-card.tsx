import { Barbell, Fire, FlagCheckered, Trophy } from '@phosphor-icons/react/dist/ssr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Achievement, AchievementId, Streak } from '@/lib/progress';
import { ACHIEVEMENT_TITLES, achievementDetail, streakText } from '@/lib/progress-text';
import { cn } from '@/lib/utils';

const ICONS: Record<AchievementId, typeof Trophy> = {
  first_workout: FlagCheckered,
  workouts_10: Barbell,
  workouts_25: Barbell,
  workouts_50: Barbell,
  streak_4: Fire,
  streak_12: Fire,
  first_record: Trophy,
};

/**
 * Başarılar (tasarım §0): az ve anlamlı — ilk antrenman; 10, 25, 50 antrenman; 4 ve 12 hafta üst üste
 * haftalık hedef; ilk rekor. Kazanılan dolu ikon ve günüyle, kazanılmayan soluk ve ilerlemesiyle
 * (durum renkle değil metinle de yazılır). Üstte haftalık seri.
 */
export function AchievementsCard({ achievements, streak }: { achievements: Achievement[]; streak: Streak }) {
  const earned = achievements.filter((item) => item.achievedOn).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-lg font-semibold">Başarılar</h2>
        </CardTitle>
        <CardDescription>
          {streakText(streak)}. {earned}/{achievements.length} başarı.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-2">
          {achievements.map((item) => {
            const Icon = ICONS[item.id];
            const done = Boolean(item.achievedOn);
            return (
              <li
                key={item.id}
                className={cn('flex min-h-20 flex-col gap-1.5 rounded-lg border p-3', done ? 'border-primary-strong/40 bg-primary-strong/5' : 'border-dashed')}>
                <span className="flex items-center gap-2">
                  <Icon weight={done ? 'fill' : 'regular'} className={cn('size-5 shrink-0', done ? 'text-primary-text' : 'text-muted-foreground')} aria-hidden />
                  <span className={cn('text-sm leading-tight font-medium', !done && 'text-muted-foreground')}>{ACHIEVEMENT_TITLES[item.id]}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  <span className="sr-only">{done ? 'Kazanıldı: ' : 'Henüz yok: '}</span>
                  {achievementDetail(item, streak.target)}
                </span>
                {!done && item.current > 0 && item.target > 1 ? (
                  <span className="mt-auto h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-primary-strong" style={{ width: `${Math.round((item.current / item.target) * 100)}%` }} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
