'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDayShort } from '@/lib/format';
import { todayState, todayStatusText, WEEKDAY_NAMES, WEEKDAY_SHORT, weekStrip, weekTarget, type StripDay } from '@/lib/training-days';
import { cn } from '@/lib/utils';
import type { WorkoutSchedule } from '@/lib/workout-plan';
import type { WorkoutResponse } from '@/lib/workout-routes';
import { ScheduleSheet } from './schedule-sheet';
import { useWorkoutOverview, useWorkoutProgram, WORKOUT_OVERVIEW_KEY } from './today-workout';
import { clearWorkoutCache, readWorkoutCache } from './workout-storage';

/**
 * Bugün kartının antrenman günleri parçaları (tasarım §2.1, §2.3, §2.11) — istemcide, `GET /api/me/workout`
 * yanıtından (`useWorkoutOverview`):
 * - üst satır: "Bugün antrenman günün · Gün B" ya da "Dinlenme günü · sıradaki antrenman Çarşamba (Gün B)";
 * - 7 günlük şerit (pazartesi başlar): seçili günler halkalı, yapılanlar dolu, kaçanlar soluk; altında
 *   "Günlerini değiştir";
 * - "Başka gün seç": gün sheet'i, antrenörüne bildirilir, sıra seçilen günden sürer;
 * - telefondaki gün planının tazeliği: sunucuda taze okunan programın damgası saklanan planınkinden
 *   farklıysa (PT programı değiştirdi) saklanan plan atılır, "Antrenmana başla" güncel planı açar.
 */

const BOTTOM = 'gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]';

/** Kartın üst satırı; gün seçilmemişse ya da yüklenirken "Sıradaki antrenman". */
export function DayStatus({ clientId, dayName }: { clientId: string; dayName: string }) {
  const { data } = useWorkoutOverview(clientId);
  if (!data?.schedule) return <>Sıradaki antrenman</>;
  const state = todayState({ today: data.today, weekdays: data.schedule.weekdays, doneToday: data.week.days.includes(data.today) });
  return <>{todayStatusText(state, data.today, dayName)}</>;
}

function dayLabel(day: StripDay): string {
  const parts = [WEEKDAY_NAMES[day.weekday], day.today ? 'bugün' : null, day.selected ? 'antrenman günü' : 'dinlenme günü', day.done ? 'antrenman yapıldı' : day.missed ? 'kaçırıldı' : null];
  return parts.filter(Boolean).join(', ');
}

/** Yedi günlük şerit ve "Günlerini değiştir". */
export function WeekStrip({ clientId }: { clientId: string }) {
  const { data, isPending } = useWorkoutOverview(clientId);
  const queryClient = useQueryClient();
  const program = useWorkoutProgram();
  const [open, setOpen] = useState(false);
  if (isPending && !data) return <Skeleton className="h-[6.25rem] w-full rounded-lg" />;
  if (!data?.schedule) return null;
  const schedule = data.schedule;
  // Program kurulmadan, günler değişmeden ya da danışan katılmadan önceki günler kaçmış sayılmaz (Genel bakış'la aynı kural).
  const strip = weekStrip({ today: data.today, weekdays: schedule.weekdays, doneDays: data.week.days, since: schedule.since });

  const saved = (next: WorkoutSchedule) => {
    // Hemen görünsün; sonra sunucudan taze (plan damgası değişti, telefondaki plan da yenilenir).
    queryClient.setQueryData<WorkoutResponse>([...WORKOUT_OVERVIEW_KEY, program ?? 'default'], (old) =>
      old ? { ...old, schedule: next, week: { ...old.week, target: weekTarget(next.weekdays, next.daysPerWeek ?? undefined) } } : old,
    );
    clearWorkoutCache(clientId);
    void queryClient.invalidateQueries({ queryKey: WORKOUT_OVERVIEW_KEY });
  };

  return (
    <div className="flex flex-col gap-1">
      <ol className="grid grid-cols-7 gap-1" aria-label="Bu haftanın günleri">
        {strip.map((day) => (
          <li key={day.date} className={cn('flex flex-col items-center gap-1.5 rounded-lg py-1.5', day.today && 'bg-muted')}>
            <span className="sr-only">{dayLabel(day)}</span>
            <span aria-hidden className={cn('text-xs', day.today ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {WEEKDAY_SHORT[day.weekday]}
            </span>
            <span
              aria-hidden
              className={cn(
                'flex size-7 items-center justify-center rounded-full',
                day.done && 'bg-primary text-primary-foreground',
                !day.done && day.selected && !day.missed && 'ring-2 ring-primary-text ring-inset',
                day.missed && 'opacity-40 ring-2 ring-muted-foreground ring-inset',
              )}>
              {day.done ? <Check weight="bold" className="size-3.5" /> : !day.selected ? <span className="size-1.5 rounded-full bg-muted-foreground/40" /> : null}
            </span>
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="h-11 self-center px-3 text-muted-foreground" onClick={() => setOpen(true)}>
        {schedule.weekdays.length > 0 ? 'Günlerini değiştir' : 'Antrenman günlerini seç'}
      </Button>
      <ScheduleSheet
        open={open}
        onOpenChange={setOpen}
        schedule={schedule}
        own={data.program?.source === 'own' && data.program.id ? { programId: data.program.id, name: data.program.name ?? '' } : null}
        onSaved={saved}
      />
    </div>
  );
}

/**
 * "Başka gün seç" (§2.3): bu evrenin günleri, sıradaki işaretli, ötekilerde son yapıldığı gün. Seçilen
 * günle antrenman başlar; sıradaki gün değilse antrenörüne bildirilir (`other_day`) ve sıra seçilen
 * günden sürer. Evrede tek gün varsa görünmez.
 */
export function OtherDayButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { data } = useWorkoutOverview(clientId);
  const program = useWorkoutProgram();
  const [open, setOpen] = useState(false);
  const days = data?.program?.days ?? [];
  const next = data?.program?.nextDayId ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  if (days.length < 2) return null;
  const selected = picked ?? next ?? days[0]?.id ?? '';
  return (
    <>
      <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={() => setOpen(true)}>
        Başka gün seç
      </Button>
      <Sheet open={open} onOpenChange={setOpen} onOpenChangeComplete={(isOpen) => (isOpen ? undefined : setPicked(null))}>
        <SheetContent side="bottom" showCloseButton={false} className={cn(BOTTOM, 'max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))]')}>
          <SheetHeader className="gap-1.5 pt-5">
            <SheetTitle id="other-day-title" className="text-lg font-semibold">
              Hangi günü yapacaksın?
            </SheetTitle>
            <SheetDescription>Antrenörüne bildirilir. Sıra seçtiğin günden devam eder.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
            <RadioGroup aria-labelledby="other-day-title" value={selected} onValueChange={(value) => setPicked(String(value))}>
              {days.map((day) => (
                <FieldLabel key={day.id} htmlFor={`other-day-${day.id}`}>
                  <Field orientation="horizontal" className="min-h-11">
                    <FieldContent>
                      <FieldTitle>{day.name}</FieldTitle>
                      <FieldDescription>
                        {day.id === next ? 'sıradaki' : day.lastDate ? `son: ${formatDayShort(day.lastDate)}` : 'henüz yapılmadı'}
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={day.id} id={`other-day-${day.id}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </div>
          <SheetFooter className="pt-4">
            <Button
              size="lg"
              className="h-14 w-full text-base"
              onClick={() => {
                setOpen(false);
                const query = [
                  ...(selected && selected !== next ? [`day=${encodeURIComponent(selected)}`] : []),
                  ...(program ? [`program=${encodeURIComponent(program)}`] : []),
                ].join('&');
                router.push(query ? `/me/antrenman?${query}` : '/me/antrenman');
              }}>
              Bu günle başla
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Telefondaki gün planı programın bu sürümüne mi ait: sunucuda taze okunan programın damgası saklanan
 * yanıtınkinden (ya da bellektekinden) farklıysa ikisi de atılır ve Bugün yeniden çeker; "Antrenmana
 * başla" eski planla açılmaz (PT o arada programı kaydetti, başka cihazda antrenman bitti).
 */
export function WorkoutFreshness({ clientId, stamp }: { clientId: string; stamp: string }) {
  const queryClient = useQueryClient();
  const program = useWorkoutProgram();
  useEffect(() => {
    const key = [...WORKOUT_OVERVIEW_KEY, program ?? 'default'];
    const cached = readWorkoutCache(clientId);
    const memory = queryClient.getQueryData<WorkoutResponse>(key);
    const stale = (data: WorkoutResponse | undefined) => Boolean(data?.program && data.program.stamp !== stamp);
    // Saklanan yanıt başka programınsa da (tek seferlik seçim) damga farklıdır: atılır, Bugün yeniden çeker.
    if (cached && (stale(cached.data) || !cached.data.program?.stamp)) clearWorkoutCache(clientId);
    if (stale(memory)) void queryClient.invalidateQueries({ queryKey: key });
  }, [clientId, stamp, program, queryClient]);
  return null;
}
