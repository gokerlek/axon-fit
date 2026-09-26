'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { Drop, Play } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatRecent, todayIn } from '@/lib/format';
import { DURATION, tween, WORKOUT } from '@/lib/motion';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import type { SessionDoc, WaterTap } from '@/lib/schemas/session';
import { waterOf, workingSetCount } from '@/lib/session-index';
import { randomId } from '@/lib/template-plan';
import { WATER_BATCH_MS, WATER_LIMITS } from '@/lib/water';
import { parseLocalWorkout } from '@/lib/workout-outbox';
import type { WorkoutDay } from '@/lib/workout-plan';
import type { WorkoutResponse } from '@/lib/workout-routes';
import { cursorOf } from '@/lib/workout-session';
import { localWorkoutText, readPendingWater, savePendingWater, saveWorkoutCache, subscribeLocalWorkout } from './workout-storage';

/**
 * Bugün'ün antrenman parçaları (tasarım §0, §2.1, §4.4) — istemcide:
 * - `GET /api/me/workout` bir kez çekilir ve telefonda saklanır: "Antrenmana başla" ağ beklemez.
 * - Yarım antrenman (telefonda ya da sunucuda) varsa sıradaki antrenman kartının yerine "Yarım kalan
 *   antrenman" kartı: "Kaldığın yerden devam et" ve "Antrenmanı bitir".
 * - "Bu hafta x/3" ve bugünkü su (+1): dokunuşlar 10 sn biriktirilip tek istekte `water.json`'a gider;
 *   gönderilene kadar telefonda durur. Günün toplamı = `water.json` + bitmiş antrenmanlar + yarım
 *   antrenmanın suyu (çift sayılmaz).
 */

const WORKOUT_KEY = ['me', 'workout'] as const;

export function useWorkoutOverview(clientId: string) {
  return useServiceQuery<WorkoutResponse>({
    key: WORKOUT_KEY,
    fn: async ({ signal }) => {
      const data = await fetchJson<WorkoutResponse>('/api/me/workout', { signal });
      saveWorkoutCache(clientId, data);
      return data;
    },
    // Bugün'ün sayıları olmasa da sayfa çalışır; hata bildirimi kartın kendisinde.
    notify: 'none',
  });
}

/** Telefondaki yarım antrenman (aynı ve öteki sekmelerdeki değişiklikleri izler). */
function useLocalWorkout(clientId: string) {
  const text = useSyncExternalStore(
    subscribeLocalWorkout,
    () => localWorkoutText(clientId),
    () => null,
  );
  return useMemo(() => parseLocalWorkout(text), [text]);
}

/** "Bu hafta 1/3" (sıklık yoksa "Bu hafta 1"); yüklenirken yer tutucu. */
export function WeekBadge({ clientId }: { clientId: string }) {
  const { data, isPending } = useWorkoutOverview(clientId);
  if (isPending) return <Skeleton className="h-5 w-20 rounded-full" />;
  if (!data) return null;
  const { done, target } = data.week;
  return (
    <Badge variant="secondary" className="tabular-nums">
      Bu hafta {target ? `${formatNumber(Math.min(done, target))}/${formatNumber(target)}` : formatNumber(done)}
    </Badge>
  );
}

type InProgress = { doc: SessionDoc; plan: WorkoutDay | null };

function ResumeCard({ progress, timeZone, clientWater }: { progress: InProgress; timeZone: string; clientWater: React.ReactNode }) {
  const { doc, plan } = progress;
  const counts = plan ? cursorOf(plan, doc).progress : null;
  const done = counts ? counts.doneSets : workingSetCount(doc);
  const lastAt = doc.entries.flatMap((entry) => entry.sets.map((set) => set.at)).sort().at(-1) ?? doc.startedAt;
  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Yarım kalan antrenman</CardDescription>
          <CardTitle className="text-xl tabular-nums">
            {doc.program?.dayName ?? 'Antrenman'} · {counts ? `${done}/${counts.plannedSets}` : done} set
          </CardTitle>
          <CardDescription>Kaldığın yerden sürer; kayıtların telefonunda saklı. Son kayıt {formatRecent(lastAt, timeZone)}.</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col items-stretch gap-2">
          <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href="/me/antrenman" />}>
            <Play data-icon="inline-start" weight="fill" />
            Kaldığın yerden devam et
          </Button>
          <Button variant="ghost" className="h-11 w-full text-muted-foreground" nativeButton={false} render={<Link href="/me/antrenman?bitir=1" />}>
            Antrenmanı bitir
          </Button>
        </CardFooter>
      </Card>
      {clientWater}
    </>
  );
}

/**
 * Bugün'ün ana kartı: yarım antrenman varsa onun kartı, yoksa sunucuda çizilen sıradaki antrenman
 * kartı (`children`; içinde su kartı da var). Sunucu HTML'i hep sıradaki antrenmanı çizer; telefondaki
 * yarım antrenman hidrasyondan sonra yerine geçer.
 */
export function TodayWorkout({ clientId, children }: { clientId: string; children: React.ReactNode }) {
  const local = useLocalWorkout(clientId);
  const { data } = useWorkoutOverview(clientId);
  const progress: InProgress | null = local
    ? { doc: local.doc, plan: local.plan }
    : data?.active
      ? { doc: data.active, plan: data.day && data.day.dayId === data.active.program?.dayId ? data.day : null }
      : null;
  if (!progress) return <>{children}</>;
  const timeZone = data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <ResumeCard progress={progress} timeZone={timeZone} clientWater={<WaterCard clientId={clientId} />} />;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Bugünkü su: "Su · bugün 3 bardak [+1]" (44 px); +1'den sonra 3 sn "Geri al". */
export function WaterCard({ clientId }: { clientId: string }) {
  const { data, isPending } = useWorkoutOverview(clientId);
  const local = useLocalWorkout(clientId);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<WaterTap[]>([]);
  const pendingRef = useRef<WaterTap[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const undoTimer = useRef<number | undefined>(undefined);
  const sending = useRef(false);
  const [undo, setUndo] = useState<string | null>(null);

  const update = useCallback(
    (next: WaterTap[]) => {
      pendingRef.current = next;
      setPending(next);
      savePendingWater(clientId, next);
    },
    [clientId],
  );

  const flush = useCallback(
    async (options: { keepalive?: boolean } = {}) => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const taps = pendingRef.current.slice(0, WATER_LIMITS.perRequest);
      if (taps.length === 0) return;
      const body = JSON.stringify({ taps });
      if (options.keepalive) {
        // Sayfa kapanıyor: sonucu beklenmez; dokunuşlar telefonda kalır, açılışta yeniden gider (kimlikle birleşir).
        void fetch('/api/me/water', { method: 'POST', headers: JSON_HEADERS, body, keepalive: true }).catch(() => undefined);
        return;
      }
      if (sending.current) return;
      sending.current = true;
      try {
        const result = await fetchJson<{ file: number }>('/api/me/water', { method: 'POST', body });
        const sent = new Set(taps.map((tap) => tap.id));
        update(pendingRef.current.filter((tap) => !sent.has(tap.id)));
        queryClient.setQueryData<WorkoutResponse>(WORKOUT_KEY, (old) => (old ? { ...old, water: { ...old.water, file: result.file } } : old));
      } catch {
        // Telefonda kalır: sonraki dokunuşta, bağlantı gelince ya da sonraki açılışta gider.
      } finally {
        sending.current = false;
      }
    },
    [queryClient, update],
  );

  useEffect(() => {
    const stored = readPendingWater(clientId);
    pendingRef.current = stored;
    setPending(stored);
    if (stored.length > 0) void flush();
    const onOnline = () => void flush();
    const onPageHide = () => void flush({ keepalive: true });
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      window.clearTimeout(undoTimer.current);
      // Sekme değişimi (uygulama içi gezinme): sayfa yaşıyor, istek tamamlanır.
      void flush();
    };
  }, [clientId, flush]);

  const tap = (d: 1 | -1) => {
    const entry: WaterTap = { id: randomId('wt', 8, new Set(pendingRef.current.map((item) => item.id))), d, at: new Date().toISOString() };
    update([...pendingRef.current, entry]);
    if (timer.current === undefined) timer.current = window.setTimeout(() => void flush(), WATER_BATCH_MS);
    return entry;
  };

  const add = () => {
    const entry = tap(1);
    try {
      navigator.vibrate?.(10);
    } catch {
      // iOS'ta yok.
    }
    setUndo(entry.id);
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), WORKOUT.waterUndoMs);
  };

  const revert = () => {
    const id = undo;
    setUndo(null);
    window.clearTimeout(undoTimer.current);
    if (!id) return;
    // Henüz gönderilmediyse dokunuş düşer; gönderildiyse "Geri al" bir −1 dokunuşudur.
    if (pendingRef.current.some((item) => item.id === id)) update(pendingRef.current.filter((item) => item.id !== id));
    else tap(-1);
  };

  const today = data?.today ?? todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const active = local?.doc ?? data?.active ?? null;
  const activeWater = active && active.date === today ? waterOf(active) : 0;
  const total = Math.max(0, (data?.water.file ?? 0) + (data?.water.sessions ?? 0) + activeWater + pending.reduce((sum, item) => sum + item.d, 0));

  return (
    <Card size="sm" className="flex-row items-center gap-3 py-1 pr-1 pl-4">
      <Drop className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm">
        Su · bugün{' '}
        {isPending && !data ? (
          <span aria-hidden className="inline-block h-4 w-4 animate-pulse rounded-md bg-muted align-middle" />
        ) : (
          <motion.b key={total} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={tween(DURATION.fast)} className="inline-block font-semibold tabular-nums">
            {formatNumber(total)}
          </motion.b>
        )}{' '}
        bardak
      </p>
      <AnimatePresence initial={false}>
        {undo ? (
          <motion.div key="undo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(DURATION.fast)}>
            <Button variant="ghost" className="h-11 px-3 text-[0.8125rem]" onClick={revert}>
              +1 · Geri al
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Button variant="secondary" className="h-11 min-w-14 text-base" onClick={add} aria-label="Bir bardak su ekle">
        +1
      </Button>
    </Card>
  );
}
