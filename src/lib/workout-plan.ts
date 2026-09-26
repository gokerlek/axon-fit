import type { AlternativeCandidate } from './alternatives.ts';
import { loadSpecFor, type DeviceLoadSettings } from './device-loads.ts';
import { exposureOf, type Stage } from './exposure.ts';
import { currentPhaseOf, nextDayId, weekProgress } from './program-plan.ts';
import { planSession, warmupSets, type LoadSpec, type ProgressionRule, type SessionPlan, type TrackingType } from './progression.ts';
import { recommend, type Why } from './recommend.ts';
import type { TrainingExperience } from './schemas/client.ts';
import type { Program } from './schemas/program.ts';
import type { SessionDoc, SessionEntry, SessionIndex, SessionIndexRow } from './schemas/session.ts';
import { exerciseHistory } from './session-results.ts';
import {
  DEFAULT_REST_SECONDS,
  DEFAULT_SETS,
  defaultSets,
  effectiveDeviceId,
  firstForMuscleRowIds,
  planInputFor,
  type PlanExercise,
  type TemplateBlock,
  type TemplateBody,
  type TemplateRow,
} from './template-plan.ts';
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
 * - Öneri katmanı (§5, `recommend.ts`): `insight` verilirse (uçlar hep verir) hareketin deneyimi bütün
 *   index'ten (`exposureOf`, egzersiz kimliğiyle, danışanın antrenman geçmişi taban) hesaplanır; plan
 *   motorun planının üstüne aşama kurallarıyla kurulur. Önceden dolu ağırlık ve kart çipi bu plandan
 *   gelir: satır aşamayı (`stage`, hareket kaydına yazılır) ve danışan dilinde gerekçeyi (`why`) taşır.
 *   Verilmezse (eski testler) yalnız motor.
 * - "Önceki" sütunu ve önceden dolu tekrar için geçen seferki setler (`lastTime`): aynı satırın en
 *   yeni kaydı; satırın kaydı yoksa aynı egzersiz ve cihazınki. Danışanın ayar notu (sehpa, koltuk)
 *   da aynı kayıttan gelir (`setupNote`); hareketin kaydı açılınca ona taşınır.
 * - Isınma setleri saklanmaz, burada hesaplanır (`warmupSets`, v1 §7.8): halterle bileşik hareket, kas
 *   grubunun gündeki ilk hareketi, en hafif çalışma seti 40 kg ve üstü (piramitte ilk basamak).
 * - Bugün'ün sayıları index'ten: "bu hafta x/3" (`weekProgress`), yarım antrenman, bitmiş
 *   antrenmanların bugünkü suyu.
 * - Muadil ("Değiştir") ve eklenen hareket ("Hareket ekle", §2.6) aynı motorla, kendi geçmişiyle
 *   planlanır (`swapRowFor`, `addedRowFor`): muadil satırın set düzenini (hedefleri) ve kuralını
 *   alır, kendi cihazıyla; kayıt türü farklıysa (tekrar ↔ süre) kendi varsayılan hedefiyle aynı sayıda
 *   set. Eklenen hareket egzersizin varsayılan setleri ve dinlenmesiyle tek hareketlik bloktur.
 */

/** Motorun okuduğu son bitmiş antrenman sayısı (tasarım §4.1: "son ~8 seans dosyası"). */
export const HISTORY_SESSIONS = 8;

/** Plan için egzersiz alanları: kural, yük, kaslar, başlık; muadil sıralaması için kalıp, tutuş, PT'nin sabitledikleri. */
export type WorkoutExercise = PlanExercise & { loadStepKg: number; minLoadKg: number } & Pick<AlternativeCandidate, 'pattern' | 'grip' | 'alternatives'>;
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
  /** Hareketin bugünkü aşaması (§5.2): hareket kaydına yazılır (hafifletme sayımı). Eski anlık görüntüde yok. */
  stage?: Stage;
  /** Önerinin danışan dilinde gerekçesi (§5.7): kartın çipi ve dokununca açılan metin. Yoksa `REASON_LABELS`. */
  why?: Why;
};

/** Öneri katmanının girdisi: onarılmış index, şimdi ve danışanın antrenman geçmişi. */
export type WorkoutInsight = {
  index: Pick<SessionIndex, 'items'>;
  now: Date;
  experience?: TrainingExperience | undefined;
};

/** Hareket kaydına yazılan planın özeti (§4.2): üst ağırlık, gerekçe, aşama. */
export function entryPlanOf(row: Pick<WorkoutRow, 'plan' | 'stage'>): { topWeightKg: number; reason: string; stage?: string } {
  return { topWeightKg: row.plan.topWeightKg, reason: row.plan.reason, ...(row.stage ? { stage: row.stage } : {}) };
}

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

/**
 * Programda olmayan satır: muadil (anahtarı yerini aldığı satır) ya da eklenen hareket (anahtarı
 * hareket kaydının kimliği). Satırın planı, şablon satırı (hedefler) ve eklenende blok dinlenmesi.
 * Telefon başlangıçtaki gün planının yanında saklar; imleç günün etkin hâlini bunlarla kurar
 * (`workout-flow.ts` → `effectiveDay`).
 */
export type ExtraRow = { exerciseId: string; row: WorkoutRow; template: TemplateRow; restSeconds?: number };
export type ExtraRows = Record<string, ExtraRow>;

/** `ExtraRows` anahtarı: satır (ya da eklenen hareket) ve egzersiz. */
export function extraKey(rowId: string, exerciseId: string): string {
  return `${rowId}:${exerciseId}`;
}

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

/**
 * Satırın planı: satırın kuralı ve setleri (`planInputFor`), cihazın ızgarası (`loadSpecFor`), geçmiş
 * yalnız aynı egzersiz ve cihazla; "Önceki", ısınma ve ayar notu. `history` bitmiş antrenmanlar.
 * `insight` verilirse öneri katmanı (aşama, gerekçe).
 */
export function workoutRowFor(input: {
  row: TemplateRow;
  blockId: string;
  exercise: WorkoutExercise;
  devices: ReadonlyMap<string, WorkoutDevice>;
  history: readonly SessionDoc[];
  firstForMuscle: boolean;
  insight?: WorkoutInsight | undefined;
}): WorkoutRow {
  const { row, exercise, insight } = input;
  const deviceId = effectiveDeviceId(row, exercise, new Set(input.devices.keys()));
  const device = deviceId ? input.devices.get(deviceId) : undefined;
  const spec = loadSpecFor(exercise, device);
  const { rule, sets } = planInputFor(row, exercise);
  const results = exerciseHistory(input.history, { exerciseId: row.exerciseId, deviceId });
  const recommended = insight
    ? recommend({
        spec,
        rule,
        sets,
        history: results,
        rowId: row.id,
        exercise,
        exposure: exposureOf(row.exerciseId, insight.index, insight.now, { experience: insight.experience }),
      })
    : null;
  const plan = recommended?.plan ?? planSession({ spec, rule, sets, history: results, rowId: row.id });
  const warmups = warmupsFor(exercise, spec, plan, input.firstForMuscle);
  const setupNote = setupNoteOf(input.history, { rowId: row.id, exerciseId: row.exerciseId, deviceId });
  return {
    rowId: row.id,
    blockId: input.blockId,
    exerciseId: row.exerciseId,
    title: exercise.title,
    trackingType: exercise.trackingType,
    ...(deviceId ? { deviceId } : {}),
    spec,
    rule,
    plan,
    lastTime: lastTimeOf(input.history, { rowId: row.id, exerciseId: row.exerciseId, deviceId }),
    ...(row.note ? { note: row.note } : {}),
    ...(warmups.length > 0 ? { warmups } : {}),
    ...(setupNote ? { setupNote } : {}),
    ...(recommended ? { stage: recommended.stage, why: recommended.why } : {}),
  };
}

/** Tekrar ve süre birbirinin hedefi olamaz (8–12 tekrar ≠ 8–12 sn). */
function valueKind(trackingType: TrackingType): 'time' | 'count' {
  return trackingType === 'duration' ? 'time' : 'count';
}

/**
 * Muadilin satırı ("Değiştir", §2.6): yerini aldığı satırın kimliği, bloğu, set düzeni ve kuralı;
 * egzersiz ve cihaz muadilin kendisi (PT'nin cihaz seçimi ve notu asıl harekete aitti). Kayıt türü
 * farklıysa (tekrar ↔ süre) muadilin varsayılan hedefiyle aynı sayıda set. Plan muadilin kendi
 * geçmişinden.
 */
export function swapRowFor(input: {
  row: TemplateRow;
  blockId: string;
  original: Pick<PlanExercise, 'trackingType'>;
  exercise: WorkoutExercise;
  devices: ReadonlyMap<string, WorkoutDevice>;
  history: readonly SessionDoc[];
  firstForMuscle: boolean;
  insight?: WorkoutInsight | undefined;
}): ExtraRow {
  const { row, exercise } = input;
  const sets = valueKind(input.original.trackingType) === valueKind(exercise.trackingType) ? row.sets : defaultSets(exercise, row.sets.length);
  const template: TemplateRow = { id: row.id, exerciseId: exercise.id, sets, ...(row.rule ? { rule: row.rule } : {}) };
  return {
    exerciseId: exercise.id,
    row: workoutRowFor({
      row: template,
      blockId: input.blockId,
      exercise,
      devices: input.devices,
      history: input.history,
      firstForMuscle: input.firstForMuscle,
      insight: input.insight,
    }),
    template,
  };
}

/**
 * Eklenen hareketin satırı ("Hareket ekle", §2.6): yalnız bu antrenmana; egzersizin varsayılan setleri
 * (`setCount` verilmezse türüne göre) ve dinlenmesi. `key` hareket kaydının kimliğidir (satır ve blok
 * yerine); sunucu kaydı bilmiyorsa egzersizin kimliği, telefon kaydı açınca değiştirir (`rekeyExtra`).
 */
export function addedRowFor(input: {
  key: string;
  exercise: WorkoutExercise;
  devices: ReadonlyMap<string, WorkoutDevice>;
  history: readonly SessionDoc[];
  setCount?: number | undefined;
  insight?: WorkoutInsight | undefined;
}): ExtraRow {
  const { exercise } = input;
  const template: TemplateRow = { id: input.key, exerciseId: exercise.id, sets: defaultSets(exercise, input.setCount ?? DEFAULT_SETS[exercise.category]) };
  return {
    exerciseId: exercise.id,
    row: workoutRowFor({
      row: template,
      blockId: input.key,
      exercise,
      devices: input.devices,
      history: input.history,
      firstForMuscle: false,
      insight: input.insight,
    }),
    template,
    restSeconds: DEFAULT_REST_SECONDS[exercise.category],
  };
}

/** Eklenen hareketin satırı yeni anahtarla (hareket kaydının kimliği). */
export function rekeyExtra(extra: ExtraRow, key: string): ExtraRow {
  return { ...extra, row: { ...extra.row, rowId: key, blockId: key }, template: { ...extra.template, id: key } };
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
  insight?: WorkoutInsight | undefined;
}): WorkoutDay | null {
  const planned = nextDayId(input.program);
  const found = resolveDay(input.program, input.dayId);
  if (!found) return null;
  const { phase, day } = found;
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
      rows[row.id] = workoutRowFor({
        row,
        blockId: block.id,
        exercise,
        devices: input.devices,
        history,
        firstForMuscle: first.has(row.id),
        insight: input.insight,
      });
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
