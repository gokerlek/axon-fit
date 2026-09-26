import { todayIn } from './format.ts';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { E1RM_MAX_REPS } from './personal-records.ts';
import { completeDay, currentPhaseOf, mondayOf, nextDayId } from './program-plan.ts';
import { deloadWeight, gridOf, LIGHTEN_FACTOR, isOverload, percentOfTop, type Effort } from './progression.ts';
import { seriesKey } from './progress.ts';
import { LOWER_BODY_PATTERNS } from './recommend.ts';
import type { Client } from './schemas/client.ts';
import type { HealthCheckIn, HealthRecord, Readiness } from './schemas/health.ts';
import type { Program } from './schemas/program.ts';
import { emptySessionIndex, type SessionDoc, type SessionIndex, type SkipReason, type WaterTap } from './schemas/session.ts';
import { adjustDay, checkContextOf, checkParts, evaluateStart, startCheckInBody, withCheckIn, withLighter, type StartAnswers } from './session-check.ts';
import { applyPatch, planFinish } from './session-finish.ts';
import { durationOf, indexRowOf, upsertIndexRow } from './session-index.ts';
import { normalizeSession } from './session-merge.ts';
import { addDays, effectiveSchedule, isoWeekdayOf, normalizeWeekdays } from './training-days.ts';
import { dropAt, withFinishReason } from './workout-flow.ts';
import { buildWorkoutDay, type WorkoutDevice, type WorkoutDay, type WorkoutExercise, type WorkoutRow } from './workout-plan.ts';
import { addWaterTap, cursorOf, logSet, logWarmup, newSessionDoc, nextSet, setEntryEffort, templateRowOf } from './workout-session.ts';

/**
 * Deneme geçmişi — YALNIZ geliştirme (SPEC §13): grafikler ve PT ekranları gerçek bir danışan beklemeden
 * gözden geçirilebilsin diye, bir danışanın programından geçmişe dönük, şemaya uyan bitmiş antrenmanlar.
 * Saf ve tohumdan belirlenimli: aynı program, katalog, gün ve tohum aynı dosyaları verir.
 *
 * Uydurma yalnız danışanın bedeni ve cevaplarıdır; gerisi uygulamanın kendi saf işleridir, ayrı bir mantık
 * yazılmaz. Her antrenman için sırasıyla:
 * - gün planı motorla (`buildWorkoutDay`, öneri katmanı dahil) o güne kadar üretilmiş geçmişten;
 * - yoklama (onay varsa) `evaluateStart` → `adjustDay` ile; cevaplar `startCheckInBody` → `withCheckIn`;
 * - setler telefonun işleriyle (`nextSet` → `logSet`, `logWarmup`, `setEntryEffort`, `dropAt`, `addWaterTap`);
 * - bitiş sunucunun hesabıyla (`planFinish`: tarih, bildirimler, rotasyon), seans zorluğu `PATCH`'in
 *   hesabıyla (`applyPatch`), index satırı `indexRowOf` + `upsertIndexRow` ile.
 *
 * Danışanın bedeni [sentez]: her hareket (ve cihaz) için gizli bir kapasite. Ağırlıkta tahmini maksimum
 * (Epley 1985: ağırlık × (1 + tekrar ÷ 30); tersinden o ağırlıkta en çok tekrar), vücut ağırlığında en çok
 * tekrar, sürede en uzun süre. Setten sete bir tekrar (sürede 3 sn) yorgunluk. Danışan planın hedefini
 * yapar; bol payı varsa aralığın tepesine kadar zorlar, yetmezse yapabildiği kadar. Hareketin ilk
 * antrenmanında plan ızgaranın en hafifini önerir ("rahat bir ağırlıkla başla"); danışan ~12 tekrarlık
 * ağırlığını girer ve gerekirse aşırı yükü onaylar (PT'ye `overload` bildirimi). Hareket başına zorluk
 * cevabı son tam yük setindeki paydan: 4+ Kolay, 2–3 İyi, ≤1 Zor; onda biri cevapsız (motor İyi sayar).
 * Kapasite her antrenmanla büyür, başta hızlı, sonra yavaş (antrenmansızda kazanım daha büyük: Rhea 2003
 * meta-analizi; Kraemer & Ratamess 2004); oranlar [sentez].
 *
 * Senaryo (hepsi tohumdan): danışanın antrenman günlerinde (programdaki geçerli günler, yoksa haftalık
 * sıklığa göre yayılmış, o da yoksa Pzt/Çar/Cum), bugünden önceki `weeks` haftada; yolun ~%40'ında bir
 * hafta hiç antrenman yok; ağırlıklı bir bileşik harekette ortalarda üç antrenman üst üste tıkanma (son
 * setler alt sınırın altında) ve motorun kendi hafifletmesi (`deload`), sonra toparlanma; ~%72'den sonra,
 * tıkanan hareketin olmadığı bir günde hafif gün (hazır oluşluk onayı varsa düşük yoklama ve "Evet,
 * hafiflet"; yoksa plandan hafif yapılıp programa yazılmayan ağırlık: `lighter`); birkaç antrenmanda son
 * hareket geçilir (bitişte neden); antrenman içinde ve dışında (`water.json`) su. Seans zorluğu (CR-10)
 * antrenman verisidir, onay istemez (SPEC §7.5); sağlık yoklaması (hazır oluşluk, ağrı) yalnız o parçanın
 * onayı varsa ve iyi huyludur: kural hiçbir antrenmanı durdurmaz ya da geri çekmez.
 *
 * İsteğe bağlı gerileme (`declining`, varsayılan kapalı): tıkanandan başka bir ağırlıklı harekette son
 * ~5 haftada kapasite her antrenmanda ~%2 düşer (uyku, stres, kalori açığı ya da küçük bir sakatlıkla
 * görülebilecek kadar; toplam ~%8–12) [sentez]. Düşüş başlarken kapasite son antrenmanda gösterilen tahmini
 * maksimumun biraz üstüne iner (yedekteki pay düşüşü gizlemesin): tekrarlar her antrenmanda biraz azalır,
 * motor kendi kuralıyla tutar, azaltır, hafifletir. Gelişim'in
 * "Gerileme" durumu ve Genel bakış'ın "geriliyor" maddesi gerçek bir danışan beklemeden gözden geçirilsin
 * diye. Kapalıyken üretim birebir aynıdır (tohumdan fazladan sayı çekilmez).
 *
 * Tanıma: seans kimlikleri `s_demo` + 4, su dokunuşları `wt_demo` + 4, yazan cihaz `w_demo01`. Şema aynı
 * olduğu için uygulama bunları sıradan kayıt gibi okur; yeniden tohumlama yalnız bunları değiştirir
 * (`demo-seed.ts`). Tarihler uygulamanın saat diliminde, hepsi bugünden önce.
 */

export const DEMO_SESSION_PREFIX = 's_demo';
export const DEMO_TAP_PREFIX = 'wt_demo';
export const DEMO_WRITER = 'w_demo01';
export const DEMO_DEFAULT_WEEKS = 12;
export const DEMO_MAX_WEEKS = 52;
/** Kimliğin sayaç kısmı (4 hane, 36 tabanı). */
const COUNTER_LENGTH = 4;

export function isDemoSessionId(id: string): boolean {
  return id.startsWith(DEMO_SESSION_PREFIX);
}

export function isDemoTapId(id: string): boolean {
  return id.startsWith(DEMO_TAP_PREFIX);
}

function counterId(prefix: string, n: number): string {
  return `${prefix}${n.toString(36).padStart(COUNTER_LENGTH, '0')}`;
}

export function demoSessionId(n: number): string {
  return counterId(DEMO_SESSION_PREFIX, n);
}

export function demoTapId(n: number): string {
  return counterId(DEMO_TAP_PREFIX, n);
}

/* --- tohum --- */

export type Random = {
  /** [0, 1) */
  next(): number;
  /** [min, max] tam sayı. */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** `randomId`'nin istediği bayt kaynağı. */
  bytes(n: number): Uint8Array;
};

/** FNV-1a ile tohum → 32 bit, mulberry32 üreteci: küçük, hızlı, belirlenimli (kriptografik değil). */
export function seededRandom(seed: string | number): Random {
  let state = 0x811c9dc5;
  for (const char of String(seed)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(next() * items.length))] as T,
    bytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(next() * 256)),
  };
}

/* --- takvim --- */

/** Gün seçilmemişse haftalık sıklığa göre yayılmış günler (ISO; 1 = Pazartesi) [sentez]. */
const SPREAD: Record<number, number[]> = {
  1: [3],
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

/** Antrenman günleri: programdaki geçerli günler (danışanınki ?? PT'ninki), yoksa sıklığa göre, o da yoksa 3 gün. */
export function demoWeekdays(program: Program): number[] {
  const chosen = effectiveSchedule(program).weekdays;
  if (chosen.length > 0) return [...chosen];
  const perWeek = currentPhaseOf(program)?.phase.daysPerWeek ?? 3;
  return SPREAD[Math.min(7, Math.max(1, perWeek))] ?? [1, 3, 5];
}

/**
 * Antrenman tarihleri: bugünden önceki `weeks` × 7 günde antrenman günlerine düşenler, eskiden yeniye.
 * 4 haftadan uzun geçmişte yolun ~%40'ındaki takvim haftası (pazartesi başlar) boş kalır.
 */
export function demoCalendar(input: { today: string; weeks: number; weekdays: readonly number[] }): { from: string; dates: string[]; missedWeek: string | null } {
  const from = addDays(input.today, -7 * input.weeks);
  const selected = new Set(normalizeWeekdays(input.weekdays));
  const missedWeek = input.weeks >= 4 ? mondayOf(addDays(from, Math.floor(7 * input.weeks * 0.4))) : null;
  const dates: string[] = [];
  for (let day = from; day < input.today; day = addDays(day, 1)) {
    if (selected.has(isoWeekdayOf(day)) && mondayOf(day) !== missedWeek) dates.push(day);
  }
  return { from, dates, missedWeek };
}

/** Saat dilimindeki bir anın UTC farkı (ms): yerel duvar saati − UTC. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wall - Math.floor(at / 1000) * 1000;
}

/** Takvim günü ve yerel dakika (18:30 → 1110) → an; yaz saati geçişinde bir kez düzeltilir. */
export function zonedTime(day: string, minutes: number, timeZone: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  const first = wall - zoneOffsetMs(wall, timeZone);
  return new Date(wall - zoneOffsetMs(first, timeZone));
}

/* --- danışanın bedeni --- */

/** Epley'in tersi: tahmini maksimumu `e1rm` olan kişi `kg`'de en çok kaç tekrar yapar (0–50). */
export function repsAt(e1rm: number, kg: number): number {
  if (kg <= 0) return 50;
  return Math.max(0, Math.min(50, Math.floor(30 * (e1rm / kg - 1) + 1e-9)));
}

/**
 * Setin değeri: `available` yapabileceği en çok, `aim` planın hedefi, `top` aralığın tepesi. Bol pay
 * (hedefin `push` üstü) varsa tepeye kadar zorlar ama `reserve` kadar yedekte bırakır; hedef tutuyorsa
 * hedef; yetmiyorsa yapabildiği (en az 1). AMRAP'ta hepsi. Pay: yedekte kalan.
 */
export function chooseValue(input: { available: number; aim: number; top: number; amrap?: boolean; push: number; reserve: number }): { value: number; margin: number } {
  const { available, aim, top } = input;
  let value: number;
  if (input.amrap) value = available;
  else if (available >= aim + input.push) value = Math.max(aim, Math.min(top, available - input.reserve));
  else if (available >= aim) value = aim;
  else value = available;
  value = Math.max(1, value);
  return { value, margin: Math.max(0, available - value) };
}

/** Hareketin zorluk cevabı son tam yük setindeki paydan (`EFFORT_RIR` ölçeğiyle). */
export function effortOf(margin: number): Exclude<Effort, 'fail'> {
  return margin >= 4 ? 'easy' : margin >= 2 ? 'good' : 'hard';
}

type Capacity = { kind: 'weight' | 'reps' | 'seconds'; value: number; exposures: number };

/** Başlangıçta rahat çalışma ağırlığı (ekipman, tür; alt vücut bileşiği ağır) [sentez]. */
const START_KG: Record<string, [compound: number, isolation: number]> = {
  barbell: [35, 20],
  dumbbell: [12, 7],
  machine: [35, 20],
  cable: [20, 12.5],
  kettlebell: [12, 8],
};

function startCapacity(row: WorkoutRow, exercise: WorkoutExercise, aimMin: number, random: Random): Capacity {
  const grid = row.trackingType === 'weight_reps' ? gridOf(row.spec) : null;
  if (grid) {
    const [compound, isolation] = START_KG[exercise.equipment] ?? [20, 12];
    let kg = exercise.category === 'compound' ? compound : isolation;
    if (exercise.category === 'compound' && exercise.pattern && LOWER_BODY_PATTERNS.has(exercise.pattern)) kg *= 1.4;
    if (Number.isFinite(grid.max) && kg > grid.max * 0.7) kg = grid.max * 0.5;
    // Rahat ağırlık ~12 tekrarlık (tahmini maksimum Epley'le); cihazın en hafifi daha ağırsa o ~15 tekrarlık.
    const reps = grid.floor(kg) < grid.min ? 15 : 12;
    kg = Math.max(grid.min, grid.floor(kg));
    return { kind: 'weight', value: kg * (1 + reps / 30) * (0.92 + random.next() * 0.16), exposures: 0 };
  }
  if (row.trackingType === 'duration') return { kind: 'seconds', value: aimMin + 5 + random.int(0, 10), exposures: 0 };
  return { kind: 'reps', value: aimMin + 1 + random.int(0, 2), exposures: 0 };
}

/** Gerilemede antrenman başına kapasite kaybı (~%2, ±%25) [sentez]. */
const DECLINE_RATE = 0.02;
/** Gerileme son bu kadar haftada (yolun yarısından önce başlamaz). */
export const DECLINE_WEEKS = 5;

/** Gerileme başlarken kapasite son gösterilenin en çok bu kadar üstünde [sentez]. */
const DECLINE_ANCHOR = 1.03;

function fade(capacity: Capacity, random: Random): Capacity {
  return { ...capacity, value: capacity.value * (1 - DECLINE_RATE * (0.75 + random.next() * 0.5)) };
}

/** Serinin son antrenmanında gösterilen tahmini maksimum (Epley, 1–12 tekrarlı yüklü çalışma setleri); yoksa undefined. */
function shownMax(sessions: readonly SessionDoc[], key: string): number | undefined {
  for (let position = sessions.length - 1; position >= 0; position--) {
    const sets = sessions[position]!.entries
      .filter((entry) => seriesKey(entry.exerciseId, entry.deviceId) === key)
      .flatMap((entry) => entry.sets.filter((set) => set.type === 'working' && (set.kg ?? 0) > 0 && (set.reps ?? 0) >= 1 && (set.reps ?? 0) <= E1RM_MAX_REPS));
    if (sets.length > 0) return Math.max(...sets.map((set) => set.kg! * (1 + set.reps! / 30)));
  }
  return undefined;
}

/** Antrenmandan sonra uyum: başta hızlı, sonra yavaş [sentez; Rhea 2003 yeni başlayanda hızlı artış]. */
function grow(capacity: Capacity, random: Random): Capacity {
  const jitter = 0.6 + random.next() * 0.8;
  const early = capacity.exposures < 4;
  const middle = capacity.exposures < 8;
  const value =
    capacity.kind === 'weight'
      ? capacity.value * (1 + (early ? 0.035 : middle ? 0.022 : 0.012) * jitter)
      : capacity.kind === 'reps'
        ? capacity.value + (early ? 0.8 : 0.4) * jitter
        : capacity.value + (early ? 5 : 2.5) * jitter;
  return { ...capacity, value, exposures: capacity.exposures + 1 };
}

/* --- yoklama cevapları --- */

/** Olağan gün: dördü de 3–5 (puan ≥ 60, hafifletme sorulmaz). */
function normalReadiness(random: Random): Readiness {
  const answer = () => random.pick([3, 4, 4, 4, 5] as const);
  return { sleep: answer(), energy: answer(), soreness: answer(), stress: answer() };
}

/** Hafif gün: kötü uyku, düşük enerji, stres (puan 45 < 60: "Hacmi hafifletelim mi?"). */
const LOW_READINESS: Readiness = { sleep: 2, energy: 2, soreness: 3, stress: 2 };

/* --- üretim --- */

export type DemoInput = {
  program: Program;
  exercises: ReadonlyMap<string, WorkoutExercise>;
  devices: ReadonlyMap<string, WorkoutDevice>;
  client: Pick<Client, 'modules' | 'consents' | 'training'>;
  now: Date;
  timeZone: string;
  weeks?: number | undefined;
  seed?: string | number | undefined;
  /** Gerileme senaryosu: bir hareket son haftalarda geriler; varsayılan kapalı. */
  declining?: boolean | undefined;
};

export type DemoSummary = {
  from: string;
  to: string;
  weekdays: number[];
  sessions: number;
  /** Boş bırakılan haftanın pazartesisi. */
  missedWeek: string | null;
  lighter: { sessionId: string; date: string; via: 'readiness' | 'weight' } | null;
  stall: { exerciseId: string; title: string; from: string; deload: string | null } | null;
  /** Gerileme senaryosu: geriyen hareket ve düşüşün başladığı antrenman günü; kapalıysa ya da hareket yoksa null. */
  decline: { exerciseId: string; title: string; from: string } | null;
  /** Hareketi geçilen antrenman sayısı. */
  skipped: number;
  /** Seans zorluğu cevaplanmayan antrenman sayısı. */
  unanswered: number;
  checkIns: number;
  waterTaps: number;
};

export type DemoHistory = {
  /** Eskiden yeniye bitmiş antrenmanlar. */
  sessions: SessionDoc[];
  /** Yalnız bu antrenmanların index'i (rekorlarıyla). */
  index: SessionIndex;
  /** `water.json`'a giden antrenman dışı su. */
  waterTaps: WaterTap[];
  /** `health.json`'a giden yoklamalar; onay yoksa boş. */
  checkIns: HealthCheckIn[];
  summary: DemoSummary;
};

export function clampWeeks(weeks: number | undefined): number {
  if (weeks === undefined || !Number.isFinite(weeks)) return DEMO_DEFAULT_WEEKS;
  return Math.min(DEMO_MAX_WEEKS, Math.max(1, Math.round(weeks)));
}

/**
 * Rotasyonun başı: son üretilen antrenman programdaki sıradaki günden hemen önceki gün olsun (hepsi
 * ilerlerse), programa yazmadan geçmiş gerçek rotasyonla tutarlı kalır.
 */
function startingRotation(program: Program, sessions: number): Program {
  const days = currentPhaseOf(program)?.phase.days ?? [];
  if (days.length === 0) return program;
  const next = Math.max(0, days.findIndex((day) => day.id === nextDayId(program)));
  const before = (((next - sessions - 1) % days.length) + days.length) % days.length;
  const lastDayId = days[before]?.id;
  return { ...program, rotation: lastDayId ? { lastDayId } : {} };
}

/**
 * Tıkanma (ya da gerileme) yaşayacak hareket: günlerin sırasıyla ilk ağırlıklı, en az iki tam yük setli bileşik
 * (yoksa ağırlıklı) satır; `except` dışında (gerileme tıkanandan başka harekette).
 */
function stallCandidate(program: Program, exercises: ReadonlyMap<string, WorkoutExercise>, except: string | null = null): string | null {
  const rows = (currentPhaseOf(program)?.phase.days ?? []).flatMap((day) => day.blocks.flatMap((block) => block.rows));
  const weighted = rows.filter((row) => {
    const exercise = exercises.get(row.exerciseId);
    return (
      row.exerciseId !== except &&
      exercise?.trackingType === 'weight_reps' &&
      (exercise.loadStepKg > 0 || exercise.deviceId) &&
      row.sets.filter((set) => (set.loadPct ?? 100) >= 100).length >= 2
    );
  });
  const compound = weighted.find((row) => exercises.get(row.exerciseId)?.category === 'compound');
  return (compound ?? weighted[0])?.exerciseId ?? null;
}

/**
 * Hafif gün: yolun ~%72'sinden sonra, tıkanan hareketin olmadığı ilk gün (tıkanma hafifletmesiyle aynı
 * güne düşmesin; hepsi ilerlediği için sıradaki günler rotasyondan bellidir). 6'dan az antrenmanda yok.
 */
function lighterSession(program: Program, sessions: number, stallExercise: string | null): number {
  if (sessions < 6) return -1;
  const start = Math.round(sessions * 0.72);
  const days = currentPhaseOf(program)?.phase.days ?? [];
  const first = Math.max(0, days.findIndex((day) => day.id === nextDayId(program)));
  for (let n = start; n < sessions; n++) {
    const day = days[(first + n) % Math.max(1, days.length)];
    if (!day?.blocks.some((block) => block.rows.some((row) => row.exerciseId === stallExercise))) return n;
  }
  return start;
}

type Stall = { exerciseId: string; key: string | null; active: boolean; done: boolean; count: number; saved: number; from: string | null; deload: string | null; title: string };
/** `start`: düşüşün en erken günü; `key`: hareket (ve cihaz) serisi; `from`: ilk düşen antrenman günü. */
type Decline = { exerciseId: string; title: string; start: string; key: string | null; from: string | null };

const SKIP_REASONS: readonly Exclude<SkipReason, 'other'>[] = ['no_time', 'tired', 'busy', 'no_equipment'];
/** Tıkanmayı başlatabilen plan gerekçeleri (hafifletme ve ilk antrenman değil). */
const STALL_START = new Set(['increase', 'add_rep', 'hold', 'confirm_increase', 'reps_first', 'device_max', 'lighter_retry']);

const MINUTE = 60_000;

export function generateDemoHistory(input: DemoInput): DemoHistory {
  const { exercises, devices, client, timeZone } = input;
  const weeks = clampWeeks(input.weeks);
  const random = seededRandom(input.seed ?? 1);
  const bytes = (n: number) => random.bytes(n);
  const today = todayIn(timeZone, input.now);
  const weekdays = demoWeekdays(input.program);
  const { from, dates, missedWeek } = demoCalendar({ today, weeks, weekdays });
  const parts = checkParts(client);
  const experience = client.training?.experience;

  let program = startingRotation(input.program, dates.length);
  const stallExercise = stallCandidate(input.program, exercises);
  const lighterAt = lighterSession(program, dates.length, stallExercise);
  const stallFrom = Math.floor(dates.length * 0.4);
  const declineExercise = input.declining ? stallCandidate(input.program, exercises, stallExercise) : null;
  const decline: Decline | null =
    declineExercise && dates.length > 0
      ? {
          exerciseId: declineExercise,
          title: exercises.get(declineExercise)?.title ?? declineExercise,
          // Son `DECLINE_WEEKS` hafta; kısa geçmişte yolun yarısından (önce bir yükseliş olsun).
          start: [addDays(today, -7 * DECLINE_WEEKS), dates[Math.floor(dates.length / 2)]!].sort().at(-1)!,
          key: null,
          from: null,
        }
      : null;
  const skipSessions = new Set<number>();
  for (let n = 3; n < dates.length; n += random.int(6, 10)) if (n !== lighterAt) skipSessions.add(n);

  let index = emptySessionIndex();
  let health: HealthRecord = { conditions: [], checkIns: [], measurements: [], movementScreens: [] };
  const sessions: SessionDoc[] = [];
  const capacities = new Map<string, Capacity>();
  const stall: Stall | null = stallExercise
    ? { exerciseId: stallExercise, key: null, active: false, done: false, count: 0, saved: 0, from: null, deload: null, title: exercises.get(stallExercise)?.title ?? stallExercise }
    : null;
  let lighter: DemoSummary['lighter'] = null;
  let skipped = 0;
  let unanswered = 0;
  let sessionTaps = 0;

  for (const [n, date] of dates.entries()) {
    const weekend = isoWeekdayOf(date) >= 6;
    const startedAt = zonedTime(date, (weekend ? 10 * 60 : 18 * 60) + 5 * random.int(0, 18), timeZone);
    const stamp = (at: number) => ({ at: new Date(at).toISOString(), by: DEMO_WRITER });
    let day: WorkoutDay | null = buildWorkoutDay({
      program,
      exercises,
      devices,
      history: sessions,
      insight: { index, now: startedAt, experience },
    });
    if (!day) break;
    const dayId = day.dayId;
    const advance = (at: Date) => {
      program = completeDay(program, dayId, at);
    };
    if (day.blocks.length === 0) {
      advance(startedAt);
      continue;
    }

    // Yoklama (onaylı parçalar): hafif günde düşük hazır oluşluk ve "Evet, hafiflet"; arada bir "Bugün atla".
    const lightDay = n === lighterAt;
    const answers: StartAnswers = {};
    const asked = (parts.readiness || parts.pain) && (lightDay || !random.chance(0.08));
    if (asked && parts.readiness) answers.readiness = lightDay ? LOW_READINESS : normalReadiness(random);
    const context = checkContextOf({ parts, record: health, today: date });
    if (asked && parts.pain) {
      answers.painBaseline = random.pick([0, 0, 0, 1, 1]);
      answers.redFlag = 'none';
      if (context.previous) answers.returnedToBaseline = true;
      if (random.chance(0.3)) answers.irritability = 'low';
      if (random.chance(0.3)) answers.symptomDirection = 'stable';
    }
    const outcome = evaluateStart({ context, answers });
    if (outcome.stop) {
      advance(startedAt);
      continue;
    }
    const adjusted = parts.readiness || parts.pain ? adjustDay(day, { outcome, lighten: lightDay && outcome.low, mode: context.mode }) : null;
    if (adjusted) day = adjusted.day;
    const readinessLighter = Boolean(adjusted?.lighter && adjusted.adjustReason === 'readiness');
    const weightLighter = lightDay && !readinessLighter;

    let doc: SessionDoc = { ...newSessionDoc(day, { today: date, now: startedAt, writer: DEMO_WRITER, random: bytes }), id: demoSessionId(n) };
    if (adjusted?.lighter) doc = withLighter(doc, startedAt.toISOString());
    const check = startCheckInBody({ parts, answers, sessionId: doc.id, adjustReason: adjusted?.adjustReason });
    if (check) health = withCheckIn(health, { date, entry: check });

    // Setler: telefonun imleciyle, sıradaki set boşalana kadar.
    const units = cursorOf(day, doc).units;
    const skipKey = skipSessions.has(n) && units.length >= 3 ? (units.at(-1)?.key ?? null) : null;
    let t = startedAt.getTime() + random.int(3, 6) * MINUTE;
    const done = new Map<string, number>();
    const firstTop = new Map<string, number>();
    const last = new Map<string, { margin: number; at: number }>();
    const performed = new Set<string>();
    let stalledToday = false;
    let decliningToday = false;
    let deloadToday = false;
    let skippedToday = false;
    for (let guard = 0; guard < 500; guard++) {
      const next = nextSet(day, doc);
      if (!next) break;
      if (next.unitKey === skipKey && !skippedToday) {
        doc = dropAt(day, doc, next.unitKey, stamp(t), bytes);
        skippedToday = true;
        continue;
      }
      const row = day.rows[next.rowId];
      const template = templateRowOf(day, next.rowId);
      const exercise = row ? exercises.get(row.exerciseId) : undefined;
      if (!row || !template || !exercise) break;
      const key = seriesKey(row.exerciseId, row.deviceId);
      const fullSets = template.sets.filter((set) => (set.loadPct ?? 100) >= 100);
      const aimMin = Math.min(...(fullSets.length > 0 ? fullSets : template.sets).map((set) => set.min));
      let capacity = capacities.get(key) ?? startCapacity(row, exercise, aimMin, random);
      const k = done.get(next.rowId) ?? 0;

      // Tıkanma: plan artıştan sonra ağırlığı tutarken kapasite düşer; motor hafifletince toparlanır.
      if (stall && k === 0 && row.exerciseId === stall.exerciseId && capacity.kind === 'weight' && !stall.done) {
        if (!stall.active && n >= stallFrom && capacity.exposures >= 4 && STALL_START.has(row.plan.reason)) {
          stall.active = true;
          stall.key = key;
          stall.saved = capacity.value;
          stall.from = date;
        }
        if (stall.active && stall.key === key && row.plan.reason === 'deload') {
          stall.active = false;
          stall.done = true;
          stall.deload = date;
          deloadToday = true;
          capacity = { ...capacity, value: stall.saved * 1.02 };
        } else if (stall.active && stall.key === key && row.plan.reason !== 'lighten') {
          stall.count += 1;
          stalledToday = true;
          if (stall.count > 6) {
            stall.active = false;
            stall.done = true;
            capacity = { ...capacity, value: stall.saved };
          }
        }
      }
      const stalling = Boolean(stall?.active && stall.key === key);

      // Gerileme: pencerede her antrenmanın başında kapasite biraz düşer (büyüme yok, aşağıda).
      if (decline && k === 0 && row.exerciseId === decline.exerciseId && capacity.kind === 'weight' && date >= decline.start) {
        decline.key ??= key;
        if (decline.key === key) {
          const shown = decline.from === null ? shownMax(sessions, key) : undefined;
          if (shown !== undefined) capacity = { ...capacity, value: Math.min(capacity.value, shown * DECLINE_ANCHOR) };
          capacity = fade(capacity, random);
          decline.from ??= date;
          decliningToday = true;
        }
      }

      if (k === 0) {
        for (const [position] of (row.warmups ?? []).entries()) {
          t += random.int(50, 80) * 1000;
          doc = logWarmup(day, doc, { rowId: next.rowId, index: position, stamp: stamp(t), random: bytes });
        }
      }

      const planned = row.plan.sets.find((set) => set.setIndex === next.setIndex);
      const aim = planned?.target ?? next.target.min;
      const amrap = planned?.amrap ?? Boolean(next.target.amrap);
      const weighted = row.trackingType === 'weight_reps';
      const grid = weighted ? gridOf(row.spec) : null;
      let kg = weighted ? (next.kg ?? next.plannedKg) : undefined;
      let available: number;
      if (grid && capacity.kind === 'weight') {
        // İlk kez: "rahat bir ağırlıkla başla" — plan ızgaranın en hafifini önerir, danışan ~12 tekrarlık
        // ağırlığını girer; sınırı aşarsa "Hedefin çok üzerindesin"i onaylar (`overload`, PT'ye bildirim).
        if (capacity.exposures === 0 && row.plan.reason === 'first_time') {
          const top = firstTop.get(next.rowId) ?? Math.max(row.plan.topWeightKg, grid.floor(capacity.value / (1 + 12 / 30)));
          firstTop.set(next.rowId, top);
          kg = percentOfTop(top, next.target.loadPct, row.spec);
        }
        // Hafif gün (onaysız): her set planın ağırlığından ~%15 az (önceki setin hafifinden değil).
        const load = weightLighter ? deloadWeight(next.plannedKg, row.spec, LIGHTEN_FACTOR) : (kg ?? next.plannedKg);
        kg = load;
        // Tıkanmada kapasite, tam yük setlerinin alt sınırı ilk sette ancak tutacak kadar.
        const e1rm = stalling && row.plan.reason !== 'lighten' ? row.plan.topWeightKg * (1 + (aimMin + 0.5) / 30) : capacity.value;
        available = repsAt(e1rm, load) - k;
      } else if (capacity.kind === 'seconds') {
        available = Math.floor(capacity.value) - 3 * k;
      } else {
        available = Math.floor(capacity.value) - k;
      }
      const seconds = row.trackingType === 'duration';
      const { value, margin } = chooseValue({
        available,
        aim,
        top: next.target.max,
        amrap,
        push: seconds ? 10 : 4,
        reserve: seconds ? 8 : 3,
      });
      t += (seconds ? value + 10 : random.int(30, 50)) * 1000;
      const overload = grid !== null && kg !== undefined && isOverload(next.plannedKg, kg);
      doc = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg, value, overload, stamp: stamp(t), random: bytes }).doc;
      done.set(next.rowId, k + 1);
      if (!amrap && (next.target.loadPct ?? 100) >= 100) last.set(next.rowId, { margin, at: t });
      if (!performed.has(key)) {
        performed.add(key);
        capacities.set(key, capacity);
      }
      t += Math.max(0, next.restAfterSeconds + random.int(-10, 30)) * 1000;
    }

    // Uyum: yapılan her hareket (tıkanmada ve gerilemede büyüme yok).
    for (const key of performed) {
      const capacity = capacities.get(key);
      if (!capacity) continue;
      const held = (stall?.active && stall.key === key) || (decliningToday && decline?.key === key);
      capacities.set(key, held ? { ...capacity, exposures: capacity.exposures + 1 } : grow(capacity, random));
    }

    // Zorluk: hareket başına bir cevap (son tam yük setindeki paydan); onda biri cevapsız.
    for (const entry of doc.entries) {
      const row = entry.rowId ? last.get(entry.rowId) : undefined;
      if (!row || random.chance(0.1)) continue;
      doc = setEntryEffort(doc, entry.id, effortOf(row.margin), stamp(row.at));
    }
    // Plandan hafif yapılan ağırlık programa yazılmadı ("Hayır, aynı kalsın"): `lighter` (§5.5).
    if (weightLighter) {
      const at = stamp(t).at;
      doc = normalizeSession({
        ...doc,
        entries: doc.entries.map((entry) =>
          entry.sets.some((set) => set.type === 'working' && set.kg !== undefined && set.plannedKg !== undefined && set.kg < set.plannedKg)
            ? { ...entry, lighter: true, updatedAt: at, by: DEMO_WRITER }
            : entry,
        ),
      });
    }
    // Su: antrenman içinde 1–3 bardak.
    const span = t - startedAt.getTime();
    for (let count = random.int(1, 3); count > 0; count--) {
      doc = addWaterTap(doc, 1, stamp(startedAt.getTime() + Math.floor(random.next() * span)), bytes).doc;
      sessionTaps += 1;
    }

    const finishedAt = new Date(t + random.int(60, 180) * 1000);
    if (skippedToday) {
      doc = withFinishReason(day, doc, random.pick(SKIP_REASONS), stamp(finishedAt.getTime()), bytes).doc;
      skipped += 1;
    }
    const finish = planFinish({ stored: null, incoming: doc, index, program, healthFile: null, client, now: finishedAt, timeZone });
    let finished = finish.doc;

    // Antrenman sonrası kart (10 dk – 24 saat): seans zorluğu ve süre; ağrı takibi onaylıysa en yüksek ağrı.
    if (random.chance(0.88)) {
      const base = readinessLighter || weightLighter || deloadToday ? 4 : stalledToday ? 8 : decliningToday ? 7 : n < 3 ? 5 : 6;
      const sessionRpe = Math.min(10, Math.max(1, base + random.int(-1, 1)));
      const durationMin = durationOf(finished);
      const answeredAt = new Date(finishedAt.getTime() + random.int(12, 90) * MINUTE);
      finished = applyPatch(
        finished,
        { writer: DEMO_WRITER, effort: { sessionRpe, ...(durationMin !== undefined && durationMin >= 1 ? { durationMin } : {}) } },
        answeredAt,
      ).doc;
      if (parts.pain) health = withCheckIn(health, { date, entry: { sessionId: finished.id, painPeak: random.pick([0, 0, 1, 1, 2]) } });
    } else {
      unanswered += 1;
    }

    index = upsertIndexRow(index, indexRowOf(finished, gitBlobSha(jsonText(finished))));
    sessions.push(finished);
    if (finish.rotation.choice === 'advance') advance(finishedAt);
    if (finished.adjust === 'lighter' || finished.entries.some((entry) => entry.lighter)) {
      lighter = { sessionId: finished.id, date, via: finished.adjust === 'lighter' ? 'readiness' : 'weight' };
    }
  }

  const waterTaps = dayWater({ from, today, timeZone, random });
  return {
    sessions,
    index,
    waterTaps,
    checkIns: health.checkIns,
    summary: {
      from,
      to: addDays(today, -1),
      weekdays: normalizeWeekdays(weekdays),
      sessions: sessions.length,
      missedWeek,
      lighter,
      stall: stall?.from ? { exerciseId: stall.exerciseId, title: stall.title, from: stall.from, deload: stall.deload } : null,
      decline: decline?.from ? { exerciseId: decline.exerciseId, title: decline.title, from: decline.from } : null,
      skipped,
      unanswered,
      checkIns: health.checkIns.length,
      waterTaps: waterTaps.length + sessionTaps,
    },
  };
}

/**
 * Antrenman dışı su (`water.json`): günlerin ~%85'inde 4–9 bardak, 08:00–22:30 arası; arada bir "Geri al"
 * (−1). Kimlikler sayaçla (`wt_demo` + 4).
 */
function dayWater(input: { from: string; today: string; timeZone: string; random: Random }): WaterTap[] {
  const { random } = input;
  const taps: WaterTap[] = [];
  let counter = 0;
  for (let day = input.from; day < input.today; day = addDays(day, 1)) {
    if (!random.chance(0.85)) continue;
    const minutes = Array.from({ length: random.int(4, 9) }, () => random.int(8 * 60, 22 * 60 + 30)).sort((a, b) => a - b);
    for (const minute of minutes) {
      const at = zonedTime(day, minute, input.timeZone);
      taps.push({ id: demoTapId(counter++), d: 1, at: at.toISOString() });
      if (random.chance(0.02)) taps.push({ id: demoTapId(counter++), d: -1, at: new Date(at.getTime() + 20_000).toISOString() });
    }
  }
  return taps;
}
