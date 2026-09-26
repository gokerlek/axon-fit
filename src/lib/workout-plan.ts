import { loadSpecFor, type DeviceLoadSettings } from './device-loads.ts';
import { currentPhaseOf, nextDayId, weekProgress } from './program-plan.ts';
import { planSession, warmupSets, type LoadSpec, type ProgressionRule, type SessionPlan, type TrackingType } from './progression.ts';
import type { Program } from './schemas/program.ts';
import type { SessionDoc, SessionEntry, SessionIndex, SessionIndexRow } from './schemas/session.ts';
import { exerciseHistory } from './session-results.ts';
import { effectiveDeviceId, firstForMuscleRowIds, planInputFor, type PlanExercise, type TemplateBlock, type TemplateBody } from './template-plan.ts';
import type { PreviousSet } from './workout-cursor.ts';

/**
 * Antrenman ekranının günü (tasarım §4.3 "Başlangıç", §5.1) — saf. `GET /api/me/workout` bunu kurar,
 * telefon başlangıçta anlık görüntü olarak saklar: antrenman PT o arada programı kaydetse de
 * başladığı günün planıyla sürer.
 *
 * - Gün programdan (şu anki evrede sıradaki ya da istenen gün); kütüphanede olmayan egzersizin
 *   satırı çizilmez, boş kalan blok düşer (geçilmiş sayılmaz).
 * - Satır başına plan var olan motordan (`planSession`): satırın kuralı ve setleri (`planInputFor`),
 *   cihazın ağırlık ızgarası (`loadSpecFor`), geçmiş yalnız aynı egzersiz ve aynı cihazla
 *   (`exerciseHistory`, SPEC §7.3). Geçmiş index'ten seçilen son bitmiş antrenmanlardır.
 * - "Önceki" sütunu ve önceden dolu tekrar için geçen seferki setler (`lastTime`): aynı satırın en
 *   yeni kaydı; satırın kaydı yoksa aynı egzersiz ve cihazınki. Danışanın ayar notu (sehpa, koltuk)
 *   da aynı kayıttan gelir (`setupNote`); hareketin kaydı açılınca ona taşınır.
 * - Isınma setleri saklanmaz, burada hesaplanır (`warmupSets`, v1 §7.8): halterle bileşik hareket, kas
 *   grubunun gündeki ilk hareketi, en hafif çalışma seti 40 kg ve üstü (piramitte ilk basamak).
 * - Bugün'ün sayıları index'ten: "bu hafta x/3" (`weekProgress`), yarım antrenman, bitmiş
 *   antrenmanların bugünkü suyu.
 */

/** Motorun okuduğu son bitmiş antrenman sayısı (tasarım §4.1: "son ~8 seans dosyası"). */
export const HISTORY_SESSIONS = 8;

/** Plan için egzersiz alanları: kural, yük, kaslar, başlık. */
export type WorkoutExercise = PlanExercise & { loadStepKg: number; minLoadKg: number };
export type WorkoutDevice = DeviceLoadSettings & { id: string };

/** Isınma seti: ağırlık ve tekrar (hacme ve rekora girmez). */
export type WarmupSet = { kg: number; reps: number };

export type WorkoutRow = {
  rowId: string;
  blockId: string;
  exerciseId: string;
  title: string;
  trackingType: TrackingType;
  deviceId?: string;
  /** Ağırlık ızgarası: öneri de stepper da bununla adımlar. */
  spec: LoadSpec;
  rule: Pick<ProgressionRule, 'scheme' | 'targetRir'>;
  /** Bugünkü plan: set başına ağırlık ve hedef, üst ağırlık, gerekçe. */
  plan: SessionPlan;
  /** Geçen seferki çalışma setleri (fazladan setler hariç). */
  lastTime: PreviousSet[];
  /** PT'nin satır notu. */
  note?: string;
  /** Isınma setleri; hesaplanmadıysa (ya da eski anlık görüntüde) yok. */
  warmups?: WarmupSet[];
  /** Danışanın geçen seferki ayar notu ("Sehpa 3. delik"). */
  setupNote?: string;
};

export type WorkoutDay = {
  dayId: string;
  dayName: string;
  phaseId: string;
  revision: number;
  /** Rotasyonda sıradaki gün; `dayId`'den farklıysa başka gün seçildi. */
  plannedDayId: string | null;
  /** Günün blokları (kütüphanede olmayan satırlar çıkmış): imleç bununla yürür. */
  blocks: TemplateBlock[];
  rows: Record<string, WorkoutRow>;
};

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

/** Günün gövdesi (imleç ve plan aynı bloklarla). */
export function dayBody(day: Pick<WorkoutDay, 'blocks'>): TemplateBody {
  return { blocks: day.blocks };
}

/** Günü bulur: önce şu anki evrede, sonra bütün evrelerde (antrenman sürerken evre değişmiş olabilir). */
function findDay(program: Program, dayId: string): { phase: Program['phases'][number]; day: Program['phases'][number]['days'][number] } | null {
  const current = currentPhaseOf(program)?.phase;
  const phases = current ? [current, ...program.phases.filter((phase) => phase.id !== current.id)] : program.phases;
  for (const phase of phases) {
    const day = phase.days.find((item) => item.id === dayId);
    if (day) return { phase, day };
  }
  return null;
}

/** Hareketin çalışma setleri (fazladan setler hariç) → "Önceki" satırları. */
function previousSets(entry: SessionEntry): PreviousSet[] {
  return entry.sets
    .filter((set) => set.type === 'working' && !set.extra)
    .map((set, position) => ({ setIndex: set.setIndex ?? position, ...(set.kg !== undefined ? { kg: set.kg } : {}), value: set.reps ?? set.seconds ?? 0 }));
}

/**
 * Geçen seferki setler: en yeni bitmiş antrenmanda aynı satırın kaydı; satırın hiç kaydı yoksa aynı
 * egzersiz ve cihazın en yeni kaydı. Bulunamazsa boş ("—").
 */
export function lastTimeOf(
  history: readonly Pick<SessionDoc, 'status' | 'startedAt' | 'entries'>[],
  select: { rowId: string; exerciseId: string; deviceId?: string | undefined },
): PreviousSet[] {
  const finished = history.filter((doc) => doc.status === 'finished').sort((a, b) => time(b.startedAt) - time(a.startedAt));
  const matches = (test: (entry: SessionEntry) => boolean) => {
    for (const doc of finished) {
      const entry = doc.entries.find((item) => test(item) && previousSets(item).length > 0);
      if (entry) return previousSets(entry);
    }
    return null;
  };
  return (
    matches((entry) => entry.rowId === select.rowId && entry.exerciseId === select.exerciseId) ??
    matches((entry) => entry.exerciseId === select.exerciseId && entry.deviceId === select.deviceId) ??
    []
  );
}

/**
 * Geçen seferki ayar notu: aynı satırın (yoksa aynı egzersiz ve cihazın) en yeni kaydındaki. Not o
 * kayıtta silinmişse yok: danışanın sildiği not geri gelmez (kayıt açılırken not taşındığı için
 * dokunulmayan not da her seferinde sürer).
 */
export function setupNoteOf(
  history: readonly Pick<SessionDoc, 'status' | 'startedAt' | 'entries'>[],
  select: { rowId: string; exerciseId: string; deviceId?: string | undefined },
): string | undefined {
  const finished = history.filter((doc) => doc.status === 'finished').sort((a, b) => time(b.startedAt) - time(a.startedAt));
  const find = (test: (entry: SessionEntry) => boolean) => {
    for (const doc of finished) {
      const entry = doc.entries.find(test);
      if (entry) return entry;
    }
    return undefined;
  };
  const entry =
    find((item) => item.rowId === select.rowId && item.exerciseId === select.exerciseId) ??
    find((item) => item.exerciseId === select.exerciseId && item.deviceId === select.deviceId);
  return entry?.setupNote || undefined;
}

/** Isınma setleri: yalnız ağırlıklı harekette; en hafif çalışma setine göre (piramitte ilk basamak). */
export function warmupsFor(
  exercise: Pick<PlanExercise, 'trackingType' | 'equipment' | 'category'>,
  spec: LoadSpec,
  plan: SessionPlan,
  isFirstForMuscle: boolean,
): WarmupSet[] {
  if (exercise.trackingType !== 'weight_reps' || plan.sets.length === 0) return [];
  const lightest = Math.min(...plan.sets.map((set) => set.weightKg));
  return warmupSets({
    workWeightKg: lightest,
    spec,
    isBarbell: exercise.equipment === 'barbell',
    isCompound: exercise.category === 'compound',
    isFirstForMuscle,
  }).map((set) => ({ kg: set.weightKg, reps: set.target }));
}

/** İstenen gün (programda yoksa) ya da rotasyonda sıradaki gün; program boşsa null. */
export function resolveDay(program: Program, dayId?: string | null) {
  const planned = nextDayId(program);
  return (dayId ? findDay(program, dayId) : null) ?? (planned ? findDay(program, planned) : null);
}

/** Günün egzersizleri: geçmişten yalnız bunları içeren antrenmanlar okunur (`historyRows`). */
export function dayExerciseIds(program: Program, dayId?: string | null): Set<string> {
  const found = resolveDay(program, dayId);
  return new Set(found?.day.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)) ?? []);
}

/**
 * Günün planı. `dayId` yoksa (ya da programda yoksa) rotasyonda sıradaki gün; program boşsa null.
 * `history` bitmiş antrenmanlar (sıra önemsiz); etkin ve silinmiş belgeler yok sayılır.
 */
export function buildWorkoutDay(input: {
  program: Program;
  dayId?: string | null | undefined;
  exercises: ReadonlyMap<string, WorkoutExercise>;
  devices: ReadonlyMap<string, WorkoutDevice>;
  history: readonly SessionDoc[];
}): WorkoutDay | null {
  const planned = nextDayId(input.program);
  const found = resolveDay(input.program, input.dayId);
  if (!found) return null;
  const { phase, day } = found;
  const deviceIds = new Set(input.devices.keys());
  const history = input.history.filter((doc) => doc.status === 'finished');

  const blocks: TemplateBlock[] = day.blocks.flatMap((block) => {
    const kept = block.rows.filter((row) => input.exercises.has(row.exerciseId));
    return kept.length > 0 ? [{ ...block, rows: kept }] : [];
  });
  const first = firstForMuscleRowIds({ blocks }, input.exercises);
  const rows: Record<string, WorkoutRow> = {};
  for (const block of blocks) {
    for (const row of block.rows) {
      const exercise = input.exercises.get(row.exerciseId) as WorkoutExercise;
      const deviceId = effectiveDeviceId(row, exercise, deviceIds);
      const device = deviceId ? input.devices.get(deviceId) : undefined;
      const spec = loadSpecFor(exercise, device);
      const { rule, sets } = planInputFor(row, exercise);
      const results = exerciseHistory(history, { exerciseId: row.exerciseId, deviceId });
      const plan = planSession({ spec, rule, sets, history: results, rowId: row.id });
      const warmups = warmupsFor(exercise, spec, plan, first.has(row.id));
      const setupNote = setupNoteOf(history, { rowId: row.id, exerciseId: row.exerciseId, deviceId });
      rows[row.id] = {
        rowId: row.id,
        blockId: block.id,
        exerciseId: row.exerciseId,
        title: exercise.title,
        trackingType: exercise.trackingType,
        ...(deviceId ? { deviceId } : {}),
        spec,
        rule,
        plan,
        lastTime: lastTimeOf(history, { rowId: row.id, exerciseId: row.exerciseId, deviceId }),
        ...(row.note ? { note: row.note } : {}),
        ...(warmups.length > 0 ? { warmups } : {}),
        ...(setupNote ? { setupNote } : {}),
      };
    }
  }
  return {
    dayId: day.id,
    dayName: day.name,
    phaseId: phase.id,
    revision: input.program.revision,
    plannedDayId: planned,
    blocks,
    rows,
  };
}

/* --- index'ten --- */

/** Planın okuyacağı antrenmanlar: bugünkü egzersizlerden birini içeren en yeni `limit` bitmiş antrenman. */
export function historyRows(index: SessionIndex, exerciseIds: ReadonlySet<string>, limit = HISTORY_SESSIONS): SessionIndexRow[] {
  return index.items
    .filter((row) => row.finishedAt && row.exercises.some((item) => exerciseIds.has(item.exerciseId)))
    .sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date))
    .slice(0, limit);
}

/** Yarım kalan (bitmemiş) en yeni antrenman: "Kaldığın yerden devam et". */
export function activeRow(index: SessionIndex): SessionIndexRow | null {
  return (
    index.items.filter((row) => !row.finishedAt).sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date))[0] ?? null
  );
}

/** "Bu hafta x/3": bitmiş antrenmanların bitiş anlarından; hedef şu anki evrenin sıklığı. */
export function weekOf(index: SessionIndex, program: Program | null, now: Date, timeZone: string): { done: number; target: number | null } {
  const completedAt = index.items.flatMap((row) => (row.finishedAt ? [row.finishedAt] : []));
  const daysPerWeek = program ? currentPhaseOf(program)?.phase.daysPerWeek : undefined;
  const { done, target } = weekProgress({ completedAt, ...(daysPerWeek !== undefined ? { daysPerWeek } : {}), now, timeZone });
  return { done, target };
}

/** Bitmiş antrenmanların o günkü suyu (etkin antrenmanın suyu telefondaki belgeden eklenir). */
export function sessionWaterOn(index: SessionIndex, day: string): number {
  return index.items.reduce((sum, row) => sum + (row.finishedAt && row.date === day ? row.water : 0), 0);
}
