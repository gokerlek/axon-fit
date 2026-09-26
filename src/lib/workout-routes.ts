import * as v from 'valibot';
import { postGuard } from './client-auth-routes.ts';
import { todayIn } from './format.ts';
import { GithubError } from './github/errors.ts';
import { currentPhaseOf, DAY_ID_PATTERN, nextDayId } from './program-plan.ts';
import { programSchema } from './schemas/program.ts';
import { parseStoredSession, type SessionDoc } from './schemas/session.ts';
import { readIndex, type SessionRepo, type StoredJson } from './session-files-core.ts';
import { run, type SessionRouteDeps, type SessionRouteResult } from './session-routes.ts';
import { mergeWaterTaps, parseWaterFile, WATER_PATH, waterMessage, waterOnDay, waterPostSchema } from './water.ts';
import {
  activeRow,
  buildWorkoutDay,
  dayExerciseIds,
  historyRows,
  resolveDay,
  sessionWaterOn,
  weekOf,
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
 * - `POST /api/me/water`: antrenman dışı su dokunuşları `water.json`'a, kimlikle birleşerek
 *   (idempotent); değişiklik yoksa yazılmaz, çakışmada taze okuyup bir kez daha. Bozuk dosya ezilmez.
 */

export type WorkoutRouteDeps = SessionRouteDeps & {
  /** Egzersiz ve cihaz kataloğu (hazır kütüphane + PT'nin kayıtları). */
  catalog(): Promise<{ exercises: readonly WorkoutExercise[]; devices: readonly WorkoutDevice[] }>;
};

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
};

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

export function workoutRoute(deps: WorkoutRouteDeps, dayParam: string | null): Promise<SessionRouteResult> {
  return run(deps, null, 'workout', async ({ repo }) => {
    const [repaired, programFile, waterFile, catalog, timeZone] = await Promise.all([
      readIndex(repo),
      readTolerant(repo, 'program.json'),
      readTolerant(repo, WATER_PATH),
      deps.catalog(),
      deps.timeZone(),
    ]);
    const now = deps.now();
    const today = todayIn(timeZone, now);
    const index = repaired.index;

    const parsed = programFile && programFile !== 'broken' ? v.safeParse(programSchema, programFile.content) : null;
    const program = parsed?.success ? parsed.output : null;
    const problem = programFile === 'broken' || (parsed && !parsed.success) ? PROGRAM_PROBLEM : undefined;

    const unfinished = activeRow(index);
    const active = unfinished ? await readSessionBlob(repo, unfinished.sha) : null;
    const current = active?.status === 'active' ? active : null;

    let day: WorkoutDay | null = null;
    if (program) {
      const requested = dayParam && DAY_ID_PATTERN.test(dayParam) ? dayParam : (current?.program?.dayId ?? null);
      const dayId = resolveDay(program, requested)?.day.id ?? null;
      const rows = historyRows(index, dayExerciseIds(program, dayId));
      const history = (await Promise.all(rows.map((row) => readSessionBlob(repo, row.sha)))).filter((doc): doc is SessionDoc => doc !== null);
      day = buildWorkoutDay({
        program,
        dayId,
        exercises: new Map(catalog.exercises.map((exercise) => [exercise.id, exercise])),
        devices: new Map(catalog.devices.map((device) => [device.id, device])),
        history,
      });
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
    };
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
