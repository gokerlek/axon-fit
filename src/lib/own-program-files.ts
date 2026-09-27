import * as v from 'valibot';
import { gitBlobSha, jsonText } from './github/blob.ts';
import {
  addOwnEvent,
  emptyOwnIndex,
  ownIndexItemOf,
  parseOwnIndex,
  parseOwnProgramFile,
  removeOwnItem,
  repairOwnIndex,
  upsertOwnItem,
  withActive,
  type OwnIndex,
  type OwnIndexItem,
  type UnreadableOwnProgram,
} from './own-program-index.ts';
import {
  OWN_DELETE_MESSAGE,
  OWN_INDEX_PATH,
  OWN_PROGRAM_LIMITS,
  OWN_PROGRAMS_DIR,
  applyOwnEdit,
  applyOwnSchedule,
  createOwnProgram,
  isOwnProgramId,
  ownNameProblem,
  ownProgramPath,
  programIds,
  reIdCollisions,
  sameOwnBody,
  setOwnShared,
  type OwnProgram,
  type OwnProgramPhase,
} from './own-programs.ts';
import { commitMessage, type DiffContext } from './program-diff.ts';
import { normalizeProgram, sameProgramBase, type ProgramChange, type ProgramPhase } from './program-plan.ts';
import type { OwnProgramSaveBody } from './schemas/own-program.ts';
import { programSchema, type Program } from './schemas/program.ts';
import { readIndex, readOrNull, withRetry, type OwnReader, type RepoHead, type SessionRepo } from './session-files-core.ts';
import type { PlanExercise } from './template-plan.ts';

/**
 * Danışanın kendi programlarının okuma ve yazma akışları (`docs/design/kendi-program.md` §3, §5.3, §6) — çekirdek.
 * GitHub işleri dışarıdan (`SessionRepo`, `session-files.ts`); testler sahte depo verir.
 *
 * - **Okuma** (`readOwnState`): index dalın ucundan, `own-programs/` ağacıyla onarılmış (okunamayan dosya ayrıca).
 * - **Yazma** hep tek commit (`commitFiles`; dosya sayısından bağımsız 3 içerik yazımı): program dosyası + index
 *   (satırın `sha`'sı dosyanın yeni metninden). Dal o arada ilerlediyse bir kez baştan (taze okuma, bütün
 *   denetimler yeniden: PT'nin kaydında `shared` da); ikincisi de olmazsa 409.
 * - **Oluşturma** idempotent: aynı kimlik ve aynı gövde `unchanged`, farklı gövde `exists`; sınır (5) aynı
 *   commit'te denetlenir. PT'nin programı yokken ilk kendi program kendiliğinden seçilir.
 * - **PT'nin kaydı** yalnız dosyada `shared` varken (403 değilse); ad, paylaşım, kimlik, geçmiş, rotasyon ve (PT
 *   günleri değiştirmediyse) günler kayıttan (`applyOwnEdit`).
 * - **Silme** yarım antrenman o programdansa reddedilir (`sessionId` ile).
 */

export type OwnState = {
  head: RepoHead;
  index: OwnIndex;
  unreadable: UnreadableOwnProgram[];
  /** Onarımda okunmuş programlar (kimlikle). */
  programs: Map<string, OwnProgram>;
  /** Index onarıldı (bir sonraki yazıma biner). */
  changed: boolean;
};

/** Onarılmış index (dalın ucunda ya da verilen commit'te). Bozuk index boş sayılır, satırlar dosyalardan kurulur. */
export async function readOwnState(repo: OwnReader, head?: RepoHead): Promise<OwnState> {
  const at = head ?? (await repo.head());
  const [file, files] = await Promise.all([readOrNull(repo, OWN_INDEX_PATH, at.commit), repo.listFolder(at.tree, OWN_PROGRAMS_DIR)]);
  const { index, dropped } = parseOwnIndex(file?.content ?? null);
  const repaired = await repairOwnIndex(file ? index : emptyOwnIndex(), files, (entry) => repo.readBlob(entry.sha));
  if (dropped > 0 || repaired.unreadable.length > 0) {
    repo.log(`[kendi program] index: ${dropped} satır okunamadı, ${repaired.unreadable.length} dosya okunamadı.`);
  }
  return { head: at, index: repaired.index, unreadable: repaired.unreadable, programs: repaired.programs, changed: repaired.changed };
}

export type OwnProgramRead = { status: 'ok'; program: OwnProgram } | { status: 'missing' } | { status: 'invalid'; problem: string; name: string | null };

/** Tek program: kimlik kalıba uymuyorsa ya da dosya yoksa `missing`; bozuksa `invalid`. */
export async function readOwnProgram(repo: OwnReader, id: string, ref?: string): Promise<OwnProgramRead> {
  if (!isOwnProgramId(id)) return { status: 'missing' };
  const file = await readOrNull(repo, ownProgramPath(id), ref);
  if (!file) return { status: 'missing' };
  const parsed = parseOwnProgramFile(id, file.content);
  return parsed.program ? { status: 'ok', program: parsed.program } : { status: 'invalid', problem: parsed.problem, name: parsed.name };
}

/** PT'nin programı (kimlik çakışması ve ilk programın seçimi için); yoksa ya da okunamıyorsa null. */
async function readPtProgram(repo: OwnReader, ref: string): Promise<{ exists: boolean; program: Program | null }> {
  const file = await readOrNull(repo, 'program.json', ref);
  if (!file) return { exists: false, program: null };
  const parsed = v.safeParse(programSchema, file.content);
  return { exists: true, program: parsed.success ? parsed.output : null };
}

function shaOf(program: OwnProgram): string {
  return gitBlobSha(jsonText(program));
}

/** Programın dosyası ve index satırı tek commit'te. */
async function commitProgram(repo: SessionRepo, head: RepoHead, program: OwnProgram, index: OwnIndex, message: string): Promise<void> {
  await repo.commit({
    head,
    files: [
      { path: ownProgramPath(program.id), content: program },
      { path: OWN_INDEX_PATH, content: index },
    ],
    message,
  });
}

/** Commit mesajı: "Kendi programı (Evde): Gün A: …" (gövdede bütün cümleler, `commitMessage` gibi). */
function ownCommitMessage(name: string, kind: 'create' | 'edit', changes: readonly ProgramChange[]): string {
  return commitMessage(kind, changes).replace(/^Program: |^/, `Kendi programı (${name}): `);
}

/* --- oluşturma ve kayıt --- */

export type OwnLibrary = { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> };

export type OwnSaveResult =
  | { status: 'created' | 'saved' | 'unchanged'; program: OwnProgram; droppedDevices: number }
  /** Alan hataları (Formisch yolları; ad `name`). */
  | { status: 'invalid'; errors: Record<string, string> }
  /**
   * missing: program yok (silinmiş) · stale: o arada kaydedildi (412) · exists: aynı kimlikle başka gövde ·
   * limit: 5 program dolu · forbidden: PT'nin kaydında dosya paylaşılmamış (403).
   */
  | { status: 'missing' | 'stale' | 'exists' | 'limit' | 'forbidden' };

/** Kütüphane denetimi ve sadeleştirme (PT programıyla aynı, `normalizeProgram`); `copiedFrom` gövdeden geri eklenir. */
function normalizeOwn(phases: readonly OwnProgramPhase[], library: OwnLibrary, stored: OwnProgram | null) {
  const normalized = normalizeProgram({ phased: false, phases: phases as ProgramPhase[] }, library, stored ? { phases: stored.phases as ProgramPhase[] } : null);
  const copies = new Map(phases.flatMap((phase) => phase.days.flatMap((day) => (day.copiedFrom ? [[day.id, day.copiedFrom] as const] : []))));
  const withCopies = (normalized.phases as OwnProgramPhase[]).map((phase) => ({
    ...phase,
    days: phase.days.map((day) => {
      const copied = copies.get(day.id);
      return copied ? { ...day, copiedFrom: copied } : day;
    }),
  }));
  return { phases: withCopies, errors: normalized.errors, droppedDevices: normalized.droppedDeviceRowIds.length };
}

/** Başka programların kimlikleri: PT'nin programı ve öteki kendi programlar (onarımda okunanlar). */
async function otherIds(repo: OwnReader, state: OwnState, id: string, pt: Program | null): Promise<Set<string>> {
  const taken = new Set<string>(pt ? programIds(pt.phases) : []);
  for (const item of state.index.items) {
    if (item.id === id) continue;
    const known = state.programs.get(item.id);
    const program = known ?? (await readOwnProgram(repo, item.id, state.head.commit).then((read) => (read.status === 'ok' ? read.program : null)));
    if (program) for (const value of programIds(program.phases)) taken.add(value);
  }
  return taken;
}

/**
 * Oluşturma (`baseRevision` null; yalnız danışan) ya da kayıt (danışan ya da PT). Değişiklik yoksa yazılmaz.
 * Bildirim anı: paylaşılmış programda PT'nin kaydı `ptEditedAt`, danışanınki `clientEditedAt`.
 */
export async function saveOwnProgram(
  repo: SessionRepo,
  input: { id: string; body: OwnProgramSaveBody; by: 'client' | 'pt'; library: OwnLibrary; ctx: DiffContext; now: Date; random?: (n: number) => Uint8Array },
): Promise<OwnSaveResult> {
  const { id, body, by, now } = input;
  if (!isOwnProgramId(id)) return { status: 'missing' };
  return withRetry(async (): Promise<OwnSaveResult> => {
    const head = await repo.head();
    const [state, stored, pt] = await Promise.all([readOwnState(repo, head), readOwnProgram(repo, id, head.commit), readPtProgram(repo, head.commit)]);
    const others = state.index.items.filter((item) => item.id !== id).map((item) => item.name);
    const at = now.toISOString();

    if (body.baseRevision === null) {
      if (by === 'pt') return { status: 'forbidden' };
      if (stored.status === 'ok') {
        return sameOwnBody(stored.program, body) ? { status: 'unchanged', program: stored.program, droppedDevices: 0 } : { status: 'exists' };
      }
      if (stored.status === 'invalid') return { status: 'exists' };
      if (state.index.items.length + state.unreadable.length >= OWN_PROGRAM_LIMITS.programs) return { status: 'limit' };
      const name = body.name ?? '';
      const problem = ownNameProblem(name, others);
      if (problem) return { status: 'invalid', errors: { name: problem } };
      const normalized = normalizeOwn(body.phases, input.library, null);
      if (Object.keys(normalized.errors).length > 0) return { status: 'invalid', errors: normalized.errors };
      const taken = await otherIds(repo, state, id, pt.program);
      const settled = reIdCollisions({ currentPhaseId: body.currentPhaseId, phases: normalized.phases }, taken, new Set(), input.random);
      const program = createOwnProgram({ id, name, currentPhaseId: settled.currentPhaseId, phases: settled.phases, weekdays: body.weekdays, now });
      let index = upsertOwnItem(state.index, ownIndexItemOf(program, shaOf(program)));
      // PT'nin programı yokken ilk kendi program Bugün'ün programı olur (§3.2): Bugün boş kalmasın.
      if (!pt.exists && state.index.items.length === 0) index = withActive(index, id, now) ?? index;
      await commitProgram(repo, head, program, index, ownCommitMessage(program.name, 'create', program.log[0]?.changes ?? []));
      repo.log(`[kendi program] oluşturuldu`);
      return { status: 'created', program, droppedDevices: normalized.droppedDevices };
    }

    if (stored.status === 'missing') return { status: 'missing' };
    if (stored.status === 'invalid') return { status: 'stale' };
    const current = stored.program;
    // PT'nin yazma izni yalnız dosyadan (index gösterimdir): paylaşım o arada kapandıysa 403.
    if (by === 'pt' && !current.shared) return { status: 'forbidden' };
    if (!sameProgramBase(current, { revision: body.baseRevision, createdAt: body.baseCreatedAt })) return { status: 'stale' };
    if (by === 'client' && body.name !== undefined) {
      const problem = ownNameProblem(body.name, others);
      if (problem) return { status: 'invalid', errors: { name: problem } };
    }
    const normalized = normalizeOwn(body.phases, input.library, current);
    if (Object.keys(normalized.errors).length > 0) return { status: 'invalid', errors: normalized.errors };
    const taken = await otherIds(repo, state, id, pt.program);
    const settled = reIdCollisions({ currentPhaseId: body.currentPhaseId, phases: normalized.phases }, taken, programIds(current.phases), input.random);
    const result = applyOwnEdit(
      current,
      { name: body.name, currentPhaseId: settled.currentPhaseId, phases: settled.phases, weekdays: body.weekdays, baseWeekdays: body.baseWeekdays },
      input.ctx,
      now,
      by,
    );
    if (!result) return { status: 'unchanged', program: current, droppedDevices: normalized.droppedDevices };
    const previous = state.index.items.find((item) => item.id === id);
    let item: OwnIndexItem = ownIndexItemOf(result.program, shaOf(result.program), previous);
    if (result.program.shared) item = { ...item, ...(by === 'pt' ? { ptEditedAt: at } : { clientEditedAt: at }) };
    const kind = result.program.log[0]?.kind === 'create' ? 'create' : 'edit';
    await commitProgram(repo, head, result.program, upsertOwnItem(state.index, item), ownCommitMessage(result.program.name, kind, result.changes));
    repo.log(`[kendi program] ${by === 'pt' ? 'PT' : 'danışan'} kaydetti`);
    return { status: 'saved', program: result.program, droppedDevices: normalized.droppedDevices };
  });
}

/* --- silme --- */

export type OwnDeleteResult = { status: 'deleted' | 'missing' } | { status: 'active_session'; sessionId: string };

/**
 * Silme (§3.7): dosya silinir, index satırı düşer (Bugün'ün programıysa seçim PT'nin programına, paylaşılmışsa
 * `deleted` olayı), tek commit, genel mesaj. Yarım antrenman bu programdansa silinmez.
 */
export async function deleteOwnProgram(repo: SessionRepo, id: string, now: Date): Promise<OwnDeleteResult> {
  if (!isOwnProgramId(id)) return { status: 'missing' };
  return withRetry(async (): Promise<OwnDeleteResult> => {
    const head = await repo.head();
    const [state, sessions] = await Promise.all([readOwnState(repo, head), readIndex(repo, head)]);
    const path = ownProgramPath(id);
    const known = state.index.items.some((item) => item.id === id) || state.unreadable.some((item) => item.id === id);
    if (!known) return { status: 'missing' };
    const half = sessions.index.items.find((row) => !row.finishedAt && row.programId === id);
    if (half) return { status: 'active_session', sessionId: half.id };
    await repo.commit({ head, files: [{ path: OWN_INDEX_PATH, content: removeOwnItem(state.index, id, now) }], deletions: [path], message: OWN_DELETE_MESSAGE });
    return { status: 'deleted' };
  });
}

/* --- paylaşım, seçim, günler --- */

export type OwnChangeResult = { status: 'saved' | 'unchanged'; program: OwnProgram } | { status: 'missing' } | { status: 'invalid' };

/** Paylaşma ya da kapatma (§3.5, §2.7): revision artmaz; kapatınca paylaşılmış program için `unshared` olayı. */
export async function shareOwnProgram(repo: SessionRepo, id: string, shared: boolean, now: Date): Promise<OwnChangeResult> {
  if (!isOwnProgramId(id)) return { status: 'missing' };
  return withRetry(async (): Promise<OwnChangeResult> => {
    const head = await repo.head();
    const [state, stored] = await Promise.all([readOwnState(repo, head), readOwnProgram(repo, id, head.commit)]);
    if (stored.status === 'missing') return { status: 'missing' };
    if (stored.status === 'invalid') return { status: 'invalid' };
    const next = setOwnShared(stored.program, shared, now);
    if (!next) return { status: 'unchanged', program: stored.program };
    const previous = state.index.items.find((item) => item.id === id);
    let index = upsertOwnItem(state.index, ownIndexItemOf(next, shaOf(next), previous));
    if (!shared) index = addOwnEvent(index, { kind: 'unshared', id, name: next.name, at: now.toISOString() }, now);
    await commitProgram(repo, head, next, index, `Kendi programı (${next.name}): ${shared ? 'antrenörle paylaşıldı' : 'paylaşım kapatıldı'}`);
    return { status: 'saved', program: next };
  });
}

export type ActiveResult = { status: 'saved' | 'unchanged' } | { status: 'missing' };

/** Bugün'ün programı (kalıcı seçim, §3.2): yalnız index; yarım antrenman engellemez. */
export async function selectOwnActive(repo: SessionRepo, programId: string | null, now: Date): Promise<ActiveResult> {
  if (programId !== null && !isOwnProgramId(programId)) return { status: 'missing' };
  return withRetry(async (): Promise<ActiveResult> => {
    const head = await repo.head();
    const state = await readOwnState(repo, head);
    if (programId !== null && !state.index.items.some((item) => item.id === programId)) return { status: 'missing' };
    const next = withActive(state.index, programId, now);
    if (!next) return { status: 'unchanged' };
    const name = programId ? (state.index.items.find((item) => item.id === programId)?.name ?? '') : null;
    await repo.commit({
      head,
      files: [{ path: OWN_INDEX_PATH, content: next }],
      message: name ? `Bugün'ün programı: ${name}` : "Bugün'ün programı: antrenörün programı",
    });
    return { status: 'saved' };
  });
}

/** Kendi programda "Günlerini değiştir" (§3.2): program ve index tek commit; revision artmaz. */
export async function scheduleOwnProgram(repo: SessionRepo, id: string, weekdays: readonly number[], now: Date): Promise<OwnChangeResult> {
  if (!isOwnProgramId(id)) return { status: 'missing' };
  return withRetry(async (): Promise<OwnChangeResult> => {
    const head = await repo.head();
    const [state, stored] = await Promise.all([readOwnState(repo, head), readOwnProgram(repo, id, head.commit)]);
    if (stored.status === 'missing') return { status: 'missing' };
    if (stored.status === 'invalid') return { status: 'invalid' };
    const applied = applyOwnSchedule(stored.program, weekdays, now);
    if (!applied) return { status: 'unchanged', program: stored.program };
    const previous = state.index.items.find((item) => item.id === id);
    const index = upsertOwnItem(state.index, ownIndexItemOf(applied.program, shaOf(applied.program), previous));
    await commitProgram(repo, head, applied.program, index, `Kendi programı (${applied.program.name}): ${applied.text}`);
    return { status: 'saved', program: applied.program };
  });
}
