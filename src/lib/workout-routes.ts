import * as v from 'valibot';
import { groupByEquipment, rankAlternatives } from './alternatives.ts';
import { postGuard } from './client-auth-routes.ts';
import { canRecordHealth } from './client-status.ts';
import { todayIn } from './format.ts';
import { GithubError } from './github/errors.ts';
import { currentPhaseOf, DAY_ID_PATTERN, nextDayId } from './program-plan.ts';
import type { TrackingType } from './progression.ts';
import { EQUIPMENT_LABELS, type Category, type Equipment } from './schemas/exercise.ts';
import { programSchema, type Program } from './schemas/program.ts';
import { parseStoredSession, type SessionDoc, type SessionIndex } from './schemas/session.ts';
import { readIndex, type SessionRepo, type StoredJson } from './session-files-core.ts';
import { run, type SessionRouteDeps, type SessionRouteResult } from './session-routes.ts';
import { firstForMuscleRowIds, ROW_ID_PATTERN } from './template-plan.ts';
import { mergeWaterTaps, parseWaterFile, WATER_PATH, waterMessage, waterOnDay, waterPostSchema } from './water.ts';
import {
  activeRow,
  addedRowFor,
  buildWorkoutDay,
  dayBody,
  dayExerciseIds,
  extraKey,
  historyRows,
  resolveDay,
  sessionWaterOn,
  swapRowFor,
  weekOf,
  type ExtraRow,
  type ExtraRows,
  type WorkoutDay,
  type WorkoutDevice,
  type WorkoutExercise,
} from './workout-plan.ts';

/**
 * Antrenman ekranının öteki uçları (tasarım §4.7) — ince çekirdek, `session-routes.ts`'in kapısıyla
 * (`run`: oturum, kayıt, GitHub hataları):
 * - `GET /api/me/workout?day=`: günün planı (`buildWorkoutDay`), Bugün'ün sayıları ("bu hafta x/3",
 *   bugünkü su) ve sunucudaki yarım antrenman. Gün: istenen → yarım antrenmanın günü → sıradaki gün.
 *   Index her okumada onarılır (`readIndex`); geçmiş yalnız bugünkü egzersizleri içeren son bitmiş
 *   antrenmanlardan (blob kimliğiyle, önbellekli). Okunamayan geçmiş dosyası planı durdurmaz.
 *   Yarım antrenmanda muadil ve eklenen hareketlerin planları da (`extras`): başka cihazda ya da
 *   silinmiş tarayıcı verisiyle sürdürülen antrenman aynı hareketlerle açılır.
 * - `GET /api/me/workout/alternatives?day=&row=`: satırın muadilleri ("Değiştir", §2.6), ekipmana göre
 *   gruplu (`alternatives.ts`); her biri kendi geçmişiyle planlı. Bugünün öteki hareketleri önerilmez.
 * - `GET /api/me/workout/exercises[?add=]`: "Hareket ekle"nin kütüphanesi; `add` verilirse o egzersizin
 *   varsayılan setleriyle planı.
 * - `POST /api/me/water`: antrenman dışı su dokunuşları `water.json`'a, kimlikle birleşerek
 *   (idempotent); değişiklik yoksa yazılmaz, çakışmada taze okuyup bir kez daha. Bozuk dosya ezilmez.
 */

export type WorkoutRouteDeps = SessionRouteDeps & {
  /** Egzersiz ve cihaz kataloğu (hazır kütüphane + PT'nin kayıtları). */
  catalog(): Promise<{ exercises: readonly WorkoutExercise[]; devices: readonly WorkoutDevice[] }>;
  /** Kasın ailesi (üst kanat → "Kanat"): muadil sıralaması (`muscles.ts`). */
  familyOf(muscle: string): string;
};

/** Muadil listesinin en çok uzunluğu (PT'nin sabitledikleri dahil). */
export const ALTERNATIVES_LIMIT = 8;

export type WorkoutResponse = {
  /** Uygulamanın saat dilimindeki bugün: yeni antrenmanın tarihi. */
  today: string;
  timeZone: string;
  program: { revision: number; phaseId: string; nextDayId: string | null; days: { id: string; name: string }[] } | null;
  /** Program okunamıyorsa danışana dönük metin. */
  problem?: string;
  day: WorkoutDay | null;
  week: { done: number; target: number | null };
  /** Bugünkü su: `water.json` ve bitmiş antrenmanlar (etkin antrenmanın suyu belgesinde). */
  water: { file: number; sessions: number };
  /** Sunucudaki yarım antrenman (başka cihaz, silinmiş tarayıcı verisi). */
  active: SessionDoc | null;
  /** Yarım antrenmandaki muadil ve eklenen hareketlerin planları. */
  extras: ExtraRows;
  /** Sağlık onayı: bitişteki "Ağrı" nedeni yalnız onay varken çıkar (sunucu yine denetler). */
  health: { pain: boolean };
};

/** "Değiştir" sheet'inin bir satırı: muadil ve kendi geçmişiyle planı. */
export type SwapOption = { exerciseId: string; title: string; pinned: boolean; extra: ExtraRow };
export type SwapGroup = { equipment: string; label: string; options: SwapOption[] };
export type AlternativesResponse = { rowId: string; exerciseId: string; groups: SwapGroup[] };

/** "Hareket ekle" kütüphanesinin satırı (arama ada ve kaslara göre). */
export type LibraryItem = {
  id: string;
  title: string;
  equipment: string;
  category: Category;
  trackingType: TrackingType;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
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

/** Geçmiş: index'ten seçilen antrenmanlar, blob kimliğiyle (okunamayan düşer). */
async function readHistory(repo: SessionRepo, index: SessionIndex, exerciseIds: ReadonlySet<string>): Promise<SessionDoc[]> {
  const rows = historyRows(index, exerciseIds);
  return (await Promise.all(rows.map((row) => readSessionBlob(repo, row.sha)))).filter((doc): doc is SessionDoc => doc !== null);
}

function parseProgram(file: StoredJson | null | 'broken'): { program: Program | null; problem?: string } {
  const parsed = file && file !== 'broken' ? v.safeParse(programSchema, file.content) : null;
  const program = parsed?.success ? parsed.output : null;
  return { program, ...(file === 'broken' || (parsed && !parsed.success) ? { problem: PROGRAM_PROBLEM } : {}) };
}

type Catalog = { exercises: ReadonlyMap<string, WorkoutExercise>; devices: ReadonlyMap<string, WorkoutDevice> };

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
export function sessionExtras(input: { day: WorkoutDay; doc: SessionDoc; catalog: Catalog; history: readonly SessionDoc[] }): ExtraRows {
  const { day, doc, catalog } = input;
  if (doc.program?.dayId !== day.dayId) return {};
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
      });
    } else if (entry.added && !entry.rowId) {
      extras[extraKey(entry.id, exercise.id)] = addedRowFor({ key: entry.id, exercise, devices: catalog.devices, history: input.history, setCount: entry.plannedSets });
    }
  }
  return extras;
}

export function workoutRoute(deps: WorkoutRouteDeps, dayParam: string | null): Promise<SessionRouteResult> {
  return run(deps, null, 'workout', async ({ client, repo }) => {
    const [repaired, programFile, waterFile, catalog, timeZone] = await Promise.all([
      readIndex(repo),
      readTolerant(repo, 'program.json'),
      readTolerant(repo, WATER_PATH),
      catalogOf(deps),
      deps.timeZone(),
    ]);
    const now = deps.now();
    const today = todayIn(timeZone, now);
    const index = repaired.index;
    const { program, problem } = parseProgram(programFile);

    const unfinished = activeRow(index);
    const active = unfinished ? await readSessionBlob(repo, unfinished.sha) : null;
    const current = active?.status === 'active' ? active : null;

    let day: WorkoutDay | null = null;
    let extras: ExtraRows = {};
    if (program) {
      const requested = dayParam && DAY_ID_PATTERN.test(dayParam) ? dayParam : (current?.program?.dayId ?? null);
      const dayId = resolveDay(program, requested)?.day.id ?? null;
      // Yarım antrenmanın muadil ve eklenen hareketlerinin geçmişi de okunur.
      const ids = new Set([...dayExerciseIds(program, dayId), ...(current?.entries.map((entry) => entry.exerciseId) ?? [])]);
      const history = await readHistory(repo, index, ids);
      day = buildWorkoutDay({ program, dayId, exercises: catalog.exercises, devices: catalog.devices, history });
      if (day && current) extras = sessionExtras({ day, doc: current, catalog, history });
    }

    const phase = program ? currentPhaseOf(program)?.phase : undefined;
    const body: WorkoutResponse = {
      today,
      timeZone,
      program:
        program && phase
          ? { revision: program.revision, phaseId: phase.id, nextDayId: nextDayId(program), days: phase.days.map((item) => ({ id: item.id, name: item.name })) }
          : null,
      ...(problem ? { problem } : {}),
      day,
      week: weekOf(index, program, now, timeZone),
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

const BAD_REQUEST = { status: 400, body: { error: 'İstek geçersiz.' } };
const ROW_GONE = { status: 404, body: { error: 'Bu hareket programında artık yok; muadilleri açılamadı.' } };

/**
 * "Değiştir" (§2.6): satırın muadilleri, ekipmana göre gruplu (vücut ağırlığı önce). PT'nin
 * sabitledikleri önce, sonra aynı kalıp ve aynı kaslar (`rankAlternatives`); bugünün öteki hareketleri
 * önerilmez. Her muadil satırın set düzeniyle ve kendi geçmişiyle planlanır: "30 kg ile başla".
 */
export function alternativesRoute(deps: WorkoutRouteDeps, dayParam: string | null, rowParam: string | null): Promise<SessionRouteResult> {
  if (!dayParam || !DAY_ID_PATTERN.test(dayParam) || !rowParam || !ROW_ID_PATTERN.test(rowParam)) return Promise.resolve(BAD_REQUEST);
  return run(deps, null, 'workout-alternatives', async ({ repo }) => {
    const [repaired, programFile, catalog] = await Promise.all([readIndex(repo), readTolerant(repo, 'program.json'), catalogOf(deps)]);
    const { program } = parseProgram(programFile);
    const found = program ? resolveDay(program, dayParam) : null;
    if (!found || found.day.id !== dayParam) return ROW_GONE;
    const block = found.day.blocks.find((item) => item.rows.some((row) => row.id === rowParam));
    const row = block?.rows.find((item) => item.id === rowParam);
    const source = row ? catalog.exercises.get(row.exerciseId) : undefined;
    if (!block || !row || !source) return ROW_GONE;

    const today = new Set(found.day.blocks.flatMap((item) => item.rows.map((other) => other.exerciseId)));
    const candidates = catalog.list.filter((exercise) => !today.has(exercise.id));
    const ranked = rankAlternatives(source, candidates, deps.familyOf, { limit: ALTERNATIVES_LIMIT });
    const history = await readHistory(repo, repaired.index, new Set(ranked.map((item) => item.exercise.id)));
    const kept = found.day.blocks.flatMap((item) => {
      const rows = item.rows.filter((other) => catalog.exercises.has(other.exerciseId));
      return rows.length > 0 ? [{ ...item, rows }] : [];
    });
    const firstForMuscle = firstForMuscleRowIds({ blocks: kept }, catalog.exercises).has(row.id);
    const groups: SwapGroup[] = groupByEquipment(ranked).map(([equipment, list]) => ({
      equipment,
      label: EQUIPMENT_LABELS[equipment as Equipment] ?? equipment,
      options: list.map(({ exercise, pinned }) => ({
        exerciseId: exercise.id,
        title: exercise.title,
        pinned,
        extra: swapRowFor({ row, blockId: block.id, original: source, exercise, devices: catalog.devices, history, firstForMuscle }),
      })),
    }));
    const body: AlternativesResponse = { rowId: row.id, exerciseId: source.id, groups };
    return { status: 200, body };
  });
}

/**
 * "Hareket ekle" (§2.6): kütüphane (ada göre sıralı) ya da `add` verilirse o egzersizin planı:
 * varsayılan setleri ve dinlenmesi, kendi geçmişiyle. Anahtar egzersizin kimliği; telefon kaydı açınca
 * kaydın kimliğiyle değiştirir.
 */
export function exercisesRoute(deps: WorkoutRouteDeps, addParam: string | null): Promise<SessionRouteResult> {
  if (addParam !== null && !/^[a-z0-9-]{2,60}$/.test(addParam)) return Promise.resolve(BAD_REQUEST);
  return run(deps, null, 'workout-exercises', async ({ repo }) => {
    const catalog = await catalogOf(deps);
    if (addParam === null) {
      const exercises: LibraryItem[] = [...catalog.list]
        .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
        .map((exercise) => ({
          id: exercise.id,
          title: exercise.title,
          equipment: exercise.equipment,
          category: exercise.category,
          trackingType: exercise.trackingType,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
        }));
      const body: LibraryResponse = { exercises };
      return { status: 200, body };
    }
    const exercise = catalog.exercises.get(addParam);
    if (!exercise) return { status: 404, body: { error: 'Bu hareket kütüphanede yok.' } };
    const repaired = await readIndex(repo);
    const history = await readHistory(repo, repaired.index, new Set([exercise.id]));
    const body: AddedRowResponse = { extra: addedRowFor({ key: exercise.id, exercise, devices: catalog.devices, history }) };
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
