import 'server-only';
import * as v from 'valibot';
import { listDevices } from './devices';
import { listExercises } from './exercises';
import { clientRepoName, GithubError } from './github/client';
import { commitFiles, readJson, repoHead, writeJson } from './github/files';
import { dropNotices } from './notices-store';
import { commitMessage } from './program-diff';
import { PROGRAM_PATH, programDiffContext } from './programs';
import { decideProposal, parseProposals, planApproval, PROPOSALS_PATH, serializeProposals, type ProposalsFile } from './proposals';
import { programSchema } from './schemas/program';

/**
 * Danışandan öneriler (tasarım §6.4) — PT tarafının GitHub'a bağlanması. Kararlar `proposals.ts`'te (saf,
 * test edilir): uygulama `planApproval`, ret `decideProposal`.
 *
 * - **Uygula:** program ve öneriler dalın aynı ucundan okunur; program `saveProgram`'ın kurallarıyla değişir
 *   (kütüphane denetimi, fark, revision +1, log `edit`) ve öneri `approved` olur: iki dosya TEK commit'te
 *   (Git Data API). Arada dal ilerlediyse (antrenman yazımı, başka kayıt) bir kez baştan.
 * - **Reddet:** yalnız `proposals.json` (isteğe bağlı notla), `sha` kilidiyle; çakışmada bir kez daha.
 * - PT'nin gördüğü sürüm (`sessionId`) değiştiyse (başka bir seans öneriyi güncelledi) karar uygulanmaz:
 *   `changed`; yeniden denemede de bakılır.
 * - Her kararda PT'nin bildirim özeti düşer (bekleyen öneri sayısı değişti).
 */

function isConflict(error: unknown): boolean {
  return error instanceof GithubError && error.status === 409;
}

/** Program sayfası: danışanın önerileri. Dosya yoksa boş; bozuksa `broken` (sayfa durmaz). */
export async function readProposals(clientId: string): Promise<{ file: ProposalsFile; broken: boolean }> {
  try {
    const stored = await readJson<unknown>(clientRepoName(clientId), PROPOSALS_PATH);
    return { file: parseProposals(stored?.content ?? null), broken: false };
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return { file: parseProposals(null), broken: true };
    throw error;
  }
}

export type ApproveResult =
  | { status: 'approved'; revision: number }
  | { status: 'stale'; reason: string }
  | { status: 'missing' | 'decided' | 'changed' | 'no_program' | 'invalid_program' };

export async function approveProposal(clientId: string, id: string, sessionId: string): Promise<ApproveResult> {
  const repo = clientRepoName(clientId);
  // Kütüphane yalnız bekleyen bir öneri uygulanacaksa okunur (bir kez).
  let catalog: { library: Parameters<typeof planApproval>[0]['library']; ctx: Parameters<typeof planApproval>[0]['ctx'] } | null = null;
  const loadCatalog = async () => {
    const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
    return {
      library: { exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])), deviceIds: new Set(devices.map((device) => device.id)) },
      ctx: programDiffContext(exercises, devices),
    };
  };
  for (let attempt = 0; ; attempt += 1) {
    const head = await repoHead(repo);
    const [programFile, proposalsFile] = await Promise.all([
      readJson<unknown>(repo, PROGRAM_PATH, { ref: head.commit }),
      readJson<unknown>(repo, PROPOSALS_PATH, { ref: head.commit }),
    ]);
    if (!proposalsFile) return { status: 'missing' };
    if (!programFile) return { status: 'no_program' };
    const program = v.safeParse(programSchema, programFile.content);
    if (!program.success) return { status: 'invalid_program' };
    const file = parseProposals(proposalsFile.content);
    const item = file.items.find((entry) => entry.id === id);
    if (!item) return { status: 'missing' };
    if (item.status !== 'pending') return { status: 'decided' };
    if (item.sessionId !== sessionId) return { status: 'changed' };
    catalog ??= await loadCatalog();
    const plan = planApproval({ program: program.output, file, id, library: catalog.library, ctx: catalog.ctx, now: new Date() });
    if (plan.status !== 'approved' && plan.status !== 'stale') return { status: plan.status };

    const files: { path: string; content: unknown }[] = [{ path: PROPOSALS_PATH, content: serializeProposals(plan.proposals) }];
    let message = plan.status === 'stale' ? 'Öneri uygulanamadı (program değişti)' : 'Öneri onaylandı';
    if (plan.status === 'approved' && plan.program) {
      // Geçersiz program hiçbir koşulda yazılmaz (`writeProgramFile` gibi).
      const checked = v.safeParse(programSchema, plan.program);
      if (!checked.success) throw new GithubError(`Program kaydı geçersiz: ${checked.issues[0]?.message ?? ''}`, 500);
      files.unshift({ path: PROGRAM_PATH, content: checked.output });
      message = commitMessage('edit', plan.changes);
    }
    try {
      await commitFiles(repo, { head, files, message });
    } catch (error) {
      // Arada dal ilerledi: taze okuyup bir kez daha (öneri o arada karara bağlandıysa `decided`).
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
    dropNotices(clientId);
    return plan.status === 'stale' ? { status: 'stale', reason: plan.reason } : { status: 'approved', revision: plan.revision };
  }
}

export type DeclineResult = { status: 'declined' } | { status: 'missing' | 'decided' | 'changed' };

export async function declineProposal(clientId: string, id: string, sessionId: string, note: string | undefined): Promise<DeclineResult> {
  const repo = clientRepoName(clientId);
  for (let attempt = 0; ; attempt += 1) {
    const stored = await readJson<unknown>(repo, PROPOSALS_PATH);
    if (!stored) return { status: 'missing' };
    const file = parseProposals(stored.content);
    const item = file.items.find((entry) => entry.id === id);
    if (!item) return { status: 'missing' };
    if (item.status !== 'pending') return { status: 'decided' };
    if (item.sessionId !== sessionId) return { status: 'changed' };
    const next = decideProposal(file, id, { status: 'declined', at: new Date(), note });
    if (!next) return { status: 'decided' };
    try {
      await writeJson(repo, PROPOSALS_PATH, serializeProposals(next), { sha: stored.sha, message: `Öneri reddedildi: ${item.text}`.slice(0, 120) });
    } catch (error) {
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
    dropNotices(clientId);
    return { status: 'declined' };
  }
}
