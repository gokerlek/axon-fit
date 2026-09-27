import type { AlternativeCandidate } from './alternatives.ts';
import { withClientTargets } from './client-targets.ts';
import type { RowCare } from './constraint-filter.ts';
import { loadSpecFor, type DeviceLoadSettings } from './device-loads.ts';
import type { ExerciseTags } from './exercise-filter.ts';
import { exposureOf, type Stage } from './exposure.ts';
import { todayIn } from './format.ts';
import type { SetSuggestion } from './program-feedback.ts';
import { currentPhaseOf, mondayOf, nextDayId } from './program-plan.ts';
import { planSession, warmupSets, type LoadSpec, type ProgressionRule, type SessionPlan, type SessionResult, type TrackingType } from './progression.ts';
import { recommend, type Why } from './recommend.ts';
import type { TrainingExperience } from './schemas/client.ts';
import type { Program } from './schemas/program.ts';
import { effectiveSchedule, scheduleSince, weekTarget, type EffectiveSchedule } from './training-days.ts';
import type { SessionDoc, SessionEntry, SessionIndex, SessionIndexRow, SkipReason } from './schemas/session.ts';
import { waterOf } from './session-index.ts';
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
 * - Bugün'ün sayıları index'ten: "bu hafta x/3" (`weekOf`), yarım antrenman, bitmiş
 *   antrenmanların bugünkü suyu.
 * - Muadil ("Değiştir") ve eklenen hareket ("Hareket ekle", §2.6) aynı motorla, kendi geçmişiyle
 *   planlanır (`swapRowFor`, `addedRowFor`): muadil satırın set düzenini (hedefleri) ve kuralını
 *   alır, kendi cihazıyla; kayıt türü farklıysa (tekrar ↔ süre) kendi varsayılan hedefiyle aynı sayıda
 *   set. Eklenen hareket egzersizin varsayılan setleri ve dinlenmesiyle tek hareketlik bloktur.
 */

/** Motorun okuduğu son bitmiş antrenman sayısı (tasarım §4.1: "son ~8 seans dosyası"). */
export const HISTORY_SESSIONS = 8;
/**
 * Satır başına ayrıca okunan en yeni antrenman (`docs/design/kendi-program.md` §3.9): başka programla çok
 * çalışılsa da satırın kendi serisi pencereden düşmez. Aynı programın günün egzersizlerini içeren en yeni
 * antrenmanları da bu kadar.
 */
export const HISTORY_PER_ROW = 4;

/**
 * Planın okuduğu program: PT'nin programı (`program.json`) ya da danışanın kendi programı
 * (`own-programs/<id>.json`). Gövde aynı; kendi programda `clientSchedule` ve `clientTargets` yok.
 */
export type PlanProgram = Pick<Program, 'revision' | 'createdAt' | 'updatedAt' | 'phases' | 'current' | 'rotation' | 'schedule'> &
  Partial<Pick<Program, 'clientSchedule' | 'clientTargets'>>;

/** Planın sahibi: kendi programda kimliği ve adı; yoksa PT'nin programı. */
export type PlanOwner = { programId: string; name: string } | null;

/**
 * Plan için egzersiz alanları: kural, yük, kaslar, başlık; muadil sıralaması için kalıp, tutuş, PT'nin sabitledikleri;
 * danışanın kısıtları için medikal etiketler (hepsi isteğe bağlı).
 */
export type WorkoutExercise = PlanExercise & { loadStepKg: number; minLoadKg: number } & Pick<AlternativeCandidate, 'pattern' | 'grip' | 'alternatives'> &
  Omit<ExerciseTags, 'primaryMuscles' | 'secondaryMuscles'>;
export type WorkoutDevice = DeviceLoadSettings & { id: string };

/** Isınma seti: ağırlık ve tekrar (hacme ve rekora girmez). */
export type WarmupSet = { kg: number; reps: number };

/**
 * Aynı günün önceki bitmiş antrenmanında satırın kaydı: bitişteki "üst üste 2 antrenman" kuralları
 * (tasarım §6.1: tekrar hedefi, set sayısı, geçme; `program-feedback.ts`).
 */
export type RowPrevious = {
  /** Çalışma setleri (fazladan hariç): satırdaki yeri ve değeri (tekrar ya da saniye). */
  values: { setIndex: number; value: number }[];
  /** Yapılan çalışma seti (fazladan dahil) ve o günkü planlanan (bilinmiyorsa 0). */
  done: number;
  planned: number;
  /**
   * Bilerek geçildi: Geçilenler'de ya da sona alınıp yapılmadı ("Hareketi geç"). Erken bitişte yalnız
   * yapılmadan kalan (nedeni bitişte sorulan) hareket geçilmiş sayılmaz.
   */
  skipped: boolean;
  reason?: SkipReason;
};

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
  /** Aynı günün önceki antrenmanında bu satır; kaydı yoksa (ya da eski anlık görüntüde) yok. */
  previous?: RowPrevious;
  /** Hareketin bugünkü aşaması (§5.2): hareket kaydına yazılır (hafifletme sayımı). Eski anlık görüntüde yok. */
  stage?: Stage;
  /** Önerinin danışan dilinde gerekçesi (§5.7): kartın çipi ve dokununca açılan metin. Yoksa `REASON_LABELS`. */
  why?: Why;
  /**
   * Bugünün yoklaması satırı değiştirdi (ağrı ya da hafif gün; `adjustDay`): yoklama artışı geri çektiği
   * için antrenman içinde de "kolay ve tepede" adımı yok (§5.5).
   */
  adjusted?: 'pain' | 'readiness';
  /**
   * Danışanın kısıtlarından kart notu (tasarım `kisit-tarama.md` §3.5): yalnız `conditions` onayı varken; tanı adı
   * yok, bölge ve taraf var. Eski anlık görüntüde ve onay yokken yok.
   */
  care?: RowCare;
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
  /**
   * Günün programı (`docs/design/kendi-program.md` §2.9): PT'ninki ya da danışanın kendi programı. Kendi
   * programda kimliği ve adı da; seans bunları taşır (`programId`, `programName`). Eski anlık görüntüde yok (PT).
   */
  source?: 'pt' | 'own';
  programId?: string;
  programName?: string;
  /** Rotasyonda sıradaki gün; `dayId`'den farklıysa başka gün seçildi. */
  plannedDayId: string | null;
  /** Sıradaki günün adı (başka gün seçildiyse PT'nin bildirimi için). */
  plannedDayName?: string;
  /**
   * Şu anki evrenin günleri, dönüş sırasıyla: bitişteki "Sıradaki antrenman: Gün B" satırı. Eski anlık
   * görüntüde yok (satır görünmez, sunucu varsayılanı uygular).
   */
  rotationDays?: { id: string; name: string }[];
  /** Günün blokları (kütüphanede olmayan satırlar çıkmış): imleç bununla yürür. */
  blocks: TemplateBlock[];
  rows: Record<string, WorkoutRow>;
  /**
   * Öneri katmanının set artışı adayları (§5.6; `set-suggestions.ts`): bitişte "Antrenörüne öner: Bench Press
   * 3 → 4 set". Sunucu günü kurarken hesaplar; yoklama o satırın planını indirdiyse ya da hazır oluşluk
   * düşükse telefonda düşer (`session-check.ts` → `adjustDay`). Eski anlık görüntüde yok.
   */
  setIncrease?: SetSuggestion[];
  /**
   * "+ Set ekle" (§2.4): birim anahtarı (blok ya da eklenen hareketin kaydı) başına istenen fazladan tur.
   * Yalnız telefonda, günün etkin hâlinde (`workout-flow.ts` → `withExtraRounds`); sunucu yazmaz.
   */
  extraRounds?: Record<string, number>;
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
function findDay(program: PlanProgram, dayId: string): { phase: Program['phases'][number]; day: Program['phases'][number]['days'][number] } | null {
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

/** Seansın programı: kendi programın kimliği, PT'nin programında null. */
export function programIdOf(doc: Partial<Pick<SessionDoc, 'program'>>): string | null {
  return doc.program?.programId ?? null;
}

type HistoryDoc = Pick<SessionDoc, 'status' | 'startedAt' | 'entries'> & Partial<Pick<SessionDoc, 'program'>>;
/** Geçmişte arama: satır, egzersiz ve cihaz; `programId` verilirse (PT'nin programında null) önce aynı programın kaydı. */
type HistorySelect = { rowId: string; exerciseId: string; deviceId?: string | undefined; programId?: string | null | undefined };

/**
 * Bitmiş antrenmanlarda en yeni eşleşen kayıt: önce satırın kendisi, sonra aynı programda aynı egzersiz ve cihaz,
 * sonra (başka programlar da) aynı egzersiz ve cihaz (`docs/design/kendi-program.md` §3.9).
 */
function latestEntry(history: readonly HistoryDoc[], select: HistorySelect, usable: (entry: SessionEntry) => boolean): SessionEntry | undefined {
  const finished = history.filter((doc) => doc.status === 'finished').sort((a, b) => time(b.startedAt) - time(a.startedAt));
  const find = (docs: readonly HistoryDoc[], test: (entry: SessionEntry) => boolean) => {
    for (const doc of docs) {
      const entry = doc.entries.find((item) => test(item) && usable(item));
      if (entry) return entry;
    }
    return undefined;
  };
  const sameDevice = (entry: SessionEntry) => entry.exerciseId === select.exerciseId && entry.deviceId === select.deviceId;
  const sameProgram = select.programId === undefined ? [] : finished.filter((doc) => programIdOf(doc) === select.programId);
  return (
    find(finished, (entry) => entry.rowId === select.rowId && entry.exerciseId === select.exerciseId) ??
    find(sameProgram, sameDevice) ??
    find(finished, sameDevice)
  );
}

/**
 * Geçen seferki setler: en yeni bitmiş antrenmanda aynı satırın kaydı; satırın hiç kaydı yoksa aynı
 * egzersiz ve cihazın en yeni kaydı (önce aynı programda). Bulunamazsa boş ("—").
 */
export function lastTimeOf(history: readonly HistoryDoc[], select: HistorySelect): PreviousSet[] {
  const entry = latestEntry(history, select, (item) => previousSets(item).length > 0);
  return entry ? previousSets(entry) : [];
}

/**
 * Geçen seferki ayar notu: aynı satırın (yoksa aynı egzersiz ve cihazın, önce aynı programda) en yeni
 * kaydındaki. Not o kayıtta silinmişse yok: danışanın sildiği not geri gelmez (kayıt açılırken not taşındığı
 * için dokunulmayan not da her seferinde sürer).
 */
export function setupNoteOf(history: readonly HistoryDoc[], select: HistorySelect): string | undefined {
  return latestEntry(history, select, () => true)?.setupNote || undefined;
}

/**
 * Satırın önceki antrenmandaki kaydı: aynı günün en yeni bitmiş antrenmanında satırın kendi kaydı (aynı
 * hareketle; muadille yapıldıysa karşılaştırılamaz). Kaydı yoksa undefined.
 */
export function previousRowOf(
  history: readonly Pick<SessionDoc, 'status' | 'startedAt' | 'entries' | 'program'>[],
  select: { dayId: string; rowId: string; exerciseId: string },
): RowPrevious | undefined {
  const doc = history
    .filter((item) => item.status === 'finished' && item.program?.dayId === select.dayId)
    .sort((a, b) => time(b.startedAt) - time(a.startedAt))[0];
  const entry = doc?.entries.find((item) => item.rowId === select.rowId && !item.added && !item.swappedFrom);
  if (!doc || !entry || entry.exerciseId !== select.exerciseId || doc.entries.some((item) => item.swappedFrom === select.rowId)) return undefined;
  const working = entry.sets.filter((set) => set.type === 'working');
  const counted = working.filter((set) => !set.extra);
  return {
    values: counted.map((set, position) => ({ setIndex: set.setIndex ?? position, value: set.reps ?? set.seconds ?? 0 })),
    done: working.length,
    planned: working.reduce((max, set) => Math.max(max, set.plannedSetCount ?? 0), 0),
    skipped: entry.status === 'skipped' || entry.skip?.moved === true,
    ...(entry.skip?.reason ? { reason: entry.skip.reason } : {}),
  };
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
 * Motorun geçmişi satır için (`docs/design/kendi-program.md` §3.9): satırın kendi kaydı varsa bütün geçmiş
 * (seri satırın kayıtlarından kurulur, `planSession`'ın `rowId`'si); yoksa `programId` verildiyse (PT'nin
 * programında null) yalnız aynı programın antrenmanları; orada da yoksa başka programların en yeni antrenmanı
 * yalnız çeviri kaynağıdır (`convertOnly`: seri kurulmaz). `programId` verilmezse (eski çağrılar) bütün geçmiş.
 */
export function rowHistory(
  history: readonly SessionDoc[],
  select: { rowId: string; exerciseId: string; deviceId?: string | undefined; programId?: string | null | undefined },
): { results: SessionResult[]; convertOnly: boolean } {
  const pick = { exerciseId: select.exerciseId, deviceId: select.deviceId };
  const results = exerciseHistory(history, pick);
  const own = results.some((session) => session.every((set) => set.rowId === undefined || set.rowId === select.rowId));
  if (own || select.programId === undefined || results.length === 0) return { results, convertOnly: false };
  const same = exerciseHistory(
    history.filter((doc) => programIdOf(doc) === select.programId),
    pick,
  );
  return same.length > 0 ? { results: same, convertOnly: false } : { results, convertOnly: true };
}

/**
 * Satırın planı: satırın kuralı ve setleri (`planInputFor`), cihazın ızgarası (`loadSpecFor`), geçmiş
 * yalnız aynı egzersiz ve cihazla (satırın serisi, yoksa aynı program: `rowHistory`); "Önceki", ısınma ve
 * ayar notu. `history` bitmiş antrenmanlar. `insight` verilirse öneri katmanı (aşama, gerekçe).
 */
export function workoutRowFor(input: {
  row: TemplateRow;
  blockId: string;
  exercise: WorkoutExercise;
  devices: ReadonlyMap<string, WorkoutDevice>;
  history: readonly SessionDoc[];
  firstForMuscle: boolean;
  /** Programın günü: satırın önceki antrenmandaki kaydı (`previous`) bununla bulunur; muadil ve eklenende yok. */
  dayId?: string;
  insight?: WorkoutInsight | undefined;
  /** Satırın programı (kendi programın kimliği, PT'ninkinde null): serisi olmayan satır yalnız aynı programa bakar. */
  programId?: string | null | undefined;
}): WorkoutRow {
  const { row, exercise, insight } = input;
  const deviceId = effectiveDeviceId(row, exercise, new Set(input.devices.keys()));
  const device = deviceId ? input.devices.get(deviceId) : undefined;
  const spec = loadSpecFor(exercise, device);
  const { rule, sets } = planInputFor(row, exercise);
  const { results, convertOnly } = rowHistory(input.history, { rowId: row.id, exerciseId: row.exerciseId, deviceId, programId: input.programId });
  const only = convertOnly ? { convertOnly: true } : {};
  const recommended = insight
    ? recommend({
        spec,
        rule,
        sets,
        history: results,
        rowId: row.id,
        ...only,
        exercise,
        exposure: exposureOf(row.exerciseId, insight.index, insight.now, { experience: insight.experience }),
      })
    : null;
  const plan = recommended?.plan ?? planSession({ spec, rule, sets, history: results, rowId: row.id, ...only });
  const warmups = warmupsFor(exercise, spec, plan, input.firstForMuscle);
  const select = { rowId: row.id, exerciseId: row.exerciseId, deviceId, programId: input.programId };
  const setupNote = setupNoteOf(input.history, select);
  const previous = input.dayId ? previousRowOf(input.history, { dayId: input.dayId, rowId: row.id, exerciseId: row.exerciseId }) : undefined;
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
    lastTime: lastTimeOf(input.history, select),
    ...(row.note ? { note: row.note } : {}),
    ...(warmups.length > 0 ? { warmups } : {}),
    ...(setupNote ? { setupNote } : {}),
    ...(previous ? { previous } : {}),
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
  programId?: string | null | undefined;
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
      programId: input.programId,
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
  programId?: string | null | undefined;
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
      programId: input.programId,
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
export function resolveDay(program: PlanProgram, dayId?: string | null) {
  const planned = nextDayId(program);
  return (dayId ? findDay(program, dayId) : null) ?? (planned ? findDay(program, planned) : null);
}

/** Gün programda var mı (bütün evrelerde; sıradakine dönmeden). İlk yazımda seansın günü böyle denetlenir. */
export function hasDay(program: Pick<PlanProgram, 'phases'>, dayId: string): boolean {
  return program.phases.some((phase) => phase.days.some((day) => day.id === dayId));
}

/** Günün egzersizleri: geçmişten yalnız bunları içeren antrenmanlar okunur (`historyRows`). */
export function dayExerciseIds(program: PlanProgram, dayId?: string | null): Set<string> {
  const found = resolveDay(program, dayId);
  return new Set(found?.day.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)) ?? []);
}

/** Günün satırları: satır başına geçmiş penceresi (`historyRows`). */
export function dayRowIds(program: PlanProgram, dayId?: string | null): Set<string> {
  const found = resolveDay(program, dayId);
  return new Set(found?.day.blocks.flatMap((block) => block.rows.map((row) => row.id)) ?? []);
}

/**
 * Günün planı. `dayId` yoksa (ya da programda yoksa) rotasyonda sıradaki gün; program boşsa null.
 * `history` bitmiş antrenmanlar (sıra önemsiz); etkin ve silinmiş belgeler yok sayılır. Satırların
 * setleri danışanın geçerli hedefleriyle (`clientTargets`, tasarım §6.2): antrenman ve bitişin farkı onlarla.
 */
export function buildWorkoutDay(input: {
  program: PlanProgram;
  dayId?: string | null | undefined;
  exercises: ReadonlyMap<string, WorkoutExercise>;
  devices: ReadonlyMap<string, WorkoutDevice>;
  history: readonly SessionDoc[];
  insight?: WorkoutInsight | undefined;
  /** Kendi programda kimliği ve adı (`source: 'own'`); verilmezse ya da null ise PT'nin programı. */
  owner?: PlanOwner | undefined;
}): WorkoutDay | null {
  const planned = nextDayId(input.program);
  const found = resolveDay(input.program, input.dayId);
  if (!found) return null;
  const { phase, day } = found;
  const history = input.history.filter((doc) => doc.status === 'finished');
  const current = currentPhaseOf(input.program)?.phase;
  const plannedName = planned ? current?.days.find((item) => item.id === planned)?.name : undefined;

  const blocks: TemplateBlock[] = withClientTargets(day.blocks, input.program.clientTargets).flatMap((block) => {
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
        dayId: day.id,
        insight: input.insight,
        programId: input.owner?.programId ?? null,
      });
    }
  }
  const owner = input.owner ?? null;
  return {
    dayId: day.id,
    dayName: day.name,
    phaseId: phase.id,
    revision: input.program.revision,
    source: owner ? 'own' : 'pt',
    ...(owner ? { programId: owner.programId, programName: owner.name } : {}),
    plannedDayId: planned,
    ...(plannedName ? { plannedDayName: plannedName } : {}),
    rotationDays: (current?.days ?? []).map((item) => ({ id: item.id, name: item.name })),
    blocks,
    rows,
  };
}

/* --- index'ten --- */

/** `historyRows`'un seçimi: günün egzersizleri, satırları ve programı (kendi programın kimliği, PT'ninkinde null). */
export type HistoryWindow = { exerciseIds: ReadonlySet<string>; rowIds?: ReadonlySet<string> | undefined; programId?: string | null | undefined };

/**
 * Planın okuyacağı antrenmanlar (`docs/design/kendi-program.md` §3.9), en yeniden eskiye, birleşim: bugünkü
 * egzersizlerden birini içeren en yeni `limit` bitmiş antrenman; günün her satırı için o satırı içeren en yeni
 * `perRow` antrenman (başka programla çok çalışılsa da satırın serisi pencereden düşmez); `programId` verilirse
 * aynı programdan günün egzersizlerini içeren en yeni `perRow` antrenman (serisi olmayan satırın kaynağı).
 * Eski çağrı biçimi: yalnız egzersizler.
 */
export function historyRows(
  index: SessionIndex,
  select: ReadonlySet<string> | HistoryWindow,
  limit = HISTORY_SESSIONS,
  perRow = HISTORY_PER_ROW,
): SessionIndexRow[] {
  const window: HistoryWindow = select instanceof Set ? { exerciseIds: select } : (select as HistoryWindow);
  const rowIds = window.rowIds ?? new Set<string>();
  const hasExercise = (row: SessionIndexRow) => row.exercises.some((item) => window.exerciseIds.has(item.exerciseId));
  const rows = index.items
    .filter((row) => row.finishedAt && (hasExercise(row) || row.exercises.some((item) => item.rowId !== undefined && rowIds.has(item.rowId))))
    .sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const picked = new Set(rows.filter(hasExercise).slice(0, limit).map((row) => row.id));
  for (const rowId of rowIds) {
    for (const row of rows.filter((item) => item.exercises.some((exercise) => exercise.rowId === rowId)).slice(0, perRow)) picked.add(row.id);
  }
  if (window.programId !== undefined) {
    const same = rows.filter((row) => (row.programId ?? null) === window.programId && hasExercise(row));
    for (const row of same.slice(0, perRow)) picked.add(row.id);
  }
  return rows.filter((row) => picked.has(row.id));
}

/** Yarım kalan (bitmemiş) en yeni antrenman: "Kaldığın yerden devam et". */
export function activeRow(index: SessionIndex): SessionIndexRow | null {
  return (
    index.items.filter((row) => !row.finishedAt).sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date))[0] ?? null
  );
}

export type WeekCount = {
  done: number;
  /** Seçili antrenman günü sayısı; gün seçilmemişse şu anki evrenin sıklığı; o da yoksa null. */
  target: number | null;
  /** Bu hafta antrenman yapılan günler (Bugün'ün gün şeridi). */
  days: string[];
  /** Haftanın pazartesisi. */
  start: string;
};

/**
 * "Bu hafta x/y" (tasarım §2.11): bitmiş antrenmanların günlerinden (`date`: başlangıç günü; gece yarısını
 * geçen ya da ertesi gün bitirilen antrenman başladığı günde, Geçmiş'le aynı), pazartesi başlayan hafta,
 * uygulamanın saat diliminde; y seçili gün sayısı, yoksa şu anki evrenin sıklığı.
 */
export function weekOf(index: SessionIndex, program: PlanProgram | null, now: Date, timeZone: string): WeekCount {
  const today = todayIn(timeZone, now);
  const start = mondayOf(today);
  const days = [...new Set(index.items.flatMap((row) => (row.finishedAt && row.date >= start && row.date <= today ? [row.date] : [])))].sort();
  const daysPerWeek = program ? currentPhaseOf(program)?.phase.daysPerWeek : undefined;
  const weekdays = program ? effectiveSchedule(program).weekdays : [];
  return { done: days.length, target: weekTarget(weekdays, daysPerWeek), days, start };
}

/**
 * Bitişten hemen sonra Bugün'ün sayıları, sunucudan taze gelene kadar (iyimser; telefon bitişin yanıtıyla
 * yazar): antrenmanın günü bu haftadaysa "Bu hafta x/y"ye girer (gün başına bir, `weekOf` gibi; aynı gün
 * ikinci antrenman sayıyı değiştirmez), suyu bugünün bitmiş antrenmanlarına geçer, yarım antrenman kartı
 * düşer. Önbellekteki eski sayı bir an bile görünmesin.
 */
export function afterFinish<T extends { today: string; week: WeekCount; water: { file: number; sessions: number }; active: Pick<SessionDoc, 'id'> | null }>(
  data: T,
  doc: Pick<SessionDoc, 'id' | 'date' | 'waterTaps'>,
): T {
  const counted = mondayOf(doc.date) === data.week.start && doc.date <= data.today && !data.week.days.includes(doc.date);
  const days = counted ? [...data.week.days, doc.date].sort() : data.week.days;
  const known = data.active?.id === doc.id;
  return {
    ...data,
    week: counted ? { ...data.week, done: days.length, days } : data.week,
    water: doc.date === data.today ? { ...data.water, sessions: data.water.sessions + waterOf(doc) } : data.water,
    active: known ? null : data.active,
  };
}

/**
 * Bugün'ün ve Ayarlar'ın "Günlerini değiştir"i için: geçerli günler, PT'ninkiler, danışanınki ve sıklık.
 * `since`: kaçan gün penceresinin başladığı takvim günü (uygulamanın saat diliminde; `scheduleSince`, Genel
 * bakış'ın "Kaçan gün"üyle aynı kural): Bugün'ün şeridi o gün ve öncesini "kaçırıldı" diye işaretlemez.
 */
export type WorkoutSchedule = EffectiveSchedule & { daysPerWeek: number | null; since: string | null };

export function scheduleOf(
  program: PlanProgram,
  context: { client: Parameters<typeof scheduleSince>[1]; timeZone: string; activeAt?: string | undefined },
): WorkoutSchedule {
  // Kalıcı seçimin anı da pencereyi açar (`docs/design/kendi-program.md` §3.2): seçimden önceki günler kaçmış sayılmaz.
  const since = latestSince(scheduleSince(program, context.client), context.activeAt);
  return {
    ...effectiveSchedule(program),
    daysPerWeek: currentPhaseOf(program)?.phase.daysPerWeek ?? null,
    since: since ? todayIn(context.timeZone, new Date(since)) : null,
  };
}

/** İki andan yenisi (biri yoksa öteki). */
export function latestSince(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return time(b) > time(a) ? b : a;
}

/**
 * Programın o anki sürümünün damgası: telefonda saklanan gün planı bununla karşılaştırılır. PT'nin kaydı
 * (revision, updatedAt), evre, rotasyon (başka cihazda bitirilen antrenman) ve günler değişince değişir;
 * Bugün sunucuda taze okunan programın damgasını verir, eskiyen plan "Antrenmana başla"da kullanılmaz.
 */
export function programStamp(
  program: Pick<PlanProgram, 'revision' | 'createdAt' | 'updatedAt' | 'current' | 'rotation' | 'schedule' | 'clientSchedule' | 'clientTargets'>,
  /** Kendi programın kimliği (`docs/design/kendi-program.md` §3.2): seçim değişince saklanan plan eskir. */
  programId?: string | null,
): string {
  return [
    programId ?? 'pt',
    program.revision,
    program.createdAt,
    program.updatedAt,
    program.current.phaseId,
    program.rotation.lastDayId ?? '',
    program.rotation.lastCompletedAt ?? '',
    (program.schedule?.weekdays ?? []).join(''),
    program.clientSchedule?.at ?? '',
    // Danışanın hedefi değişince (bitişte "Evet, güncelle") saklanan plan eskir.
    Object.entries(program.clientTargets ?? {})
      .map(([rowId, target]) => `${rowId}@${target.at}`)
      .sort()
      .join(','),
  ].join('|');
}

/** Günlerin son yapıldığı tarih ("Başka gün seç": "son: 22 Eyl"): bitmiş antrenmanlardan. */
export function lastDoneDates(index: SessionIndex): Record<string, string> {
  const last: Record<string, string> = {};
  for (const row of index.items) {
    if (!row.finishedAt || !row.dayId) continue;
    const known = last[row.dayId];
    if (!known || row.date > known) last[row.dayId] = row.date;
  }
  return last;
}

/** Bitmiş antrenmanların o günkü suyu (etkin antrenmanın suyu telefondaki belgeden eklenir). */
export function sessionWaterOn(index: SessionIndex, day: string): number {
  return index.items.reduce((sum, row) => sum + (row.finishedAt && row.date === day ? row.water : 0), 0);
}
