'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowClockwise, Barbell, CaretLeft, CloudSlash, Drop, List, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKg } from '@/lib/format';
import { DRAG, DURATION, EASE, tween, WORKOUT } from '@/lib/motion';
import { EFFORT_LABELS } from '@/lib/progression';
import { ApiError, fetchJson } from '@/lib/query/errors';
import { feedbackItems, feedbackMessage, resolveFeedback, withFeedbackFlags, type FeedbackItem, type FeedbackOutcome } from '@/lib/program-feedback';
import type { FinishFeedback, FinishHealth, RotationChoice, SessionDoc } from '@/lib/schemas/session';
import { waterOf } from '@/lib/session-index';
import { cn } from '@/lib/utils';
import { rowKeyOf } from '@/lib/workout-cursor';
import {
  addExercise,
  canSwap,
  doNowAt,
  dropAt,
  effectiveDay,
  finishRotation,
  firstSkippedKey,
  flowView,
  restoreAt,
  skipAt,
  skipMessage,
  swapRow,
  undoSkip,
  unitTitle,
  withExtraRounds,
  withFinishReason,
  type FinishReason,
} from '@/lib/workout-flow';
import { groupView, nextMemberLetter } from '@/lib/workout-groups';
import { createLocalWorkout, setsMissingOn, unsentSets, withChange, type LocalWorkout } from '@/lib/workout-outbox';
import { acknowledgeRest, adjustRest, alarmPending, LATE_MS, startRest, tickRest, type RestEvent, type RestTimer } from '@/lib/workout-rest';
import { afterFinish, extraKey, rekeyExtra, type WorkoutDay } from '@/lib/workout-plan';
import type { AddedRowResponse, LibraryItem, SwapOption, WorkoutResponse } from '@/lib/workout-routes';
import {
  addExtraRound,
  addWaterTap,
  afterLog,
  cursorOf,
  deleteSet,
  dropExtraRound,
  easyShortcut,
  editSet,
  effortQuestions,
  elapsedText,
  ensureEntries,
  findSet,
  logSet,
  logWarmup,
  newEntryId,
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
  unitKeyOfRow,
  unlogWarmup,
  warmupViews,
  workoutSummary,
  type EffortChoice,
  type EffortQuestion,
  type NextSet,
} from '@/lib/workout-session';
import { startSetTimer, stopSetTimer, tickSetTimer } from '@/lib/workout-timer';
import { WORKOUT_KEY, WORKOUT_OVERVIEW_KEY } from '../today-workout';
import { clearLocalWorkout, clearWorkoutCache, readLocalWorkout, readWorkoutCache, saveLocalWorkout, saveWorkoutCache, writerId } from '../workout-storage';
import { DonePanel } from './done-panel';
import { EntryPanel, type TimerView, type TransitionView } from './entry-panel';
import { ExerciseCard } from './exercise-card';
import { AddExerciseSheet, FlowSheet, SwapSheet, type SwapTarget } from './flow-sheets';
import { ProgramUpdateSheet, type ProgramAnswer } from './program-update-sheet';
import { RestPanel, RestStrip, type EffortPromptView, type RestView } from './rest-panel';
import { StartCheck } from './start-check';
import { useWorkoutOutbox } from './use-workout-outbox';
import { beep, isIOS, unlockAudio, useWakeLock, vibrate } from './workout-feedback';
import { DeleteSetDialog, EditSetSheet, FinishedElsewhereDialog, FinishSheet, type EditTarget, type EditValues } from './workout-sheets';

/**
 * Bugün'de çekilen plan bu kadar tazeyse başlangıç ağ beklemez; yine de arka planda taze plan istenir ve
 * henüz hiçbir şey kaydedilmediyse (PT o arada programı değiştirdiyse) antrenman güncel planla yeniden
 * kurulur. Bugün de sunucudaki programın damgası tutmayan planı atar (`WorkoutFreshness`).
 */
const CACHE_FRESH_MS = 60_000;
/** Hareket bitince: eski kart çıkar, yenisi gelir; dinlenme onun üstünde açılır (tasarım §2.4, prototip). */
const NEXT_SLIDE_MS = 260;
const NEXT_REST_MS = 700;

type LoadState = { phase: 'loading' } | { phase: 'ready' } | { phase: 'empty'; problem?: string | undefined } | { phase: 'error'; message: string };

/** Bitiş sorusu cevaplandı, "Programını güncelleyelim mi?" bekliyor: maddeler ve bitişin öteki seçimleri. */
type PendingUpdate = { items: FeedbackItem[]; rotation: RotationChoice | null; health: FinishHealth | undefined };

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

/** Planın programı adres parçası olarak (`program=`): kendi programın kimliği ya da `pt`. */
function planProgram(plan: WorkoutDay): string {
  return plan.source === 'own' && plan.programId ? plan.programId : 'pt';
}

/** Yanıttaki planın programı (`planProgram` gibi). */
function responseProgram(data: WorkoutResponse): string {
  return data.program?.source === 'own' && data.program.id ? data.program.id : 'pt';
}

/** Telefondaki antrenmanda henüz hiçbir şey yok: plan değişirse sessizce yeniden kurulabilir. */
function untouched(local: LocalWorkout): boolean {
  return local.acked === null && local.lastSentAt === null && local.doc.entries.length === 0 && local.doc.waterTaps.length === 0;
}

/**
 * Taze yanıt telefondaki boş antrenmanı değiştirir mi: sunucuda aynı günün yarım antrenmanı var (başka
 * cihaz) ya da gün planı farklı (PT programı kaydetti). Başka günün yarım antrenmanı buradan devralınmaz.
 */
function planChanged(local: LocalWorkout, fresh: WorkoutResponse): boolean {
  if (fresh.active) return fresh.active.program?.dayId === local.plan.dayId;
  return fresh.day !== null && JSON.stringify(fresh.day) !== JSON.stringify(local.plan);
}

/** Sona alma ve geçme toast'ının düğmeleri: dokunmatikte 44 px (`undo-toast.ts` gibi). */
const TOAST_BUTTONS = { actionButton: 'touch:min-h-11 touch:px-3! touch:text-sm!', cancelButton: 'touch:min-h-11 touch:px-3! touch:text-sm!' };

const effective = new WeakMap<LocalWorkout, WorkoutDay>();

/** Günün etkin hâli verilen belgeyle: başlangıçtaki gün + muadiller + eklenen hareketler + istenen fazladan turlar. */
function dayFor(local: LocalWorkout, doc: SessionDoc): WorkoutDay {
  return withExtraRounds(effectiveDay(local.plan, doc, local.extras), local.extraRounds);
}

/**
 * Günün etkin planı: başlangıçtaki gün + muadiller + eklenen hareketler (`effectiveDay`) + "+ Set ekle"nin
 * turları (`withExtraRounds`). Her kayıt yeni bir `LocalWorkout` olduğu için kayıt başına bir kez kurulur.
 */
function planOf(local: LocalWorkout): WorkoutDay {
  let day = effective.get(local);
  if (!day) {
    day = dayFor(local, local.doc);
    effective.set(local, day);
  }
  return day;
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
 * belge (dosya ilk setle oluşur). Saklanan planla açılan boş antrenman arka planda taze planla
 * karşılaştırılır; PT o arada programı değiştirdiyse güncel planla yeniden kurulur. Başka gün seçildiyse
 * (`?day=`) "Gün C seçildi · Antrenörüne bildirilecek".
 *
 * Bitiş (§2.7): "Antrenman tamamlandı, bitirelim mi?" ya da erken bitişte yapılmayanlar, hazır seçilmiş
 * "Sıradaki antrenman: Gün B · Değiştir" (`finishRotation`) ve bir kez sorulan isteğe bağlı neden; plandan
 * sapma ya da öneri varsa ardından "Programını güncelleyelim mi?" (`program-feedback.ts`), kararlar bitişin
 * tek commit'ine biner. Bitince özet karuseli açılır (§2.8, `/me/antrenman/ozet/[id]`).
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
 *
 * Akış ve geçme (§2.6): üst çubuktaki ☰ akış sheet'i (şimdi yap, [Geç], Geçilenler, hareket ekle), panelde
 * tek dokunuşluk "Hareketi geç ›" (sona alır; 5 sn toast [Bugün yapma] [Geri al]), başlıkta "Değiştir"
 * (muadil, kendi geçmişiyle). Ekran günün etkin planıyla çalışır (`planOf`: muadiller ve eklenenler).
 * Geçme, sıra ve muadil de kendi başına gönderilmez; neden yalnız bitişte sorulur.
 *
 * "+ Set ekle" (§2.4): kartın tablosunun altında (grupta "Tur ekle") ve bitmiş antrenmanda "Devam et"ten
 * sonra (`DonePanel`: harekete set ya da yeni hareket). İstek telefonda durur (`extraRounds`), fazladan set
 * `extra` işaretiyle yazılır; iki antrenman üst üste plandan fazla set yapılırsa bitişte antrenöre set önerisi
 * olur (§6.1). Bekleyen fazladan set bitirmeyi engellemez; satırdaki ✕ ya da paneldeki "Kaldır" bırakır.
 */
export function WorkoutScreen({
  clientId,
  dayParam,
  programParam = null,
  finishOnOpen,
}: {
  clientId: string;
  dayParam: string | null;
  /** Bugün'ün tek seferlik program seçimi (`op_…` ya da `pt`); yoksa kalıcı seçim. */
  programParam?: string | null;
  finishOnOpen: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [local, setLocal] = useState<LocalWorkout | null>(null);
  const localRef = useRef<LocalWorkout | null>(null);
  const storageWarned = useRef(false);

  const [saving, setSaving] = useState<Saving | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [restTick, setRestTick] = useState<{ key: string; view: RestView } | null>(null);
  const [transition, setTransition] = useState<TransitionView | null>(null);
  const [timerTick, setTimerTick] = useState<{ key: string; view: TimerView } | null>(null);
  const [undoWater, setUndoWater] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [update, setUpdate] = useState<PendingUpdate | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<(EditTarget & { text: string }) | null>(null);
  const [elsewhere, setElsewhere] = useState<{ server: SessionDoc; count: number } | null>(null);
  const [elsewhereBusy, setElsewhereBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [flowOpen, setFlowOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState<string | null>(null);
  const [flowHighlight, setFlowHighlight] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

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

  /** Telefondaki antrenman sunucuda bitti ya da silindi: yerel kopya ve saklanan plan düşer, Bugün tazelenir. */
  const release = useCallback(() => {
    localRef.current = null;
    clearLocalWorkout(clientId);
    clearWorkoutCache(clientId);
    void queryClient.invalidateQueries({ queryKey: WORKOUT_KEY });
  }, [clientId, queryClient]);

  const leave = useCallback(
    (message: string, kind: 'success' | 'info' = 'success') => {
      release();
      router.replace('/me');
      if (kind === 'success') toast.success(message);
      else toast(message);
    },
    [release, router],
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
      window.clearTimeout(highlightTimer.current);
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
    let announced = false;
    const adopt = (next: LocalWorkout) => {
      commit(next);
      setLoad({ phase: 'ready' });
      if (finishOnOpen) setFinishOpen(true);
      outbox.schedule();
    };
    const begin = (data: WorkoutResponse) => {
      // Önceki sürümün sakladığı yanıtta muadil planları ve onay bilgisi yok.
      const options = { extras: data.extras ?? {}, pain: data.health?.pain ?? false };
      if (data.active && data.day) return adopt(createLocalWorkout(data.active, data.day, data.active, options));
      if (!data.day) return setLoad({ phase: 'empty', problem: data.problem });
      const doc = newSessionDoc(data.day, { today: data.today, now: new Date(), writer: writerId() });
      adopt(createLocalWorkout(doc, data.day, null, options));
      // Başka gün seçildi (§2.3): antrenöre bitişte bildirilir (`other_day`); kendi programda bildirim yok.
      if (!announced && data.day.source !== 'own' && data.day.plannedDayId && data.day.plannedDayId !== data.day.dayId) {
        announced = true;
        toast(`${data.day.dayName} seçildi`, { description: 'Antrenörüne bildirilecek' });
      }
    };
    const query = [
      ...(dayParam ? [`day=${encodeURIComponent(dayParam)}`] : []),
      ...(programParam ? [`program=${encodeURIComponent(programParam)}`] : []),
    ].join('&');
    const url = `/api/me/workout${query ? `?${query}` : ''}`;
    /**
     * Saklanan planla açılan ve henüz hiçbir şey kaydedilmemiş antrenman arka planda aynı günün taze planıyla
     * karşılaştırılır: PT o arada programı kaydettiyse (ya da başka cihazda yarım antrenman varsa) güncel
     * hâliyle yeniden kurulur. Bir şey kaydedildiyse antrenman başladığı günün anlık görüntüsüyle sürer.
     */
    const revalidate = () => {
      const current = localRef.current;
      if (!current || !untouched(current)) return;
      fetchJson<WorkoutResponse>(`/api/me/workout?day=${encodeURIComponent(current.plan.dayId)}&program=${encodeURIComponent(planProgram(current.plan))}`)
        .then((data) => {
          const latest = localRef.current;
          if (cancelled || !latest || latest.doc.id !== current.doc.id || !untouched(latest) || !planChanged(latest, data)) return;
          begin(data);
        })
        .catch(() => undefined);
    };
    const cleanup = () => {
      cancelled = true;
    };

    const existing = readLocalWorkout(clientId);
    if (existing) {
      adopt(existing);
      revalidate();
      return cleanup;
    }
    const cached = readWorkoutCache(clientId);
    // Saklanan yanıt bu açılışın günü mü: istenen gün ya da (gün istenmediyse) rotasyonda sıradaki gün;
    // "Başka gün seç"le çekilmiş bir gün sonraki olağan başlangıçta kullanılmaz.
    // Program da aynı olmalı: tek seferlik seçimde istenen program, yoksa kalıcı seçim (`docs/design/kendi-program.md` §2.6).
    const sameProgram = (data: WorkoutResponse) =>
      data.active !== null || (programParam ? responseProgram(data) === programParam : !data.selection?.oneOff);
    const matches = (data: WorkoutResponse) =>
      sameProgram(data) &&
      (dayParam ? data.day?.dayId === dayParam : data.active !== null || !data.day || data.day.dayId === (data.program?.nextDayId ?? data.day.dayId));
    const usable = cached && matches(cached.data) ? cached : null;
    if (usable && Date.now() - usable.at < CACHE_FRESH_MS) {
      begin(usable.data);
      revalidate();
      return cleanup;
    }
    fetchJson<WorkoutResponse>(url)
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
    return cleanup;
    // `finishOnOpen` ve `outbox` açılışta bir kez okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dayParam, programParam, attempt]);

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

  // Görünüm hangi dinlenmenin: dinlenme bitince (ya da yenisi başlayınca) eskisinin görünümü kendiliğinden düşer.
  const restView = restTick && restTick.key === restKey ? restTick.view : null;
  useEffect(() => {
    if (!restKey) return;
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
        setRestTick({ key: restKey, view: { state: tick.state, seconds, alarmPending: pending } });
      }
      frame = window.requestAnimationFrame(loop);
    };
    loop();
    return () => window.cancelAnimationFrame(frame);
  }, [restKey, commit, handleRestEvents]);

  /* --- süreli set sayacı ve devrenin istasyon geçişi: zaman damgasından --- */

  const timerKey = local?.timer ? `${local.timer.rowId}#${local.timer.setIndex}@${local.timer.startedAt}` : null;
  const timerView = timerTick && timerTick.key === timerKey ? timerTick.view : null;
  useEffect(() => {
    if (!timerKey) return;
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
        setTimerTick({ key: timerKey, view: { seconds: tick.seconds, toMin: tick.toMin, fraction: tick.fraction, phase: tick.phase } });
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
    const plan = planOf(local);
    const doc = local.doc;
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
      // Set yazmak günün etkin planını değiştirmez (muadil ve eklenenler aynı): önce ve sonra aynı plan.
      const plan = planOf(current);
      const next = nextSet(plan, current.doc, current.draft);
      if (!next) return;
      unlockAudio();
      const row = plan.rows[next.rowId];
      const value = seconds ?? next.value;
      // Aşırı yük: "Onayla · Set bitti" (ilk kez) ya da bu harekette zaten onaylanmış.
      const overload = overloadState(plan, current.doc, next, next.kg) !== 'none';
      const { doc, setId } = logSet(plan, current.doc, {
        rowId: next.rowId,
        setIndex: next.setIndex,
        kg: next.kg,
        value,
        overload,
        extra: next.extra === true,
        stamp: stampOf(current),
      });
      const after = afterLog(plan, current.doc, doc);
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
        const following = nextSet(plan, doc);
        guard(DURATION.base + WORKOUT.tapGuardMs);
        later(DURATION.base, () => {
          setSaving(null);
          guard();
          if (after.transitionSeconds > 0) setTransition({ endsAt: Date.now() + after.transitionSeconds * 1000, total: after.transitionSeconds });
          const title = following ? plan.rows[following.rowId]?.title : undefined;
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
        const following = nextSet(plan, doc);
        // Grupta bütün üyeler: "Romanian Deadlift ve Şınav tamamlandı."
        const unit = cursorOf(plan, doc).units.find((item) => item.key === next.unitKey);
        const names = unit?.members.flatMap((member) => (member.rowId && plan.rows[member.rowId] ? [plan.rows[member.rowId]?.title ?? ''] : [])) ?? [];
        const done = names.length > 0 ? names.join(' ve ') : (row?.title ?? 'Hareket');
        guard(NEXT_REST_MS + WORKOUT.tapGuardMs);
        later(NEXT_SLIDE_MS, () => {
          setSaving(null);
          vibrate(20);
          const title = following ? plan.rows[following.rowId]?.title : undefined;
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
    const next = nextSet(planOf(current), current.doc, current.draft);
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
    const next = nextSet(planOf(current), current.doc, current.draft);
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
      const doc = done ? logWarmup(planOf(current), current.doc, { rowId, index, stamp }) : unlogWarmup(planOf(current), current.doc, { rowId, index, stamp });
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
      const doc = setSetupNote(planOf(current), current.doc, { rowId, note: text, stamp: stampOf(current) });
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
    const shortcut = easyShortcut(planOf(current), current.doc, current.rest.setId);
    if (!shortcut) return;
    const doc = setSetEffort(current.doc, current.rest.setId, shortcut.taken ? undefined : 'easy', stampOf(current));
    commit(withChange({ ...current, draft: null, rest: acknowledgeRest(current.rest) }, doc, { send: false }));
    const kg = nextSet(planOf(current), doc)?.kg;
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
      const next = nextSet(planOf(current), current.doc, current.draft);
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
    const rowId = found ? rowKeyOf(found.entry) : undefined;
    const row = rowId ? planOf(current).rows[rowId] : undefined;
    if (!found || !row || !rowId) return;
    const position = setViews(planOf(current), current.doc, rowId).find((item) => item.logged?.id === setId)?.position ?? 0;
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
    const plan = planOf(current);
    const found = findSet(current.doc, deleting.setId);
    const doc = deleteSet(plan, current.doc, deleting.setId, stampOf(current));
    const rest = current.rest?.setId === deleting.setId ? null : current.rest;
    // Tek harekette silinen fazladan set istenen turdan da düşer (yeniden beklemesin); grupta tur üyelerle paylaşılır.
    const rowKey = found?.set.extra ? rowKeyOf(found.entry) : undefined;
    const unitKey = rowKey ? unitKeyOfRow(plan, rowKey) : undefined;
    const single = unitKey ? plan.blocks.find((block) => block.id === unitKey)?.rows.length === 1 : false;
    const extraRounds = unitKey && single ? dropExtraRound(plan, unitKey) : current.extraRounds;
    commit(withChange({ ...current, rest, draft: null, extraRounds }, doc, { send: true }));
    outbox.schedule();
    setDeleting(null);
    announce('Set silindi');
    guard();
  }, [commit, deleting, outbox, announce, guard]);

  /**
   * Bitişi gönderir (tek commit): `feedback` "Programını güncelleyelim mi?"nin kararları; uygulanmayan ağırlık
   * önce seansa işlenir (`oneOff` / `lighter`). Başarılıysa özet karuseli açılır (§2.8, dock yok); program
   * güncellemesi bir an sonra bildirimle söylenir. Bugün'ün sayıları ("Bu hafta x/y", su, yarım kart) hemen
   * bitişin yanıtıyla güncellenir (`afterFinish`): Bugün'e dönünce eski sayı bir an bile görünmez, taze veri
   * arkadan gelir.
   */
  const submitFinish = useCallback(
    async (rotation: RotationChoice | null, health: FinishHealth | undefined, feedback: FinishFeedback | undefined) => {
      let current = localRef.current;
      if (!current) return;
      if (feedback) {
        const flagged = withFeedbackFlags(current.doc, feedback.items, stampOf(current));
        if (flagged !== current.doc) {
          current = withChange(current, flagged, { send: false });
          commit(current);
        }
      }
      setFinishing(true);
      outbox.stop();
      const doc: SessionDoc = { ...current.doc, status: 'finished', finishedAt: new Date().toISOString() };
      try {
        const result = await fetchJson<{ doc?: SessionDoc; feedback?: FeedbackOutcome }>(`/api/me/sessions/${current.doc.id}/finish`, {
          method: 'POST',
          body: JSON.stringify({ doc, ...(rotation ? { rotation } : {}), ...(health ? { health } : {}), ...(feedback ? { feedback } : {}) }),
        });
        // Tarih sunucunun (ilk yazımda koyduğu); yanıt gelmediyse telefondaki.
        const saved = result.doc ?? doc;
        queryClient.setQueriesData<WorkoutResponse>({ queryKey: WORKOUT_OVERVIEW_KEY }, (old) => (old ? afterFinish(old, saved) : old));
        release();
        router.replace(`/me/antrenman/ozet/${current.doc.id}`);
        // Kendi programda mesaj programın adıyla; yazılamayan madde varsa [Programı aç] (§2.9).
        const ownPlan = current.plan.source === 'own' && current.plan.programId ? { id: current.plan.programId, name: current.plan.programName ?? 'Programın' } : null;
        const message = result.feedback ? feedbackMessage(result.feedback, ownPlan) : null;
        // Özet açılırken bir an sonra (prototip): önce özetin ilk kartı görünsün.
        if (message) {
          window.setTimeout(
            () =>
              toast(message.title, {
                description: message.description,
                ...(message.open && ownPlan ? { action: { label: 'Programı aç', onClick: () => router.push(`/me/programlar/${ownPlan.id}`) } } : {}),
              }),
            450,
          );
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 410) {
          leave('Bu antrenman silinmiş.', 'info');
          return;
        }
        outbox.resume();
        setFinishing(false);
        setUpdate(null);
        toast.error(
          error instanceof ApiError && error.status === 0
            ? 'Bağlantı yok; antrenmanın bu telefonda duruyor. Bağlantı gelince yeniden bitir.'
            : error instanceof ApiError
              ? error.message
              : 'Antrenman bitirilemedi. Biraz sonra tekrar dene.',
        );
      }
    },
    [outbox, leave, release, router, commit, queryClient],
  );

  /**
   * Bitir; `reason`: yapılmayanların isteğe bağlı nedeni (ağrı yalnız onayla, ayrıntısı `health.json`'a);
   * `rotation`: "Sıradaki antrenman" satırındaki seçim (gösterilmediyse sunucunun hazır seçimi). Plandan
   * sapma ya da öneri varsa önce "Programını güncelleyelim mi?" (§2.7 c), özetten önce; öneri katmanının set
   * artışı adayları (`plan.setIncrease`, §5.6) orada "Antrenörüne öner" olarak. Günün her satırının kaydı
   * açılır (`ensureEntries`): hafifletilen günde planın set sayısı kayda yazılır, sunucunun "yarım bırakıldı
   * (x/y set)" sayısı sheet'tekiyle aynı olur.
   */
  const onFinish = useCallback(
    (reason: FinishReason | null, rotation: RotationChoice | null) => {
      let current = localRef.current;
      if (!current) return;
      const ready = ensureEntries(planOf(current), current.doc, stampOf(current));
      if (ready !== current.doc) {
        current = withChange(current, ready, { send: false });
        commit(current);
      }
      let health: FinishHealth | undefined;
      if (reason) {
        const result = withFinishReason(planOf(current), current.doc, reason, stampOf(current));
        if (result.skippedRows.length > 0) health = { skippedRows: result.skippedRows };
        current = withChange(current, result.doc, { send: false });
        commit(current);
      }
      const items = feedbackItems({ day: current.plan, doc: current.doc, extras: current.extras, suggestions: current.plan.setIncrease });
      if (items.length === 0) {
        void submitFinish(rotation, health, undefined);
        return;
      }
      setFinishOpen(false);
      setUpdate({ items, rotation, health });
    },
    [commit, submitFinish],
  );

  /** "Programını güncelleyelim mi?"nin cevabı; sheet kararsız kapandıysa cevapsız (`none`). */
  const onProgramAnswer = useCallback(
    (answer: ProgramAnswer | null) => {
      const pending = update;
      if (!pending) return;
      // Kararsız kapandı: sheet kapanır, bitiş arkada gider; cevapta sheet düğmesinde bekler.
      if (!answer) setUpdate(null);
      const feedback = resolveFeedback(pending.items, answer?.answer ?? 'none', answer?.picked);
      void submitFinish(pending.rotation, pending.health, feedback);
    },
    [update, submitFinish],
  );

  /* --- akış: geç, sona al, şimdi yap, değiştir, hareket ekle (§2.6) --- */

  /**
   * Sıra ya da hareket değişti: kendi başına gönderilmez (sonraki set yazımına ya da bitişe biner).
   * Şu anki set değiştiyse taslak ve süreli setin sayacı düşer; dinlenme sürer ("Sıradaki" yenilenir).
   */
  const commitFlow = useCallback(
    (current: LocalWorkout, doc: SessionDoc, extra: Partial<LocalWorkout> = {}) => {
      const before = nextSet(planOf(current), current.doc);
      const next = { ...current, ...extra };
      const after = nextSet(dayFor(next, doc), doc);
      const moved = before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex;
      commit(withChange(moved ? { ...next, draft: null, timer: null } : next, doc, { send: false }));
      if (moved) setTransition(null);
      guard();
      return { moved, after };
    },
    [commit, guard],
  );

  /** Akışta yeri değişen satır bir an vurgulu (`DRAG.highlightMs`). */
  const highlightUnit = useCallback((key: string) => {
    setFlowHighlight(key);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setFlowHighlight(null), DRAG.highlightMs);
  }, []);

  /** Tüm hareketler yapıldıysa (geçilenler hariç) bitirme sorusu: akış sheet'i kapanır, sheet açılır. */
  const finishIfDone = useCallback(
    (doc: SessionDoc) => {
      const current = localRef.current;
      if (!current || !cursorOf(planOf(current), doc).allDone) return;
      setFlowOpen(false);
      later(DURATION.slow + 50, () => setFinishOpen(true));
    },
    [later],
  );

  const onJump = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const doc = doNowAt(plan, current.doc, key, stampOf(current));
      if (!unit || doc === current.doc) return;
      commitFlow(current, doc);
      setFlowOpen(false);
      setFinishOpen(false);
      announce(`Şimdi: ${unitTitle(plan, current.doc, unit)}`);
      focusLater('exercise-title', DURATION.slow);
    },
    [saving, commitFlow, announce, focusLater],
  );

  /**
   * "Hareketi geç ›" ya da akıştaki [Geç]: tek dokunuş, neden sorulmaz. 5 sn toast: sona alındıysa
   * [Bugün yapma] [Geri al], Geçilenler'e gittiyse [Geri al].
   */
  const onSkip = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const result = unit ? skipAt(plan, current.doc, key, stampOf(current)) : null;
      if (!unit || !result) return;
      const title = unitTitle(plan, current.doc, unit);
      const done = unit.members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0);
      const planned = unit.members.reduce((sum, member) => sum + member.planned, 0);
      const { moved } = commitFlow(current, result.doc);
      highlightUnit(key);
      const message = skipMessage(result.outcome, title, done, planned);
      announce(message.title);
      if (moved) focusLater('exercise-title', DURATION.base);
      const sessionId = current.doc.id;
      const alive = () => localRef.current?.doc.id === sessionId;
      const undo = () => {
        const latest = localRef.current;
        if (!latest || !alive()) return;
        commitFlow(latest, undoSkip(planOf(latest), latest.doc, result.undo, stampOf(latest)));
        highlightUnit(key);
        announce(`${title} geri alındı`);
        focusLater('exercise-title', DURATION.base);
      };
      toast(message.title, {
        ...(message.description ? { description: message.description } : {}),
        duration: WORKOUT.skipToastMs,
        classNames: TOAST_BUTTONS,
        action: { label: 'Geri al', onClick: undo },
        ...(result.outcome === 'moved'
          ? {
              cancel: {
                label: 'Bugün yapma',
                onClick: () => {
                  const latest = localRef.current;
                  if (!latest || !alive()) return;
                  const dropped = dropAt(planOf(latest), latest.doc, key, stampOf(latest));
                  commitFlow(latest, dropped);
                  highlightUnit(key);
                  announce(`${title} geçildi`);
                  finishIfDone(dropped);
                },
              },
            }
          : {}),
      });
      finishIfDone(result.doc);
    },
    [saving, commitFlow, highlightUnit, announce, focusLater, finishIfDone],
  );

  /** Geçilenler'de "Geri al": hareket yeniden yapılacaklara, sona. */
  const onRestore = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const doc = restoreAt(plan, current.doc, key, stampOf(current));
      if (!unit || doc === current.doc) return;
      commitFlow(current, doc);
      highlightUnit(key);
      announce(`${unitTitle(plan, current.doc, unit)} yeniden sırada`);
    },
    [commitFlow, highlightUnit, announce],
  );

  /** "Değiştir": sheet'i şu anki hareket için açar; muadil seçildiyse başta asıl hareket. */
  const openSwap = useCallback((rowId: string) => {
    const current = localRef.current;
    if (!current) return;
    const row = planOf(current).rows[rowId];
    const original = current.plan.rows[rowId];
    if (!row || !original) return;
    setSwapTarget({
      dayId: current.plan.dayId,
      program: planProgram(current.plan),
      rowId,
      title: row.title,
      original: row.exerciseId !== original.exerciseId ? original.title : null,
    });
  }, []);

  const onPickSwap = useCallback(
    (option: SwapOption | null) => {
      const current = localRef.current;
      const target = swapTarget;
      if (!current || !target) return;
      const from = planOf(current).rows[target.rowId]?.title ?? target.title;
      const doc = swapRow(current.plan, current.doc, { rowId: target.rowId, extra: option?.extra ?? null, stamp: stampOf(current) });
      setSwapTarget(null);
      if (doc === current.doc) return;
      const extras = option ? { ...current.extras, [extraKey(target.rowId, option.exerciseId)]: option.extra } : current.extras;
      // Hareket değişti: eski hareketin taslağı ve sayacı yenisine taşınmaz (muadil kendi önerisiyle).
      commitFlow(current, doc, { extras, draft: null, timer: null });
      const to = option?.title ?? current.plan.rows[target.rowId]?.title ?? '';
      toast.success(option ? `${from} yerine ${to}` : `Yeniden ${to}`);
      announce(option ? `${from} yerine ${to}` : `Asıl hareket: ${to}`);
      focusLater('exercise-title', DURATION.slow);
    },
    [swapTarget, commitFlow, announce, focusLater],
  );

  /** "Hareket ekle": planı sunucudan (kendi geçmişiyle), kayıt hemen açılır; yapılacakların sonuna. */
  const onPickAdd = useCallback(
    async (item: LibraryItem) => {
      if (addBusy) return;
      setAddBusy(item.id);
      try {
        const planned = localRef.current;
        const { extra } = await fetchJson<AddedRowResponse>(
          `/api/me/workout/exercises?add=${encodeURIComponent(item.id)}${planned ? `&program=${encodeURIComponent(planProgram(planned.plan))}` : ''}`,
        );
        const current = localRef.current;
        if (!current) return;
        const entryId = newEntryId(current.doc);
        const keyed = rekeyExtra(extra, entryId);
        const doc = addExercise(planOf(current), current.doc, { entryId, extra: keyed, stamp: stampOf(current) });
        commitFlow(current, doc, { extras: { ...current.extras, [extraKey(entryId, keyed.exerciseId)]: keyed } });
        setAddOpen(false);
        setFinishOpen(false);
        announce(`${item.title} eklendi`);
        toast.success(`${item.title} eklendi`, {
          description: 'Yapılacakların sonunda',
          duration: WORKOUT.skipToastMs,
          classNames: TOAST_BUTTONS,
          action: { label: 'Şimdi yap', onClick: () => onJump(entryId) },
        });
      } catch (error) {
        toast.error(error instanceof ApiError && error.status === 0 ? 'Bağlantı yok; hareket eklenemedi.' : error instanceof ApiError ? error.message : 'Hareket eklenemedi.');
        // Kısıt değişmiş (409): önbellekteki kütüphane tazelenir, hareket listeden düşer.
        if (error instanceof ApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey: ['me', 'workout', 'library'] });
      } finally {
        setAddBusy(null);
      }
    },
    [addBusy, commitFlow, announce, onJump, queryClient],
  );

  /**
   * "+ Set ekle" (§2.4; grupta tur) ya da bitmiş antrenmanda "Devam et"ten sonra bir harekete fazladan set:
   * yalnız telefonda istenir (kendi başına gönderilmez); yapılan set `extra` işaretiyle yazılır. Planın setleri
   * bittiyse imleç fazladan sete geçer, bitirme sorusu kapanır.
   */
  const onAddSet = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const extraRounds = addExtraRound(plan, current.doc, key);
      if ((extraRounds[key] ?? 0) <= (plan.extraRounds?.[key] ?? 0)) return;
      const group = (plan.blocks.find((block) => block.id === key)?.rows.length ?? 1) > 1;
      const before = nextSet(plan, current.doc);
      const next = { ...current, extraRounds };
      const after = nextSet(planOf(next), current.doc);
      const moved = before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex;
      commit(moved ? { ...next, draft: null, timer: null } : next);
      guard();
      setFinishOpen(false);
      announce(group ? 'Fazladan tur eklendi' : 'Fazladan set eklendi');
      if (moved) focusLater('exercise-title', DURATION.base);
    },
    [saving, commit, guard, announce, focusLater],
  );

  /** Bekleyen fazladan seti (grupta turu) bırakır; geriye bir şey kalmadıysa bitirme sorusu. */
  const onDropExtra = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const before = nextSet(plan, current.doc);
      const next = { ...current, extraRounds: dropExtraRound(plan, key) };
      const after = nextSet(planOf(next), current.doc);
      const moved = before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex;
      commit(moved ? { ...next, draft: null, timer: null } : next);
      guard();
      announce('Fazladan set kaldırıldı');
      if (before && !after) later(DURATION.slow + 50, () => setFinishOpen(true));
    },
    [saving, commit, guard, announce, later],
  );

  /** Bitişte "Geçileni yap": ilk geçilen hareket şimdi. */
  const onDoSkipped = useCallback(() => {
    const current = localRef.current;
    const key = current ? firstSkippedKey(planOf(current), current.doc) : null;
    if (key) onJump(key);
  }, [onJump]);

  const onCancelWorkout = useCallback(async () => {
    const current = localRef.current;
    if (!current) return;
    setFinishing(true);
    outbox.stop();
    // Dosya yazılmış olabilir (onaylı ya da yolda bir PUT): iz dosyasına döner; hiç gönderilmediyse silinecek bir şey yok.
    if (current.acked || current.lastSentAt !== null) {
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
  const rotation = finishRotation(plan, summary);
  const flow = flowView(plan, doc);
  // "+ Set ekle": birim sınırda değilse (en çok `EXTRA_ROUNDS_MAX` tur).
  const addable = (key: string) => (addExtraRound(plan, doc, key)[key] ?? 0) > (plan.extraRounds?.[key] ?? 0);
  const todayIds = new Set(Object.values(plan.rows).map((item) => item.exerciseId));
  const progress = cursor.progress;
  const unsent = unsentSets(local);
  const water = waterOf(doc);
  // Süreli setin sayacı yalnız sıradaki setinse çalışıyor sayılır (set silindiyse, düzeltildiyse değil).
  const timerRunning = Boolean(local.timer && next && local.timer.rowId === next.rowId && local.timer.setIndex === next.setIndex);

  const restFound = rest ? findSet(doc, rest.setId) : null;
  const restRowId = restFound ? rowKeyOf(restFound.entry) : undefined;
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
        {/* Orta sütun daralabilir: uzun program adı kısalır, gün, süre ve "Bitir" ekranda kalır. */}
        <div className="grid h-13 grid-cols-[1fr_minmax(0,auto)_1fr] items-center px-1">
          <Button variant="ghost" className="h-11 justify-self-start px-2 text-muted-foreground" onClick={() => router.push('/me')}>
            <CaretLeft data-icon="inline-start" weight="bold" />
            Ara ver
          </Button>
          <p className="flex min-w-0 font-heading font-semibold whitespace-nowrap tabular-nums">
            {plan.source === 'own' && plan.programName ? <span className="truncate">{plan.programName}</span> : null}
            <span className="shrink-0">
              {plan.source === 'own' && plan.programName ? '\u00a0· ' : ''}
              {doc.program?.dayName ?? plan.dayName} · {elapsedText((now - Date.parse(doc.startedAt)) / 1000)}
            </span>
          </p>
          <Button variant="ghost" className="h-11 justify-self-end px-3" onClick={() => setFinishOpen(true)}>
            Bitir
          </Button>
        </div>
        <div className="flex h-11 items-center gap-3 pr-1 pl-4">
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
          <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Antrenman akışı" aria-haspopup="dialog" onClick={() => setFlowOpen(true)}>
            <List weight="bold" className="size-5.5" />
          </Button>
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
                  onSwap={!saving && canSwap(local.plan, doc, row.rowId) ? () => openSwap(row.rowId) : null}
                  onAddSet={!saving && addable(unitKey) ? () => onAddSet(unitKey) : null}
                  onDropExtra={() => onDropExtra(unitKey)}
                  ownProgram={local.plan.source === 'own'}
                />
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(DURATION.base) }}>
                <DonePanel
                  items={flow.active.filter((item) => item.state === 'done' && addable(item.key))}
                  disabled={saving !== null || addBusy !== null}
                  onAddSet={onAddSet}
                  onAddExercise={() => setAddOpen(true)}
                />
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
              onSkip={() => (next ? onSkip(next.unitKey) : undefined)}
              onDropExtra={() => (next ? onDropExtra(next.unitKey) : undefined)}
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
        pain={local.pain}
        rotation={rotation}
        onEffort={onEffort}
        onAmrap={(reps) => (lastSetId ? onAmrapReps(lastSetId, reps) : undefined)}
        onDoSkipped={onDoSkipped}
        onFinish={(reason, choice) => void onFinish(reason, choice)}
        onCancelWorkout={onCancelWorkout}
      />
      <FlowSheet
        open={flowOpen}
        onOpenChange={setFlowOpen}
        view={flow}
        highlight={flowHighlight}
        onJump={onJump}
        onSkip={onSkip}
        onRestore={onRestore}
        onAdd={() => {
          setFlowOpen(false);
          setAddOpen(true);
        }}
      />
      <SwapSheet target={swapTarget} onClose={() => setSwapTarget(null)} onPick={onPickSwap} />
      <AddExerciseSheet open={addOpen} onOpenChange={setAddOpen} todayIds={todayIds} busyId={addBusy} onPick={(item) => void onPickAdd(item)} />
      <EditSetSheet target={editing} onClose={() => setEditing(null)} onSave={onSaveEdit} onDelete={onAskDelete} />
      <DeleteSetDialog target={deleting} onCancel={() => setDeleting(null)} onConfirm={onConfirmDelete} />
      <ProgramUpdateSheet
        items={update?.items ?? null}
        busy={finishing}
        ownName={local?.plan.source === 'own' ? (local.plan.programName ?? null) : null}
        onAnswer={onProgramAnswer}
        onDismiss={() => onProgramAnswer(null)}
      />
      <FinishedElsewhereDialog count={elsewhere?.count ?? null} busy={elsewhereBusy} onAdd={onAddElsewhere} onSkip={() => leave('Bu antrenman başka bir cihazda bitirildi.', 'info')} />
      {/* Yoklama (§2.2): yalnız sağlık onayı varken ve antrenman yeni başlıyorken açılır. */}
      <StartCheck clientId={clientId} local={local} onApply={commit} onLeave={leave} />
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
