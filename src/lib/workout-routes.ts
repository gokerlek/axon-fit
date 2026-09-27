import * as v from 'valibot';
import { groupByEquipment, rankAlternatives } from './alternatives.ts';
import { effectiveSets } from './client-targets.ts';
import { postGuard } from './client-auth-routes.ts';
import { canRecordHealth } from './client-status.ts';
import { HEALTH_PATH } from './check-in-routes.ts';
import {
  careInputOf,
  careStampOf,
  EMPTY_CARE,
  evaluateCare,
  hasCare,
  optionCareText,
  orderByCare,
  rowCareOf,
  type CareInput,
  type CareResult,
} from './constraint-filter.ts';
import { healthRecordSchema, type HealthRecord } from './schemas/health.ts';
import { BLOCKED_TEXT } from './exercise-caution.ts';
import { todayIn } from './format.ts';
import { GithubError } from './github/errors.ts';
import { currentPhaseOf, DAY_ID_PATTERN, nextDayId } from './program-plan.ts';
import type { TrackingType } from './progression.ts';
import { parseProposals, PROPOSALS_PATH } from './proposals.ts';
import type { Client } from './schemas/client.ts';
import { EQUIPMENT_LABELS, type Category, type Equipment } from './schemas/exercise.ts';
import { readOwnProgram, readOwnState, scheduleOwnProgram, type OwnState } from './own-program-files.ts';
import { activeProgramId, shownProgram } from './own-program-index.ts';
import { lastDateByProgram } from './own-program-text.ts';
import { isOwnProgramId, PT_PROGRAM_NAME } from './own-programs.ts';
import { scheduleBodySchema } from './schemas/own-program.ts';
import { programSchema, type Program } from './schemas/program.ts';
import { parseStoredSession, type SessionDoc, type SessionIndex } from './schemas/session.ts';
import { readIndex, type SessionRepo, type StoredJson } from './session-files-core.ts';
import { run, type SessionRouteDeps, type SessionRouteResult } from './session-routes.ts';
import { readinessFromHealth, setSuggestionsFor, type SuggestionExercise } from './set-suggestions.ts';
import { firstForMuscleRowIds, ROW_ID_PATTERN } from './template-plan.ts';
import { applyClientSchedule } from './training-days.ts';
import { mergeWaterTaps, parseWaterFile, WATER_PATH, waterMessage, waterOnDay, waterPostSchema } from './water.ts';
import {
  activeRow,
  addedRowFor,
  buildWorkoutDay,
  dayBody,
  dayExerciseIds,
  dayRowIds,
  extraKey,
  historyRows,
  lastDoneDates,
  programStamp,
  resolveDay,
  scheduleOf,
  sessionWaterOn,
  swapRowFor,
  weekOf,
  type ExtraRow,
  type ExtraRows,
  type HistoryWindow,
  type PlanOwner,
  type PlanProgram,
  type WeekCount,
  type WorkoutDay,
  type WorkoutDevice,
  type WorkoutExercise,
  type WorkoutInsight,
  type WorkoutSchedule,
} from './workout-plan.ts';

/**
 * Antrenman ekranının öteki uçları (tasarım §4.7) — ince çekirdek, `session-routes.ts`'in kapısıyla
 * (`run`: oturum, kayıt, GitHub hataları):
 * - `GET /api/me/workout?day=`: günün planı (`buildWorkoutDay`), Bugün'ün sayıları ("bu hafta x/3",
 *   bugünkü su) ve sunucudaki yarım antrenman. Gün: istenen → yarım antrenmanın günü → sıradaki gün.
 *   Index her okumada onarılır (`readIndex`); geçmiş yalnız bugünkü egzersizleri içeren son bitmiş
 *   antrenmanlardan (blob kimliğiyle, önbellekli). Okunamayan geçmiş dosyası planı durdurmaz. Öneri
 *   katmanı (§5) bütün uçlarda aynı girdiyle: onarılmış index, şimdi, danışanın antrenman geçmişi
 *   (`insightOf`).
 *   Yarım antrenmanda muadil ve eklenen hareketlerin planları da (`extras`): başka cihazda ya da
 *   silinmiş tarayıcı verisiyle sürdürülen antrenman aynı hareketlerle açılır. Günün set artışı adayları
 *   (§5.6, `set-suggestions.ts`) planda (`day.setIncrease`): `proposals.json` (bu haftaki öneriler) ve
 *   sağlık onayı varken `health.json` (son hazır oluşluk) bunun için okunur.
 *   Kendi programlar (`docs/design/kendi-program.md` §2.6, §3.2): `?program=op_…|pt` ("Yalnız bugün") planı o
 *   programdan kurar; yarım antrenman varsa onun programı, yoksa adresteki, o da yoksa kalıcı seçim
 *   (`shownProgram`). En az bir kendi program varken yanıtta seçim (`selection`) de gelir.
 * - `GET /api/me/workout/alternatives?day=&row=[&program=]`: satırın muadilleri ("Değiştir", §2.6), ekipmana göre
 *   gruplu (`alternatives.ts`); her biri kendi geçmişiyle planlı. Bugünün öteki hareketleri önerilmez.
 * - `GET /api/me/workout/exercises[?add=][&program=]`: "Hareket ekle"nin kütüphanesi; `add` verilirse o egzersizin
 *   varsayılan setleriyle planı. `program` (muadil ve eklenen için): `op_…` kendi program, yok ya da `pt` PT'nin.
 *   Kısıtın izinsiz yasakladığı hareket listede yok, eklenemez (409).
 * - `POST /api/me/water`: antrenman dışı su dokunuşları `water.json`'a, kimlikle birleşerek
 *   (idempotent); değişiklik yoksa yazılmaz, çakışmada taze okuyup bir kez daha. Bozuk dosya ezilmez.
 * - `POST /api/me/schedule`: danışanın antrenman günleri (§2.11) `program.json` → `clientSchedule`;
 *   revision artmaz, program geçmişine `client` kaydı, PT'nin bildirim özeti düşer. `programId` bir kendi
 *   programsa günler o programa yazılır (`scheduleOwnProgram`); null PT'nin programı, verilmezse kalıcı seçim.
 */

export type WorkoutRouteDeps = SessionRouteDeps & {
  /** Egzersiz ve cihaz kataloğu (hazır kütüphane + PT'nin kayıtları). */
  catalog(): Promise<{ exercises: readonly WorkoutExercise[]; devices: readonly WorkoutDevice[] }>;
  /** Kasın ailesi (üst kanat → "Kanat"): muadil sıralaması (`muscles.ts`). */
  familyOf(muscle: string): string;
  /** Hareketin setinin kaslara payı (kesirli set; `muscles.ts` → `exerciseSetWeights`): set artışı önerisi. */
  setWeights(exercise: SuggestionExercise): Readonly<Partial<Record<string, number>>>;
};

/** Muadil listesinin en çok uzunluğu (PT'nin sabitledikleri dahil). */
export const ALTERNATIVES_LIMIT = 8;

/** Bugün'ün program seçimi (`docs/design/kendi-program.md` §2.6): yalnız en az bir kendi program varken. */
export type WorkoutSelection = {
  /** Kalıcı seçim: kendi programın kimliği ya da null (PT'nin programı). */
  active: string | null;
  /** Kalıcı seçimin anı (kaçan gün penceresi, yeni PT programı satırı). */
  activeAt?: string;
  /** Gösterilen program (tek seferlikte adresteki). */
  shown: string | null;
  /** Gösterilen, kalıcı seçimden farklı ("Yalnız bugün"). */
  oneOff: boolean;
  /** Seçim sheet'inin satırları: PT'nin programı (varsa) ve kendi programlar; son antrenman günü. */
  choices: { id: string | null; name: string; lastDate?: string }[];
  /** Seçili program okunamadı: PT'nin programı gösterildi ("Evde şu an açılamıyor."). */
  problem?: string;
};

export type WorkoutResponse = {
  /** Uygulamanın saat dilimindeki bugün: yeni antrenmanın tarihi. */
  today: string;
  timeZone: string;
  program: {
    revision: number;
    /** Programın sürüm damgası (`programStamp`): Bugün telefondaki planı bununla eskimiş sayar. */
    stamp: string;
    phaseId: string;
    nextDayId: string | null;
    /** Şu anki evrenin günleri; `lastDate`: son yapıldığı gün ("Başka gün seç"). */
    days: { id: string; name: string; lastDate?: string }[];
    /** Planın kaynağı: PT'nin programı ya da kendi program (kimliği ve adı). Eski yanıtta yok (PT). */
    source?: 'pt' | 'own';
    id?: string;
    name?: string;
  } | null;
  /** Program seçimi; kendi program yoksa yok. */
  selection?: WorkoutSelection;
  /** Program okunamıyorsa danışana dönük metin. */
  problem?: string;
  day: WorkoutDay | null;
  week: WeekCount;
  /** Antrenman günleri (Bugün'ün gün şeridi, "Günlerini değiştir"); program yoksa null. */
  schedule: WorkoutSchedule | null;
  /** Bugünkü su: `water.json` ve bitmiş antrenmanlar (etkin antrenmanın suyu belgesinde). */
  water: { file: number; sessions: number };
  /** Sunucudaki yarım antrenman (başka cihaz, silinmiş tarayıcı verisi). */
  active: SessionDoc | null;
  /** Yarım antrenmandaki muadil ve eklenen hareketlerin planları. */
  extras: ExtraRows;
  /** Sağlık onayı: bitişteki "Ağrı" nedeni yalnız onay varken çıkar (sunucu yine denetler). */
  health: { pain: boolean };
};

/** "Değiştir" sheet'inin bir satırı: muadil ve kendi geçmişiyle planı; kısıtta dikkat varsa kısa not ("Sol diz için dikkatli"). */
export type SwapOption = { exerciseId: string; title: string; pinned: boolean; care?: string; extra: ExtraRow };
export type SwapGroup = { equipment: string; label: string; options: SwapOption[] };
/** `careNote`: sıra kısıtlara göre değiştiyse açıklamanın ikinci cümlesi. */
export type AlternativesResponse = { rowId: string; exerciseId: string; groups: SwapGroup[]; careNote?: string };

/** "Hareket ekle" kütüphanesinin satırı (arama ada ve kaslara göre). */
export type LibraryItem = {
  id: string;
  title: string;
  equipment: string;
  category: Category;
  trackingType: TrackingType;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  /** Kısıtta dikkat varsa kısa not ("Sol diz için dikkatli"; "Değiştir"deki gibi). */
  care?: string;
};
export type LibraryResponse = { exercises: LibraryItem[] };
export type AddedRowResponse = { extra: ExtraRow };

const PROGRAM_PROBLEM = 'Programın şu an açılamıyor. Antrenörüne haber ver.';

/** Bozuk JSON okunamayan dosyadır ('broken'); ağ ve yetki hataları yukarı çıkar. */
async function readTolerant(repo: SessionRepo, path: string): Promise<StoredJson | null | 'broken'> {
  try {
    return await repo.read(path);
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) {
      repo.log(`[antrenman] ${path} okunamadı (bozuk JSON).`);
      return 'broken';
    }
    throw error;
  }
}

/** Blob'daki antrenman; okunamazsa null (tek bozuk geçmiş dosyası günü durdurmaz). */
async function readSessionBlob(repo: SessionRepo, sha: string): Promise<SessionDoc | null> {
  try {
    const stored = parseStoredSession(await repo.readBlob(sha));
    return stored && stored.status !== 'deleted' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Geçmiş: index'ten seçilen antrenmanlar (`historyRows`: günün egzersizleri, satırları ve programı), blob
 * kimliğiyle (okunamayan düşer). Özetin "Gelecek sefer"i de bununla.
 */
export async function readHistory(repo: SessionRepo, index: SessionIndex, select: ReadonlySet<string> | HistoryWindow): Promise<SessionDoc[]> {
  const rows = historyRows(index, select);
  return (await Promise.all(rows.map((row) => readSessionBlob(repo, row.sha)))).filter((doc): doc is SessionDoc => doc !== null);
}

function parseProgram(file: StoredJson | null | 'broken'): { program: Program | null; problem?: string } {
  const parsed = file && file !== 'broken' ? v.safeParse(programSchema, file.content) : null;
  const program = parsed?.success ? parsed.output : null;
  return { program, ...(file === 'broken' || (parsed && !parsed.success) ? { problem: PROGRAM_PROBLEM } : {}) };
}

/** Planın programı: PT'nin programı ya da kendi program (sahibiyle); okunamadıysa danışana dönük sorun. */
type PlanSource = { program: PlanProgram | null; owner: PlanOwner; problem?: string };

/**
 * Gösterilecek program (`docs/design/kendi-program.md` §3.2, §5.4): yarım antrenman varsa onun programı (seçimden
 * bağımsız); yoksa adresteki (`program=op_…|pt`, "Yalnız bugün"); o da yoksa kalıcı seçim. Seçilen kendi program
 * okunamazsa PT'nin programı (sorunuyla); yarım antrenmanın programı okunamazsa plan yok.
 */
async function planSource(input: {
  repo: SessionRepo;
  own: OwnState;
  pt: { program: Program | null; problem?: string };
  current: SessionDoc | null;
  param: string | null;
}): Promise<{ source: PlanSource; shown: string | null; oneOff: boolean; selectionProblem?: string }> {
  const { own, pt, current, param } = input;
  const choice = current ? { shown: current.program?.programId ?? null, oneOff: false } : shownProgram(own.index, own.unreadable, param);
  const { shown, oneOff } = choice;
  const ptSource: PlanSource = { program: pt.program, owner: null, ...(pt.problem ? { problem: pt.problem } : {}) };
  // Kalıcı seçim okunamayan programı gösteriyor (onarımda listeden düştü): PT'nin programı, sorunuyla.
  const broken = 'broken' in choice ? choice.broken : undefined;
  if (broken) return { source: ptSource, shown: null, oneOff: false, selectionProblem: `${broken.name ?? 'Seçtiğin program'} şu an açılamıyor.` };
  if (!shown) return { source: ptSource, shown: null, oneOff };
  const cached = own.programs.get(shown);
  const read = cached ? { status: 'ok' as const, program: cached } : await readOwnProgram(input.repo, shown, own.head.commit);
  if (read.status === 'ok') return { source: { program: read.program, owner: { programId: shown, name: read.program.name } }, shown, oneOff };
  const name = own.index.items.find((item) => item.id === shown)?.name ?? current?.program?.programName ?? 'Programın';
  if (current) return { source: { program: null, owner: null, problem: `${name} şu an açılamıyor.` }, shown, oneOff: false };
  return { source: ptSource, shown: null, oneOff: false, selectionProblem: `${name} şu an açılamıyor.` };
}

type Catalog = { exercises: ReadonlyMap<string, WorkoutExercise>; devices: ReadonlyMap<string, WorkoutDevice> };

/** Öneri katmanının girdisi: hareket deneyimi bütün index'ten, taban danışanın antrenman geçmişinden. */
function insightOf(index: SessionIndex, now: Date, client: Pick<Client, 'training'>): WorkoutInsight {
  return { index, now, experience: client.training?.experience };
}

async function catalogOf(deps: WorkoutRouteDeps): Promise<Catalog & { list: readonly WorkoutExercise[] }> {
  const catalog = await deps.catalog();
  return {
    list: catalog.exercises,
    exercises: new Map(catalog.exercises.map((exercise) => [exercise.id, exercise])),
    devices: new Map(catalog.devices.map((device) => [device.id, device])),
  };
}

/**
 * Yarım antrenmandaki muadil ve eklenen hareketlerin planları (günün planıyla aynı motor, kendi
 * geçmişleriyle). Başka günün antrenmanıysa ya da egzersiz kütüphanede yoksa o hareket atlanır
 * (telefon asıl satırın düzeniyle sürdürür).
 */
export function sessionExtras(input: {
  day: WorkoutDay;
  doc: SessionDoc;
  catalog: Catalog;
  history: readonly SessionDoc[];
  insight?: WorkoutInsight | undefined;
}): ExtraRows {
  const { day, doc, catalog } = input;
  if (doc.program?.dayId !== day.dayId) return {};
  const programId = day.programId ?? null;
  const first = firstForMuscleRowIds(dayBody(day), catalog.exercises);
  const extras: ExtraRows = {};
  for (const entry of doc.entries) {
    const exercise = catalog.exercises.get(entry.exerciseId);
    if (!exercise) continue;
    if (entry.swappedFrom) {
      const original = day.rows[entry.swappedFrom];
      const block = day.blocks.find((item) => item.id === original?.blockId);
      const row = block?.rows.find((item) => item.id === entry.swappedFrom);
      if (!original || !block || !row || original.exerciseId === entry.exerciseId) continue;
      extras[extraKey(row.id, exercise.id)] = swapRowFor({
        row,
        blockId: block.id,
        original,
        exercise,
        devices: catalog.devices,
        history: input.history,
        firstForMuscle: first.has(row.id),
        insight: input.insight,
        programId,
      });
    } else if (entry.added && !entry.rowId) {
      extras[extraKey(entry.id, exercise.id)] = addedRowFor({
        key: entry.id,
        exercise,
        devices: catalog.devices,
        history: input.history,
        setCount: entry.plannedSets,
        insight: input.insight,
        programId,
      });
    }
  }
  return extras;
}

/**
 * Danışanın kısıtları (tasarım `kisit-tarama.md` §3.4, §3.5): yalnız `conditions` onayı varken; dosya okunamazsa
 * süzgeç kısıtsız çalışır (antrenman durmaz). `record` kısıt damgası için (onay yoksa null).
 */
function careOf(client: Client, healthFile: StoredJson | null | 'broken', today: string): { input: CareInput; record: HealthRecord | null } {
  if (!canRecordHealth(client, 'conditions') || healthFile === 'broken') return { input: EMPTY_CARE, record: null };
  // Dosya yoksa boş kayıt: damga Bugün'ün hesabıyla (`client-care.ts`) aynı çıksın.
  if (!healthFile) return { input: EMPTY_CARE, record: { version: 2, checkIns: [], measurements: [] } };
  const parsed = v.safeParse(healthRecordSchema, healthFile.content);
  if (!parsed.success) return { input: EMPTY_CARE, record: null };
  return { input: careInputOf(parsed.output, { today, painConsent: canRecordHealth(client, 'check_in') }), record: parsed.output };
}

/**
 * Günün satırlarına kart notu (`care`); kısıt yoksa gün aynen döner. Kendi programda satırı danışan seçti: metin
 * "antrenörün planladı" demez (`own`, muadil ve eklenenle aynı).
 */
export function withRowCare(day: WorkoutDay, exercises: ReadonlyMap<string, WorkoutExercise>, input: CareInput): WorkoutDay {
  if (!hasCare(input)) return day;
  const rows: Record<string, WorkoutDay['rows'][string]> = {};
  let changed = false;
  const own = day.source === 'own';
  for (const [rowId, row] of Object.entries(day.rows)) {
    const exercise = exercises.get(row.exerciseId);
    const care = exercise ? rowCareOf(evaluateCare(exercise, input), input) : null;
    rows[rowId] = care ? { ...row, care: own ? { ...care, own: true as const } : care } : row;
    if (care) changed = true;
  }
  return changed ? { ...day, rows } : day;
}

/**
 * Danışanın seçtiği hareketin (muadil ya da eklenen) kart notu: günün satırlarıyla aynı kural; metin "antrenörün
 * planladı" demez (`own`). Kısıt yoksa satır aynen döner.
 */
function withExtraCare(extra: ExtraRow, input: CareInput, result: CareResult): ExtraRow {
  const care = rowCareOf(result, input);
  return care ? { ...extra, row: { ...extra.row, care: { ...care, own: true } } } : extra;
}

/** Yarım antrenmandaki muadil ve eklenenlerin notları: yeniden açınca ya da başka cihazda da kalsın. */
function withExtrasCare(extras: ExtraRows, exercises: ReadonlyMap<string, WorkoutExercise>, input: CareInput): ExtraRows {
  if (!hasCare(input)) return extras;
  return Object.fromEntries(
    Object.entries(extras).map(([key, extra]) => {
      const exercise = exercises.get(extra.exerciseId);
      return [key, exercise ? withExtraCare(extra, input, evaluateCare(exercise, input)) : extra];
    }),
  );
}

export function workoutRoute(deps: WorkoutRouteDeps, dayParam: string | null, programParam: string | null = null): Promise<SessionRouteResult> {
  return run(deps, null, 'workout', async ({ client, repo }) => {
    const head = await repo.head();
    const [repaired, own, programFile, waterFile, catalog, timeZone, proposalsFile, healthFile] = await Promise.all([
      readIndex(repo, head),
      readOwnState(repo, head),
      readTolerant(repo, 'program.json'),
      readTolerant(repo, WATER_PATH),
      catalogOf(deps),
      deps.timeZone(),
      readTolerant(repo, PROPOSALS_PATH),
      // Sağlık verisi yalnız onay varken okunur (gösterim de işlemedir): set artışının hazır oluşluk koşulu ve kısıtlar.
      canRecordHealth(client, 'readiness') || canRecordHealth(client, 'conditions') ? readTolerant(repo, HEALTH_PATH) : Promise.resolve(null),
    ]);
    const now = deps.now();
    const today = todayIn(timeZone, now);
    const index = repaired.index;
    const pt = parseProgram(programFile);
    const care = careOf(client, healthFile, today);

    const unfinished = activeRow(index);
    const active = unfinished ? await readSessionBlob(repo, unfinished.sha) : null;
    const current = active?.status === 'active' ? active : null;
    // Yarım antrenman seçimden bağımsız kendi programıyla sürer; yoksa adresteki ya da kalıcı seçim (§3.2, §5.4).
    const chosen = await planSource({ repo, own, pt, current, param: programParam });
    const { program, owner, problem } = chosen.source;

    let day: WorkoutDay | null = null;
    let extras: ExtraRows = {};
    if (program) {
      const requested = dayParam && DAY_ID_PATTERN.test(dayParam) ? dayParam : (current?.program?.dayId ?? null);
      const dayId = resolveDay(program, requested)?.day.id ?? null;
      // Yarım antrenmanın muadil ve eklenen hareketlerinin geçmişi de okunur; satır başına ve aynı programdan pencere (§3.9).
      const ids = new Set([...dayExerciseIds(program, dayId), ...(current?.entries.map((entry) => entry.exerciseId) ?? [])]);
      const history = await readHistory(repo, index, { exerciseIds: ids, rowIds: dayRowIds(program, dayId), programId: owner?.programId ?? null });
      const insight = insightOf(index, now, client);
      day = buildWorkoutDay({ program, dayId, exercises: catalog.exercises, devices: catalog.devices, history, insight, owner });
      if (day && current) extras = withExtrasCare(sessionExtras({ day, doc: current, catalog, history, insight }), catalog.exercises, care.input);
      if (day) {
        const setIncrease = setSuggestionsFor({
          day,
          exercises: catalog.exercises,
          index,
          now,
          experience: client.training?.experience,
          readinessScore:
            healthFile && healthFile !== 'broken' && canRecordHealth(client, 'readiness') ? readinessFromHealth(healthFile.content) : undefined,
          proposals: proposalsFile && proposalsFile !== 'broken' ? parseProposals(proposalsFile.content).items : [],
          setWeightsOf: deps.setWeights,
          sessionId: current?.id,
        });
        if (setIncrease.length > 0) day = { ...day, setIncrease };
        day = withRowCare(day, catalog.exercises, care.input);
      }
    }

    const phase = program ? currentPhaseOf(program)?.phase : undefined;
    const last = lastDoneDates(index);
    // Kalıcı seçimin anı gösterilen program kalıcı seçimse pencereyi açar (seçimden önceki günler kaçmış sayılmaz).
    const activeAt = !chosen.oneOff ? own.index.active?.at : undefined;
    const selection = selectionOf({ own, pt: pt.program, index, shown: chosen.shown, oneOff: chosen.oneOff, problem: chosen.selectionProblem });
    const body: WorkoutResponse = {
      today,
      timeZone,
      program:
        program && phase
          ? {
              revision: program.revision,
              // Kısıtlar ya da izinler değişince (ya da onay çekilince) telefondaki plan eskir: kart notu yenilenir.
              stamp: programStamp(program, owner?.programId ?? null) + careStampOf(care.record),
              phaseId: phase.id,
              nextDayId: nextDayId(program),
              days: phase.days.map((item) => ({ id: item.id, name: item.name, ...(last[item.id] ? { lastDate: last[item.id] } : {}) })),
              source: owner ? 'own' : 'pt',
              ...(owner ? { id: owner.programId, name: owner.name } : {}),
            }
          : null,
      ...(selection ? { selection } : {}),
      ...(problem ? { problem } : {}),
      day,
      week: weekOf(index, program, now, timeZone),
      schedule: program ? scheduleOf(program, { client, timeZone, activeAt }) : null,
      water: {
        file: waterFile && waterFile !== 'broken' ? waterOnDay(parseWaterFile(waterFile.content).file.taps, today, timeZone) : 0,
        sessions: sessionWaterOn(index, today),
      },
      active: current,
      extras,
      health: { pain: canRecordHealth(client, 'check_in') },
    };
    return { status: 200, body };
  });
}

/** Seçim sheet'inin verisi: yalnız en az bir kendi program (ya da okunamayan) varken. */
function selectionOf(input: {
  own: OwnState;
  pt: Program | null;
  index: SessionIndex;
  shown: string | null;
  oneOff: boolean;
  problem?: string | undefined;
}): WorkoutSelection | null {
  const { own } = input;
  if (own.index.items.length === 0 && !input.problem) return null;
  const last = lastDateByProgram(input.index);
  const lastOf = (key: string) => (last.get(key) ? { lastDate: last.get(key) as string } : {});
  const active = activeProgramId(own.index);
  return {
    active,
    ...(own.index.active?.at ? { activeAt: own.index.active.at } : {}),
    shown: input.shown,
    oneOff: input.oneOff,
    choices: [
      ...(input.pt ? [{ id: null, name: PT_PROGRAM_NAME, ...lastOf('pt') }] : []),
      ...own.index.items.map((item) => ({ id: item.id, name: item.name, ...lastOf(item.id) })),
    ],
    ...(input.problem ? { problem: input.problem } : {}),
  };
}

const BAD_REQUEST = { status: 400, body: { error: 'İstek geçersiz.' } };

/** Muadil ve eklenen hareketin programı: `op_…` kendi program, yok ya da `pt` PT'nin programı; bozuksa undefined. */
function ownParam(value: string | null): string | null | undefined {
  if (value === null || value === 'pt') return null;
  return isOwnProgramId(value) ? value : undefined;
}
const ROW_GONE = { status: 404, body: { error: 'Bu hareket programında artık yok; muadilleri açılamadı.' } };

/**
 * "Değiştir" (§2.6): satırın muadilleri, ekipmana göre gruplu (vücut ağırlığı önce). PT'nin
 * sabitledikleri önce, sonra aynı kalıp ve aynı kaslar (`rankAlternatives`); bugünün öteki hareketleri
 * önerilmez. Her muadil satırın set düzeniyle ve kendi geçmişiyle planlanır: "30 kg ile başla".
 */
export function alternativesRoute(
  deps: WorkoutRouteDeps,
  dayParam: string | null,
  rowParam: string | null,
  programQuery: string | null = null,
): Promise<SessionRouteResult> {
  if (!dayParam || !DAY_ID_PATTERN.test(dayParam) || !rowParam || !ROW_ID_PATTERN.test(rowParam)) return Promise.resolve(BAD_REQUEST);
  const programParam = ownParam(programQuery);
  if (programParam === undefined) return Promise.resolve(BAD_REQUEST);
  return run(deps, null, 'workout-alternatives', async ({ client, repo }) => {
    // Günün programı: kendi programda `program=op_…` (gün kimlikleri bütün programlarda benzersiz).
    const [repaired, programFile, catalog, ownRead, healthFile, timeZone] = await Promise.all([
      readIndex(repo),
      programParam ? Promise.resolve(null) : readTolerant(repo, 'program.json'),
      catalogOf(deps),
      programParam ? readOwnProgram(repo, programParam) : Promise.resolve(null),
      // Kısıtlar yalnız `conditions` onayı varken okunur.
      canRecordHealth(client, 'conditions') ? readTolerant(repo, HEALTH_PATH) : Promise.resolve(null),
      deps.timeZone(),
    ]);
    const care = careOf(client, healthFile, todayIn(timeZone, deps.now())).input;
    const program: PlanProgram | null = ownRead ? (ownRead.status === 'ok' ? ownRead.program : null) : parseProgram(programFile).program;
    const found = program ? resolveDay(program, dayParam) : null;
    if (!found || found.day.id !== dayParam) return ROW_GONE;
    const block = found.day.blocks.find((item) => item.rows.some((row) => row.id === rowParam));
    const stored = block?.rows.find((item) => item.id === rowParam);
    // Muadil satırın geçerli hedefiyle (danışanın hedefi dahil, §6.2) planlanır: günün planıyla aynı.
    const row = stored ? { ...stored, sets: effectiveSets(stored, program?.clientTargets) } : undefined;
    const source = row ? catalog.exercises.get(row.exerciseId) : undefined;
    if (!block || !row || !source) return ROW_GONE;

    const today = new Set(found.day.blocks.flatMap((item) => item.rows.map((other) => other.exerciseId)));
    // Danışanın kısıtlarına göre izinsiz yasak adaylar listeye hiç girmez (tasarım `kisit-tarama.md` §3.4).
    const results = new Map<string, CareResult>();
    const resultOf = (exercise: WorkoutExercise) => {
      let result = results.get(exercise.id);
      if (!result) {
        result = evaluateCare(exercise, care);
        results.set(exercise.id, result);
      }
      return result;
    };
    const candidates = catalog.list.filter((exercise) => !today.has(exercise.id) && (!hasCare(care) || resultOf(exercise).blockedBy.length === 0));
    const ranked = rankAlternatives(source, candidates, deps.familyOf, { limit: ALTERNATIVES_LIMIT });
    const programId = programParam ?? null;
    const history = await readHistory(repo, repaired.index, { exerciseIds: new Set(ranked.map((item) => item.exercise.id)), rowIds: new Set([row.id]), programId });
    const kept = found.day.blocks.flatMap((item) => {
      const rows = item.rows.filter((other) => catalog.exercises.has(other.exerciseId));
      return rows.length > 0 ? [{ ...item, rows }] : [];
    });
    const firstForMuscle = firstForMuscleRowIds({ blocks: kept }, catalog.exercises).has(row.id);
    const insight = insightOf(repaired.index, deps.now(), client);
    let reordered = false;
    let anyClear = false;
    const groups: SwapGroup[] = groupByEquipment(ranked).map(([equipment, list]) => {
      // Grubun içinde uygun → ipucu → dikkat → eksik bilgi → kontrol edilmedi; puan sırası aynı kümede korunur.
      const ordered = hasCare(care) ? orderByCare(list, (item) => resultOf(item.exercise)) : { items: list, changed: false, anyClear: true };
      reordered ||= ordered.changed;
      anyClear ||= ordered.anyClear;
      return {
        equipment,
        label: EQUIPMENT_LABELS[equipment as Equipment] ?? equipment,
        options: ordered.items.map(({ exercise, pinned }) => {
          const note = hasCare(care) ? optionCareText(resultOf(exercise)) : null;
          const extra = swapRowFor({ row, blockId: block.id, original: source, exercise, devices: catalog.devices, history, firstForMuscle, insight, programId });
          return {
            exerciseId: exercise.id,
            title: exercise.title,
            pinned,
            ...(note ? { care: note } : {}),
            // Seçilen muadilin kartı da notu taşır ("Sol diz için dikkatli" seçildiyse kartta da).
            extra: hasCare(care) ? withExtraCare(extra, care, resultOf(exercise)) : extra,
          };
        }),
      };
    });
    // "Kısıtına uygun olanlar önce" yalnız sıra gerçekten değiştiyse ve en az bir aday uygunsa.
    const careNote = reordered && anyClear ? (care.active.length + care.reports.length > 1 ? 'Kısıtlarına uygun olanlar önce.' : 'Kısıtına uygun olanlar önce.') : undefined;
    const body: AlternativesResponse = { rowId: row.id, exerciseId: source.id, groups, ...(careNote ? { careNote } : {}) };
    return { status: 200, body };
  });
}

/**
 * "Hareket ekle" (§2.6): kütüphane (ada göre sıralı) ya da `add` verilirse o egzersizin planı:
 * varsayılan setleri ve dinlenmesi, kendi geçmişiyle. Anahtar egzersizin kimliği; telefon kaydı açınca
 * kaydın kimliğiyle değiştirir. Kısıtlar "Değiştir"le aynı kuralla (tasarım `kisit-tarama.md` §3.4): izinsiz
 * yasak listeye girmez ve eklenemez (liste telefonda önbellekte kalabilir: 409), dikkat kısa notla; eklenen
 * satır kart notunu taşır.
 */
export function exercisesRoute(deps: WorkoutRouteDeps, addParam: string | null, programQuery: string | null = null): Promise<SessionRouteResult> {
  if (addParam !== null && !/^[a-z0-9-]{2,60}$/.test(addParam)) return Promise.resolve(BAD_REQUEST);
  const programParam = ownParam(programQuery);
  if (programParam === undefined) return Promise.resolve(BAD_REQUEST);
  return run(deps, null, 'workout-exercises', async ({ client, repo }) => {
    const [catalog, healthFile, timeZone] = await Promise.all([
      catalogOf(deps),
      // Kısıtlar yalnız `conditions` onayı varken okunur.
      canRecordHealth(client, 'conditions') ? readTolerant(repo, HEALTH_PATH) : Promise.resolve(null),
      deps.timeZone(),
    ]);
    const care = careOf(client, healthFile, todayIn(timeZone, deps.now())).input;
    const cared = hasCare(care);
    if (addParam === null) {
      const exercises: LibraryItem[] = [...catalog.list]
        .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
        .flatMap((exercise) => {
          const result = cared ? evaluateCare(exercise, care) : null;
          // Danışan izin veremez: izinsiz yasak listede hiç yok ("Değiştir"deki gibi).
          if (result && result.blockedBy.length > 0) return [];
          const note = result ? optionCareText(result) : null;
          return [
            {
              id: exercise.id,
              title: exercise.title,
              equipment: exercise.equipment,
              category: exercise.category,
              trackingType: exercise.trackingType,
              primaryMuscles: exercise.primaryMuscles,
              secondaryMuscles: exercise.secondaryMuscles,
              ...(note ? { care: note } : {}),
            },
          ];
        });
      const body: LibraryResponse = { exercises };
      return { status: 200, body };
    }
    const exercise = catalog.exercises.get(addParam);
    if (!exercise) return { status: 404, body: { error: 'Bu hareket kütüphanede yok.' } };
    const result = cared ? evaluateCare(exercise, care) : null;
    if (result && result.blockedBy.length > 0) return { status: 409, body: { error: BLOCKED_TEXT } };
    const repaired = await readIndex(repo);
    const programId = programParam ?? null;
    const history = await readHistory(repo, repaired.index, { exerciseIds: new Set([exercise.id]), programId });
    const insight = insightOf(repaired.index, deps.now(), client);
    const extra = addedRowFor({ key: exercise.id, exercise, devices: catalog.devices, history, insight, programId });
    const body: AddedRowResponse = { extra: result ? withExtraCare(extra, care, result) : extra };
    return { status: 200, body };
  });
}

/** Antrenman dışı su: dokunuşlar `water.json`'a (kimlikle birleşir); yanıt bugünkü bardak sayısı. */
export function waterRoute(deps: SessionRouteDeps, headers: Headers, origin: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, null, 'water', async ({ client, repo }) => {
    const parsed = v.safeParse(waterPostSchema, input);
    if (!parsed.success) return { status: 400, body: { error: 'Kayıt geçersiz.' } };
    const timeZone = await deps.timeZone();
    const today = todayIn(timeZone, deps.now());
    for (let attempt = 0; ; attempt += 1) {
      // Bozuk JSON 500 fırlatır: dosya ezilmez, telefon dokunuşları tutar.
      const file = await repo.read(WATER_PATH);
      const { file: current, dropped } = parseWaterFile(file?.content ?? null);
      if (dropped > 0) deps.log(`[su] ${client.id}: ${dropped} dokunuş okunamadı.`);
      const merged = mergeWaterTaps(current, parsed.output.taps);
      if (!merged.changed) return { status: 200, body: { file: waterOnDay(current.taps, today, timeZone), unchanged: true } };
      try {
        await repo.write(WATER_PATH, merged.file, { sha: file?.sha, message: waterMessage(merged.added) });
        deps.log(`[su] ${client.id} ${merged.added.length} dokunuş`);
        return { status: 200, body: { file: waterOnDay(merged.file.taps, today, timeZone) } };
      } catch (error) {
        if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
        throw error;
      }
    }
  });
}

export type ScheduleResponse = { schedule: WorkoutSchedule; unchanged?: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Danışanın antrenman günleri (tasarım §2.11; Bugün'deki ve Ayarlar'daki "Günlerini değiştir"):
 * doğrudan uygulanır (`applyClientSchedule`), program geçmişine `client` türünde yazılır, revision
 * artmaz; PT'nin açık düzenleyicisi 412 almaz. Dosya ham hâliyle korunur: yalnız danışanın katmanı ve
 * geçmiş değişir (bilinmeyen alanlar düşmez). Değişiklik yoksa yazılmaz; çakışmada taze okuyup bir kez
 * daha. Yazınca PT'nin bildirim özeti düşer ("Danışan programını güncelledi").
 */
export function scheduleRoute(deps: SessionRouteDeps, headers: Headers, origin: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, null, 'schedule', async ({ client, repo }) => {
    const parsed = v.safeParse(scheduleBodySchema, input);
    if (!parsed.success) return { status: 400, body: { error: 'En az bir gün seç.' } };
    const timeZone = await deps.timeZone();
    // Gösterilen program (`docs/design/kendi-program.md` §3.2): verilmezse kalıcı seçim; kendi programda doğrudan
    // `schedule` (program + index tek commit), PT'ninkinde danışanın katmanı.
    const target = parsed.output.programId !== undefined ? parsed.output.programId : activeProgramId((await readOwnState(repo)).index);
    if (target) {
      const result = await scheduleOwnProgram(repo, target, parsed.output.weekdays, deps.now());
      if (!('program' in result)) {
        return result.status === 'missing'
          ? { status: 404, body: { error: 'Bu program artık yok.' } }
          : { status: 409, body: { error: 'Programın şu an açılamıyor.' } };
      }
      if (result.status === 'saved') deps.log(`[kendi program] ${client.id} günler`);
      const body: ScheduleResponse = { schedule: scheduleOf(result.program, { client, timeZone }), ...(result.status === 'unchanged' ? { unchanged: true as const } : {}) };
      return { status: 200, body };
    }
    for (let attempt = 0; ; attempt += 1) {
      // Bozuk JSON 500 fırlatır: dosya ezilmez.
      const file = await repo.read('program.json');
      if (!file) return { status: 404, body: { error: 'Henüz programın yok; antrenörün hazırlayınca günlerini seçebilirsin.' } };
      const program = v.safeParse(programSchema, file.content);
      if (!program.success) return { status: 409, body: { error: PROGRAM_PROBLEM } };
      const applied = applyClientSchedule(program.output, parsed.output.weekdays, deps.now());
      if (!applied) {
        const body: ScheduleResponse = { schedule: scheduleOf(program.output, { client, timeZone }), unchanged: true };
        return { status: 200, body };
      }
      const raw = isRecord(file.content) && file.content.version === 2 ? file.content : program.output;
      const { clientSchedule: _dropped, ...rest } = raw as Record<string, unknown>;
      // PT'nin günlerine dönüşte `schedule.at` şimdi olur (`applyClientSchedule`): kaçan gün penceresi eski katmanın anına geri açılmasın.
      const next = {
        ...rest,
        ...(applied.program.schedule ? { schedule: applied.program.schedule } : {}),
        ...(applied.program.clientSchedule ? { clientSchedule: applied.program.clientSchedule } : {}),
        log: applied.program.log,
      };
      try {
        await repo.write('program.json', next, { sha: file.sha, message: `Program (danışan): ${applied.text}` });
        repo.noticesChanged();
        deps.log(`[program] ${client.id} günler`);
        const body: ScheduleResponse = { schedule: scheduleOf(applied.program, { client, timeZone }) };
        return { status: 200, body };
      } catch (error) {
        if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
        throw error;
      }
    }
  });
}
