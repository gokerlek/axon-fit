import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addConstraint, constraintsOf } from './constraints.ts';
import { reportDeleteRoute, reportPatchRoute, reportPostRoute } from './me-constraint-routes.ts';
import { HEALTH_CONSENT_VERSION, type Client, type HealthField } from './schemas/client.ts';
import type { HealthRecord } from './schemas/health.ts';
import type { ClientSession } from './session-core.ts';
import type { SessionRouteDeps } from './session-routes.ts';
import { fakeSessionRepo } from './testing/fake-session-repo.ts';

const ORIGIN = 'https://pt.example.com';
const JSON_HEADERS = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
const NOW = new Date('2026-09-26T18:00:00.000Z');

function client(fields: HealthField[], consent: HealthField[] | null = fields, version = HEALTH_CONSENT_VERSION): Client {
  return {
    id: 'c_testolcm',
    name: 'Test',
    createdAt: '2026-09-01T10:00:00.000Z',
    status: 'active',
    modules: { health: { enabled: fields.length > 0, fields } },
    consents: consent ? { health: { granted: true, version, fields: consent, at: '2026-09-20T10:00:00.000Z' } } : {},
    access: { version: 1 },
    visibleTo: [],
  };
}
const SESSION: ClientSession = { role: 'client', clientId: 'c_testolcm', accessVersion: 1 };

function setup(files: Record<string, unknown>, who: Client) {
  const gh = fakeSessionRepo(files);
  const deps: SessionRouteDeps = {
    session: SESSION,
    loadClient: async () => who,
    repo: () => gh.repo,
    timeZone: async () => 'Europe/Istanbul',
    now: () => NOW,
    log: () => undefined,
  };
  return { gh, deps };
}

const report = { region: 'knee', side: 'left', type: 'injury', severity: 'moderate', since: 'week', triggers: ['squat'], note: 'Merdiven' };

describe('danışanın kısıt bildirimi', () => {
  test('onayla yazılır; kimlik ve tarih sunucudan; PT\'nin özeti düşer; eski ölçümler korunur', async () => {
    const existing: HealthRecord = { conditions: [], checkIns: [], measurements: [{ date: '2026-09-01', id: 'body_mass', value: 70 }], movementScreens: [] };
    const { gh, deps } = setup({ 'health.json': existing }, client(['conditions', 'measurements']));
    const result = await reportPostRoute(deps, JSON_HEADERS, ORIGIN, report);
    assert.equal(result.status, 201);
    const stored = gh.get('health.json') as HealthRecord;
    const [constraint] = constraintsOf(stored);
    assert.deepEqual([constraint?.source, constraint?.onset, constraint?.reportNote, constraint?.createdAt], ['client', '2026-09-26', 'Merdiven', NOW.toISOString()]);
    assert.match(constraint?.id ?? '', /^k_[a-z0-9]{6}$/);
    assert.deepEqual(stored.measurements, existing.measurements);
    assert.equal('conditions' in stored, false);
    assert.equal(gh.noticeDrops(), 1);
  });

  test('onay yoksa ya da kısıtların sürümü eskiyse 403; başka siteden 403; JSON değilse 415', async () => {
    const none = setup({}, client(['conditions'], null));
    assert.equal((await reportPostRoute(none.deps, JSON_HEADERS, ORIGIN, report)).status, 403);
    const old = setup({}, client(['conditions', 'check_in'], ['conditions', 'check_in'], '2026-09'));
    assert.equal((await reportPostRoute(old.deps, JSON_HEADERS, ORIGIN, report)).status, 403);
    const ok = setup({}, client(['conditions']));
    assert.equal((await reportPostRoute(ok.deps, new Headers({ origin: 'https://baska.site', 'content-type': 'application/json' }), ORIGIN, report)).status, 403);
    assert.equal((await reportPostRoute(ok.deps, new Headers({ origin: ORIGIN, 'content-type': 'text/plain' }), ORIGIN, report)).status, 415);
  });

  test('geçersiz gövde alan başına 400; çift bölgede taraf zorunlu', async () => {
    const { deps } = setup({}, client(['conditions']));
    const bad = await reportPostRoute(deps, JSON_HEADERS, ORIGIN, { ...report, severity: 'x' });
    assert.equal(bad.status, 400);
    assert.ok('severity' in (bad.body.fields as Record<string, string>));
    const noSide = await reportPostRoute(deps, JSON_HEADERS, ORIGIN, { ...report, side: undefined });
    assert.equal(noSide.status, 400);
  });

  test('bozuk dosya ezilmez', async () => {
    const { gh, deps } = setup({ 'health.json': { checkIns: 'bozuk' } }, client(['conditions']));
    const result = await reportPostRoute(deps, JSON_HEADERS, ORIGIN, report);
    assert.equal(result.status, 500);
    assert.deepEqual(gh.get('health.json'), { checkIns: 'bozuk' });
  });

  test('düzelt, geri çek; onaylıda kötüleşti hemen yazılır', async () => {
    const { gh, deps } = setup({}, client(['conditions']));
    await reportPostRoute(deps, JSON_HEADERS, ORIGIN, report);
    const id = constraintsOf(gh.get('health.json') as HealthRecord)[0]!.id;
    const edited = await reportPatchRoute(deps, JSON_HEADERS, ORIGIN, id, { action: 'edit', report: { ...report, severity: 'severe' } });
    assert.equal(edited.status, 200);
    assert.equal(constraintsOf(gh.get('health.json') as HealthRecord)[0]?.severity, 'severe');
    // Bekleyen bildirimde "kötüleşti" yok (etkin değil).
    assert.equal((await reportPatchRoute(deps, JSON_HEADERS, ORIGIN, id, { action: 'worse', severity: 'severe' })).status, 409);
    const withdrawn = await reportDeleteRoute(deps, new Headers({ origin: ORIGIN }), ORIGIN, id);
    assert.equal(withdrawn.status, 200);
    assert.equal(constraintsOf(gh.get('health.json') as HealthRecord).length, 0);

    const confirmed = addConstraint({ version: 2, checkIns: [], measurements: [] }, { region: 'lower_back', type: 'condition', severity: 'mild', avoid: [] }, { id: 'k_pppppp', now: NOW.toISOString() });
    const pt = setup({ 'health.json': confirmed }, client(['conditions']));
    assert.equal((await reportPatchRoute(pt.deps, JSON_HEADERS, ORIGIN, 'k_pppppp', { action: 'worse', severity: 'moderate' })).status, 200);
    assert.equal(constraintsOf(pt.gh.get('health.json') as HealthRecord)[0]?.severity, 'moderate');
    // PT'nin kaydını danışan geri çekemez.
    assert.equal((await reportDeleteRoute(pt.deps, new Headers({ origin: ORIGIN }), ORIGIN, 'k_pppppp')).status, 409);
    assert.equal((await reportDeleteRoute(pt.deps, new Headers({ origin: ORIGIN }), ORIGIN, 'bozuk')).status, 404);
  });
});
