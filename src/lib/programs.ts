import 'server-only';
import * as v from 'valibot';
import type { DeviceWithSource } from './devices';
import type { ExerciseWithSource } from './exercises';
import { clientRepoName, GithubError } from './github/client';
import { deleteFile, getFileSha, readJson, writeJson } from './github/files';
import { dropNotices } from './notices-store';
import { applyProgramEdit, commitMessage, type DiffContext } from './program-diff';
import {
  createProgramRecord,
  normalizeProgram,
  sameProgramBase,
  startPhase,
  type ProgramBase,
  type ProgramBody,
  type ProgramState,
} from './program-plan';
import { programSchema, type Program } from './schemas/program';
import type { PlanExercise } from './template-plan';
import { resetClientSchedule } from './training-days';

/**
 * Danışana özel program (SPEC §3, §7.4): danışanın kendi repo'sunda `program.json`.
 *
 * Çakışma denetimi dosyanın sha'sıyla değil `revision` ve oluşturulma anıyla (`createdAt`): PT'nin
 * her içerik yazımı (oluşturma, kayıt, evre geçişi) revision'ı bir artırır; antrenman ekranının
 * rotasyon yazımı artırmaz. Düzenleyici yüklediği revision'ı ve oluşturulma anını gönderir; sunucu
 * dosyayı taze okur, tutmuyorsa kaydetmez (412), tutuyorsa taze sha ile yazar. Oluşturulma anı,
 * silinip yeniden oluşturulan programı (revision yine 1) ayırır; göndermeyen eski sekme yalnız
 * revision'la denetlenir (`sameProgramBase`). Arada rotasyon yazıldıysa GitHub 409 verir, sunucu bir
 * kez yeniden okuyup dener — PT'nin açık düzenlemesi antrenman bitti diye boşa düşmez.
 *
 * Her kayıtta değişikliklerin özeti hem dosyadaki geçmişe hem commit mesajına girer.
 * Sürüm 1 dosya okunurken sürüm 2'ye çevrilir (şema); her yazım sürüm 2'dir.
 */

export const PROGRAM_PATH = 'program.json';
export const PROGRAM_DELETE_MESSAGE = 'Program silindi';

export type ProgramFile =
  | { sha: string; program: Program; problem: null }
  /** Okunamayan dosya (bozuk JSON ya da şemaya uymuyor): silinebilsin diye sha'sıyla. */
  | { sha: string; program: null; problem: string };

/** Taze okuma. `null`: dosya yok. Bozuk dosya hata değil, sorunuyla döner. */
export async function readProgramFile(clientId: string): Promise<ProgramFile | null> {
  const repo = clientRepoName(clientId);
  let stored: Awaited<ReturnType<typeof readJson<unknown>>>;
  try {
    stored = await readJson<unknown>(repo, PROGRAM_PATH);
  } catch (error) {
    // Bozuk JSON: silinebilsin ya da üzerine yazılabilsin diye sha ayrıca alınır.
    if (error instanceof GithubError && error.status === 500) {
      const sha = await getFileSha(repo, PROGRAM_PATH);
      return sha ? { sha, program: null, problem: 'Dosya JSON olarak okunamadı.' } : null;
    }
    throw error;
  }
  if (!stored) return null;
  const parsed = v.safeParse(programSchema, stored.content);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    return { sha: stored.sha, program: null, problem: `${v.getDotPath(issue) ?? 'dosya'}: ${issue.message}` };
  }
  return { sha: stored.sha, program: parsed.output, problem: null };
}

/** Yazmadan önce şemadan geçirir: geçersiz program hiçbir koşulda dosyaya yazılmaz. */
export async function writeProgramFile(
  clientId: string,
  program: ProgramState,
  options: { sha?: string; message: string },
): Promise<{ sha: string }> {
  const parsed = v.safeParse(programSchema, program);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    throw new GithubError(`Program kaydı geçersiz: ${v.getDotPath(issue) ?? 'dosya'}: ${issue.message}`, 500);
  }
  const written = await writeJson(clientRepoName(clientId), PROGRAM_PATH, parsed.output, { sha: options.sha, message: options.message });
  // Genel bakış'ın özeti (antrenman günleri, evre, bildirimler) programdan: yeniden türetilsin.
  dropNotices(clientId);
  return written;
}

/** Farkın cümleleri için egzersiz adları ve kayıt türleri, cihaz adları. */
export function programDiffContext(exercises: readonly ExerciseWithSource[], devices: readonly DeviceWithSource[]): DiffContext {
  return {
    exercises: new Map(exercises.map((exercise) => [exercise.id, { title: exercise.title, trackingType: exercise.trackingType }])),
    devices: new Map(devices.map((device) => [device.id, { name: device.name }])),
  };
}

export type SaveProgramResult =
  /** droppedDevices: cihazı artık olmayan (o arada silinmiş) satırlar; egzersizin kendi cihazına döndüler. */
  | { status: 'created' | 'saved' | 'unchanged'; revision: number; droppedDevices: number }
  /** Kütüphane denetimi geçmedi: alan hataları (Formisch yolları, `phases.0.days.1.…`). */
  | { status: 'invalid'; errors: Record<string, string> }
  /** missing: düzenlenen program silinmiş · stale: o arada başka yerde kaydedilmiş · exists: oluştururken başkası oluşturmuş. */
  | { status: 'missing' | 'stale' | 'exists' };

function isConflict(error: unknown): boolean {
  return error instanceof GithubError && error.status === 409;
}

/**
 * Oluşturma (`base` null) ya da kayıt. Gövde taze okunan kayda göre kütüphaneyle
 * denetlenir ve sadeleştirilir (`normalizeProgram`): egzersizinkine eşit kural ya da cihaz yalnız
 * kayıttaki aynı satırda duruyorsa kalır. Değişiklik yoksa hiçbir şey yazılmaz.
 */
export async function saveProgram(
  clientId: string,
  body: ProgramBody,
  base: ProgramBase | null,
  library: { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> },
  ctx: DiffContext,
): Promise<SaveProgramResult> {
  for (let attempt = 0; ; attempt += 1) {
    const stored = await readProgramFile(clientId);
    const now = new Date();
    try {
      if (base === null) {
        if (stored) return { status: 'exists' };
        const normalized = normalizeProgram(body, library, null);
        if (Object.keys(normalized.errors).length > 0) return { status: 'invalid', errors: normalized.errors };
        const program = createProgramRecord({ ...body, phases: normalized.phases }, now);
        await writeProgramFile(clientId, program, { message: commitMessage('create', program.log[0]?.changes ?? []) });
        return { status: 'created', revision: program.revision, droppedDevices: normalized.droppedDeviceRowIds.length };
      }
      if (!stored) return { status: 'missing' };
      if (!stored.program || !sameProgramBase(stored.program, base)) return { status: 'stale' };
      const normalized = normalizeProgram(body, library, stored.program);
      if (Object.keys(normalized.errors).length > 0) return { status: 'invalid', errors: normalized.errors };
      const droppedDevices = normalized.droppedDeviceRowIds.length;
      const result = applyProgramEdit(stored.program, { ...body, phases: normalized.phases }, ctx, now);
      if (!result) return { status: 'unchanged', revision: stored.program.revision, droppedDevices };
      await writeProgramFile(clientId, result.program, {
        sha: stored.sha,
        message: commitMessage(result.program.log[0]?.kind ?? 'edit', result.changes),
      });
      return { status: 'saved', revision: result.program.revision, droppedDevices };
    } catch (error) {
      // Arada başka bir yazım (ör. rotasyon) oldu: taze okuyup bir kez daha; revision yine denetlenir.
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
  }
}

export type SwitchPhaseResult =
  | { status: 'saved' | 'unchanged'; revision: number }
  | { status: 'missing' | 'stale' | 'unknown' };

/** PT onaylı evre geçişi (program sayfasındaki öneri). */
export async function switchPhase(clientId: string, phaseId: string, base: ProgramBase): Promise<SwitchPhaseResult> {
  for (let attempt = 0; ; attempt += 1) {
    const stored = await readProgramFile(clientId);
    if (!stored) return { status: 'missing' };
    if (!stored.program || !sameProgramBase(stored.program, base)) return { status: 'stale' };
    const program = stored.program;
    const next = startPhase(program, phaseId, new Date());
    if (!next) {
      return program.phases.some((phase) => phase.id === phaseId)
        ? { status: 'unchanged', revision: program.revision }
        : { status: 'unknown' };
    }
    try {
      await writeProgramFile(clientId, next, { sha: stored.sha, message: commitMessage('phase', next.log[0]?.changes ?? []) });
      return { status: 'saved', revision: next.revision };
    } catch (error) {
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
  }
}

export type ResetScheduleResult = { status: 'saved' | 'unchanged' } | { status: 'missing' | 'invalid' };

/**
 * PT: "PT'nin günlerine dön" (tasarım §2.11): danışanın antrenman günleri silinir, PT'nin günleri geçerli
 * olur; geçmişe yazılır. Revision artmaz: PT'nin açık düzenleyicisi (aynı sayfadan) 412 almaz.
 */
export async function resetSchedule(clientId: string): Promise<ResetScheduleResult> {
  for (let attempt = 0; ; attempt += 1) {
    const stored = await readProgramFile(clientId);
    if (!stored) return { status: 'missing' };
    if (!stored.program) return { status: 'invalid' };
    const result = resetClientSchedule(stored.program, new Date());
    if (!result) return { status: 'unchanged' };
    try {
      await writeProgramFile(clientId, result.program, { sha: stored.sha, message: `Program: ${result.text}` });
      return { status: 'saved' };
    } catch (error) {
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
  }
}

/** Programı siler (bozuk dosya da silinir). Geçmişi git'te durur. `false`: dosya yoktu. */
export async function deleteProgram(clientId: string): Promise<boolean> {
  const repo = clientRepoName(clientId);
  const sha = await getFileSha(repo, PROGRAM_PATH);
  if (!sha) return false;
  await deleteFile(repo, PROGRAM_PATH, { sha, message: PROGRAM_DELETE_MESSAGE });
  dropNotices(clientId);
  return true;
}
