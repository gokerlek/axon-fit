import 'server-only';
import { progressReview } from './coach-review';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readClient } from '@/lib/clients';
import { readIndex } from '@/lib/session-files-core';
import { sessionRepo } from '@/lib/session-files';
import { listExercises } from '@/lib/exercises';
import { listDevices } from '@/lib/devices';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { canRecordHealth } from '@/lib/client-status';
import { readHealthIfAllowed } from '@/lib/health';
import { careInputOf, EMPTY_CARE } from '@/lib/constraint-filter';
import { programDiffContext, readProgramFile, saveProgram } from '@/lib/programs';
import { measurementDef } from '@/lib/measurements';
import { coachAccess } from './coach-contract';
import { strongestOf } from '@/lib/session-records';
import { PROTOCOLS, METRIC_LABELS } from '@/lib/pose/protocols';
import { coachingKey } from './coach-keys';
import { classifyCoachQuestion } from './coach-gemini';
import type { CoachDeps } from './coach-routes';
import { coachProgramMatches, type CoachContext, type CoachFact } from './coach-engine';
import type { Client } from '@/lib/schemas/client';
import { GithubError } from '@/lib/github/client';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (prefix?: string) => prefix ? `${prefix}_${randomBytes(3).toString('hex')}` : randomUUID();
export async function coachContext(client: Client) {
  const [catalog, program, index, config] = await Promise.all([listExercises(), readProgramFile(client.id), readIndex(sessionRepo(client.id)), readAppConfig()]);
  if (program?.problem) throw new GithubError('Mevcut program okunamadı. Taslak hazırlanmadan önce programı düzelt.', 409);
  const today = todayIn(config.timeZone);
  const conditions = canRecordHealth(client, 'conditions'), pain = canRecordHealth(client, 'check_in'), measurements = canRecordHealth(client, 'measurements'), screening = canRecordHealth(client, 'screening');
  const record = await readHealthIfAllowed(client, ['conditions', 'check_in', 'measurements', 'screening']);
  const healthUnavailable = (client.modules.health.enabled && client.modules.health.fields.includes('conditions') && !conditions) || ((conditions || pain) && !record);
  const care = record && (conditions || pain) ? careInputOf({
    conditions: conditions ? record.conditions : [],
    constraints: conditions ? record.constraints : undefined,
    surgeryDate: conditions ? record.surgeryDate : undefined,
    overrides: conditions ? record.overrides : undefined,
    checkIns: pain ? record.checkIns : [],
  }, { today, painConsent: pain }) : { ...EMPTY_CARE, today };
  const finished = index.index.items.filter(item => item.finishedAt && item.date <= today).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const facts: CoachFact[] = [
    { text: `Bitmiş ${finished.length} antrenman kaydı var.`, source: 'Antrenman geçmişi' },
    ...finished.slice(0, 3).map(item => ({ text: `${item.date}: ${item.dayName ?? 'Antrenman'}, ${item.sets} çalışma seti, ${item.volumeKg} kg toplam hacim. Hacim farklı hareketler arasında bir güç puanı değildir.`, source: `${item.date} antrenman kaydı` })),
  ];
  const seenExercises = new Set<string>();
  for (let rowIndex = 0; rowIndex < Math.min(8, finished.length); rowIndex++) {
    const row = finished[rowIndex]!;
    for (const item of row.exercises) {
      const key = `${item.exerciseId}:${item.deviceId ?? ''}`;
      const best = strongestOf(item.best);
      if (!best || seenExercises.has(key)) continue;
      seenExercises.add(key);
      const before = finished.slice(rowIndex + 1).flatMap(previous => previous.exercises)
        .find(previous => previous.exerciseId === item.exerciseId && previous.deviceId === item.deviceId && strongestOf(previous.best));
      const old = before ? strongestOf(before.best) : null;
      const difference = old ? `Aynı hareket ve cihazın önceki tahminine göre fark ${(best.e1rm - old.e1rm).toFixed(1)} kg. Tek seans farkı neden veya başarısızlık göstermez.` : 'Karşılaştırılabilecek önceki tahmin bulunamadı.';
      const title = catalog.find(e => e.id === item.exerciseId)?.title ?? 'Kütüphaneden kaldırılmış hareket';
      facts.push({ text: `${row.date}, ${title}: tahmini maksimum ${best.e1rm.toFixed(1)} kg (${best.kg} kg × ${best.reps} tekrar). ${difference} Bu bir gerçek maksimum testi değildir.`, source: `${row.date} · ${title} kaydı`, exerciseId: item.exerciseId });
    }
  }
  const current = program?.program;
  if (current) facts.push({ text: `Mevcut PT programında ${current.phases.reduce((n, p) => n + p.days.length, 0)} antrenman günü tanımlı.`, source: 'PT programı' });
  if (screening && record) {
    for (const entry of (record.cameraMeasurements ?? []).filter(e => !e.deletedAt).slice(0, 3)) {
      facts.push({ text: `${entry.capturedAt.slice(0, 10)}, ${PROTOCOLS[entry.task].title}: ${entry.metrics.map(m => `${METRIC_LABELS[m.id] ?? m.id} ${m.median.toFixed(1)}°`).join(', ')}. Bu bir 2D kamera ölçümüdür; normal/anormal etiketi verilmedi.`, source: `Ölçüm ${entry.capturedAt.slice(0, 10)} · ${PROTOCOLS[entry.task].title}` });
    }
  }
  if (measurements && record) {
    for (const entry of [...record.measurements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) {
      const definition = measurementDef(entry.id);
      facts.push({ text: `${entry.date}, ${definition.label}${entry.side ? (entry.side === 'left' ? ' (sol)' : ' (sağ)') : ''}: ${entry.value} ${definition.unit}. Ölçüm yöntemini eşitlemeden farkı gelişim olarak yorumlamıyorum.`, source: `Ölçüm ${entry.date} · ${definition.label}` });
    }
  }
  const insights = progressReview(finished, today, new Map(catalog.map(e => [e.id, e.title])));
  const context: CoachContext = { today, facts, insights, exercises: catalog, care, healthUnavailable, existingExerciseIds: [...new Set([...(current?.phases.flatMap(p => p.days.flatMap(d => d.blocks.flatMap(b => b.rows.map(r => r.exerciseId)))) ?? []), ...finished.flatMap(s => s.exercises.map(e => e.exerciseId))])] };
  return { context, hash: hash({ client: { modules: client.modules, consents: client.consents }, care, facts, insights, catalog, program: current }), baseRevision: current?.revision ?? null, ...(current ? { baseCreatedAt: current.createdAt } : {}) };
}
export function coachDeps(session: CoachDeps['session']): CoachDeps {
  return {
    session, client: async id => (await readClient(id))?.client ?? null, repo: sessionRepo,
    connection: async (id, role) => (await coachingKey(id, role)).source,
    context: coachContext, hash, id, now: () => new Date(),
    classify: async (clientId, role, message, context, previous) => {
      const { key } = await coachingKey(clientId, role);
      if (!key) throw new GithubError('Gemini bağlantısı kapatılmış. Anahtarını kontrol et.', 409);
      return classifyCoachQuestion(key, message, context.exercises.map(e => ({ id: e.id, title: e.title })), previous);
    },
    published: async (clientId, proposal) => {
      const current = (await readProgramFile(clientId))?.program;
      return !!current && coachProgramMatches(current, proposal.body);
    },
    publish: async (clientId, proposal) => {
      const client = (await readClient(clientId))?.client;
      if (!client || coachAccess(client) !== 'ready') throw new GithubError('AI desteği kapatıldı. Program yayımlanmadı.', 403);
      const fresh = await coachContext(client);
      if (fresh.hash !== proposal.contextHash) throw new GithubError('Kayıtlar veya izinler değişti. Taslağı yeniden hazırla.', 412);
      // Validate the current catalog again; never drop a device silently during an AI approval.
      const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
      const result = await saveProgram(clientId, proposal.body,
        proposal.baseRevision === null ? null : { revision: proposal.baseRevision, createdAt: proposal.baseCreatedAt },
        { exercises: new Map(exercises.map(e => [e.id, e])), deviceIds: new Set(devices.map(d => d.id)) }, programDiffContext(exercises, devices));
      if (!['created', 'saved', 'unchanged'].includes(result.status)) throw new GithubError('Program veya katalog değişti. Taslağı yeniden hazırla; mevcut programın korunuyor.', 412);
    },
  };
}
