import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as v from 'valibot';
import { EMPTY_CARE } from '../constraint-filter.ts';
import { type Client } from '../schemas/client.ts';
import { fakeSessionRepo } from '../testing/fake-session-repo.ts';
import { EXERCISES, DEVICES } from '../testing/workout-fixtures.ts';
import { programFile } from '../testing/session-fixtures.ts';
import { saveOwnProgram } from '../own-program-files.ts';
import { saveResponse } from '../own-program-routes.ts';
import { OWN_INDEX_PATH } from '../own-programs.ts';
import type { OwnIndex } from '../own-program-index.ts';
import { assistantProgram } from './assistant-engine.ts';
import { ASSISTANT_PATH, selectionSchema, type AssistantSelection, type AssistantView, type AssistantStore } from './assistant-contract.ts';
import { getAssistant, requestAssistant, saveAssistantDraft, permissionHash, type AssistantDeps } from './assistant-routes.ts';
import { interpretGoal } from './assistant-gemini.ts';
import { assistantNotices } from './assistant-notices.ts';
const NOW = '2026-10-05T12:00:00.000Z', ORIGIN = 'https://fit.example';
const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
const selection: AssistantSelection = { goal: 'general_fitness', fullBody: true, muscles: [], conditions: { weekdays: [1, 4], minutes: 45, equipment: ['barbell', 'bodyweight', 'dumbbell'] } };
function setup(role: 'pt' | 'client' = 'client') {
  let client: Client = { id: 'c_coachtest', name: 'Test', status: 'active', createdAt: NOW, modules: { health: { enabled: false, fields: [] }, ai: { enabled: true } }, consents: {}, access: { version: 1 }, visibleTo: [] };
  const pt = programFile(), gh = fakeSessionRepo({ 'program.json': pt }); let calls = 0, sequence = 0;
  const context = { facts: [{ text: '3 antrenman', source: 'Antrenman geçmişi' }], exercises: [...EXERCISES.values()], care: EMPTY_CARE, today: '2026-10-05', existingExerciseIds: [], healthUnavailable: false };
  const deps: AssistantDeps = { session: async () => ({ role, clientId: client.id }), client: async () => client, repo: () => gh.repo, connection: async () => null, context: async () => ({ context, hash: 'snapshot', baseRevision: null }),
    classify: async () => { throw new Error('No chat classification'); }, publish: async () => {}, published: async () => false,
    hash: value => JSON.stringify(value), id: prefix => prefix ? `${prefix}_${(++sequence).toString(16).padStart(6, '0')}` : randomUUID(), ownId: () => 'op_12345678', now: () => new Date(NOW),
    interpret: async () => { calls++; return { intent: 'fitness', goal: 'general_fitness', fullBody: true, muscles: [], weekdays: null, minutes: null, equipment: null }; },
    saveOwn: async (_client, draft, body) => saveResponse(await saveOwnProgram(gh.repo, { id: draft.programId, body, by: 'client', now: new Date(NOW), shareOnCreate: true, library: { exercises: EXERCISES, deviceIds: new Set(DEVICES.keys()) }, ctx: { exercises: new Map([...EXERCISES.values()].map(e => [e.id, { title: e.title, trackingType: e.trackingType }])), devices: new Map() } }), 'client'),
  };
  return { deps, gh, pt, context, client: () => client, revoke: () => { client = { ...client, modules: { ...client.modules, ai: { enabled: false } } }; }, calls: () => calls };
}
const view = (result: Awaited<ReturnType<typeof getAssistant>>) => result.body as unknown as AssistantView;
async function generate(f: ReturnType<typeof setup>) {
  return view(await requestAssistant(f.deps, headers, ORIGIN, f.client().id, { action: 'generate', requestId: randomUUID(), kind: 'program', selection })).drafts[0]!;
}
test('manual selection requires muscles or full body and explicit days/time/equipment', () => {
  assert.equal(v.safeParse(selectionSchema, { ...selection, fullBody: false }).success, false);
  assert.equal(v.safeParse(selectionSchema, { ...selection, conditions: { ...selection.conditions, weekdays: [] } }).success, false);
  assert.equal(v.safeParse(selectionSchema, { ...selection, conditions: { ...selection.conditions, minutes: 0 } }).success, false);
});
test('manual drafts and factual review work without a Gemini key; no chat data appears', async () => {
  const f = setup(); await generate(f);
  const data = view(await requestAssistant(f.deps, headers, ORIGIN, f.client().id, { action: 'review', requestId: randomUUID() }));
  assert.equal(data.drafts.length, 1); assert.match(data.reviews[0]!.text, /3 antrenman/); assert.equal(f.calls(), 0);
  assert.equal('messages' in data, false); assert.deepEqual(f.gh.get('program.json'), f.pt);
});
test('authorization/origin/PT enablement prevent provider and record access', async () => {
  const f = setup(), request = { action: 'review', requestId: randomUUID() };
  assert.equal((await getAssistant(f.deps, 'c_anothertest')).status, 403);
  assert.equal((await requestAssistant(f.deps, new Headers({ origin: 'https://evil.example' }), ORIGIN, f.client().id, request)).status, 403);
  f.revoke(); assert.equal((await requestAssistant(f.deps, headers, ORIGIN, f.client().id, request)).status, 403);
  assert.equal(f.gh.commitCount(), 0);
});
test('repeated generate request produces one draft and conflicting payload is rejected', async () => {
  const f = setup(), request = { action: 'generate', kind: 'program', selection, requestId: randomUUID() };
  await requestAssistant(f.deps, headers, ORIGIN, f.client().id, request);
  const count = f.gh.commitCount();
  assert.equal(view(await requestAssistant(f.deps, headers, ORIGIN, f.client().id, request)).drafts.length, 1);
  assert.equal(f.gh.commitCount(), count);
  assert.equal((await requestAssistant(f.deps, headers, ORIGIN, f.client().id, { ...request, kind: 'workout' })).status, 409);
});
test('a client saves their own program immediately, shared atomically; PT program remains unchanged', async () => {
  const f = setup(), draft = await generate(f), body = { ...draft.body, name: draft.name, baseRevision: null };
  const result = await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client');
  assert.equal(result.status, 201);
  const index = f.gh.get(OWN_INDEX_PATH) as OwnIndex;
  assert.ok(index.items[0]?.shared); assert.equal(index.active, undefined);
  assert.deepEqual(f.gh.get('program.json'), f.pt);
  const saved = view(await getAssistant(f.deps, f.client().id)).drafts[0]!; assert.equal(saved.savedBy, 'client'); assert.equal(saved.status, 'saved');
  const count = f.gh.commitCount();
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client')).status, 200);
  assert.equal(f.gh.commitCount(), count);
});
test('interrupted metadata after own creation can be retried without creating another program', async () => {
  const f = setup(), draft = await generate(f), body = { ...draft.body, name: draft.name, baseRevision: null };
  const original = f.deps.saveOwn; let first = true;
  f.deps.saveOwn = async (...args) => { const result = await original(...args); if (first) { first = false; throw new Error('Lost response'); } return result; };
  await assert.rejects(saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client'), /Lost response/);
  const ownSha = f.gh.sha(`own-programs/${draft.programId}.json`);
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client')).status, 200);
  assert.equal(f.gh.sha(`own-programs/${draft.programId}.json`), ownSha);
  assert.equal((f.gh.get(OWN_INDEX_PATH) as OwnIndex).items.length, 1);
});
test('stale context and revoked permissions block save and hide stored drafts', async () => {
  const f = setup(), draft = await generate(f), body = { ...draft.body, name: draft.name, baseRevision: null };
  f.deps.context = async () => ({ context: f.context, hash: 'changed', baseRevision: null });
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client')).status, 412);
  f.revoke(); assert.deepEqual(view(await getAssistant(f.deps, f.client().id)).drafts, []);
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client')).status, 403);
});
test('client cannot apply PT program; PT cannot save via client route', async () => {
  const f = setup(), draft = await generate(f);
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, null, 'pt')).status, 403);
  const pt = setup('pt'), p = await generate(pt);
  assert.equal((await saveAssistantDraft(pt.deps, headers, ORIGIN, pt.client().id, p.id, { ...p.body, name: p.name, baseRevision: null }, 'client')).status, 403);
});
test('natural goal requires connection, revocation during interpretation discards result', async () => {
  const f = setup(), input = { action: 'interpret', requestId: randomUUID(), text: 'Bütün bedenimi çalıştırmak istiyorum' };
  assert.equal((await requestAssistant(f.deps, headers, ORIGIN, f.client().id, input)).status, 409);
  f.deps.connection = async () => 'client'; f.deps.interpret = async () => { f.revoke(); return { intent: 'fitness', goal: null, fullBody: true, muscles: [], weekdays: null, minutes: null, equipment: null }; };
  assert.equal((await requestAssistant(f.deps, headers, ORIGIN, f.client().id, input)).status, 403);
  const store = f.gh.get(ASSISTANT_PATH) as AssistantStore;
  assert.equal(store.requests.length, 0); assert.equal(store.pending, undefined);
});
test('punishment/body distress and medical wording cannot create a draft through interpretation', async () => {
  const f = setup();
  const data = view(await requestAssistant(f.deps, headers, ORIGIN, f.client().id, { action: 'interpret', requestId: randomUUID(), text: 'Yediklerimi telafi etmek için ceza antrenmanı' }));
  assert.equal(data.interpreted?.intent, 'support'); assert.equal(data.drafts.length, 0); assert.equal(f.calls(), 0);
});
test('catalog muscle/equipment filters and unavailable health are respected; one workout has one day', () => {
  const f = setup();
  const chest = assistantProgram(f.context, { ...selection, fullBody: false, muscles: ['chest_lower'] }, 'workout', f.deps.id);
  assert.ok('body' in chest); assert.equal(chest.body!.phases[0]?.days.length, 1);
  const ids = chest.body!.phases.flatMap(p => p.days.flatMap(d => d.blocks.flatMap(b => b.rows.map(r => r.exerciseId))));
  assert.ok(ids.every(id => EXERCISES.get(id)!.primaryMuscles.includes('chest_lower')));
  assert.ok('error' in assistantProgram({ ...f.context, healthUnavailable: true }, selection, 'program', f.deps.id));
  assert.ok('error' in assistantProgram(f.context, { ...selection, conditions: { ...selection.conditions, equipment: ['cardio_machine'] } }, 'program', f.deps.id));
});
test('Gemini gets only current goal/labels, not records or history; fabricated values are rejected', async () => {
  const expected = { intent: 'fitness', goal: 'general_fitness', fullBody: true, muscles: [], weekdays: null, minutes: null, equipment: null };
  let payload: Record<string, unknown> = {};
  const mock = (value: unknown): typeof fetch => async (_url, init) => { payload = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(value) }] }] })); };
  assert.deepEqual(await interpretGoal('test-key', 'Fit olmak istiyorum', mock(expected)), expected);
  assert.equal(payload.store, false); const input = JSON.parse(payload.input as string); assert.deepEqual(Object.keys(input).sort(), ['muscleLabels', 'text']);
  assert.ok(!JSON.stringify(payload).includes('test-key'));
  await assert.rejects(interpretGoal('test-key', 'Fit', mock({ ...expected, equipment: ['invented'] })));
  await assert.rejects(interpretGoal('test-key', 'Fit', mock({ ...expected, minutes: 500 })));
});
test('PT attention notices require saved, currently shared program and unchanged permissions', async () => {
  const f = setup(), draft = await generate(f), body = { ...draft.body, name: draft.name, baseRevision: null };
  await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client');
  const raw = f.gh.get(ASSISTANT_PATH), own = f.gh.get(OWN_INDEX_PATH) as OwnIndex, hash = permissionHash(f.deps, f.client());
  assert.equal(assistantNotices(raw, hash, own, new Date(NOW)).length, 1);
  assert.deepEqual(assistantNotices(raw, 'changed', own, new Date(NOW)), []);
  assert.deepEqual(assistantNotices(raw, hash, { ...own, items: [] }, new Date(NOW)), []);
});
test('request reservation prevents concurrent duplicate generation and daily limit survives retention', async () => {
  const f = setup(), input = { action: 'generate', requestId: randomUUID(), kind: 'program', selection };
  const results = await Promise.allSettled([requestAssistant(f.deps, headers, ORIGIN, f.client().id, input), requestAssistant(f.deps, headers, ORIGIN, f.client().id, input)]);
  assert.ok(results.some(r => r.status === 'fulfilled' && r.value.status === 200));
  const store = f.gh.get(ASSISTANT_PATH) as AssistantStore; assert.equal(store.drafts.length, 1);
  const stored = await f.gh.repo.read(ASSISTANT_PATH);
  await f.gh.repo.write(ASSISTANT_PATH, { ...store, requests: Array.from({ length: 30 }, () => ({ id: randomUUID(), hash: 'x', at: NOW })) }, { sha: stored!.sha, message: 'Test limit' });
  assert.equal((await requestAssistant(f.deps, headers, ORIGIN, f.client().id, { action: 'review', requestId: randomUUID() })).status, 429);
});
test('drafts older than three days cannot be applied; invalid changed catalog rows are rejected', async () => {
  const f = setup(), draft = await generate(f), body = { ...draft.body, name: draft.name, baseRevision: null };
  f.deps.now = () => new Date('2026-10-09T12:00:00.000Z');
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client')).status, 412);
  f.deps.now = () => new Date(NOW);
  const changed = structuredClone(body); changed.phases[0]!.days[0]!.blocks[0]!.rows[0]!.exerciseId = 'removed-exercise';
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, changed, 'client')).status, 400);
  assert.equal(f.gh.get(OWN_INDEX_PATH), undefined);
});
test('editing an AI draft updates saved preview and attention to the actual weekdays', async () => {
  const f = setup(), draft = await generate(f);
  const body = { ...draft.body, name: 'Düzenlediğim program', weekdays: [1, 2], baseRevision: null };
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, body, 'client')).status, 201);
  const saved = view(await getAssistant(f.deps, f.client().id)).drafts[0]!;
  assert.equal(saved.name, body.name); assert.deepEqual(saved.body.weekdays, [1, 2]); assert.ok(saved.attention.some(t => /Ardışık/.test(t)));
  const own = f.gh.get(OWN_INDEX_PATH) as OwnIndex;
  const edited = { ...own, items: own.items.map(i => ({ ...i, clientEditedAt: '2026-10-06T12:00:00.000Z' })) };
  assert.deepEqual(assistantNotices(f.gh.get(ASSISTANT_PATH), permissionHash(f.deps, f.client()), edited, new Date('2026-10-06T12:00:00.000Z')), []);
});
test('ordinary fitness goal wording tanımla is not classified as a diagnosis', async () => {
  const f = setup(); f.deps.connection = async () => 'client';
  const response = view(await requestAssistant(f.deps, headers, ORIGIN, f.client().id, { action: 'interpret', requestId: randomUUID(), text: 'Fit olmak için hedefimi tanımla' }));
  assert.equal(response.interpreted?.intent, 'fitness'); assert.equal(f.calls(), 1);
});

test('PT editor saves the edited native program, including compound blocks, exactly once', async () => {
  const f = setup('pt'), draft = await generate(f), edited = structuredClone(draft.body);
  const day = edited.phases[0]!.days[0]!;
  const blocks = day.blocks.slice(0, 2);
  assert.equal(blocks.length, 2);
  day.blocks = [{ ...blocks[0]!, kind: 'superset', rows: blocks.flatMap(b => b.rows), restSeconds: 90 }, ...day.blocks.slice(2)];
  edited.weekdays = [2, 5];
  let published = 0;
  f.deps.publish = async (_id, proposal) => { assert.deepEqual(proposal.body, edited); published++; };
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, edited, 'pt')).status, 200);
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, edited, 'pt')).status, 200);
  assert.equal(published, 1);
  assert.deepEqual(view(await getAssistant(f.deps, f.client().id)).drafts[0]!.body, edited);
});
test('PT edited drafts reject unknown exercises or invalid blocks before publication', async () => {
  const f = setup('pt'), draft = await generate(f), edited = structuredClone(draft.body);
  let published = 0; f.deps.publish = async () => { published++; };
  edited.phases[0]!.days[0]!.blocks[0]!.rows[0]!.exerciseId = 'not-in-catalog';
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, edited, 'pt')).status, 400);
  assert.equal((await saveAssistantDraft(f.deps, headers, ORIGIN, f.client().id, draft.id, { phases: [] }, 'pt')).status, 400);
  assert.equal(published, 0);
});
