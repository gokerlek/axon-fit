import 'server-only';
import { createHash } from 'node:crypto';
import { readPtSession } from '@/lib/session';
import { listClients } from '@/lib/clients';
import { appRepo, gh, owner } from '@/lib/github/client';
import { readJson, writeJson } from '@/lib/github/files';
import { geminiApiKey } from './gemini-key';
import { coachContext, coachDeps } from './coach-service';
import { type Client } from '@/lib/schemas/client';
import { ASSISTANT_PATH } from './assistant-contract';
import { coachAccess, COACH_PATH } from './coach-contract';
import { EMPTY_CARE } from '@/lib/constraint-filter';
import type { CoachInsight } from './coach-review';
import type { CoachExercise, CoachFact } from './coach-engine';
import type { SessionRepo } from '@/lib/session-files-core';

export const PT_COACH_ID = 'c_ptgeneral';
const generalClient: Client = { id: PT_COACH_ID, name: 'Tüm danışanlar', status: 'active', createdAt: '2026-10-05T00:00:00.000Z', modules: { health: { enabled: false, fields: [] }, ai: { enabled: true } }, consents: {}, access: { version: 1 }, visibleTo: [] };
function generalRepo(): SessionRepo {
  // This route uses only these two operations. Keep the ordinary coach's atomic SHA reservation.
  const privateRepo = async () => {
    const result = await gh().rest.repos.get({ owner: owner(), repo: appRepo() });
    if (!result.data.private || result.data.fork) throw new Error('PT sohbeti için özel ve bağımsız veri reposu gerekiyor.');
  };
  const path = (value: string) => { if (value === ASSISTANT_PATH) return 'ai/pt-assistant.json'; if (value !== COACH_PATH) throw new Error('Geçersiz koç dosyası.'); return 'ai/pt-coach.json'; };
  const unsupported = async (): Promise<never> => { throw new Error('Genel sohbet seans/program dosyalarına yazamaz.'); };
  return { read: async value => { await privateRepo(); return readJson(appRepo(), path(value)); }, write: async (value, data, options) => { await privateRepo(); return writeJson(appRepo(), path(value), data, options); }, head: unsupported, readBlob: unsupported, listSessions: unsupported, listFolder: unsupported, commit: unsupported, invalidate: () => {}, noticesChanged: () => {}, log: () => {} };
}
export function generalCoachDeps() {
  const deps = coachDeps(async () => await readPtSession());
  deps.client = async id => id === PT_COACH_ID ? generalClient : null;
  deps.repo = generalRepo;
  deps.connection = async () => await geminiApiKey() ? 'pt' : null;
  const permissionHash = (items: Awaited<ReturnType<typeof listClients>>) => createHash('sha256').update(JSON.stringify(items.map(item => item.ok ? { id: item.client.id, status: item.client.status, modules: item.client.modules, consents: item.client.consents } : { id: item.id, ok: false }))).digest('hex');
  let permissions = '';
  deps.permissionsUnchanged = async () => permissionHash(await listClients()) === permissions;
  deps.context = async () => {
    const clients = await listClients();
    permissions = permissionHash(clients);
    const allowed = clients.flatMap(item => item.ok && coachAccess(item.client) === 'ready' ? [item.client] : []);
    const facts: CoachFact[] = [{ text: `${clients.length} danışandan ${allowed.length} danışanın AI desteği açık. Sağlık kayıtları yalnız mevcut sağlık izninin kapsamına göre kullanılır. Diğerlerinin kişisel kayıtları bu değerlendirmede kullanılmaz.`, source: 'Danışan kapsamı' }];
    let exercises: CoachExercise[] = [];
    const insights: CoachInsight[] = [];
    // Read sequentially to avoid exhausting GitHub's concurrent request quota on large rosters.
    for (const client of allowed) {
      try {
        const snapshot = await coachContext(client);
        exercises = snapshot.context.exercises;
        insights.push(...(snapshot.context.insights ?? []).map(i => ({ ...i, title: `${client.name} · ${i.title}` })));
        const plain = snapshot.context.facts.filter(f => !f.exerciseId && !f.source.startsWith('Ölçüm')).slice(0, 2);
        const chosen = [...plain, ...snapshot.context.facts.filter(f => f.exerciseId).slice(0, 2), ...snapshot.context.facts.filter(f => f.source.startsWith('Ölçüm')).slice(0, 2)];
        facts.push(...chosen.map(f => ({ ...f, text: `${client.name}: ${f.text}`, clientName: client.name, source: `${f.source} · ${client.name}` })));
      } catch { facts.push({ text: `${client.name}: kayıt okunamadı; eksik bilgiden sonuç çıkarmıyorum.`, clientName: client.name, source: 'Eksik kayıt' }); }
    }
    if (facts.length > 100) facts.push({ text: 'Genel yanıtta en fazla 100 kayıt özeti gösterilir. Belirli bir danışanı incelemek için danışan sayfasından sor.', source: 'Yanıt kapsamı' });
    return { context: { facts, insights: insights.slice(0, 20), exercises, care: EMPTY_CARE, today: '', existingExerciseIds: [], healthUnavailable: true, global: true }, hash: createHash('sha256').update(JSON.stringify(facts)).digest('hex'), baseRevision: null };
  };
  deps.classify = async (_id, _role, message, context, previous) => {
    const key = await geminiApiKey();
    if (!key) throw new Error('PT Gemini bağlantısı kapalı.');
    const { classifyCoachQuestion } = await import('./coach-gemini');
    return classifyCoachQuestion(key, message, context.exercises, previous);
  };
  deps.publish = async () => { throw new Error('Genel sohbetten program yayımlanamaz.'); };
  deps.published = async () => false;
  return deps;
}
