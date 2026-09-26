import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubError } from './github/errors.ts';
import type { Client } from './schemas/client.ts';
import type { SessionDoc } from './schemas/session.ts';
import type { ClientSession } from './session-core.ts';
import { fakeSessionRepo, type FakeSessionRepo } from './testing/fake-session-repo.ts';
import { at, DAY_A, DAY_B, programFile, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';
import { DEVICES, EXERCISES } from './testing/workout-fixtures.ts';
import { waterRoute, workoutRoute, type WorkoutResponse, type WorkoutRouteDeps } from './workout-routes.ts';

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
/** 26 Eylül 2026 cumartesi, İstanbul 19:00. */
const NOW = new Date('2026-09-26T16:00:00.000Z');

function setup(files: Record<string, unknown> = { 'program.json': programFile() }, options: { session?: ClientSession | null; gh?: FakeSessionRepo } = {}) {
  const gh = options.gh ?? fakeSessionRepo(files);
  const logs: string[] = [];
  const deps: WorkoutRouteDeps = {
    session: options.session === undefined ? SESSION : options.session,
    loadClient: async () => CLIENT,
    repo: () => gh.repo,
    timeZone: async () => 'Europe/Istanbul',
    now: () => NOW,
    log: (message) => logs.push(message),
    catalog: async () => ({ exercises: [...EXERCISES.values()], devices: [...DEVICES.values()] }),
  };
  return { gh, deps, logs };
}

let counter = 0;
function finished(id: string, startedAt: string, reps: number, water = 0): SessionDoc {
  const start = Date.parse(startedAt);
  return sessionDoc({
    id,
    status: 'finished',
    date: startedAt.slice(0, 10),
    startedAt,
    finishedAt: new Date(start + 45 * 60_000).toISOString(),
    waterTaps: Array.from({ length: water }, (_, index) => ({ id: `wt_${id.slice(2, 6)}${index}000`, d: 1 as const, at: startedAt })),
    entries: [
      sessionEntry(`e_${id.slice(2, 8)}`, {
        rowId: 'r_aaaaaa',
        status: 'done',
        sets: [0, 1, 2].map((index) =>
          workingSet(`st_${(++counter).toString(36).padStart(8, '0')}`, 0, { at: new Date(start + (index + 1) * 60_000).toISOString(), setIndex: index, kg: 60, reps, target: { min: 8, max: 10 } }),
        ),
      }),
    ],
  });
}

const body = (result: { body: Record<string, unknown> }) => result.body as unknown as WorkoutResponse;

describe('GET /api/me/workout', () => {
  test('geçmiş yoksa: sıradaki gün, ilk kez; hafta 0, su 0, yarım antrenman yok', async () => {
    const { deps } = setup();
    const result = await workoutRoute(deps, null);
    assert.equal(result.status, 200);
    const data = body(result);
    assert.equal(data.today, '2026-09-26');
    assert.equal(data.day?.dayId, DAY_A);
    assert.equal(data.day?.rows.r_aaaaaa?.plan.reason, 'first_time');
    assert.deepEqual(data.week, { done: 0, target: null });
    assert.deepEqual(data.water, { file: 0, sessions: 0 });
    assert.equal(data.active, null);
    assert.deepEqual(data.program?.days.map((day) => day.id), [DAY_A, DAY_B]);
    assert.equal(data.program?.nextDayId, DAY_A);
  });

  test('bitmiş antrenmanlardan: plan, "Önceki", bu hafta, bugünkü su (index dosyasız da onarılır)', async () => {
    const { deps } = setup({
      'program.json': programFile(),
      'sessions/s_aaaaaaaa.json': finished('s_aaaaaaaa', '2026-09-22T15:00:00.000Z', 9),
      'sessions/s_bbbbbbbb.json': finished('s_bbbbbbbb', '2026-09-26T06:00:00.000Z', 10, 2),
      'water.json': { version: 1, taps: [{ id: 'wt_zzzzzzzz', d: 1, at: '2026-09-26T09:00:00.000Z' }] },
    });
    const data = body(await workoutRoute(deps, null));
    const row = data.day?.rows.r_aaaaaa;
    assert.equal(row?.plan.reason, 'increase');
    assert.equal(row?.plan.topWeightKg, 62.5);
    assert.deepEqual(row?.lastTime.map((item) => item.value), [10, 10, 10]);
    assert.deepEqual(data.week, { done: 2, target: null });
    assert.deepEqual(data.water, { file: 1, sessions: 2 });
  });

  test('sunucudaki yarım antrenman döner; gün onun günü (istenen gün önce gelir)', async () => {
    const active = sessionDoc({
      id: 's_cccccccc',
      startedAt: '2026-09-26T15:00:00.000Z',
      program: { revision: 7, dayId: DAY_B, dayName: 'Gün B' },
    });
    const { deps } = setup({ 'program.json': programFile(), 'sessions/s_cccccccc.json': active });
    const data = body(await workoutRoute(deps, null));
    assert.equal(data.active?.id, 's_cccccccc');
    assert.equal(data.day?.dayId, DAY_B);
    assert.equal(body(await workoutRoute(deps, DAY_A)).day?.dayId, DAY_A);
    assert.equal(body(await workoutRoute(deps, '../x')).day?.dayId, DAY_B);
  });

  test('program yoksa gün yok; okunamıyorsa danışana dönük metin; bozuk su dosyası sayılmaz', async () => {
    const empty = body(await workoutRoute(setup({}).deps, null));
    assert.deepEqual([empty.program, empty.day, empty.problem], [null, null, undefined]);
    const gh = fakeSessionRepo({});
    gh.putText('program.json', '{ bozuk');
    gh.putText('water.json', '{ bozuk');
    const broken = body(await workoutRoute(setup({}, { gh }).deps, null));
    assert.equal(broken.day, null);
    assert.match(broken.problem ?? '', /açılamıyor/);
    assert.equal(broken.water.file, 0);
  });

  test('oturum yoksa 401; GitHub sınırı 429 + Retry-After', async () => {
    assert.equal((await workoutRoute(setup(undefined, { session: null }).deps, null)).status, 401);
    const { deps, gh } = setup();
    gh.failNext('head', new GithubError('sınır', 403, { rateLimited: true, retryAfter: 30 }));
    const limited = await workoutRoute(deps, null);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers?.['Retry-After'], '30');
  });
});

describe('POST /api/me/water', () => {
  const headers = (origin = ORIGIN, type = 'application/json') => new Headers({ origin, 'content-type': type });
  const tap = (id: string, at: string, d: 1 | -1 = 1) => ({ id, d, at });

  test('yalnız bu siteden ve JSON\'la; gövde şemadan geçer', async () => {
    const { deps, gh } = setup();
    assert.equal((await waterRoute(deps, headers('https://kotu.example'), ORIGIN, { taps: [] })).status, 403);
    assert.equal((await waterRoute(deps, headers(ORIGIN, 'text/plain'), ORIGIN, { taps: [] })).status, 415);
    assert.equal((await waterRoute(deps, headers(), ORIGIN, { taps: [] })).status, 400);
    assert.equal((await waterRoute(deps, headers(), ORIGIN, { taps: [{ id: 'x', d: 1, at: 'dün' }] })).status, 400);
    assert.equal(gh.commitCount(), 0);
  });

  test('dokunuşlar water.json\'a; aynısını yeniden göndermek yazmaz; yanıt bugünkü bardak', async () => {
    const { deps, gh } = setup();
    const taps = [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z'), tap('wt_bbbbbbbb', '2026-09-26T09:00:05.000Z')];
    const first = await waterRoute(deps, headers(), ORIGIN, { taps });
    assert.deepEqual([first.status, first.body.file], [200, 2]);
    assert.deepEqual(gh.messages(), ['Su · +2']);
    const again = await waterRoute(deps, headers(), ORIGIN, { taps });
    assert.deepEqual([again.status, again.body.file, again.body.unchanged], [200, 2, true]);
    assert.equal(gh.commitCount(), 1);
    const undo = await waterRoute(deps, headers(), ORIGIN, { taps: [tap('wt_cccccccc', '2026-09-26T09:01:00.000Z', -1)] });
    assert.equal(undo.body.file, 1);
    assert.deepEqual((gh.get('water.json') as { taps: unknown[] }).taps.length, 3);
  });

  test('çakışmada taze okuyup bir kez daha: başka sekmenin dokunuşu kaybolmaz', async () => {
    const { deps, gh } = setup();
    gh.onNext('write', () => gh.put('water.json', { version: 1, taps: [tap('wt_dddddddd', '2026-09-26T08:00:00.000Z')] }), 'water.json');
    const result = await waterRoute(deps, headers(), ORIGIN, { taps: [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z')] });
    assert.deepEqual([result.status, result.body.file], [200, 2]);
  });

  test('bozuk water.json ezilmez', async () => {
    const gh = fakeSessionRepo({});
    gh.putText('water.json', '{ bozuk');
    const { deps } = setup({}, { gh });
    const result = await waterRoute(deps, headers(), ORIGIN, { taps: [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z')] });
    assert.equal(result.status, 500);
    assert.equal(gh.commitCount(), 1);
  });
});
