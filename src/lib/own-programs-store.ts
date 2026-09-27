import 'server-only';
import { loadCareInput } from './client-care';
import { canRecordHealth } from './client-status';
import { careInputOf } from './constraint-filter';
import { readHealth } from './health';
import { readAppConfig } from './config';
import { listDevices } from './devices';
import { exerciseCaution } from './exercise-caution';
import { listExercises } from './exercises';
import { todayIn } from './format';
import { readOwnProgram, readOwnState, saveOwnProgram, type OwnGuard, type OwnProgramRead, type OwnSaveResult, type OwnState } from './own-program-files';
import type { OwnRouteDeps } from './own-program-routes';
import { programDiffContext, readProgramFile, type ProgramFile } from './programs';
import type { Client } from './schemas/client';
import type { OwnProgramSaveBody } from './schemas/own-program';
import type { SessionIndex } from './schemas/session';
import { readIndex } from './session-files-core';
import { sessionRepo, sessionRouteDeps } from './session-files';
import type { EditorDevice, PickerExercise } from './template-edit';
import { clientTemplate, pickerDevices, pickerExercises } from './templates';

/**
 * Danışanın kendi programları — sayfaların okumaları ve uçların bağlaması (`docs/design/kendi-program.md` §5.5).
 * Akışlar `own-program-files.ts`'te (sahte depoyla test edilir); burada yalnız danışanın repo'su, kütüphane ve
 * PT'nin kaydı. Her yazım tek commit (`session-files.ts` → `commitFiles`) ve PT'nin bildirim özetini düşürür.
 */

/** Kütüphane denetimi ve geçmişin cümleleri: hazır kütüphane + PT'nin kayıtları. */
export async function ownLibrary(): Promise<Awaited<ReturnType<OwnRouteDeps['library']>>> {
  const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
  return {
    library: { exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])), deviceIds: new Set(devices.map((device) => device.id)) },
    ctx: programDiffContext(exercises, devices),
  };
}

/**
 * Danışanın kaydındaki kısıt denetimi (`kisit-tarama.md` §3.7): `conditions` onayı ve kısıt varsa izinsiz yasaklılar;
 * kopyayla gelen şablon hareketleri yalnız danışanlara açık şablondan (`clientTemplate`). Onay ya da kısıt yoksa null.
 */
export async function ownGuard(client: Client): Promise<OwnGuard | null> {
  if (!canRecordHealth(client, 'conditions')) return null;
  // Kayıtta okuma hatası kısıtsız demek değildir: bozuk/erişilemeyen sağlık kaydında işlem durur.
  const [exercises, config, health] = await Promise.all([listExercises(), readAppConfig(), readHealth(client.id)]);
  const care = health ? careInputOf(health.record, { today: todayIn(config.timeZone, new Date()), painConsent: canRecordHealth(client, 'check_in') }) : null;
  const blocked = care ? exerciseCaution(exercises, care).blocked : new Set<string>();
  if (blocked.size === 0) return null;
  return {
    blocked,
    templateExercises: async (id) => {
      const template = await clientTemplate(id).catch(() => null);
      return template ? template.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)) : null;
    },
  };
}

/** Danışan uçlarının ortamı: oturum, kayıt, depo, saat dilimi, kütüphane ve kısıt denetimi. */
export async function ownRouteDeps(): Promise<OwnRouteDeps> {
  return { ...(await sessionRouteDeps()), library: ownLibrary, guard: ownGuard };
}

export type OwnOverview = {
  state: OwnState;
  /** PT'nin programı: yoksa null; okunamıyorsa `undefined` (ağ ya da bozuk dosya). */
  pt: ProgramFile | null | undefined;
  /** Onarılmış seans index'i ("son antrenman", yarım antrenman). */
  sessions: SessionIndex;
};

/** Programlar sekmesi, Bugün ve PT'nin Program sekmesi: index (onarılmış), PT'nin programı, seans index'i. */
export async function readOwnOverview(clientId: string): Promise<OwnOverview> {
  const repo = sessionRepo(clientId);
  const head = await repo.head();
  const [state, pt, sessions] = await Promise.all([
    readOwnState(repo, head),
    readProgramFile(clientId).catch(() => undefined),
    readIndex(repo, head),
  ]);
  return { state, pt, sessions: sessions.index };
}

/**
 * Danışanın düzenleyicisinin kütüphanesi (§2.5): hazır kütüphane + PT'nin kayıtları, cihazlar. Kısıtlar onaylıyken
 * izinsiz yasaklı hareket `blocked` (sheet'te yok, programdaki satırda "Sana önerilmiyor"), dikkat alan hareket
 * `caution` ("Kısıtına uymayabilir", engel değil; tasarım `kisit-tarama.md` §3.7). Yasaklılar listede kalır: kopyayla
 * gelen satır adıyla çizilsin. Onay yoksa sağlık kaydı okunmaz (`loadCareInput`).
 */
export async function ownEditorLibrary(client: Client): Promise<{ exercises: PickerExercise[]; devices: EditorDevice[] }> {
  const [exercises, devices, config] = await Promise.all([listExercises(), listDevices(), readAppConfig()]);
  const care = await loadCareInput(client, todayIn(config.timeZone, new Date()));
  const flags = care ? exerciseCaution(exercises, care) : null;
  return {
    exercises: pickerExercises(exercises).map((exercise) =>
      flags?.blocked.has(exercise.id)
        ? { ...exercise, blocked: true as const }
        : flags?.caution.has(exercise.id)
          ? { ...exercise, caution: true as const }
          : exercise,
    ),
    devices: pickerDevices(devices),
  };
}

/** Tek program (kimlik kalıba uymuyorsa `missing`). */
export async function readOwnProgramOf(clientId: string, programId: string): Promise<OwnProgramRead> {
  return readOwnProgram(sessionRepo(clientId), programId);
}

/**
 * PT'nin kaydı (`PUT /api/clients/[id]/programs/[pid]`): dosya dalın ucunda okunur, paylaşılmamışsa `forbidden`;
 * aynı uçla commit, çakışmada paylaşım yeniden denetlenir (`saveOwnProgram`, `by: 'pt'`).
 */
export async function ptSaveOwnProgram(clientId: string, programId: string, body: OwnProgramSaveBody): Promise<OwnSaveResult> {
  const { library, ctx } = await ownLibrary();
  return saveOwnProgram(sessionRepo(clientId), { id: programId, body: { ...body, name: undefined }, by: 'pt', library, ctx, now: new Date() });
}
