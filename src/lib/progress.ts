import { exposureOf, STAGE_LABELS, type Exposure } from './exposure.ts';
import { byPriority, recordsOf, sessionMarks, type RecordEvent, type RecordMark } from './personal-records.ts';
import { mondayOf } from './program-plan.ts';
import type { TrackingType } from './progression.ts';
import type { TrainingExperience } from './schemas/client.ts';
import type { SessionDoc, SessionIndex, SessionIndexRow } from './schemas/session.ts';
import { countsForLoad, muscleLoadOf, type PlanExercise } from './template-plan.ts';

/**
 * İlerleme sekmesi (tasarım `docs/design/antrenman-ekrani.md` §0, §8 satır 10; SPEC §6) — saf hesaplar.
 *
 * Kaynaklar ucuzdan pahalıya:
 * - `sessions-index.json` (tek okuma): antrenman sayısı ve tarihleri (seri, başarılar), haftalık toplam
 *   ağırlık (`volumeKg`) ve hareket başına çalışma seti (haftalık kas yükü), hareket deneyimi (aşama rozeti).
 * - Antrenman dosyaları, blob kimliğiyle ve özetlenmiş hâliyle önbellekte (`digestSession`,
 *   `progress-data.ts`): hareket başına grafikler (en ağır set, tahmini maksimum, toplam ağırlık) ve rekorlar.
 *
 * Kurallar:
 * - Yalnız bitmiş antrenmanlar; çalışma setleri (ısınma hariç). Fazladan ve "bir defalık" setler
 *   yapıldığı için sayılır (tasarım §6.2).
 * - Hareket ve cihaz birlikte izlenir: ağırlık geçmişi cihaza göredir (SPEC §7.3); aynı hareket iki cihazda
 *   yapıldıysa iki ayrı seri (listede cihaz adıyla). Aşama rozeti hareketindir (beceri harekete özgü, §5.2).
 * - Grafikte gün başına bir nokta: aynı gün iki antrenmanda en iyisi (en ağır, tahmini maksimum, en çok
 *   tekrar, en uzun) ve toplamı (ağırlık, tekrar, süre).
 * - Hafta pazartesi başlar; antrenmanın günü dosyadaki başlangıç günüdür (`date`, uygulamanın saat
 *   diliminde, sunucu koyar; gece yarısını geçen antrenman başlangıç gününde kalır, tasarım §4.1).
 * - Haftalık kas yükü şablon haritasının hesabıyla (`muscleLoadOf`: hedef 1, yardımcı 0,5, dengeleyici
 *   0,25; ısınma ve soğuma hareketleri sayılmaz), yapılan setlerle (SPEC §7.4 "gerçekleşen").
 */

/** Özetin biçimi değişirse artar: önbellekteki eski özetler kullanılmaz (2: seans zorluğu eklendi). */
export const DIGEST_VERSION = 2;
/** En çok bu kadar son antrenmanın dosyası okunur (ilk açılışta; sonra önbellekten). */
export const PROGRESS_MAX_SESSIONS = 300;
/** Haftalık görünümler en çok bu kadar hafta geriye gider. */
export const PROGRESS_WEEKS = 12;
/** "Son rekorlar" listesinde en çok. */
export const RECENT_RECORDS = 10;

const DAY_MS = 86_400_000;

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/* --- antrenman özeti --- */

export type DigestSet = { kg?: number; reps?: number; seconds?: number };
export type DigestEntry = { exerciseId: string; title: string; deviceId?: string; sets: DigestSet[] };
/**
 * Bir antrenmanın İlerleme için gereken kısmı: hareket (ve cihaz) başına çalışma setleri ve seans zorluğu
 * (CR-10, bitişten sonra sorulur; antrenman verisidir, sağlık verisi değil — SPEC §4).
 */
export type SessionDigest = { id: string; date: string; startedAt: string; entries: DigestEntry[]; rpe?: number };

/** Seri anahtarı: hareket, cihazlıysa `hareket@cihaz`. */
export function seriesKey(exerciseId: string, deviceId?: string): string {
  return deviceId ? `${exerciseId}@${deviceId}` : exerciseId;
}

/**
 * Antrenman dosyasından özet: çalışma setleri (ısınma hariç; fazladan ve "bir defalık" dahil), hareket ve
 * cihaz başına tek kalem (aynı hareket iki kez eklendiyse setleri birleşir). Seti olmayan hareket düşer.
 */
export function digestSession(doc: Pick<SessionDoc, 'id' | 'date' | 'startedAt' | 'entries'> & Partial<Pick<SessionDoc, 'effort'>>): SessionDigest {
  const entries = new Map<string, DigestEntry>();
  for (const entry of doc.entries) {
    const sets = entry.sets
      .filter((set) => set.type === 'working')
      .map((set) => ({
        ...(set.kg !== undefined ? { kg: set.kg } : {}),
        ...(set.reps !== undefined ? { reps: set.reps } : {}),
        ...(set.seconds !== undefined ? { seconds: set.seconds } : {}),
      }));
    if (sets.length === 0) continue;
    const key = seriesKey(entry.exerciseId, entry.deviceId);
    const current = entries.get(key);
    if (current) current.sets.push(...sets);
    else entries.set(key, { exerciseId: entry.exerciseId, title: entry.title, ...(entry.deviceId ? { deviceId: entry.deviceId } : {}), sets });
  }
  const rpe = doc.effort?.sessionRpe;
  return { id: doc.id, date: doc.date, startedAt: doc.startedAt, entries: [...entries.values()], ...(rpe !== undefined ? { rpe } : {}) };
}

function byStart<T extends { startedAt?: string | undefined; date: string; id: string }>(a: T, b: T): number {
  const at = (item: T) => Date.parse(item.startedAt ?? `${item.date}T00:00:00Z`) || 0;
  return at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/* --- hareket başına --- */

/** Grafiğin günlük noktası. Ağırlıksız harekette ağırlık alanları yok; tekrarsızda tekrar alanları 0. */
export type ExercisePoint = {
  date: string;
  /** En ağır set: ağırlık ve o ağırlıktaki en çok tekrar (1+ tekrarlı, yüklü setler). */
  topKg?: number;
  topReps?: number;
  /** Tahmini maksimum (Epley, 1–12 tekrar) ve geldiği set. */
  e1rm?: number;
  e1rmKg?: number;
  e1rmReps?: number;
  /** Σ ağırlık × tekrar (ACSM 2009 hacim tanımı; süreli set girmez). */
  volumeKg: number;
  bestReps?: number;
  totalReps: number;
  bestSeconds?: number;
  totalSeconds: number;
  sets: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Günlük noktalar: aynı günün setleri birlikte (antrenmanlar eskiden yeniye verilir). */
export function exercisePoints(sessions: readonly { id: string; date: string; sets: readonly DigestSet[] }[]): ExercisePoint[] {
  const days = new Map<string, DigestSet[]>();
  for (const session of sessions) days.set(session.date, [...(days.get(session.date) ?? []), ...session.sets]);
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sets]) => {
      const marks = sessionMarks({ id: '', date, sets }, 'weight_reps');
      const top = marks.find((mark) => mark.kind === 'heaviest');
      const e1rm = marks.find((mark) => mark.kind === 'e1rm');
      const reps = sets.flatMap((set) => (set.reps !== undefined ? [set.reps] : []));
      const seconds = sets.flatMap((set) => (set.seconds !== undefined ? [set.seconds] : []));
      const bestReps = Math.max(0, ...reps);
      const bestSeconds = Math.max(0, ...seconds);
      return {
        date,
        ...(top ? { topKg: top.kg!, topReps: top.reps! } : {}),
        ...(e1rm ? { e1rm: e1rm.value, e1rmKg: e1rm.kg!, e1rmReps: e1rm.reps! } : {}),
        volumeKg: round2(sets.reduce((sum, set) => sum + (set.reps !== undefined ? (set.kg ?? 0) * set.reps : 0), 0)),
        ...(bestReps > 0 ? { bestReps } : {}),
        totalReps: reps.reduce((sum, value) => sum + value, 0),
        ...(bestSeconds > 0 ? { bestSeconds } : {}),
        totalSeconds: seconds.reduce((sum, value) => sum + value, 0),
        sets: sets.length,
      };
    });
}

/** Kütüphanede kaydı olmayan (silinmiş) harekette kayıt türü setlerden: süre → süreli, yük → ağırlıklı. */
export function inferTracking(sets: readonly DigestSet[]): TrackingType {
  if (sets.some((set) => set.seconds !== undefined)) return 'duration';
  if (sets.some((set) => (set.kg ?? 0) > 0)) return 'weight_reps';
  return 'bodyweight_reps';
}

export type ExerciseView = {
  key: string;
  exerciseId: string;
  deviceId?: string;
  /** Kütüphanedeki ad; silinmişse antrenmandaki anlık görüntü. */
  title: string;
  inLibrary: boolean;
  /** Hareket birden çok cihazda yapıldıysa bu serinin cihazı (ağırlık geçmişi cihaza göre, SPEC §7.3). */
  deviceName?: string;
  trackingType: TrackingType;
  /** Bu seride antrenman sayısı. */
  sessions: number;
  firstDate: string;
  lastDate: string;
  /** Hareket deneyimi (§5.7): "Başlangıç · 5. hafta"; sayılan antrenmanı yoksa null. */
  stage: string | null;
  points: ExercisePoint[];
  best: RecordMark[];
  events: RecordEvent[];
  /**
   * Kas → rol payı (hedef 1 · yardımcı 0,5 · dengeleyici 0,25; `setWeightsOf`): Gelişim bölümü kasları
   * bununla tartar (`muscle-progress.ts`). Kütüphanede olmayan, ısınma ve soğuma hareketinde boş.
   */
  muscles: Partial<Record<string, number>>;
};

type Series = { exerciseId: string; deviceId?: string; title: string; sessions: { id: string; date: string; sets: DigestSet[] }[] };

/** Özetlerden seriler (hareket + cihaz), antrenmanlar eskiden yeniye; ad en son antrenmandaki. */
export function seriesOf(digests: readonly SessionDigest[]): Map<string, Series> {
  const series = new Map<string, Series>();
  for (const digest of [...digests].sort(byStart)) {
    for (const entry of digest.entries) {
      const key = seriesKey(entry.exerciseId, entry.deviceId);
      const current = series.get(key) ?? { exerciseId: entry.exerciseId, ...(entry.deviceId ? { deviceId: entry.deviceId } : {}), title: entry.title, sessions: [] };
      current.title = entry.title;
      current.sessions.push({ id: digest.id, date: digest.date, sets: entry.sets });
      series.set(key, current);
    }
  }
  return series;
}

/** Aşama rozeti (§5.7): "Başlangıç · 5. hafta" — hafta, hareketin ilk sayılan antrenmanından bugüne. */
export function stageLabel(exposure: Pick<Exposure, 'sessions' | 'stage' | 'weeks'>): string | null {
  if (exposure.sessions === 0) return null;
  return `${STAGE_LABELS[exposure.stage]} · ${Math.floor(exposure.weeks) + 1}. hafta`;
}

/* --- haftalar --- */

export type WeekView = {
  weekStart: string;
  weekEnd: string;
  /** Bitmiş antrenman ve antrenman günü (aynı gün iki antrenman bir gün). */
  sessions: number;
  days: number;
  volumeKg: number;
  sets: number;
  /** Kas başına kesirli set (gerçekleşen). */
  muscles: Record<string, number>;
};

type WeekRow = Pick<SessionIndexRow, 'id' | 'date' | 'finishedAt' | 'volumeKg' | 'sets' | 'exercises'>;

/**
 * Son `weeks` hafta (bu hafta dahil, ilk antrenmanın haftasından geriye gitmez): antrenman, gün, toplam
 * ağırlık, set ve kas başına set. Antrenmansız haftalar sıfırla yer alır (grafikte boşluk değil, sıfır).
 */
export function weeklyViews<E extends PlanExercise>(input: {
  rows: readonly WeekRow[];
  today: string;
  exercises: ReadonlyMap<string, E>;
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>;
  weeks?: number;
}): WeekView[] {
  const finished = input.rows.filter((row) => row.finishedAt && row.date <= input.today);
  if (finished.length === 0) return [];
  const last = mondayOf(input.today);
  const first = mondayOf(finished.reduce((min, row) => (row.date < min ? row.date : min), input.today));
  const earliest = addDays(last, -7 * ((input.weeks ?? PROGRESS_WEEKS) - 1));
  const views: WeekView[] = [];
  for (let week = first > earliest ? first : earliest; week <= last; week = addDays(week, 7)) {
    const weekEnd = addDays(week, 6);
    const rows = finished.filter((row) => row.date >= week && row.date <= weekEnd);
    const items = rows.flatMap((row) => row.exercises.map((item, i) => ({ key: `${row.id}:${i}`, exerciseId: item.exerciseId, sets: item.sets })));
    views.push({
      weekStart: week,
      weekEnd,
      sessions: rows.length,
      days: new Set(rows.map((row) => row.date)).size,
      volumeKg: round2(rows.reduce((sum, row) => sum + row.volumeKg, 0)),
      sets: rows.reduce((sum, row) => sum + row.sets, 0),
      muscles: muscleLoadOf(items, input.exercises, input.setWeightsOf).load,
    });
  }
  return views;
}

/* --- seri ve başarılar --- */

export type Streak = {
  /** Üst üste hedefi tutan hafta sayısı; bu hafta henüz tutmadıysa seri bozulmaz, geçen haftadan sayılır. */
  current: number;
  best: number;
  /** Bu haftanın antrenman günü. */
  thisWeek: number;
  /** Haftalık hedef (antrenman günü). */
  target: number;
};

/** Hafta başına ayrı antrenman günleri, eskiden yeniye; bugünden sonrası sayılmaz. */
function trainingDaysByWeek(dates: readonly string[], today: string): Map<string, string[]> {
  const weeks = new Map<string, Set<string>>();
  for (const date of dates) {
    if (date > today) continue;
    const week = mondayOf(date);
    weeks.set(week, (weeks.get(week) ?? new Set()).add(date));
  }
  return new Map([...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, days]) => [week, [...days].sort()]));
}

/**
 * Haftalık seri (v1 ALGO-18): hafta, antrenman günü haftalık hedefe ulaşınca sayılır (aynı gün iki
 * antrenman bir gün, "bu hafta x/3" gibi). Bu hafta tuttuysa 1'den, tutmadıysa geçen haftadan geriye.
 * Hedef programın haftalık sıklığıdır; yoksa haftada 1 antrenman **[sentez]**. Bugünkü hedef geçmiş
 * haftalara da uygulanır (o günkü hedef kayıtlı değil).
 */
export function weeklyStreak(dates: readonly string[], today: string, target: number): Streak {
  const goal = Math.max(1, Math.trunc(target) || 1);
  const weeks = trainingDaysByWeek(dates, today);
  const met = (week: string) => (weeks.get(week)?.length ?? 0) >= goal;
  const thisWeekStart = mondayOf(today);
  let current = met(thisWeekStart) ? 1 : 0;
  for (let week = addDays(thisWeekStart, -7); met(week); week = addDays(week, -7)) current += 1;
  let best = 0;
  let run = 0;
  const first = [...weeks.keys()][0];
  for (let week = first ?? thisWeekStart; week <= thisWeekStart; week = addDays(week, 7)) {
    run = met(week) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best, thisWeek: weeks.get(thisWeekStart)?.length ?? 0, target: goal };
}

export type AchievementId = 'first_workout' | 'workouts_10' | 'workouts_25' | 'workouts_50' | 'streak_4' | 'streak_12' | 'first_record';

/**
 * Başarıların eşikleri: antrenman sayısı, üst üste hafta (ilk ay ve ~3 ay **[sentez]**), rekor. Sıra
 * ekrandaki sıradır.
 */
export const ACHIEVEMENT_TARGETS = {
  first_workout: 1,
  workouts_10: 10,
  workouts_25: 25,
  workouts_50: 50,
  streak_4: 4,
  streak_12: 12,
  first_record: 1,
} as const satisfies Record<AchievementId, number>;

/** Başarı: kazanıldığı gün (yoksa null) ve ilerleme (`current`/`target`). */
export type Achievement = { id: AchievementId; achievedOn: string | null; current: number; target: number };

/**
 * Az ve anlamlı başarılar: ilk antrenman; 10, 25, 50 antrenman; 4 ve 12 hafta üst üste haftalık hedef;
 * ilk rekor. Kazanılan kalıcıdır (sonra seri bozulsa da); tarih, eşiğin aşıldığı gündür.
 * `dates`: bitmiş antrenmanların günleri (her antrenman bir kez); `recordDates`: kırılan rekorların günleri.
 */
export function achievementsOf(input: {
  dates: readonly string[];
  recordDates: readonly string[];
  today: string;
  weeklyTarget: number;
}): Achievement[] {
  const dates = input.dates.filter((date) => date <= input.today).sort();
  const streak = weeklyStreak(dates, input.today, input.weeklyTarget);
  // Serinin N. haftaya ilk ulaştığı gün: o haftada hedefin tamamlandığı gün.
  const streakDays = new Map<number, string>();
  let run = 0;
  let previous: string | null = null;
  for (const [week, days] of trainingDaysByWeek(dates, input.today)) {
    if (days.length < streak.target) {
      run = 0;
      previous = week;
      continue;
    }
    run = previous !== null && addDays(previous, 7) === week && run > 0 ? run + 1 : 1;
    previous = week;
    if (!streakDays.has(run)) streakDays.set(run, days[streak.target - 1]!);
  }
  const records = input.recordDates.filter((date) => date <= input.today).sort();

  return (Object.keys(ACHIEVEMENT_TARGETS) as AchievementId[]).map((id): Achievement => {
    const target = ACHIEVEMENT_TARGETS[id];
    if (id === 'streak_4' || id === 'streak_12') {
      const achievedOn = streakDays.get(target) ?? null;
      return { id, achievedOn, current: achievedOn ? target : Math.min(streak.current, target), target };
    }
    const list = id === 'first_record' ? records : dates;
    return { id, achievedOn: list[target - 1] ?? null, current: Math.min(list.length, target), target };
  });
}

/* --- sayfanın tamamı --- */

function positiveWeights(weights: Partial<Record<string, number>>): Partial<Record<string, number>> {
  return Object.fromEntries(Object.entries(weights).filter(([, weight]) => weight !== undefined && weight > 0));
}

/** Bir antrenmanda bir hareketin kırdığı rekorlar (hareket başına bir satır). */
export type RecordItem = {
  sessionId: string;
  date: string;
  key: string;
  title: string;
  deviceName?: string;
  trackingType: TrackingType;
  /** Öne çıkan önce (`RECORD_PRIORITY`). */
  events: RecordEvent[];
};

export type ProgressView = {
  today: string;
  /** Bitmiş antrenman sayısı (index'ten; dosyası okunamayanlar dahil). */
  workouts: number;
  firstDate: string | null;
  /** Kırılan rekor sayısı (antrenman × hareket başına bir). */
  records: number;
  streak: Streak;
  /** Seçici ve grafikler; en son yapılan önce. */
  exercises: ExerciseView[];
  weeks: WeekView[];
  recentRecords: RecordItem[];
  achievements: Achievement[];
  /** Okunamayan antrenman dosyası: grafik ve rekorlar onlarsız. */
  skipped: number;
  /** Yalnız son `PROGRESS_MAX_SESSIONS` antrenmanın dosyası okundu. */
  truncated: boolean;
};

export function buildProgressView<E extends PlanExercise>(input: {
  /** Onarılmış `sessions-index.json`. */
  index: Pick<SessionIndex, 'items'>;
  /** Okunabilen bitmiş antrenmanların özetleri. */
  digests: readonly SessionDigest[];
  now: Date;
  today: string;
  experience?: TrainingExperience | undefined;
  exercises: ReadonlyMap<string, E>;
  deviceNames: ReadonlyMap<string, string>;
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>;
  /** Haftalık hedef (antrenman günü); yoksa 1. */
  weeklyTarget?: number | undefined;
  skipped?: number;
  truncated?: boolean;
}): ProgressView {
  const finished = input.index.items.filter((row) => row.finishedAt);
  const dates = finished.map((row) => row.date).sort();

  const all = seriesOf(input.digests);
  const devicesOf = new Map<string, number>();
  for (const series of all.values()) devicesOf.set(series.exerciseId, (devicesOf.get(series.exerciseId) ?? 0) + 1);

  const exercises: ExerciseView[] = [...all.entries()].map(([key, series]) => {
    const exercise = input.exercises.get(series.exerciseId);
    const trackingType = exercise?.trackingType ?? inferTracking(series.sessions.flatMap((session) => session.sets));
    const { best, events } = recordsOf(series.sessions, trackingType);
    const exposure = exposureOf(series.exerciseId, input.index, input.now, { experience: input.experience });
    const shared = (devicesOf.get(series.exerciseId) ?? 0) > 1 && series.deviceId;
    return {
      key,
      exerciseId: series.exerciseId,
      ...(series.deviceId ? { deviceId: series.deviceId } : {}),
      title: exercise?.title ?? series.title,
      inLibrary: Boolean(exercise),
      ...(shared ? { deviceName: input.deviceNames.get(series.deviceId!) ?? series.deviceId! } : {}),
      trackingType,
      sessions: series.sessions.length,
      firstDate: series.sessions[0]!.date,
      lastDate: series.sessions.at(-1)!.date,
      stage: stageLabel(exposure),
      points: exercisePoints(series.sessions),
      best,
      events,
      muscles: exercise && countsForLoad(exercise.category) ? positiveWeights(input.setWeightsOf(exercise)) : {},
    };
  });
  exercises.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.sessions - a.sessions || a.title.localeCompare(b.title, 'tr'));

  const groups = new Map<string, RecordItem>();
  for (const view of exercises) {
    for (const event of view.events) {
      const id = `${event.sessionId}|${view.key}`;
      const item = groups.get(id) ?? {
        sessionId: event.sessionId,
        date: event.date,
        key: view.key,
        title: view.title,
        ...(view.deviceName ? { deviceName: view.deviceName } : {}),
        trackingType: view.trackingType,
        events: [],
      };
      item.events.push(event);
      groups.set(id, item);
    }
  }
  const order = new Map(input.digests.map((digest) => [digest.id, digest.startedAt]));
  const items = [...groups.values()]
    .map((item) => ({ ...item, events: byPriority(item.events) }))
    .sort((a, b) => b.date.localeCompare(a.date) || (order.get(b.sessionId) ?? '').localeCompare(order.get(a.sessionId) ?? '') || a.title.localeCompare(b.title, 'tr'));

  const weeklyTarget = input.weeklyTarget ?? 1;
  return {
    today: input.today,
    workouts: finished.length,
    firstDate: dates[0] ?? null,
    records: items.length,
    streak: weeklyStreak(dates, input.today, weeklyTarget),
    exercises,
    weeks: weeklyViews({ rows: finished, today: input.today, exercises: input.exercises, setWeightsOf: input.setWeightsOf }),
    recentRecords: items.slice(0, RECENT_RECORDS),
    achievements: achievementsOf({ dates, recordDates: items.map((item) => item.date), today: input.today, weeklyTarget }),
    skipped: input.skipped ?? 0,
    truncated: input.truncated ?? false,
  };
}
