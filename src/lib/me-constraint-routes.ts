import * as v from 'valibot';
import { originGuard, postGuard } from './client-auth-routes.ts';
import { canRecordHealth } from './client-status.ts';
import { constraintsOf, CONSTRAINT_ID_PATTERN, ConstraintError, editReport, reportBetter, reportConstraint, reportWorse, withdrawReport } from './constraints.ts';
import { todayIn } from './format.ts';
import { GithubError } from './github/errors.ts';
import { prepareForWrite } from './health-view.ts';
import { reportPatchSchema, reportSchema } from './schemas/constraint.ts';
import { healthRecordSchema, type HealthRecord } from './schemas/health.ts';
import type { SessionRepo } from './session-files-core.ts';
import { run, type SessionRouteDeps, type SessionRouteResult } from './session-routes.ts';
import { randomId } from './template-plan.ts';

/**
 * Danışanın kısıt bildirimleri (tasarım `kisit-tarama.md` §2.4, §5.5) — ince çekirdek, `session-routes.ts`'in
 * kapısıyla (oturum, kayıt, GitHub hataları). Kimlik yalnız oturumdan; yalnız bu siteden ve JSON'la.
 *
 * - `POST /api/me/constraints`: yeni bildirim → 201.
 * - `PATCH /api/me/constraints/[kid]`: kendi bekleyen bildirimini düzeltir; onaylıda "Kötüleşti" (şiddet, hemen
 *   yazılır) ya da "Düzeldi" (PT onaylayana kadar kapanmaz).
 * - `DELETE /api/me/constraints/[kid]`: yalnız kendi bekleyen bildirimini geri çeker.
 *
 * Onay (`conditions`) her yazımda taze kayıttan; yoksa 403. Bozuk `health.json` ezilmez. Commit mesajları
 * geneldir, değer taşımaz. Yazınca PT'nin bildirim özeti düşer.
 */

const HEALTH_PATH = 'health.json';
const FORBIDDEN: SessionRouteResult = { status: 403, body: { error: 'Kısıt bildirmek için sağlık onayın yok.', reason: 'consent' } };
const BROKEN: SessionRouteResult = { status: 500, body: { error: 'Sağlık kaydın şu an açılamıyor. Antrenörüne haber ver.', reason: 'broken' } };

function fieldsOf(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? '';
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function readHealthFile(repo: SessionRepo): Promise<{ record: HealthRecord; sha: string } | null | 'broken'> {
  try {
    const file = await repo.read(HEALTH_PATH);
    if (!file) return null;
    const parsed = v.safeParse(healthRecordSchema, file.content);
    return parsed.success ? { record: parsed.output, sha: file.sha } : 'broken';
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return 'broken';
    throw error;
  }
}

/** Oku → uygula → yaz (`sha`), çakışmada bir kez taze okuyup yeniden. Kural hatası durumuyla döner. */
async function write(
  deps: SessionRouteDeps,
  repo: SessionRepo,
  clientId: string,
  change: (record: HealthRecord) => HealthRecord,
  message: string,
  status = 200,
): Promise<SessionRouteResult> {
  for (let attempt = 0; ; attempt += 1) {
    const file = await readHealthFile(repo);
    if (file === 'broken') {
      deps.log(`[kısıt] ${clientId}: ${HEALTH_PATH} bozuk, yazılmadı.`);
      return BROKEN;
    }
    let next: HealthRecord;
    try {
      next = change(prepareForWrite(file?.record ?? { version: 2, checkIns: [], measurements: [] }, 'conditions'));
    } catch (error) {
      if (error instanceof ConstraintError) return { status: error.status, body: { error: error.message } };
      throw error;
    }
    try {
      await repo.write(HEALTH_PATH, next, { sha: file?.sha, message });
      repo.noticesChanged();
      deps.log(`[kısıt] ${clientId} ${message}`);
      return { status, body: { ok: true } };
    } catch (error) {
      if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
      throw error;
    }
  }
}

export function reportPostRoute(deps: SessionRouteDeps, headers: Headers, origin: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, null, 'constraint-report', async ({ client, repo }) => {
    if (!canRecordHealth(client, 'conditions')) return FORBIDDEN;
    const parsed = v.safeParse(reportSchema, input);
    if (!parsed.success) return { status: 400, body: { error: 'Bilgileri kontrol et.', fields: fieldsOf(parsed.issues) } };
    const now = deps.now();
    const today = todayIn(await deps.timeZone(), now);
    return write(
      deps,
      repo,
      client.id,
      (record) => {
        const id = randomId('k', 6, new Set(constraintsOf(record).map((item) => item.id)));
        return reportConstraint(record, parsed.output, { id, now: now.toISOString(), today });
      },
      'Kısıt bildirildi',
      201,
    );
  });
}

export function reportPatchRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  if (!CONSTRAINT_ID_PATTERN.test(id)) return Promise.resolve({ status: 404, body: { error: 'Kısıt bulunamadı.' } });
  return run(deps, null, 'constraint-update', async ({ client, repo }) => {
    if (!canRecordHealth(client, 'conditions')) return FORBIDDEN;
    const parsed = v.safeParse(reportPatchSchema, input);
    if (!parsed.success) return { status: 400, body: { error: 'Bilgileri kontrol et.', fields: fieldsOf(parsed.issues) } };
    const now = deps.now();
    const today = todayIn(await deps.timeZone(), now);
    const body = parsed.output;
    return write(
      deps,
      repo,
      client.id,
      (record) =>
        body.action === 'edit'
          ? editReport(record, id, body.report, { now: now.toISOString(), today })
          : body.action === 'worse'
            ? reportWorse(record, id, body.severity, { now: now.toISOString() })
            : reportBetter(record, id, { now: now.toISOString() }),
      body.action === 'edit' ? 'Kısıt bildirimi düzeltildi' : 'Kısıt güncellendi',
    );
  });
}

export function reportDeleteRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string): Promise<SessionRouteResult> {
  const blocked = originGuard(headers, origin);
  if (blocked) return Promise.resolve(blocked);
  if (!CONSTRAINT_ID_PATTERN.test(id)) return Promise.resolve({ status: 404, body: { error: 'Kısıt bulunamadı.' } });
  return run(deps, null, 'constraint-withdraw', async ({ client, repo }) => {
    if (!canRecordHealth(client, 'conditions')) return FORBIDDEN;
    return write(deps, repo, client.id, (record) => withdrawReport(record, id, { now: deps.now().toISOString() }), 'Kısıt bildirimi geri çekildi');
  });
}
