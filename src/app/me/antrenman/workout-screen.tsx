'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowClockwise, Barbell, CaretLeft, CheckCircle, CloudSlash, Drop, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKg } from '@/lib/format';
import { DURATION, EASE, tween, WORKOUT } from '@/lib/motion';
import { EFFORT_LABELS } from '@/lib/progression';
import { ApiError, fetchJson } from '@/lib/query/errors';
import type { SessionDoc } from '@/lib/schemas/session';
import { waterOf } from '@/lib/session-index';
import { cn } from '@/lib/utils';
import { groupView, nextMemberLetter } from '@/lib/workout-groups';
import { createLocalWorkout, setsMissingOn, unsentSets, withChange, type LocalWorkout } from '@/lib/workout-outbox';
import { acknowledgeRest, adjustRest, alarmPending, LATE_MS, startRest, tickRest, type RestEvent, type RestTimer } from '@/lib/workout-rest';
import type { WorkoutResponse } from '@/lib/workout-routes';
import {
  addWaterTap,
  afterLog,
  cursorOf,
  deleteSet,
  easyShortcut,
  editSet,
  effortQuestions,
  elapsedText,
  findSet,
  logSet,
  logWarmup,
  newSessionDoc,
  nextSet,
  nextText,
  overloadState,
  setEntryEffort,
  setSetEffort,
  setSetupNote,
  setupNoteOf,
  setValueText,
  setViews,
  unlogWarmup,
  warmupViews,
  workoutSummary,
  type EffortChoice,
  type EffortQuestion,
  type NextSet,
} from '@/lib/workout-session';
import { startSetTimer, stopSetTimer, tickSetTimer } from '@/lib/workout-timer';
import { clearLocalWorkout, clearWorkoutCache, readLocalWorkout, readWorkoutCache, saveLocalWorkout, saveWorkoutCache, writerId } from '../workout-storage';
import { EntryPanel, type TimerView, type TransitionView } from './entry-panel';
import { ExerciseCard } from './exercise-card';
import { RestPanel, RestStrip, type EffortPromptView, type RestView } from './rest-panel';
import { useWorkoutOutbox } from './use-workout-outbox';
import { beep, isIOS, unlockAudio, useWakeLock, vibrate } from './workout-feedback';
import { DeleteSetDialog, EditSetSheet, FinishedElsewhereDialog, FinishSheet, type EditTarget, type EditValues } from './workout-sheets';

/** Bugün'de çekilen plan bu kadar tazeyse başlangıç ağ beklemez. */
const CACHE_FRESH_MS = 5 * 60_000;
/** Hareket bitince: eski kart çıkar, yenisi gelir; dinlenme onun üstünde açılır (tasarım §2.4, prototip). */
const NEXT_SLIDE_MS = 260;
const NEXT_REST_MS = 700;

type LoadState = { phase: 'loading' } | { phase: 'ready' } | { phase: 'empty'; problem?: string | undefined } | { phase: 'error'; message: string };

/** Az önce kaydedilen set: panel değişene kadar gösterilir. */
type Saving = { next: NextSet };

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function stampOf(local: LocalWorkout) {
  return { at: new Date().toISOString(), by: local.doc.writer };
}

/** Sorulardan panelin görünümü: ilk cevapsız soru; hepsi cevaplandıysa teşekkür. Soru yoksa null. */
function promptOf(questions: readonly EffortQuestion[]): EffortPromptView | null {
  if (questions.length === 0) return null;
  const question = questions.find((item) => item.answer === undefined) ?? null;
  return { question, answered: question === null };
}

/** Belgedeki en son kaydedilen çalışma seti (bitiş sorusunun konusu). */
function lastWorkingSetId(doc: SessionDoc): string | null {
  let best: { id: string; at: number } | null = null;
  for (const entry of doc.entries) {
    for (const set of entry.sets) {
      const at = Date.parse(set.at);
      if (set.type === 'working' && (!best || at >= best.at)) best = { id: set.id, at };
    }
  }
  return best?.id ?? null;
}

/**
 * Etkin antrenman (tasarım §2.4, §2.5, §4.3, §4.4): tam ekran, dock yok. Kaynak telefondur: belge,
 * gönderim kuyruğu, dinlenme ve taslak `localStorage`'da (`workout-outbox.ts`); yenileme ya da çökme
 * bir şey kaybettirmez, kaldığı yerden sürer.
 *
 * Başlangıç ağ beklemez: Bugün'de çekilen plan tazeyse o, değilse `GET /api/me/workout`; çevrimdışıysa
 * son okunan plan. Telefonda yarım antrenman varsa o; yoksa sunucudaki yarım antrenman; o da yoksa yeni
 * belge (dosya ilk setle oluşur).
 *
 * "Set bitti": önce ✓ satıra düşer ve düğme "Kaydedildi" der; 220 ms sonra panel dinlenmeye döner.
 * Hareket bittiyse kart sola çıkar, sıradaki sağdan gelir, dinlenme onun üstünde açılır; son setten sonra
 * bitirme sorusu. Alt panel her durum değişiminden sonra 400 ms dokunuş almaz (`WORKOUT.tapGuardMs`):
 * emin olmak için ikinci kez basmak ikinci bir set yazmaz.
 *
 * Set türleri ve gruplar (§2.4, §2.5): grupta tur `setSlots` sırasıyla yürür; üyeler arasında dinlenme
 * yok (kart 12 px kayar, düğme "Set bitti → B"), devrede istasyon geçişi panelde ince çubuk, tur sonunda
 * blok dinlenmesi. Süreli sette "Başlat ▶ / Bitir ■" sayacı; ısınma satırdaki ✓; aşırı yük hareket
 * başına bir kez onaylanır. Zorluk hareketin son setinden sonra bir kez; AMRAP'ta "Kaç tekrar yaptın?".
 * Zorluk, ısınma, ayar notu ve AMRAP düzeltmesi kendi başına gönderilmez, sonraki set yazımına biner.
 */
export function WorkoutScreen({ clientId, dayParam, finishOnOpen }: { clientId: string; dayParam: string | null; finishOnOpen: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [local, setLocal] = useState<LocalWorkout | null>(null);
  const localRef = useRef<LocalWorkout | null>(null);
  const storageWarned = useRef(false);

  const [saving, setSaving] = useState<Saving | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [restView, setRestView] = useState<RestView | null>(null);
  const [transition, setTransition] = useState<TransitionView | null>(null);
  const [timerView, setTimerView] = useState<TimerView | null>(null);
  const [undoWater, setUndoWater] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<(EditTarget & { text: string }) | null>(null);
  const [elsewhere, setElsewhere] = useState<{ server: SessionDoc; count: number } | null>(null);
  const [elsewhereBusy, setElsewhereBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const guardUntil = useRef(0);
  const timers = useRef<number[]>([]);
  const waterTimer = useRef<number | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const now = useNow(1000);
  const wakeHeld = useWakeLock(load.phase === 'ready');

  /* --- kayıt --- */

  const commit = useCallback(
    (next: LocalWorkout) => {
      localRef.current = next;
      setLocal(next);
      if (!saveLocalWorkout(clientId, next) && !storageWarned.current) {
        storageWarned.current = true;
        toast.warning('Bu tarayıcıda yedeklenemiyor; sekmeyi kapatma.');
      }
    },
    [clientId],
  );

  const leave = useCallback(
    (message: string, kind: 'success' | 'info' = 'success') => {
      localRef.current = null;
      clearLocalWorkout(clientId);
      clearWorkoutCache(clientId);
      void queryClient.invalidateQueries({ queryKey: ['me', 'workout'] });
      router.replace('/me');
      if (kind === 'success') toast.success(message);
      else toast(message);
    },
    [clientId, queryClient, router],
  );

  const { outbox, problem, online } = useWorkoutOutbox({
    localRef,
    commit,
    onGone: () => leave('Bu antrenman silinmiş.', 'info'),
    onFinishedElsewhere: (server) => {
      const current = localRef.current;
      const count = current ? setsMissingOn(current.doc, server) : 0;
      if (count === 0) leave('Bu antrenman başka bir cihazda bitirildi.', 'info');
      else setElsewhere({ server, count });
    },
  });

  /* --- yardımcılar --- */

  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  }, []);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
      window.clearTimeout(waterTimer.current);
    },
    [],
  );

  /** Alt panelin dokunuş kilidi: durum değişiminden sonra dokunuş yutulur, alttaki öğeye geçmez. */
  const guard = useCallback((ms: number = WORKOUT.tapGuardMs) => {
    guardUntil.current = Math.max(guardUntil.current, performance.now() + ms);
  }, []);
  const swallow = useCallback((event: React.SyntheticEvent) => {
    if (performance.now() < guardUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  /** Tek `aria-live` bölgesi: aynı metin art arda da okunsun diye önce boşaltılır. */
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    window.requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const focusLater = useCallback((id: string, ms: number) => later(ms, () => document.getElementById(id)?.focus({ preventScroll: true })), [later]);

  /* --- açılış: telefondaki antrenman → taze plan → sunucu → son okunan plan --- */

  useEffect(() => {
    let cancelled = false;
    const adopt = (next: LocalWorkout) => {
      commit(next);
      setLoad({ phase: 'ready' });
      if (finishOnOpen) setFinishOpen(true);
      outbox.schedule();
    };
    const begin = (data: WorkoutResponse) => {
      if (data.active && data.day) return adopt(createLocalWorkout(data.active, data.day, data.active));
      if (!data.day) return setLoad({ phase: 'empty', problem: data.problem });
      const doc = newSessionDoc(data.day, { today: data.today, now: new Date(), writer: writerId() });
      adopt(createLocalWorkout(doc, data.day));
    };

    const existing = readLocalWorkout(clientId);
    if (existing) {
      adopt(existing);
      return;
    }
    const cached = readWorkoutCache(clientId);
    const usable = cached && (!dayParam || cached.data.day?.dayId === dayParam) ? cached : null;
    if (usable && Date.now() - usable.at < CACHE_FRESH_MS) {
      begin(usable.data);
      return;
    }
    fetchJson<WorkoutResponse>(`/api/me/workout${dayParam ? `?day=${encodeURIComponent(dayParam)}` : ''}`)
      .then((data) => {
        if (cancelled) return;
        saveWorkoutCache(clientId, data);
        begin(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Çevrimdışı: son okunan planla başlanır.
        if (usable) begin(usable.data);
        else setLoad({ phase: 'error', message: error instanceof ApiError ? error.message : 'Antrenman açılamadı.' });
      });
    return () => {
      cancelled = true;
    };
    // `finishOnOpen` ve `outbox` açılışta bir kez okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dayParam, attempt]);

  // Ses bağlamı ilk dokunuşta açılır: sayfa dinlenmenin ortasında yenilendiyse de bitiş çalsın.
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock, { capture: true, once: true });
    return () => document.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  // Toast'lar alt panelin üstünde çıksın (telefonda bildirimler altta, `ui/sonner.tsx`).
  useEffect(() => {
    const element = bottomRef.current;
    if (!element) return;
    const style = document.documentElement.style;
    const observer = new ResizeObserver(() => style.setProperty('--dock-clearance', `${element.offsetHeight + 8}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      style.removeProperty('--dock-clearance');
    };
  }, [load.phase]);

  /* --- dinlenme sayacı: kare kare, zaman damgasından --- */

  const restKey = local?.rest ? `${local.rest.setId}@${local.rest.startedAt}` : null;
  const handleRestEvents = useCallback(
    (events: RestEvent[]) => {
      for (const event of events) {
        if (event === 'warn') {
          beep(1, 660);
          announce('10 saniye kaldı');
        } else {
          beep(3);
          vibrate([80, 60, 80]);
          if (event === 'end') {
            announce('Dinlenme bitti. Hazırsın.');
            guard();
          }
        }
      }
    },
    [announce, guard],
  );

  useEffect(() => {
    if (!restKey) {
      setRestView(null);
      return;
    }
    let frame = 0;
    let shown = '';
    const loop = () => {
      const current = localRef.current;
      if (!current?.rest) return;
      const tick = tickRest(current.rest, Date.now());
      if (tick.events.length > 0) handleRestEvents(tick.events);
      if (tick.timer !== current.rest) commit({ ...current, rest: tick.timer });
      const seconds = tick.state === 'ended' ? Math.floor(tick.overrunMs / 1000) : Math.ceil(tick.remainingMs / 1000);
      const pending = alarmPending(tick.timer);
      const key = `${tick.state}:${seconds}:${pending}`;
      if (key !== shown) {
        shown = key;
        setRestView({ state: tick.state, seconds, alarmPending: pending });
      }
      frame = window.requestAnimationFrame(loop);
    };
    loop();
    return () => window.cancelAnimationFrame(frame);
  }, [restKey, commit, handleRestEvents]);

  /* --- süreli set sayacı ve devrenin istasyon geçişi: zaman damgasından --- */

  const timerKey = local?.timer ? `${local.timer.rowId}#${local.timer.setIndex}@${local.timer.startedAt}` : null;
  useEffect(() => {
    if (!timerKey) {
      setTimerView(null);
      return;
    }
    let frame = 0;
    let shown = '';
    const loop = () => {
      const current = localRef.current;
      if (!current?.timer) return;
      const tick = tickSetTimer(current.timer, Date.now());
      if (tick.events.length > 0) {
        beep(1, 990);
        vibrate(20);
        announce('Hedefe ulaştın');
      }
      if (tick.timer !== current.timer) commit({ ...current, timer: tick.timer });
      const key = `${tick.seconds}:${tick.phase}`;
      if (key !== shown) {
        shown = key;
        setTimerView({ seconds: tick.seconds, toMin: tick.toMin, fraction: tick.fraction, phase: tick.phase });
      }
      frame = window.requestAnimationFrame(loop);
    };
    loop();
    return () => window.cancelAnimationFrame(frame);
  }, [timerKey, commit, announce]);

  // Geçiş bitince tek kısa bip (geç fark edildiyse sessiz); tam dinlenme değil, alarm yok.
  useEffect(() => {
    if (!transition) return;
    const id = window.setTimeout(() => {
      setTransition(null);
      if (Date.now() - transition.endsAt <= LATE_MS) beep(1, 660);
    }, Math.max(0, transition.endsAt - Date.now()));
    return () => window.clearTimeout(id);
  }, [transition]);

  const updateRest = useCallback(
    (change: (rest: RestTimer) => RestTimer | null) => {
      const current = localRef.current;
      if (!current?.rest) return;
      commit({ ...current, rest: change(current.rest) });
    },
    [commit],
  );

  const openRest = useCallback(
    (setId: string, seconds: number) => {
      const current = localRef.current;
      if (!current) return;
      commit({ ...current, rest: startRest(setId, seconds, Date.now()), restCount: current.restCount + 1 });
      guard();
      focusLater('rest-title', DURATION.base);
    },
    [commit, guard, focusLater],
  );

  const endRest = useCallback(() => {
    updateRest(() => null);
    guard();
    focusLater('set-done', DURATION.fast);
  }, [updateRest, guard, focusLater]);

  /* --- görünüm --- */

  const view = useMemo(() => {
    if (!local) return null;
    const { plan, doc } = local;
    const cursor = cursorOf(plan, doc);
    const next = nextSet(plan, doc, local.draft);
    // Kaydedilirken kart ve panel az önce kaydedilen seti gösterir (✓ önce satırda), sonra sıradakine geçer.
    const focus = saving?.next ?? next;
    const unitKey = focus?.unitKey ?? null;
    const unit = unitKey ? cursor.units.find((item) => item.key === unitKey) : undefined;
    const rowId = focus?.rowId ?? unit?.members.at(-1)?.rowId ?? null;
    const row = rowId ? (plan.rows[rowId] ?? null) : null;
    return {
      plan,
      doc,
      cursor,
      next,
      unitKey,
      row,
      sets: row ? setViews(plan, doc, row.rowId) : [],
      group: unitKey ? groupView(plan, doc, unitKey, focus) : null,
      warmups: row ? warmupViews(plan, doc, row.rowId) : [],
      setupNote: row ? setupNoteOf(plan, doc, row.rowId) : undefined,
    };
  }, [local, saving]);

  /* --- işler --- */

  /** "Set bitti" (süreli sette "Bitir ■": geçen saniye). */
  const onDone = useCallback(
    (seconds?: number) => {
      const current = localRef.current;
      if (!current || saving) return;
      const next = nextSet(current.plan, current.doc, current.draft);
      if (!next) return;
      unlockAudio();
      const row = current.plan.rows[next.rowId];
      const value = seconds ?? next.value;
      // Aşırı yük: "Onayla · Set bitti" (ilk kez) ya da bu harekette zaten onaylanmış.
      const overload = overloadState(current.plan, current.doc, next, next.kg) !== 'none';
      const { doc, setId } = logSet(current.plan, current.doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value, overload, stamp: stampOf(current) });
      const after = afterLog(current.plan, current.doc, doc);
      commit(withChange({ ...current, draft: null, rest: null, timer: null }, doc, { send: true }));
      outbox.schedule();
      setTransition(null);
      setFresh(setId);
      setSaving({ next: { ...next, value } });
      vibrate(10);
      const logged = findSet(doc, setId)?.set;
      announce(`Set ${next.position + 1} kaydedildi${logged ? `: ${setValueText(logged)}` : ''}`);

      if (after.kind === 'member') {
        // Grupta turun sıradaki üyesi: dinlenme yok; kart 12 px kayar, devrede istasyon geçişi sayar.
        const following = nextSet(current.plan, doc);
        guard(DURATION.base + WORKOUT.tapGuardMs);
        later(DURATION.base, () => {
          setSaving(null);
          guard();
          if (after.transitionSeconds > 0) setTransition({ endsAt: Date.now() + after.transitionSeconds * 1000, total: after.transitionSeconds });
          const title = following ? current.plan.rows[following.rowId]?.title : undefined;
          if (title) announce(`Sıradaki: ${title}`);
        });
      } else if (after.kind === 'same') {
        guard(DURATION.base + WORKOUT.tapGuardMs);
        later(DURATION.base, () => {
          setSaving(null);
          if (after.restSeconds > 0) openRest(setId, after.restSeconds);
          else guard();
        });
      } else if (after.kind === 'next') {
        const following = nextSet(current.plan, doc);
        // Grupta bütün üyeler: "Romanian Deadlift ve Şınav tamamlandı."
        const unit = cursorOf(current.plan, doc).units.find((item) => item.key === next.unitKey);
        const names = unit?.members.flatMap((member) => (member.rowId && current.plan.rows[member.rowId] ? [current.plan.rows[member.rowId]?.title ?? ''] : [])) ?? [];
        const done = names.length > 0 ? names.join(' ve ') : (row?.title ?? 'Hareket');
        guard(NEXT_REST_MS + WORKOUT.tapGuardMs);
        later(NEXT_SLIDE_MS, () => {
          setSaving(null);
          vibrate(20);
          const title = following ? current.plan.rows[following.rowId]?.title : undefined;
          announce(`${done} tamamlandı.${title ? ` Sıradaki: ${title}.` : ''}`);
          if (after.restSeconds <= 0) focusLater('exercise-title', DURATION.base);
        });
        later(NEXT_REST_MS, () => {
          if (after.restSeconds > 0) openRest(setId, after.restSeconds);
          else guard();
        });
      } else {
        guard(DURATION.slow + 50 + WORKOUT.tapGuardMs);
        later(DURATION.slow + 50, () => {
          setSaving(null);
          setFinishOpen(true);
        });
      }
    },
    [saving, commit, outbox, announce, guard, later, openRest, focusLater],
  );

  const onStartTimer = useCallback(() => {
    const current = localRef.current;
    if (!current || saving) return;
    const next = nextSet(current.plan, current.doc, current.draft);
    if (!next) return;
    unlockAudio();
    // Sayaç başlarsa set başlamıştır: küçültülmüş dinlenme biter.
    commit({ ...current, rest: null, timer: startSetTimer({ rowId: next.rowId, setIndex: next.setIndex, target: next.target }, Date.now()) });
    guard();
    announce('Sayaç başladı');
  }, [saving, commit, guard, announce]);

  const onStopTimer = useCallback(() => {
    const timer = localRef.current?.timer;
    if (timer) onDone(stopSetTimer(timer, Date.now()));
  }, [onDone]);

  const onCancelTimer = useCallback(() => {
    const current = localRef.current;
    if (!current?.timer) return;
    commit({ ...current, timer: null });
    guard();
    announce('Sayaç durdu');
  }, [commit, guard, announce]);

  /** Aşırı yük uyarısında "Düzelt": ağırlık planınkine döner. */
  const onResetKg = useCallback(() => {
    const current = localRef.current;
    if (!current) return;
    const next = nextSet(current.plan, current.doc, current.draft);
    if (!next) return;
    commit({ ...current, draft: { rowId: next.rowId, setIndex: next.setIndex, kg: next.plannedKg, value: next.value } });
    guard();
    announce(`Ağırlık ${formatKg(next.plannedKg)}`);
  }, [commit, guard, announce]);

  const onToggleWarmup = useCallback(
    (rowId: string, index: number, done: boolean) => {
      const current = localRef.current;
      if (!current) return;
      const stamp = stampOf(current);
      const doc = done ? logWarmup(current.plan, current.doc, { rowId, index, stamp }) : unlogWarmup(current.plan, current.doc, { rowId, index, stamp });
      if (doc === current.doc) return;
      commit(withChange(current, doc, { send: false }));
      vibrate(10);
      announce(done ? `Isınma ${index + 1} yapıldı` : `Isınma ${index + 1} geri alındı`);
    },
    [commit, announce],
  );

  const onSetupNote = useCallback(
    (rowId: string, text: string) => {
      const current = localRef.current;
      if (!current) return;
      const doc = setSetupNote(current.plan, current.doc, { rowId, note: text, stamp: stampOf(current) });
      if (doc === current.doc) return;
      commit(withChange(current, doc, { send: false }));
      announce(text.trim() ? 'Ayar notu kaydedildi' : 'Ayar notu silindi');
    },
    [commit, announce],
  );

  /** "<Hareket> nasıldı?": cevap o hareketin (AMRAP olmayan) bütün çalışma setlerine. */
  const onEffort = useCallback(
    (entryId: string, effort: EffortChoice) => {
      const current = localRef.current;
      if (!current) return;
      const doc = setEntryEffort(current.doc, entryId, effort, stampOf(current));
      commit(withChange(current.rest ? { ...current, rest: acknowledgeRest(current.rest) } : current, doc, { send: false }));
      const title = doc.entries.find((entry) => entry.id === entryId)?.title;
      announce(`${title ?? 'Hareket'}: ${EFFORT_LABELS[effort]}`);
    },
    [commit, announce],
  );

  /** "Kolaydı · sonraki set X kg": o sete "Kolay", sonraki set bir adım (yeniden dokunmak geri alır). */
  const onEasy = useCallback(() => {
    const current = localRef.current;
    if (!current?.rest) return;
    const shortcut = easyShortcut(current.plan, current.doc, current.rest.setId);
    if (!shortcut) return;
    const doc = setSetEffort(current.doc, current.rest.setId, shortcut.taken ? undefined : 'easy', stampOf(current));
    commit(withChange({ ...current, draft: null, rest: acknowledgeRest(current.rest) }, doc, { send: false }));
    const kg = nextSet(current.plan, doc)?.kg;
    announce(kg !== undefined ? `Sonraki set ${formatKg(kg)}` : 'Kaydedildi');
  }, [commit, announce]);

  /** AMRAP'ta set bittikten sonra "Kaç tekrar yaptın?". */
  const onAmrapReps = useCallback(
    (setId: string, reps: number) => {
      const current = localRef.current;
      const found = current ? findSet(current.doc, setId) : null;
      if (!current || !found) return;
      const doc = editSet(current.doc, setId, { kg: found.set.kg, value: reps }, stampOf(current));
      commit(withChange(current.rest ? { ...current, rest: acknowledgeRest(current.rest) } : current, doc, { send: false }));
    },
    [commit],
  );

  const onDraft = useCallback(
    (values: { kg?: number | undefined; value?: number | undefined }) => {
      const current = localRef.current;
      if (!current || saving) return;
      const next = nextSet(current.plan, current.doc, current.draft);
      if (!next) return;
      commit({ ...current, draft: { rowId: next.rowId, setIndex: next.setIndex, kg: values.kg ?? next.kg, value: values.value ?? next.value } });
    },
    [commit, saving],
  );

  const onWater = useCallback(() => {
    const current = localRef.current;
    if (!current) return;
    const { doc } = addWaterTap(current.doc, 1, stampOf(current));
    commit(withChange(current.rest ? { ...current, rest: acknowledgeRest(current.rest) } : current, doc, { send: false }));
    vibrate(10);
    announce(`Su: ${waterOf(doc)} bardak`);
    setUndoWater(true);
    window.clearTimeout(waterTimer.current);
    waterTimer.current = window.setTimeout(() => setUndoWater(false), WORKOUT.waterUndoMs);
  }, [commit, announce]);

  const onUndoWater = useCallback(() => {
    const current = localRef.current;
    if (!current) return;
    const { doc } = addWaterTap(current.doc, -1, stampOf(current));
    commit(withChange(current, doc, { send: false }));
    window.clearTimeout(waterTimer.current);
    setUndoWater(false);
    announce(`Su: ${waterOf(doc)} bardak`);
  }, [commit, announce]);

  const openEdit = useCallback((setId: string) => {
    const current = localRef.current;
    if (!current) return;
    const found = findSet(current.doc, setId);
    const rowId = found?.entry.rowId;
    const row = rowId ? current.plan.rows[rowId] : undefined;
    if (!found || !row || !rowId) return;
    const position = setViews(current.plan, current.doc, rowId).find((item) => item.logged?.id === setId)?.position ?? 0;
    const sent = current.acked?.entries.some((entry) => entry.sets.some((set) => set.id === setId)) ?? false;
    setEditing({
      setId,
      title: row.title,
      position,
      trackingType: row.trackingType,
      spec: row.spec,
      kg: found.set.kg,
      value: found.set.reps ?? found.set.seconds ?? 0,
      effort: found.set.target?.amrap ? null : found.set.effort,
      sent,
    });
  }, []);

  const onSaveEdit = useCallback(
    (values: EditValues) => {
      const current = localRef.current;
      if (!current || !editing) return;
      const stamp = stampOf(current);
      let doc = editSet(current.doc, editing.setId, values, stamp);
      if ('effort' in values) doc = setSetEffort(doc, editing.setId, values.effort, stamp);
      commit(withChange(current, doc, { send: true }));
      outbox.schedule();
      setEditing(null);
      toast.success('Set düzeltildi');
    },
    [commit, editing, outbox],
  );

  const onAskDelete = useCallback(() => {
    const current = localRef.current;
    if (!current || !editing) return;
    const set = findSet(current.doc, editing.setId)?.set;
    setDeleting({ ...editing, text: `${editing.title} · Set ${editing.position + 1}${set ? ` · ${setValueText(set)}` : ''}` });
    setEditing(null);
  }, [editing]);

  const onConfirmDelete = useCallback(() => {
    const current = localRef.current;
    if (!current || !deleting) return;
    const doc = deleteSet(current.plan, current.doc, deleting.setId, stampOf(current));
    const rest = current.rest?.setId === deleting.setId ? null : current.rest;
    commit(withChange({ ...current, rest, draft: null }, doc, { send: true }));
    outbox.schedule();
    setDeleting(null);
    announce('Set silindi');
    guard();
  }, [commit, deleting, outbox, announce, guard]);

  const onFinish = useCallback(async () => {
    const current = localRef.current;
    if (!current) return;
    setFinishing(true);
    outbox.stop();
    const doc: SessionDoc = { ...current.doc, status: 'finished', finishedAt: new Date().toISOString() };
    try {
      await fetchJson(`/api/me/sessions/${current.doc.id}/finish`, { method: 'POST', body: JSON.stringify({ doc }) });
      leave('Antrenman kaydedildi. Antrenörün görecek.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        leave('Bu antrenman silinmiş.', 'info');
        return;
      }
      outbox.resume();
      setFinishing(false);
      toast.error(
        error instanceof ApiError && error.status === 0
          ? 'Bağlantı yok; antrenmanın bu telefonda duruyor. Bağlantı gelince yeniden bitir.'
          : error instanceof ApiError
            ? error.message
            : 'Antrenman bitirilemedi. Biraz sonra tekrar dene.',
      );
    }
  }, [outbox, leave]);

  const onCancelWorkout = useCallback(async () => {
    const current = localRef.current;
    if (!current) return;
    setFinishing(true);
    outbox.stop();
    // Dosya yazıldıysa (setler sonradan silindi) iz dosyasına döner; yazılmadıysa silinecek bir şey yok.
    if (current.acked) {
      try {
        await fetchJson(`/api/me/sessions/${current.doc.id}`, { method: 'DELETE' });
      } catch (error) {
        outbox.resume();
        setFinishing(false);
        toast.error(error instanceof ApiError ? error.message : 'Antrenman iptal edilemedi.');
        return;
      }
    }
    leave('Antrenman iptal edildi.', 'info');
  }, [outbox, leave]);

  const onAddElsewhere = useCallback(async () => {
    const current = localRef.current;
    if (!current || !elsewhere) return;
    setElsewhereBusy(true);
    try {
      await fetchJson(`/api/me/sessions/${current.doc.id}`, { method: 'PATCH', body: JSON.stringify({ writer: current.doc.writer, addSets: current.doc.entries }) });
      leave('Setler eklendi.');
    } catch (error) {
      setElsewhereBusy(false);
      toast.error(error instanceof ApiError ? error.message : 'Setler eklenemedi.');
    }
  }, [elsewhere, leave]);

  /* --- çizim --- */

  if (load.phase === 'loading') return <WorkoutSkeleton />;
  if (load.phase === 'error' || load.phase === 'empty' || !view || !local) {
    const error = load.phase === 'error';
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{error ? <WarningCircle weight="fill" /> : <Barbell weight="fill" />}</EmptyMedia>
            <EmptyTitle>{error ? 'Antrenman açılamadı' : 'Henüz program yok'}</EmptyTitle>
            <EmptyDescription>
              {error
                ? load.message
                : load.phase === 'empty' && load.problem
                  ? load.problem
                  : 'Antrenörün programını hazırladığında antrenmanın burada açılacak.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="gap-2">
            {error ? (
              <Button size="lg" className="h-11 w-full" onClick={() => setAttempt((value) => value + 1)}>
                <ArrowClockwise data-icon="inline-start" />
                Tekrar dene
              </Button>
            ) : null}
            <Button size="lg" variant={error ? 'outline' : 'default'} className="h-11 w-full" nativeButton={false} render={<Link href="/me" />}>
              Bugün&apos;e dön
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const { plan, doc, cursor, next, unitKey, row, sets, group, warmups, setupNote } = view;
  const rest = local.rest;
  // Tam dinlenme paneli açıkken altındaki kart ve giriş paneli erişilemez (ekran okuyucu, klavye).
  const covered = Boolean(rest && rest.mode === 'full' && restView);
  const shown = saving?.next ?? next;
  const shownRow = shown ? (plan.rows[shown.rowId] ?? null) : null;
  const summary = workoutSummary(plan, doc, new Date(now));
  const progress = cursor.progress;
  const unsent = unsentSets(local);
  const water = waterOf(doc);
  // Süreli setin sayacı yalnız sıradaki setinse çalışıyor sayılır (set silindiyse, düzeltildiyse değil).
  const timerRunning = Boolean(local.timer && next && local.timer.rowId === next.rowId && local.timer.setIndex === next.setIndex);

  const restFound = rest ? findSet(doc, rest.setId) : null;
  const restRowId = restFound?.entry.rowId;
  const restSet = restFound?.set;
  const restUnit = restFound ? cursor.units.find((unit) => unit.members.some((member) => member.entryId === restFound.entry.id)) : undefined;
  const restSummary = restUnit
    ? {
        title: restUnit.members.flatMap((member) => (member.rowId && plan.rows[member.rowId] ? [plan.rows[member.rowId]?.title ?? ''] : [])).join(' + '),
        done: restUnit.members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0),
        planned: restUnit.members.reduce((sum, member) => sum + (member.skipped ? Math.min(member.done, member.planned) : member.planned), 0),
        finished: restUnit.members.every((member) => member.skipped || member.done >= member.planned),
      }
    : null;
  const restPosition = rest && restRowId ? setViews(plan, doc, restRowId).find((item) => item.logged?.id === rest.setId)?.position : undefined;
  const restEffort = rest ? promptOf(effortQuestions(plan, doc, rest.setId)) : null;
  const restEasy = rest && !restEffort ? easyShortcut(plan, doc, rest.setId) : null;

  // Bitiş sorusu: son hareketin dinlenmesi yok; onun zorluğu ve (AMRAP'sa) tekrarı sheet'te.
  const lastSetId = lastWorkingSetId(doc);
  const lastSet = lastSetId ? findSet(doc, lastSetId)?.set : undefined;
  const finishEffort = lastSetId ? promptOf(effortQuestions(plan, doc, lastSetId)) : null;

  const status =
    problem === 'session'
      ? { tone: 'warn' as const, text: 'Oturumun kapandı; kayıtların bu telefonda. Antrenörüne yaz.' }
      : problem === 'error'
        ? { tone: 'warn' as const, text: 'Kayıt gönderilemedi', retry: true }
        : !online || problem === 'offline'
          ? { tone: 'offline' as const, text: `Çevrimdışı${unsent > 0 ? ` · ${unsent} set telefonda` : ''}` }
          : problem === 'limited' && unsent > 0
            ? { tone: 'offline' as const, text: `Şu an yoğun · ${unsent} set telefonda, birazdan gönderilecek` }
            : null;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b pt-[env(safe-area-inset-top)]">
        <div className="grid h-13 grid-cols-[1fr_auto_1fr] items-center px-1">
          <Button variant="ghost" className="h-11 justify-self-start px-2 text-muted-foreground" onClick={() => router.push('/me')}>
            <CaretLeft data-icon="inline-start" weight="bold" />
            Ara ver
          </Button>
          <p className="font-heading font-semibold whitespace-nowrap tabular-nums">
            {doc.program?.dayName ?? plan.dayName} · {elapsedText((now - Date.parse(doc.startedAt)) / 1000)}
          </p>
          <Button variant="ghost" className="h-11 justify-self-end px-3" onClick={() => setFinishOpen(true)}>
            Bitir
          </Button>
        </div>
        <div className="flex h-11 items-center gap-3 pr-4 pl-4">
          <Progress value={progress.plannedSets > 0 ? (progress.doneSets / progress.plannedSets) * 100 : 0} aria-label="Antrenmanın ilerlemesi" className="min-w-16 flex-1" />
          <span className="text-[0.8125rem] whitespace-nowrap text-muted-foreground tabular-nums">
            Hareket {progress.currentUnit}/{progress.totalUnits} · {progress.doneSets}/{progress.plannedSets} set
          </span>
          {water > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">
              <Drop className="size-3.5 text-primary" aria-hidden />
              <span aria-hidden>{water}</span>
              <span className="sr-only">Su: {water} bardak</span>
            </span>
          ) : null}
        </div>
        {status ? (
          <div role="status" className={cn('flex min-h-9 items-center gap-2 border-t px-4 text-[0.8125rem]', status.tone === 'warn' ? 'text-destructive' : 'text-muted-foreground')}>
            {status.tone === 'offline' ? <CloudSlash className="size-4 shrink-0" /> : <WarningCircle className="size-4 shrink-0" />}
            <span className="min-w-0 flex-1">{status.text}</span>
            {'retry' in status && status.retry ? (
              <Button variant="ghost" className="-mr-2 h-9 px-2" onClick={() => outbox.retry()}>
                Tekrar dene
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <main inert={covered} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-3 pb-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {row && unitKey ? (
              <motion.div
                key={unitKey}
                initial={{ opacity: 0, x: WORKOUT.slidePx }}
                animate={{ opacity: 1, x: 0, transition: tween(DURATION.base) }}
                exit={{ opacity: 0, x: -WORKOUT.slidePx, transition: tween(DURATION.fast, EASE.exit) }}>
                <ExerciseCard
                  row={row}
                  group={group}
                  sets={sets}
                  warmups={warmups}
                  setupNote={setupNote}
                  currentSetIndex={
                    // Kaydedilirken vurgu kaydedilen satırda kalır; panel değişince sonraki sete kayar.
                    saving ? (saving.next.rowId === row.rowId ? saving.next.setIndex : null) : next && next.rowId === row.rowId ? next.setIndex : null
                  }
                  currentKg={next?.kg}
                  freshSetId={fresh}
                  onEditSet={openEdit}
                  onToggleWarmup={(index, done) => onToggleWarmup(row.rowId, index, done)}
                  onSetupNote={(text) => onSetupNote(row.rowId, text)}
                />
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(DURATION.base) }}>
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CheckCircle weight="fill" />
                    </EmptyMedia>
                    <EmptyTitle>Bütün hareketler bitti</EmptyTitle>
                    <EmptyDescription>Antrenmanı bitirmek için aşağıdaki düğmeye dokun.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <div ref={bottomRef} inert={covered} className="shrink-0">
          {rest && rest.mode === 'mini' && restView ? (
            <div onPointerDownCapture={swallow} onClickCapture={swallow}>
              <RestStrip
                view={restView}
                onExpand={() => {
                  updateRest((timer) => ({ ...timer, mode: 'full' }));
                  guard();
                }}
                onSkip={endRest}
              />
            </div>
          ) : null}
          <section
            aria-label="Set girişi"
            onPointerDownCapture={swallow}
            onClickCapture={swallow}
            className="relative border-t bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <EntryPanel
              row={shownRow}
              next={shown}
              frozen={saving !== null}
              overload={next && !saving ? overloadState(plan, doc, next, next.kg) : 'none'}
              nextLetter={saving ? null : nextMemberLetter(plan, doc)}
              transition={transition}
              timer={timerRunning ? timerView : null}
              now={now}
              onChange={onDraft}
              onResetKg={onResetKg}
              onDone={() => onDone()}
              onStartTimer={onStartTimer}
              onStopTimer={onStopTimer}
              onCancelTimer={onCancelTimer}
              onFinish={() => setFinishOpen(true)}
            />
          </section>
        </div>

        <AnimatePresence>
          {rest && rest.mode === 'full' && restView ? (
            <motion.section
              key="rest"
              aria-label="Dinlenme"
              initial={{ y: '100%' }}
              animate={{ y: 0, transition: tween(DURATION.base) }}
              exit={{ y: '100%', transition: tween(DURATION.fast, EASE.exit) }}
              onPointerDownCapture={swallow}
              onClickCapture={swallow}
              className="absolute inset-0 z-20 bg-background">
              <RestPanel
                endsAt={rest.endsAt}
                total={rest.total}
                view={restView}
                summary={restSummary}
                saved={restSet ? { text: `Set ${(restPosition ?? 0) + 1} kaydedildi · ${setValueText(restSet)}`, setId: restSet.id } : null}
                lockWarning={local.restCount === 1 && (isIOS() || !wakeHeld)}
                amrap={restSet?.target?.amrap ? { reps: restSet.reps ?? 0 } : null}
                effort={restEffort}
                easy={restEasy}
                onAmrap={(reps) => onAmrapReps(rest.setId, reps)}
                onEffort={onEffort}
                onEasy={onEasy}
                water={water}
                undoWater={undoWater}
                next={next ? nextText(next, plan.rows[next.rowId] ?? { title: '', trackingType: 'weight_reps' }, next.rowId !== restRowId) : null}
                onSkip={endRest}
                onMinimize={() => {
                  updateRest((timer) => ({ ...acknowledgeRest(timer), mode: 'mini' }));
                  guard();
                  focusLater('set-done', DURATION.fast);
                }}
                onAdjust={(seconds) => updateRest((timer) => adjustRest(acknowledgeRest(timer), seconds, Date.now()))}
                onWater={onWater}
                onUndoWater={onUndoWater}
                onEditSaved={openEdit}
                onTouch={() => {
                  if (localRef.current?.rest && alarmPending(localRef.current.rest)) updateRest(acknowledgeRest);
                }}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>

      <FinishSheet
        open={finishOpen}
        onOpenChange={setFinishOpen}
        summary={summary}
        busy={finishing}
        effort={finishEffort}
        amrap={lastSet?.target?.amrap ? { reps: lastSet.reps ?? 0 } : null}
        onEffort={onEffort}
        onAmrap={(reps) => (lastSetId ? onAmrapReps(lastSetId, reps) : undefined)}
        onFinish={onFinish}
        onCancelWorkout={onCancelWorkout}
      />
      <EditSetSheet target={editing} onClose={() => setEditing(null)} onSave={onSaveEdit} onDelete={onAskDelete} />
      <DeleteSetDialog target={deleting} onCancel={() => setDeleting(null)} onConfirm={onConfirmDelete} />
      <FinishedElsewhereDialog count={elsewhere?.count ?? null} busy={elsewhereBusy} onAdd={onAddElsewhere} onSkip={() => leave('Bu antrenman başka bir cihazda bitirildi.', 'info')} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** Açılış: plan telefonda yoksa bir an; üst çubuk, kart ve panel yerinde. */
function WorkoutSkeleton() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-background" aria-busy="true">
      <span role="status" className="sr-only">
        Antrenman açılıyor…
      </span>
      <div className="shrink-0 border-b pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-between px-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="flex h-11 items-center gap-3 px-4">
          <Skeleton className="h-1 flex-1" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="flex-1 px-4 pt-3">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
