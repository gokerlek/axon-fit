import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInContextRoute, checkInPostRoute, type CheckInResponse } from './check-in-routes.ts';
import { GithubError } from './github/errors.ts';
import { HEALTH_CONSENT_VERSION, type Client, type HealthField } from './schemas/client.ts';
import type { HealthRecord } from './schemas/health.ts';
import type { SessionDoc } from './schemas/session.ts';
import type { SessionRouteDeps } from './session-routes.ts';
import type { ClientSession } from './session-core.ts';
import { fakeSessionRepo } from './testing/fake-session-repo.ts';
import { sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const ORIGIN = 'https://pt.example.com';
const JSON_HEADERS = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
/** 26 Eylül 2026 cumartesi, İstanbul 21:00. */
const NOW = new Date('2026-09-26T18:00:00.000Z');

function client(fields: HealthField[], consent: HealthField[] | null = fields): Client {
  return {
    id: 'c_testolcm',
    name: 'Test',
    createdAt: '2026-09-01T10:00:00.000Z',
    status: 'active',
    modules: { health: { enabled: fields.length > 0, fields } },
    consents: consent ? { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: consent, at: '2026-09-20T10:00:00.000Z' } } : {},
    access: { version: 1 },
    visibleTo: [],
  };
}
const SESSION: ClientSession = { role: 'client', clientId: 'c_testolcm', accessVersion: 1 };

function setup(files: Record<string, unknown>, who: Client) {
  const gh = fakeSessionRepo(files);
  const logs: string[] = [];
  const deps: SessionRouteDeps = {
    session: SESSION,
    loadClient: async () => who,
    repo: () => gh.repo,
    timeZone: async () => 'Europe/Istanbul',
    now: () => NOW,
    log: (message) => logs.push(message),
  };
  return { gh, deps, logs };
}

const health = (checkIns: HealthRecord['checkIns'], extra: Partial<HealthRecord> = {}): HealthRecord => ({
  conditions: [],
  checkIns,
  measurements: [],
  movementScreens: [],
  ...extra,
});

function finished(id: string, minutesAgo: number, effort?: SessionDoc['effort']): SessionDoc {
  const end = NOW.getTime() - minutesAgo * 60_000;
  return sessionDoc({
    id,
    status: 'finished',
    date: '2026-09-26',
    startedAt: new Date(end - 45 * 60_000).toISOString(),
    finishedAt: new Date(end).toISOString(),
    entries: [sessionEntry(`e_${id.slice(2, 8)}`, { rowId: 'r_aaaaaa', status: 'done', sets: [workingSet(`st_${id.slice(2, 10)}`, 1, { at: new Date(end - 30 * 60_000).toISOString() })] })],
    ...(effort ? { effort } : {}),
  });
}

const body = (result: { body: Record<string, unknown> }) => result.body as unknown as CheckInResponse;

describe('GET /api/me/check-in', () => {
  test('onay yoksa health.json okunmaz bile; sorulacak parça yok', async () => {
    const { gh, deps } = setup({ 'health.json': health([{ date: '2026-09-25', painBaseline: 4 }]) }, client(['readiness', 'check_in'], null));
    const result = await checkInContextRoute(deps);
    assert.equal(result.status, 200);
    const data = body(result);
    assert.deepEqual([data.parts, data.history, data.broken, data.after], [{ readiness: false, pain: false }, [], false, null]);
    assert.ok(!gh.calls.some((call) => call.includes('health.json')));
  });

  test('onaylı: bugün, tavan, ağrı geçmişi, önceki antrenman ve ağrılı hareketler', async () => {
    const file = health(
      [
        { date: '2026-09-20', painBaseline: 1 },
        { date: '2026-09-24', sessionId: 's_aaaaaaaa', painBaseline: 3, painPeak: 5, painRows: ['r_aaaaaa'] },
      ],
      { toleranceMode: 'pain_monitoring' },
    );
    const data = body(await checkInContextRoute(setup({ 'health.json': file }, client(['readiness', 'check_in'])).deps));
    assert.equal(data.today, '2026-09-26');
    assert.deepEqual(data.parts, { readiness: true, pain: true });
    assert.equal(data.mode, 'pain_monitoring');
    assert.deepEqual(data.history, [{ date: '2026-09-20', painBaseline: 1 }, { date: '2026-09-24', painBaseline: 3 }]);
    assert.deepEqual(data.previous, { date: '2026-09-24', painPeak: 5, rows: ['r_aaaaaa'] });
    assert.deepEqual(data.painRows, ['r_aaaaaa']);
  });

  test('bozuk health.json: yoklama geçmişsiz, `broken`; Bugün durmaz', async () => {
    const { gh, deps, logs } = setup({}, client(['readiness']));
    gh.putText('health.json', '{ bozuk');
    const data = body(await checkInContextRoute(deps));
    assert.deepEqual([data.broken, data.parts.readiness, data.history], [true, true, []]);
    assert.ok(logs.some((line) => line.includes('okunamadı')));
    gh.put('health.json', { checkIns: 'yanlış' });
    assert.equal(body(await checkInContextRoute(deps)).broken, true);
  });

  test('antrenman sonrası kart: son 24 saatte biten, zorluğu olmayan; onaydan bağımsız', async () => {
    const files = { 'sessions/s_aaaaaaaa.json': finished('s_aaaaaaaa', 90), 'sessions/s_bbbbbbbb.json': finished('s_bbbbbbbb', 30) };
    const data = body(await checkInContextRoute(setup(files, client([])).deps));
    assert.equal(data.after?.sessionId, 's_bbbbbbbb');
    assert.equal(data.after?.durationMin, 45);
    assert.deepEqual(data.after?.exercises, [{ rowId: 'r_aaaaaa', title: 'Bench Press' }]);
    const answered = { 'sessions/s_bbbbbbbb.json': finished('s_bbbbbbbb', 30, { sessionRpe: 7, updatedAt: NOW.toISOString() }) };
    assert.equal(body(await checkInContextRoute(setup(answered, client([])).deps)).after, null);
    const old = { 'sessions/s_bbbbbbbb.json': finished('s_bbbbbbbb', 24 * 60 + 5) };
    assert.equal(body(await checkInContextRoute(setup(old, client([])).deps)).after, null);
  });
});

describe('POST /api/me/check-in', () => {
  const readiness = { sleep: 2, energy: 3, soreness: 3, stress: 3 };

  test('yazar: onaylı alanlar, sunucunun günü, genel commit mesajı; dosya ilk yazımda oluşur', async () => {
    const { gh, deps, logs } = setup({}, client(['readiness', 'check_in']));
    const result = await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { sessionId: 's_aaaaaaaa', readiness, redFlag: 'none', adjustReason: 'readiness' });
    assert.equal(result.status, 200);
    assert.deepEqual(gh.get('health.json'), {
      conditions: [],
      checkIns: [{ date: '2026-09-26', sessionId: 's_aaaaaaaa', readiness, redFlag: 'none', adjustReason: 'readiness' }],
      measurements: [],
      movementScreens: [],
    });
    assert.deepEqual(gh.messages(), ['Yoklama kaydedildi']);
    // Günlükte değer yok.
    assert.ok(logs.every((line) => !line.includes('none') && !line.includes('readiness')));
  });

  test('onayın kapsamadığı alan atılır; hiçbiri kalmazsa 403, yazma yok', async () => {
    const { gh, deps } = setup({}, client(['readiness']));
    await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { sessionId: 's_aaaaaaaa', readiness, painBaseline: 6, redFlag: 'night_pain' });
    assert.deepEqual((gh.get('health.json') as HealthRecord).checkIns, [{ date: '2026-09-26', sessionId: 's_aaaaaaaa', readiness }]);
    const denied = await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { sessionId: 's_aaaaaaaa', painPeak: 6 });
    assert.deepEqual([denied.status, denied.body.reason], [403, 'consent']);
    const none = setup({}, client([]));
    assert.equal((await checkInPostRoute(none.deps, JSON_HEADERS, ORIGIN, { readiness })).status, 403);
    assert.equal(none.gh.commitCount(), 0);
  });

  test('aynı antrenmanın kaydına biner (antrenman sonrası ağrı); aynısı yeniden gelirse yazma yok', async () => {
    const file = health([{ date: '2026-09-25', sessionId: 's_aaaaaaaa', readiness }]);
    const { gh, deps } = setup({ 'health.json': file }, client(['readiness', 'check_in']));
    await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { sessionId: 's_aaaaaaaa', painPeak: 5, painRows: ['r_aaaaaa'] });
    assert.deepEqual((gh.get('health.json') as HealthRecord).checkIns, [{ date: '2026-09-25', sessionId: 's_aaaaaaaa', readiness, painPeak: 5, painRows: ['r_aaaaaa'] }]);
    const again = await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { sessionId: 's_aaaaaaaa', painPeak: 5, painRows: ['r_aaaaaa'] });
    assert.deepEqual([again.status, again.body.unchanged, gh.commitCount()], [200, true, 1]);
  });

  test('çakışmada taze okuyup bir kez daha (araya ölçüm yazıldı; ikisi de kalır)', async () => {
    const { gh, deps } = setup({ 'health.json': health([]) }, client(['readiness', 'measurements']));
    gh.onNext('write', () => gh.put('health.json', health([], { measurements: [{ date: '2026-09-26', id: 'waist_girth', value: 80 }] })), 'health.json');
    const result = await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { readiness });
    assert.equal(result.status, 200);
    const stored = gh.get('health.json') as HealthRecord;
    assert.deepEqual([stored.measurements.length, stored.checkIns.length], [1, 1]);
  });

  test('bozuk dosya ezilmez: 500', async () => {
    const { gh, deps } = setup({}, client(['readiness']));
    gh.putText('health.json', '{ bozuk');
    const result = await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { readiness });
    assert.deepEqual([result.status, result.body.reason], [500, 'broken']);
    assert.equal(gh.commitCount(), 1);
  });

  test('geçersiz gövde 400; kimliksiz alan yoksa 400; başka köken 403; JSON değilse 415', async () => {
    const { deps } = setup({}, client(['readiness']));
    assert.equal((await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { readiness: { ...readiness, sleep: 6 } })).status, 400);
    assert.equal((await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { sessionId: 's_aaaaaaaa' })).status, 400);
    assert.equal((await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { readiness, date: '2020-01-01' })).status, 200);
    assert.equal((await checkInPostRoute(deps, new Headers({ origin: 'https://kotu.example.com', 'content-type': 'application/json' }), ORIGIN, { readiness })).status, 403);
    assert.equal((await checkInPostRoute(deps, new Headers({ origin: ORIGIN, 'content-type': 'text/plain' }), ORIGIN, { readiness })).status, 415);
  });

  test('GitHub sınırı: 429 + Retry-After (veri telefonda kalır)', async () => {
    const { gh, deps } = setup({}, client(['readiness']));
    gh.failNext('write', new GithubError('sınır', 403, { rateLimited: true, retryAfter: 30 }), 'health.json');
    const result = await checkInPostRoute(deps, JSON_HEADERS, ORIGIN, { readiness });
    assert.deepEqual([result.status, result.headers?.['Retry-After']], [429, '30']);
  });
});
