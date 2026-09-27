import * as v from 'valibot';
import { originGuard, postGuard } from './client-auth-routes.ts';
import { BLOCKED_TEXT } from './exercise-caution.ts';
import { deleteOwnProgram, saveOwnProgram, selectOwnActive, shareOwnProgram, type OwnGuard, type OwnLibrary, type OwnSaveResult } from './own-program-files.ts';
import { isOwnProgramId, OWN_PROGRAM_LIMITS } from './own-programs.ts';
import type { DiffContext } from './program-diff.ts';
import type { Client } from './schemas/client.ts';
import { ownProgramActiveSchema, ownProgramSaveSchema, ownProgramShareSchema } from './schemas/own-program.ts';
import { run, type SessionRouteDeps, type SessionRouteResult } from './session-routes.ts';

/**
 * Danışanın kendi program uçlarının ince çekirdeği (`docs/design/kendi-program.md` §6): `PUT` ve `DELETE
 * /api/me/programs/[pid]`, `POST /api/me/programs/[pid]/share`, `POST /api/me/programs/active`. Uçlar isteği
 * okuyup buraya verir; kararlar burada ve test edilir.
 *
 * - Kimlik yalnız oturumdan (`run()`: oturum, kayıt, GitHub hataları → 429/503). Durum değiştirenler yalnız bu
 *   siteden ve JSON'la (`postGuard`); DELETE gövdesiz, köken yeter (`originGuard`).
 * - `pid` yol kurulmadan önce `^op_[a-z0-9]{8}$` ile denetlenir; uymazsa 404 (dosya adı yalnız kimlikten).
 * - Kayıtta kısıt denetimi (`guard`): kütüphaneden eklenen izinsiz yasaklı hareket 400, satırın alanında
 *   "Bu hareket şu an sana önerilmiyor; antrenörüne sor." (409 değil: istemci 409'u bir kez yeniden dener).
 */

export type OwnRouteDeps = SessionRouteDeps & {
  /** Kütüphane denetimi (egzersiz ve cihaz kimlikleri) ve geçmişin cümleleri için adlar. */
  library(): Promise<{ library: OwnLibrary; ctx: DiffContext }>;
  /** Danışanın kısıtları (`conditions` onayıyla): kayıtta eklenen yasaklı hareketi reddetmek için; yoksa null. */
  guard?(client: Client): Promise<OwnGuard | null>;
};

const MISSING = { status: 404, body: { error: 'Program bulunamadı.' } };
const INVALID = { status: 400, body: { error: 'İstek geçersiz.' } };

function fieldsOf(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? '';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Kaydın sonucu yanıta (danışan ve PT uçları ortak). */
export function saveResponse(result: OwnSaveResult, by: 'client' | 'pt'): SessionRouteResult {
  switch (result.status) {
    case 'created':
      return {
        status: 201,
        body: { id: result.program.id, revision: result.program.revision, droppedDevices: result.droppedDevices, ...(result.activated ? { activated: true } : {}) },
      };
    case 'saved':
      return { status: 200, body: { id: result.program.id, revision: result.program.revision, droppedDevices: result.droppedDevices } };
    case 'unchanged':
      return { status: 200, body: { id: result.program.id, revision: result.program.revision, unchanged: true, droppedDevices: result.droppedDevices } };
    case 'invalid':
      return { status: 400, body: { error: 'Bilgileri kontrol et.', fields: result.errors } };
    case 'blocked':
      return { status: 400, body: { error: BLOCKED_TEXT, reason: 'blocked', fields: result.errors } };
    case 'missing':
      return { status: 404, body: { error: 'Program silindi.', reason: 'missing' } };
    case 'stale':
      return {
        status: 412,
        body: {
          error:
            by === 'pt'
              ? 'Bu program sen düzenlerken değişti. Değişikliklerin kaybolmasın diye kaydetmedim.'
              : 'Bu program sen düzenlerken değişti (antrenörün ya da başka bir cihazın kaydetti).',
        },
      };
    case 'exists':
      return { status: 409, body: { error: 'Bu program başka bir yerde oluşturuldu.', reason: 'exists' } };
    case 'limit':
      return { status: 409, body: { error: `En fazla ${OWN_PROGRAM_LIMITS.programs} program; yenisi için birini sil.`, reason: 'limit' } };
    case 'forbidden':
      return { status: 403, body: { error: 'Danışan bu programın paylaşımını kapattı.', reason: 'unshared' } };
  }
}

/** Oluştur (`baseRevision: null`) ya da kaydet; ad oluştururken zorunlu. */
export function saveOwnRoute(deps: OwnRouteDeps, headers: Headers, origin: string, pid: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  if (!isOwnProgramId(pid)) return Promise.resolve(MISSING);
  return run(deps, null, 'own-program', async ({ client, repo }) => {
    const parsed = v.safeParse(ownProgramSaveSchema, input);
    if (!parsed.success) return { status: 400, body: { error: 'Bilgileri kontrol et.', fields: fieldsOf(parsed.issues) } };
    if (parsed.output.baseRevision === null && parsed.output.name === undefined) return { status: 400, body: { error: 'Bilgileri kontrol et.', fields: { name: 'Ad gir.' } } };
    const [{ library, ctx }, guard] = await Promise.all([deps.library(), deps.guard ? deps.guard(client) : null]);
    const result = await saveOwnProgram(repo, { id: pid, body: parsed.output, by: 'client', library, ctx, now: deps.now(), guard });
    if (result.status === 'created' || result.status === 'saved') deps.log(`[kendi program] ${client.id} ${result.status}`);
    return saveResponse(result, 'client');
  });
}

/** Sil; yarım antrenman bu programdansa 409 ve seansın kimliği ([Yarım antrenmanı sil]). */
export function deleteOwnRoute(deps: SessionRouteDeps, headers: Headers, origin: string, pid: string): Promise<SessionRouteResult> {
  const blocked = originGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  if (!isOwnProgramId(pid)) return Promise.resolve(MISSING);
  return run(deps, null, 'own-program-delete', async ({ client, repo }) => {
    const result = await deleteOwnProgram(repo, pid, deps.now());
    if (result.status === 'missing') return MISSING;
    if (result.status === 'active_session') {
      return { status: 409, body: { error: 'Yarım antrenmanın bu programdan; önce bitir ya da sil.', reason: 'active_session', sessionId: result.sessionId } };
    }
    deps.log(`[kendi program] ${client.id} silindi`);
    return { status: 200, body: { ok: true } };
  });
}

/** Paylaş ya da kapat (`{ shared }`); revision artmaz. */
export function shareOwnRoute(deps: SessionRouteDeps, headers: Headers, origin: string, pid: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  if (!isOwnProgramId(pid)) return Promise.resolve(MISSING);
  return run(deps, null, 'own-program-share', async ({ repo }) => {
    const parsed = v.safeParse(ownProgramShareSchema, input);
    if (!parsed.success) return INVALID;
    const result = await shareOwnProgram(repo, pid, parsed.output.shared, deps.now());
    if (result.status === 'missing') return MISSING;
    if (result.status === 'invalid') return { status: 409, body: { error: 'Program şu an açılamıyor.' } };
    return { status: 200, body: { shared: Boolean(result.program.shared), ...(result.status === 'unchanged' ? { unchanged: true } : {}) } };
  });
}

/** Bugün'ün programı (kalıcı seçim): kendi programın kimliği ya da null (PT'nin programı). Yarım antrenman engellemez. */
export function activeOwnRoute(deps: SessionRouteDeps, headers: Headers, origin: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, null, 'own-program-active', async ({ repo }) => {
    const parsed = v.safeParse(ownProgramActiveSchema, input);
    if (!parsed.success) return INVALID;
    const result = await selectOwnActive(repo, parsed.output.programId, deps.now());
    if (result.status === 'missing') return MISSING;
    return { status: 200, body: { active: parsed.output.programId, ...(result.status === 'unchanged' ? { unchanged: true } : {}) } };
  });
}
