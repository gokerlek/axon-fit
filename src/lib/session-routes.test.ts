import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubError } from './github/errors.ts';
import type { Client } from './schemas/client.ts';
import type { SessionDoc } from './schemas/session.ts';
import type { ClientSession } from './session-core.ts';
import { deleteRoute, finishRoute, getRoute, indexRoute, patchRoute, putRoute, type SessionRouteDeps } from './session-routes.ts';
import { fakeSessionRepo, type FakeSessionRepo } from './testing/fake-session-repo.ts';
import { at, programFile, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

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
const ID = 's_k2m9x4qa';

function jsonHeaders(origin = ORIGIN, type = 'application/json') {
  return new Headers({ origin, 'content-type': type });
}

function setup(options: { session?: ClientSession | null; client?: Client | null; gh?: FakeSessionRepo } = {}) {
  const gh = options.gh ?? fakeSessionRepo({ 'program.json': programFile() });
  const logs: string[] = [];
  const repos: string[] = [];
  const deps: SessionRouteDeps = {
    session: options.session === undefined ? SESSION : options.session,
    loadClient: async () => (options.client === undefined ? CLIENT : options.client),
    repo: (clientId) => {
      repos.push(clientId);
      return gh.repo;
    },
    timeZone: async () => 'Europe/Istanbul',
    now: () => new Date(at(60)),
    log: (message) => logs.push(message),
  };
  return { gh, deps, logs, repos };
}

const doc = (sets = [workingSet('st_aaaaaaaa', 3, { setIndex: 0, kg: 62.5 })]): SessionDoc =>
  sessionDoc({ entries: [sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets })] });

describe('antrenman uçları: kapı', () => {
  test('oturum yoksa ya da kayıt geçersizse 401; repo hiç açılmaz', async () => {
    for (const options of [{ session: null }, { client: null }]) {
      const { deps, repos, gh } = setup(options);
      const result = await putRoute(deps, jsonHeaders(), ORIGIN, ID, doc());
      assert.equal(result.status, 401);
      assert.equal(gh.commitCount(), 0);
      if (options.session === null) assert.deepEqual(repos, []);
    }
  });

  test('yalnız bu siteden ve JSON\'la; DELETE yalnız köken; bozuk kimlik 404', async () => {
    const { deps } = setup();
    assert.equal((await putRoute(deps, jsonHeaders('https://kotu.example'), ORIGIN, ID, doc())).status, 403);
    assert.equal((await putRoute(deps, jsonHeaders(ORIGIN, 'text/plain'), ORIGIN, ID, doc())).status, 415);
    assert.equal((await finishRoute(deps, new Headers({ referer: 'https://kotu.example/x', 'content-type': 'application/json' }), ORIGIN, ID, { doc: doc() })).status, 403);
    assert.equal((await deleteRoute(deps, new Headers(), ORIGIN, ID)).status, 403);
    assert.equal((await deleteRoute(deps, new Headers({ origin: ORIGIN }), ORIGIN, ID)).status, 200);
    assert.equal((await putRoute(deps, jsonHeaders(), ORIGIN, '../program', doc())).status, 404);
    assert.equal((await getRoute(deps, 's_KISA')).status, 404);
  });

  test('gövde şemadan geçer; kimlik adresle aynı olmalı', async () => {
    const { deps, gh } = setup();
    const bad = await putRoute(deps, jsonHeaders(), ORIGIN, ID, { ...doc(), entries: [{ id: 'x' }] });
    assert.equal(bad.status, 400);
    assert.ok(Object.keys(bad.body.fields as object).some((key) => key.startsWith('entries.0')));
    assert.equal((await putRoute(deps, jsonHeaders(), ORIGIN, 's_bbbbbbbb', doc())).status, 400);
    assert.equal((await putRoute(deps, jsonHeaders(), ORIGIN, ID, null)).status, 400);
    assert.equal(gh.commitCount(), 0);
  });
});

describe('antrenman uçları: akış', () => {
  test('oluştur (201) → güncelle (200) → aynısı (değişmedi) → bitir → bitmişe PUT 409 → sil → PUT 410', async () => {
    const { deps, gh, logs } = setup();
    const created = await putRoute(deps, jsonHeaders(), ORIGIN, ID, doc());
    assert.equal(created.status, 201);
    const two = doc([workingSet('st_aaaaaaaa', 3, { setIndex: 0, kg: 62.5 }), workingSet('st_bbbbbbbb', 5, { setIndex: 1, kg: 62.5 })]);
    assert.equal((await putRoute(deps, jsonHeaders(), ORIGIN, ID, two)).status, 200);
    const same = await putRoute(deps, jsonHeaders(), ORIGIN, ID, two);
    assert.deepEqual([same.status, same.body.unchanged], [200, true]);

    const finished = await finishRoute(deps, jsonHeaders(), ORIGIN, ID, { doc: two, rotation: 'keep' });
    assert.equal(finished.status, 200);
    assert.deepEqual(finished.body.rotation, { choice: 'keep', applied: false });
    assert.equal((finished.body.doc as SessionDoc).status, 'finished');

    const late = await putRoute(deps, jsonHeaders(), ORIGIN, ID, two);
    assert.deepEqual([late.status, late.body.reason], [409, 'finished']);
    assert.equal(((await getRoute(deps, ID)).body.doc as SessionDoc).status, 'finished');
    const list = await indexRoute(deps);
    assert.equal((list.body.index as { items: unknown[] }).items.length, 1);

    assert.equal((await deleteRoute(deps, new Headers({ origin: ORIGIN }), ORIGIN, ID)).status, 200);
    const gone = await putRoute(deps, jsonHeaders(), ORIGIN, ID, two);
    assert.deepEqual([gone.status, gone.body.reason], [410, 'deleted']);
    assert.equal((await getRoute(deps, ID)).status, 410);

    assert.deepEqual(gh.messages(), [
      'Set 1 · Bench Press · 62,5 kg × 10',
      'Set 2 · Bench Press · 62,5 kg × 10',
      'Antrenman bitti · Gün A · 2 set',
      'Kayıt silindi',
    ]);
    // Günlükte değer yok: yalnız iş ve kimlik.
    assert.equal(logs.some((line) => line.includes('kg') || line.includes('Bench')), false);
  });

  test('düzeltme: bitmişte set silme; olmayan antrenman 404', async () => {
    const { deps } = setup();
    await putRoute(deps, jsonHeaders(), ORIGIN, ID, doc());
    await finishRoute(deps, jsonHeaders(), ORIGIN, ID, { doc: doc() });
    const patched = await patchRoute(deps, jsonHeaders(), ORIGIN, ID, { writer: 'w_aaaaaa', deleteSetIds: ['st_aaaaaaaa'] });
    assert.equal(patched.status, 200);
    assert.deepEqual((patched.body.doc as SessionDoc).deletedSetIds, ['st_aaaaaaaa']);
    assert.equal((await patchRoute(deps, jsonHeaders(), ORIGIN, 's_bbbbbbbb', { writer: 'w_aaaaaa', deleteSetIds: ['st_aaaaaaaa'] })).status, 404);
    assert.equal((await patchRoute(deps, jsonHeaders(), ORIGIN, ID, { writer: 'w_aaaaaa' })).status, 400);
  });

  test('sağlık ayrıntısı onaysız: atılır, yanıt söyler', async () => {
    const { deps, gh } = setup();
    const result = await finishRoute(deps, jsonHeaders(), ORIGIN, ID, { doc: doc(), health: { skippedRows: [{ rowId: 'r_aaaaaa', reason: 'pain' }] } });
    assert.equal(result.body.health, 'dropped');
    assert.equal(gh.get('health.json'), undefined);
  });
});

describe('antrenman uçları: GitHub sınırı', () => {
  test('istek sınırı: 429 + Retry-After; Route Handler beklemez', async () => {
    const { deps, gh } = setup();
    gh.failNext('read', new GithubError('sessions: GitHub istek sınırı doldu', 429, { rateLimited: true, retryAfter: 42 }));
    const result = await putRoute(deps, jsonHeaders(), ORIGIN, ID, doc());
    assert.equal(result.status, 429);
    assert.equal(result.headers?.['Retry-After'], '42');
    assert.equal(result.body.retryAfter, 42);
  });

  test('başlık yoksa 60 sn; kota azaldıysa yanıtta slow', async () => {
    const { deps, gh } = setup();
    gh.failNext('read', new GithubError('ikincil sınır', 429, { rateLimited: true }));
    assert.equal((await putRoute(deps, jsonHeaders(), ORIGIN, ID, doc())).headers?.['Retry-After'], '60');
    gh.setRemaining(120);
    const slow = await putRoute(deps, jsonHeaders(), ORIGIN, ID, doc());
    assert.deepEqual([slow.status, slow.body.slow], [201, true]);
  });

  test('bitiş iki kez çakışırsa 503 + Retry-After; başka GitHub hatası 502', async () => {
    const { deps, gh } = setup();
    await putRoute(deps, jsonHeaders(), ORIGIN, ID, doc());
    const bump = () => gh.put('notes.json', { at: Math.random() });
    gh.onNext('commit', bump);
    gh.onNext('commit', bump);
    const busy = await finishRoute(deps, jsonHeaders(), ORIGIN, ID, { doc: doc() });
    assert.deepEqual([busy.status, busy.headers?.['Retry-After']], [503, '5']);

    gh.failNext('head', new GithubError('ulaşılamadı', 502));
    assert.equal((await finishRoute(deps, jsonHeaders(), ORIGIN, ID, { doc: doc() })).status, 502);
  });
});
