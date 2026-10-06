import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EMPTY_CARE } from '../constraint-filter.ts';
import { AI_CONSENT_VERSION, type Client } from '../schemas/client.ts';
import { fakeSessionRepo } from '../testing/fake-session-repo.ts';
import { EXERCISES } from '../testing/workout-fixtures.ts';
import { askCoach, decideCoach, getCoach, type CoachDeps } from './coach-routes.ts';
import { createProgramRecord } from '../program-plan.ts';
import { answerCoach, coachProgramMatches, draftCoachProgram, eligibleExercises, type CoachContext } from './coach-engine.ts';
import { coachAccess, coachView, COACH_PATH, emptyCoach, type CoachData, type CoachStore } from './coach-contract.ts';
import { classifyCoachQuestion } from './coach-gemini.ts';

const NOW = '2026-10-05T12:00:00.000Z', ORIGIN = 'https://fit.example';
const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
const conditions = { weekdays: [1, 4], minutes: 45, equipment: ['barbell', 'bodyweight'] as ('barbell' | 'bodyweight')[] };
function setup(role: 'pt' | 'client' = 'client') {
  let client: Client = { id: 'c_coachtest', name: 'Test', status: 'active', createdAt: NOW, modules: { health: { enabled: false, fields: [] }, ai: { enabled: true } }, consents: { ai: { granted: true, version: AI_CONSENT_VERSION, at: NOW } }, access: { version: 1 }, visibleTo: [] };
  const gh = fakeSessionRepo(); let calls = 0, writes = 0, didPublish = false, sequence = 0;
  const context: CoachContext = { facts: [{ text: '3 antrenman', source: 'Antrenman geçmişi' }], exercises: [...EXERCISES.values()], care: EMPTY_CARE, today: '2026-10-05', existingExerciseIds: [], healthUnavailable: false };
  const deps: CoachDeps = {
    session: async () => ({ role, clientId: client.id }), client: async () => client, repo: () => gh.repo,
    connection: async () => role === 'client' ? 'client' : 'pt',
    context: async () => ({ context, hash: 'snapshot', baseRevision: null }),
    classify: async () => { calls++; return { intent: 'overview', exerciseIds: [] }; },
    publish: async () => { writes++; didPublish = true; }, published: async () => didPublish,
    hash: value => JSON.stringify(value), id: prefix => prefix ? `${prefix}_${(++sequence).toString(16).padStart(6, '0')}` : randomUUID(), now: () => new Date(NOW),
  };
  return { deps, gh, context, setClient: (value: Client) => { client = value; }, client: () => client, calls: () => calls, writes: () => writes };
}
const ask = (message = 'Nasıldı?', extra = {}) => ({ requestId: randomUUID(), message, ...extra });
const data = (result: Awaited<ReturnType<typeof getCoach>>) => result.body as unknown as CoachData;

test('AI gate requires PT enablement, not a separate AI consent, and closes for paused clients', () => {
  const f = setup();
  assert.equal(coachAccess({ ...f.client(), modules: { health: f.client().modules.health } }), 'off');
  assert.equal(coachAccess({ ...f.client(), consents: {} }), 'ready');
  assert.equal(coachAccess({ ...f.client(), consents: { ai: { granted: false, version: 'old', at: NOW } } }), 'ready');
  assert.equal(coachAccess({ ...f.client(), status: 'paused' }), 'off');
  assert.equal(coachAccess(f.client()), 'ready');
});
test('a client cannot access another client or make PT approval decisions', async () => {
  const f = setup();
  assert.equal((await getCoach(f.deps, 'c_anotherone')).status, 403);
  assert.equal((await askCoach(f.deps, headers, ORIGIN, 'c_anotherone', ask())).status, 403);
  assert.equal((await decideCoach(f.deps, headers, ORIGIN, f.client().id, { id: randomUUID(), action: 'approve' })).status, 403);
  assert.equal(f.gh.commitCount(), 0); assert.equal(f.calls(), 0);
});
test('blocked origin and disabled AI prevent provider calls and record writes', async () => {
  const f = setup();
  assert.equal((await askCoach(f.deps, new Headers({ origin: 'https://evil.example' }), ORIGIN, f.client().id, ask())).status, 403);
  f.setClient({ ...f.client(), modules: { ...f.client().modules, ai: { enabled: false } } });
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, ask())).status, 403);
  assert.equal(f.gh.commitCount(), 0); assert.equal(f.calls(), 0);
});
test('PT and client threads are separate', () => {
  const store: CoachStore = { ...emptyCoach(), pt: [{ id: 'pt-message', requestHash: 'a', at: NOW, question: 'PT private', answer: 'x', sources: [] }] };
  assert.deepEqual(coachView(store, 'client').messages, []);
  assert.equal(coachView(store, 'pt').messages[0]?.question, 'PT private');
});
test('retrying the same completed request does not call the provider again; conflicting body is rejected', async () => {
  const f = setup(), request = ask();
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, request)).status, 200);
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, request)).status, 200);
  assert.equal(f.calls(), 1);
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, { ...request, message: 'Başka' })).status, 409);
});
test('revocation during provider call discards reply and releases the reservation', async () => {
  const f = setup(); f.deps.classify = async () => { f.setClient({ ...f.client(), modules: { ...f.client().modules, ai: { enabled: false } } }); return { intent: 'overview', exerciseIds: [] }; };
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, ask())).status, 403);
  const store = (await f.gh.repo.read(COACH_PATH))?.content as CoachStore;
  assert.equal(store.client.length, 0); assert.equal(store.pending, undefined);
});
test('missing Gemini connection does not generate pretend AI replies', async () => {
  const f = setup(); f.deps.connection = async () => null;
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, ask())).status, 409);
  assert.equal(f.calls(), 0); assert.equal(f.gh.commitCount(), 0);
});
test('program request asks for missing conditions without guessing them', async () => {
  const f = setup(); f.deps.classify = async () => ({ intent: 'plan', exerciseIds: [] });
  const result = data(await askCoach(f.deps, headers, ORIGIN, f.client().id, ask()));
  assert.match(result.messages[0]!.answer, /kaç dakika/); assert.equal(result.proposals.length, 0); assert.equal(f.writes(), 0);
});
test('new program is a draft until PT approves; retries do not publish twice', async () => {
  const f = setup('pt');
  const request = ask('Program', { conditions, makePlan: true });
  const response = data(await askCoach(f.deps, headers, ORIGIN, f.client().id, request));
  assert.equal(response.proposals.length, 1); assert.equal(f.writes(), 0);
  const proposal = response.proposals[0]!;
  assert.equal(proposal.status, 'pending');
  const result = data(await decideCoach(f.deps, headers, ORIGIN, f.client().id, { id: proposal.id, action: 'approve' }));
  assert.equal(result.proposals[0]?.status, 'approved'); assert.equal(f.writes(), 1);
  await decideCoach(f.deps, headers, ORIGIN, f.client().id, { id: proposal.id, action: 'approve' });
  assert.equal(f.writes(), 1);
});
test('rejecting a draft never changes the program', async () => {
  const f = setup('pt');
  const proposal = data(await askCoach(f.deps, headers, ORIGIN, f.client().id, ask('Program', { conditions, makePlan: true }))).proposals[0]!;
  const result = data(await decideCoach(f.deps, headers, ORIGIN, f.client().id, { id: proposal.id, action: 'reject' }));
  assert.equal(result.proposals[0]?.status, 'rejected'); assert.equal(f.writes(), 0);
});
test('changed context blocks a stale draft approval', async () => {
  const f = setup('pt');
  const proposal = data(await askCoach(f.deps, headers, ORIGIN, f.client().id, ask('Program', { conditions, makePlan: true }))).proposals[0]!;
  f.deps.context = async () => ({ context: f.context, hash: 'changed', baseRevision: null });
  assert.equal((await decideCoach(f.deps, headers, ORIGIN, f.client().id, { id: proposal.id, action: 'approve' })).status, 412);
  assert.equal(f.writes(), 0);
});
test('sensitive/body-concern response cannot generate a plan, even with explicit plan flag', async () => {
  const f = setup(); f.deps.classify = async () => ({ intent: 'support', exerciseIds: [] });
  const result = data(await askCoach(f.deps, headers, ORIGIN, f.client().id, ask('Ceza olarak antrenman', { conditions, makePlan: true })));
  assert.equal(result.proposals.length, 0); assert.match(result.messages[0]!.answer, /bir ceza/);
});
test('unavailable health or unavailable equipment stops the draft; numbers stay in application rules', () => {
  const f = setup();
  assert.deepEqual(eligibleExercises({ ...f.context, healthUnavailable: true }, conditions), []);
  assert.ok('error' in draftCoachProgram({ ...f.context, healthUnavailable: true }, conditions, [], f.deps.id));
  assert.ok('error' in draftCoachProgram(f.context, { ...conditions, equipment: ['cardio_machine'] }, [], f.deps.id));
  const result = draftCoachProgram(f.context, conditions, [], f.deps.id);
  assert.ok('body' in result);
  assert.equal(result.body.phases[0]?.days.length, 2);
  assert.ok(result.body.phases[0]?.days.every(d => d.blocks.every(b => b.rows.every(row => row.sets.length === 2))));
});
test('facts are rendered from records; empty measurements are not invented', () => {
  const f = setup();
  assert.match(answerCoach({ intent: 'overview', exerciseIds: [] }, f.context).answer, /3 antrenman/);
  assert.match(answerCoach({ intent: 'measurement', exerciseIds: [] }, f.context).answer, /kayıt henüz yok/);
});
test('Gemini adapter is stateless, does not put the key in URL, and rejects invented exercise IDs', async () => {
  let seen: RequestInit | undefined, address = '';
  const fake = (async (url: string | URL | Request, options?: RequestInit) => { address = String(url); seen = options; return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ intent: 'progress', exerciseIds: ['bench'] }) }] }] }); }) as typeof fetch;
  const result = await classifyCoachQuestion('synthetic-key', 'Bench nasıldı?', [{ id: 'bench', title: 'Bench' }], [], fake);
  assert.equal(result.intent, 'progress'); assert.ok(!address.includes('synthetic-key'));
  assert.equal(JSON.parse(String(seen?.body)).store, false);
  await assert.rejects(() => classifyCoachQuestion('synthetic-key', 'Soru', [], [], fake), /katalogda olmayan/);
});

test('simultaneous asks reserve one provider call and leave no in-flight lock', async () => {
  const f = setup();
  let started!: () => void, finish!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const release = new Promise<void>(resolve => { finish = resolve; });
  f.deps.classify = async () => { started(); await release; return { intent: 'overview', exerciseIds: [] }; };
  const first = askCoach(f.deps, headers, ORIGIN, f.client().id, ask());
  await entered;
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, ask())).status, 409);
  finish();
  assert.equal((await first).status, 200);
  const store = (await f.gh.repo.read(COACH_PATH))?.content as CoachStore;
  assert.equal(store.client.length, 1); assert.equal(store.pending, undefined);
});
test('publication interrupted after program save recovers without publishing again', async () => {
  const f = setup('pt');
  const proposal = data(await askCoach(f.deps, headers, ORIGIN, f.client().id, ask('Program', { conditions, makePlan: true }))).proposals[0]!;
  let saves = 0, published = false;
  f.deps.publish = async () => { saves++; published = true; throw new Error('Synthetic interrupted response'); };
  f.deps.published = async () => published;
  await assert.rejects(() => decideCoach(f.deps, headers, ORIGIN, f.client().id, { id: proposal.id, action: 'approve' }));
  const result = data(await decideCoach(f.deps, headers, ORIGIN, f.client().id, { id: proposal.id, action: 'approve' }));
  assert.equal(result.proposals[0]?.status, 'approved'); assert.equal(saves, 1);
});

test('published-program recovery compares the real stored shape with the form draft', () => {
  const f = setup();
  const draft = draftCoachProgram(f.context, conditions, [], f.deps.id);
  assert.ok('body' in draft);
  const stored = createProgramRecord(draft.body, new Date(NOW));
  assert.equal(coachProgramMatches(stored, draft.body), true);
  assert.equal(coachProgramMatches({ ...stored, schedule: { weekdays: [2] } }, draft.body), false);
});
test('health-field revocation during classification discards a previously read response', async () => {
  const f = setup();
  f.deps.classify = async () => { f.setClient({ ...f.client(), modules: { ...f.client().modules, health: { enabled: false, fields: ['conditions'] } } }); return { intent: 'overview', exerciseIds: [] }; };
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, ask())).status, 403);
  const store = (await f.gh.repo.read(COACH_PATH))?.content as CoachStore;
  assert.equal(store.client.length, 0);
});

test('punishment and pain requests cannot become programs even if provider would classify them as plans', async () => {
  const f = setup();
  f.deps.classify = async () => { throw new Error('Sensitive request should be handled locally'); };
  for (const message of ['Yediklerimi telafi etmek için ceza antrenmanı yap', 'Diz ağrısına tedavi programı hazırla']) {
    const result = data(await askCoach(f.deps, headers, ORIGIN, f.client().id, ask(message, { conditions, makePlan: true })));
    assert.equal(result.proposals.length, 0);
  }
});
test('general-roster permission changes discard the pending answer', async () => {
  const f = setup('pt');
  f.context.global = true;
  f.deps.permissionsUnchanged = async () => false;
  assert.equal((await askCoach(f.deps, headers, ORIGIN, f.client().id, ask())).status, 403);
  const stored = (await f.gh.repo.read(COACH_PATH))?.content as CoachStore;
  assert.equal(stored.pt.length, 0); assert.equal(stored.pending, undefined);
});
