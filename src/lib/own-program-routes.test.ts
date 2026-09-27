import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { OwnIndex } from './own-program-index.ts';
import { activeOwnRoute, deleteOwnRoute, saveOwnRoute, shareOwnRoute, type OwnRouteDeps } from './own-program-routes.ts';
import { OWN_INDEX_PATH, type OwnProgram } from './own-programs.ts';
import type { Client } from './schemas/client.ts';
import type { ClientSession } from './session-core.ts';
import { fakeSessionRepo, type FakeSessionRepo } from './testing/fake-session-repo.ts';
import { OWN_ID, ownProgram } from './testing/own-fixtures.ts';
import { at, programFile, sessionDoc } from './testing/session-fixtures.ts';
import { DEVICES, EXERCISES } from './testing/workout-fixtures.ts';

const ORIGIN = 'https://pt.example.com';
const CLIENT: Client = {
  id: 'c_testolcm',
  name: 'Test',
  createdAt: at(-10_000),
  status: 'active',
  modules: { health: { enabled: false, fields: [] } },
  consents: {},
  access: { version: 1 },
  visibleTo: [],
};
const SESSION: ClientSession = { role: 'client', clientId: CLIENT.id, accessVersion: 1 };
const PATH = `own-programs/${OWN_ID}.json`;

const headers = (origin = ORIGIN, type = 'application/json') => new Headers({ origin, 'content-type': type });

function setup(options: { session?: ClientSession | null; gh?: FakeSessionRepo } = {}) {
  const gh = options.gh ?? fakeSessionRepo({ 'program.json': programFile() });
  const deps: OwnRouteDeps = {
    session: options.session === undefined ? SESSION : options.session,
    loadClient: async () => CLIENT,
    repo: () => gh.repo,
    timeZone: async () => 'Europe/Istanbul',
    now: () => new Date(at(60)),
    log: () => undefined,
    library: async () => ({
      library: { exercises: EXERCISES, deviceIds: new Set(DEVICES.keys()) },
      ctx: { exercises: new Map([...EXERCISES.values()].map((item) => [item.id, { title: item.title, trackingType: item.trackingType }])), devices: new Map() },
    }),
  };
  return { gh, deps };
}

const program = ownProgram();
const createBody = (overrides: Record<string, unknown> = {}) => ({ name: 'Evde', currentPhaseId: program.current.phaseId, phases: program.phases, baseRevision: null, ...overrides });

describe('kendi program uçları: kapı', () => {
  test('köken, JSON, oturum; kalıba uymayan pid 404 (yol kurulmaz)', async () => {
    const { deps, gh } = setup();
    assert.equal((await saveOwnRoute(deps, headers('https://kotu.example'), ORIGIN, OWN_ID, createBody())).status, 403);
    assert.equal((await saveOwnRoute(deps, headers(ORIGIN, 'text/plain'), ORIGIN, OWN_ID, createBody())).status, 415);
    assert.equal((await saveOwnRoute(setup({ session: null }).deps, headers(), ORIGIN, OWN_ID, createBody())).status, 401);
    for (const pid of ['../program', 'op_ABCDEFGH', 'op_kisa', 'op_k2m9x4qa/../../x']) {
      assert.equal((await saveOwnRoute(deps, headers(), ORIGIN, pid, createBody())).status, 404);
      assert.equal((await deleteOwnRoute(deps, headers(), ORIGIN, pid)).status, 404);
      assert.equal((await shareOwnRoute(deps, headers(), ORIGIN, pid, { shared: true })).status, 404);
    }
    assert.equal((await deleteOwnRoute(deps, headers('https://kotu.example'), ORIGIN, OWN_ID)).status, 403);
    assert.equal(gh.commitCount(), 0);
  });
});

describe('kendi program uçları', () => {
  test('oluştur 201; ad eksikse 400; aynısı yeniden 200 unchanged; farklıysa 409 exists', async () => {
    const { deps, gh } = setup();
    assert.deepEqual((await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, createBody({ name: undefined }))).body.fields, { name: 'Ad gir.' });
    const created = await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, createBody());
    assert.equal(created.status, 201);
    assert.equal((gh.get(PATH) as OwnProgram).name, 'Evde');
    const again = await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, createBody());
    assert.deepEqual([again.status, again.body.unchanged], [200, true]);
    assert.equal((await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, createBody({ name: 'Başka' }))).status, 409);
  });

  test('eski sürümle kayıt 412', async () => {
    const { deps } = setup();
    await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, createBody());
    const phases = structuredClone(program.phases);
    phases[0]!.days[1]!.name = 'Karın';
    const stale = await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, { ...createBody({ phases }), baseRevision: 5 });
    assert.equal(stale.status, 412);
  });

  test('silme: yarım antrenman 409 (sessionId ile), sonra 200; yoksa 404', async () => {
    const { deps, gh } = setup();
    await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, createBody());
    const half = sessionDoc({ program: { revision: 1, dayId: 'd_ownaaa', dayName: 'Gün A', programId: OWN_ID } });
    gh.put(`sessions/${half.id}.json`, half);
    const blocked = await deleteOwnRoute(deps, headers(), ORIGIN, OWN_ID);
    assert.deepEqual([blocked.status, blocked.body.reason, blocked.body.sessionId], [409, 'active_session', half.id]);
    gh.remove(`sessions/${half.id}.json`);
    assert.equal((await deleteOwnRoute(deps, headers(), ORIGIN, OWN_ID)).status, 200);
    assert.equal((await deleteOwnRoute(deps, headers(), ORIGIN, OWN_ID)).status, 404);
  });

  test('paylaşım ve seçim; bilinmeyen program 404', async () => {
    const { deps, gh } = setup();
    await saveOwnRoute(deps, headers(), ORIGIN, OWN_ID, createBody());
    assert.deepEqual((await shareOwnRoute(deps, headers(), ORIGIN, OWN_ID, { shared: true })).body, { shared: true });
    assert.equal((await shareOwnRoute(deps, headers(), ORIGIN, OWN_ID, { shared: 'evet' })).status, 400);
    assert.equal((await activeOwnRoute(deps, headers(), ORIGIN, { programId: 'op_yokyok01' })).status, 404);
    assert.equal((await activeOwnRoute(deps, headers(), ORIGIN, { programId: OWN_ID })).status, 200);
    assert.equal((gh.get(OWN_INDEX_PATH) as OwnIndex).active?.programId, OWN_ID);
    assert.equal((await activeOwnRoute(deps, headers(), ORIGIN, { programId: '../x' })).status, 400);
  });
});
