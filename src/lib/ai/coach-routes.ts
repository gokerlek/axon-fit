import * as v from 'valibot';
import { postGuard, type RouteResult } from '../client-auth-routes.ts';
import { clientIdSchema, type Client } from '../schemas/client.ts';
import type { SessionRepo } from '../session-files-core.ts';
import type { CoachContext } from './coach-engine.ts';
import { answerCoach, coachSensitiveIntent, draftCoachProgram } from './coach-engine.ts';
import { askSchema, coachAccess, coachStoreSchema, coachView, COACH_PATH, decisionSchema, emptyCoach, type CoachIntent, type CoachProposal, type CoachStore } from './coach-contract.ts';

export type CoachDeps = {
  session: () => Promise<{ role: 'pt' | 'client'; clientId?: string } | null>;
  client: (id: string) => Promise<Client | null>;
  repo: (id: string) => SessionRepo;
  connection: (id: string, role: 'pt' | 'client') => Promise<'pt' | 'client' | null>;
  context: (client: Client) => Promise<{ context: CoachContext; hash: string; baseRevision: number | null; baseCreatedAt?: string }>;
  classify: (id: string, role: 'pt' | 'client', message: string, context: CoachContext, previous: readonly string[]) => Promise<CoachIntent>;
  publish: (id: string, proposal: CoachProposal) => Promise<void>;
  published: (id: string, proposal: CoachProposal) => Promise<boolean>;
  hash: (value: unknown) => string;
  id: (prefix?: string) => string;
  now: () => Date;
  permissionsUnchanged?: () => Promise<boolean>;
};
async function authorization(deps: CoachDeps, id: string) {
  const session = await deps.session();
  if (!session || (session.role === 'client' && session.clientId !== id)) return null;
  if (!v.is(clientIdSchema, id)) return null;
  const client = await deps.client(id);
  return client ? { client, role: session.role } : null;
}
async function load(repo: SessionRepo) {
  const stored = await repo.read(COACH_PATH);
  return { store: stored ? v.parse(coachStoreSchema, stored.content) : emptyCoach(), sha: stored?.sha };
}
async function write(repo: SessionRepo, store: CoachStore, sha?: string) {
  await repo.write(COACH_PATH, v.parse(coachStoreSchema, store), { sha, message: 'AI koç kaydı güncellendi' });
}
const fail = (status: number, error: string): RouteResult => ({ status, body: { error } });
export async function getCoach(deps: CoachDeps, id: string): Promise<RouteResult> {
  const auth = await authorization(deps, id);
  if (!auth) return fail(403, 'Bu danışanın koç kayıtlarına erişemezsin.');
  const access = coachAccess(auth.client);
  if (access !== 'ready') return { status: 200, body: { clientName: auth.client.name, access, messages: [], proposals: [], connection: null } };
  const [{ store }, connection] = await Promise.all([load(deps.repo(id)), deps.connection(id, auth.role)]);
  return { status: 200, body: { clientName: auth.client.name, access, ...coachView(store, auth.role), connection } };
}
export async function askCoach(deps: CoachDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<RouteResult> {
  const blocked = postGuard(headers, origin); if (blocked) return blocked;
  const auth = await authorization(deps, id);
  if (!auth || coachAccess(auth.client) !== 'ready') return fail(403, 'Bu danışan için AI desteği kapalı.');
  const parsed = v.safeParse(askSchema, input);
  if (!parsed.success) return fail(400, 'Mesajı ve program koşullarını kontrol et.');
  const request = parsed.output, repo = deps.repo(id), now = deps.now();
  const { store, sha } = await load(repo);
  const hash = deps.hash(request);
  const existing = store[auth.role].find(message => message.id === request.requestId);
  if (existing) return existing.requestHash === hash ? getCoach(deps, id) : fail(409, 'Bu istek kimliği başka bir mesajda kullanılmış.');
  if (store.pending && now.getTime() - Date.parse(store.pending.at) < 120000) return fail(409, 'Bir yanıt hazırlanıyor. Biraz sonra yeniden dene.');
  if (store.proposals.some(p => p.status === 'publishing')) return fail(409, 'PT programı yayımlıyor. İşlem bitince tekrar dene.');
  if (store[auth.role].filter(m => now.getTime() - Date.parse(m.at) < 86400000).length >= 30) return fail(429, 'Bugünkü 30 mesaj sınırına ulaştın.');
  if (!await deps.connection(id, auth.role)) return fail(409, 'Gemini bağlantısı eklenmemiş. Önce AI bağlantısını ayarla.');
  const reserved = { ...store, pending: { id: request.requestId, role: auth.role, at: now.toISOString() } };
  await write(repo, reserved, sha);
  try {
    const data = await deps.context(auth.client);
    const sensitive = coachSensitiveIntent(request.message);
    let intent: CoachIntent = sensitive ? { intent: sensitive, exerciseIds: [] } : await deps.classify(id, auth.role, request.message, data.context, store[auth.role].map(m => m.question));
    if (intent.intent === 'overview' && request.page === 'measurements') intent = { ...intent, intent: 'measurement' };
    // Explicit plan requests still respect model's sensitive-content/medical gates.
    const wantsPlan = (request.makePlan || intent.intent === 'plan') && intent.intent !== 'support' && intent.intent !== 'health_question' && !data.context.global;
    const response = answerCoach(intent, data.context, request.message);
    let proposal: CoachProposal | undefined;
    if (wantsPlan) {
      if (!request.conditions) response.answer = 'Taslak için aşağıdan hangi günler, kaç dakika ve hangi ekipmanlarla çalışabileceğini seç. Koşullarını tahmin etmeyeceğim.';
      else {
        const draft = draftCoachProgram(data.context, request.conditions, intent.exerciseIds, deps.id);
        if ('error' in draft) response.answer = draft.error;
        else {
          if (store.proposals.filter(p => p.status === 'pending' && Date.parse(p.expiresAt) > now.getTime()).length >= 12) return fail(409, 'Bekleyen taslakları PT değerlendirdikten sonra yenisini hazırlayabiliriz.');
          proposal = { id: deps.id(), at: now.toISOString(), expiresAt: new Date(now.getTime() + 72 * 3600000).toISOString(), status: 'pending', baseRevision: data.baseRevision, ...(data.baseCreatedAt ? { baseCreatedAt: data.baseCreatedAt } : {}), body: draft.body, exerciseTitles: Object.fromEntries(data.context.exercises.filter(e => draft.body.phases.some(p => p.days.some(d => d.blocks.some(b => b.rows.some(r => r.exerciseId === e.id))))).map(e => [e.id, e.title])), rationale: draft.rationale, conditions: request.conditions, contextHash: data.hash };
          response.answer = `Koşullarına göre taslak hazırladım. Henüz programına uygulanmadı; antrenörün hareketleri, yükü ve sıklığı değerlendirip onaylayabilir.\n\n${draft.rationale.join('\n')}`;
        }
      }
    }
    // Re-read permissions after the provider call; revocation discards the result.
    const freshAuth = await authorization(deps, id);
    if (!freshAuth || coachAccess(freshAuth.client) !== 'ready') return fail(403, 'AI desteği işlem sırasında kapatıldı. Yanıt kaydedilmedi.');
    if (deps.hash({ modules: freshAuth.client.modules, consents: freshAuth.client.consents }) !== deps.hash({ modules: auth.client.modules, consents: auth.client.consents }) || (deps.permissionsUnchanged && !await deps.permissionsUnchanged())) return fail(403, 'Veri izinleri değişti. Yanıt kaydedilmedi; güncel izinlerle yeniden sor.');
    const fresh = await load(repo);
    if (fresh.store.pending?.id !== request.requestId) return fail(409, 'İstek değişti. Yeniden dene.');
    const { pending: _pending, ...next } = fresh.store;
    next[auth.role] = [...next[auth.role], { id: request.requestId, requestHash: hash, at: now.toISOString(), question: request.message, ...response }].slice(-120);
    if (proposal) next.proposals = [...next.proposals.filter(p => p.status === 'pending' || p.status === 'publishing' || Date.parse(p.at) > now.getTime() - 30 * 86400000), proposal].slice(-40);
    await write(repo, next, fresh.sha);
    return getCoach(deps, id);
  } finally {
    const fresh = await load(repo);
    if (fresh.store.pending?.id === request.requestId) {
      const { pending: _pending, ...next } = fresh.store;
      await write(repo, next, fresh.sha);
    }
  }
}
export async function decideCoach(deps: CoachDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<RouteResult> {
  const blocked = postGuard(headers, origin); if (blocked) return blocked;
  const auth = await authorization(deps, id);
  if (!auth || auth.role !== 'pt' || coachAccess(auth.client) !== 'ready') return fail(403, 'Program taslağını yalnız PT değerlendirebilir.');
  const parsed = v.safeParse(decisionSchema, input);
  if (!parsed.success) return fail(400, 'Taslak işlemi geçersiz.');
  const repo = deps.repo(id), loaded = await load(repo);
  if (loaded.store.pending) return fail(409, 'Koç yanıtı hazırlanıyor. Tamamlanınca taslağı değerlendir.');
  const proposal = loaded.store.proposals.find(p => p.id === parsed.output.id);
  if (!proposal) return fail(404, 'Taslak bulunamadı.');
  if (proposal.status === 'approved' || proposal.status === 'rejected') return getCoach(deps, id);
  if (proposal.status === 'publishing' && await deps.published(id, proposal)) {
    proposal.status = 'approved'; proposal.decidedAt = deps.now().toISOString();
    await write(repo, loaded.store, loaded.sha);
    return getCoach(deps, id);
  }
  if (proposal.status === 'publishing' && parsed.output.action === 'reject') return fail(409, 'Başlamış yayımlama tamamlanmalı; program uygulanmış olabilir.');
  if (parsed.output.action === 'reject') {
    proposal.status = 'rejected'; proposal.decidedAt = deps.now().toISOString();
    await write(repo, loaded.store, loaded.sha);
    return getCoach(deps, id);
  }
  if (Date.parse(proposal.expiresAt) < deps.now().getTime()) return fail(412, 'Taslak üç günü geçti. Güncel kayıtlardan yeniden hazırla.');
  const context = await deps.context(auth.client);
  if (context.hash !== proposal.contextHash) return fail(412, 'Program, izinler, ölçümler veya katalog değişti. Güncel kayıtlardan yeni taslak hazırla.');
  proposal.status = 'publishing';
  await write(repo, loaded.store, loaded.sha);
  try {
    await deps.publish(id, proposal);
  } catch (error) {
    const fresh = await load(repo), found = fresh.store.proposals.find(p => p.id === proposal.id);
    if (found && !await deps.published(id, proposal)) { found.status = 'pending'; await write(repo, fresh.store, fresh.sha); }
    throw error;
  }
  const fresh = await load(repo), found = fresh.store.proposals.find(p => p.id === proposal.id);
  if (found) { found.status = 'approved'; found.decidedAt = deps.now().toISOString(); await write(repo, fresh.store, fresh.sha); }
  return getCoach(deps, id);
}
