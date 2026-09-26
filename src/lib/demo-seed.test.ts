import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { demoSessionId, generateDemoHistory, isDemoSessionId, isDemoTapId, type DemoHistory } from './demo-history.ts';
import { demoSeedGate, HEALTH_PATH, isDemoClientName, parseSeedRequest, planDemoSeed, seedDemoHistory, SEED_MESSAGE, type SeedState } from './demo-seed.ts';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { GithubError } from './github/errors.ts';
import type { HealthField } from './schemas/client.ts';
import type { HealthRecord } from './schemas/health.ts';
import { emptySessionIndex, sessionPath, SESSIONS_INDEX_PATH, type SessionDoc, type SessionIndex } from './schemas/session.ts';
import { readIndex } from './session-files-core.ts';
import { indexRowOf, removeIndexRow, upsertIndexRow } from './session-index.ts';
import { tombstoneOf } from './session-merge.ts';
import { DEMO_DEVICES, DEMO_EXERCISES, DEMO_NOW, DEMO_TZ, demoClient, demoProgram } from './testing/demo-fixtures.ts';
import { fakeSessionRepo } from './testing/fake-session-repo.ts';
import { sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';
import { WATER_PATH, type WaterFile } from './water.ts';

function history(options: { weeks?: number; seed?: string | number; fields?: HealthField[] } = {}): DemoHistory {
  return generateDemoHistory({
    program: demoProgram(),
    exercises: DEMO_EXERCISES,
    devices: DEMO_DEVICES,
    client: demoClient(options.fields ?? ['readiness', 'check_in']),
    now: DEMO_NOW,
    timeZone: DEMO_TZ,
    weeks: options.weeks ?? 3,
    seed: options.seed ?? 1,
  });
}

const three = history();
const two = history({ weeks: 2 });

/** Danışanın kendi (deneme olmayan) bitmiş antrenmanı, bugünden önce. */
const own: SessionDoc = sessionDoc({
  id: 's_k2m9x4qa',
  status: 'finished',
  date: '2026-09-26',
  startedAt: '2026-09-26T15:00:00.000Z',
  finishedAt: '2026-09-26T15:40:00.000Z',
  entries: [sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', status: 'done', sets: [workingSet('st_aaaaaaa1', 3, { setIndex: 0 })] })],
});
const ownIndex = (): SessionIndex => upsertIndexRow(emptySessionIndex(), indexRowOf(own, gitBlobSha(jsonText(own))));
const ownWater: WaterFile = { version: 1, taps: [{ id: 'wt_aaaaaaaa', d: 1, at: '2026-09-26T08:00:00.000Z' }] };
const ownHealth: HealthRecord = {
  conditions: [],
  toleranceMode: 'pain_free',
  checkIns: [{ date: '2026-09-26', sessionId: 's_k2m9x4qa', painBaseline: 1, redFlag: 'none' }],
  measurements: [{ date: '2026-09-20', id: 'waist_girth', value: 80 }],
  movementScreens: [],
};

describe('deneme geçmişi: kapı', () => {
  test('ad "Test " ile başlamalı (büyük harf ve boşlukla)', () => {
    for (const [name, allowed] of [
      ['Test Ali', true],
      ['Test  Veli', true],
      ['Test', false],
      ['test Ali', false],
      ['Testo Ali', false],
      [' Test Ali', false],
      ['Gizem gonca', false],
      ['TEST Ali', false],
    ] as const) {
      assert.equal(isDemoClientName(name), allowed, name);
    }
  });

  test('sıra: üretimde her şey 404, sonra PT oturumu, sonra danışan, sonra ad', () => {
    const cases = [
      { input: { production: true, pt: true, client: { name: 'Test Ali' } }, expected: { ok: false, status: 404 } },
      { input: { production: true, pt: false }, expected: { ok: false, status: 404 } },
      { input: { production: false, pt: false, client: { name: 'Test Ali' } }, expected: { ok: false, status: 403 } },
      { input: { production: false, pt: true }, expected: { ok: true } },
      { input: { production: false, pt: true, client: null }, expected: { ok: false, status: 404 } },
      { input: { production: false, pt: true, client: { name: 'Gizem gonca' } }, expected: { ok: false, status: 403 } },
      { input: { production: false, pt: true, client: { name: 'Test Ali' } }, expected: { ok: true } },
    ];
    for (const item of cases) {
      const result = demoSeedGate(item.input);
      assert.equal(result.ok, item.expected.ok, JSON.stringify(item.input));
      if (!result.ok) assert.equal(result.status, item.expected.status, JSON.stringify(item.input));
    }
  });

  test('istek: JSON ya da form alanları; boş alan verilmemiş sayılır', () => {
    const cases: [Record<string, unknown>, ReturnType<typeof parseSeedRequest>][] = [
      [{ clientId: 'c_test0001' }, { clientId: 'c_test0001' }],
      [{ clientId: 'c_test0001', weeks: 8, seed: 3 }, { clientId: 'c_test0001', weeks: 8, seed: '3' }],
      [{ clientId: 'c_test0001', weeks: '12', seed: 'Ali' }, { clientId: 'c_test0001', weeks: 12, seed: 'Ali' }],
      [{ clientId: 'c_test0001', weeks: '', seed: '' }, { clientId: 'c_test0001' }],
      // Gerileme senaryosu: form onay kutusu "on", JSON'da true; başka değer kapalı.
      [{ clientId: 'c_test0001', declining: 'on' }, { clientId: 'c_test0001', declining: true }],
      [{ clientId: 'c_test0001', declining: true }, { clientId: 'c_test0001', declining: true }],
      [{ clientId: 'c_test0001', declining: false }, { clientId: 'c_test0001', declining: false }],
      [{ clientId: 'c_test0001', declining: 'evet' }, { clientId: 'c_test0001', declining: false }],
      [{ clientId: 'c_test0001', weeks: '0' }, null],
      [{ clientId: 'c_test0001', weeks: 53 }, null],
      [{ clientId: 'c_test0001', weeks: 'on iki' }, null],
      [{ clientId: 'c_test0001', weeks: 4.5 }, null],
      [{ clientId: '../app' }, null],
      [{}, null],
    ];
    for (const [input, expected] of cases) assert.deepEqual(parseSeedRequest(input), expected, JSON.stringify(input));
  });
});

describe('deneme geçmişi: plan', () => {
  const empty: SeedState = { index: emptySessionIndex(), indexSha: null, sessionFiles: [], water: null, health: null };

  test('boş depo: bütün antrenmanlar, index, su ve (onaylıysa) sağlık; silme yok', () => {
    const plan = planDemoSeed(three, empty);
    const paths = plan.files.map((file) => file.path);
    assert.equal(paths.filter((path) => path.startsWith('sessions/')).length, three.sessions.length);
    for (const path of [SESSIONS_INDEX_PATH, WATER_PATH, HEALTH_PATH]) assert.ok(paths.includes(path), path);
    assert.deepEqual(plan.deletions, []);
    assert.deepEqual([plan.changed, plan.water, plan.health], [true, 'written', 'written']);
  });

  test('danışanın kendi kayıtları kalır, deneme kayıtları yenileriyle değişir, artık üretilmeyenler silinir', () => {
    const staleId = demoSessionId(999);
    const stale = { ...three.sessions[0]!, id: staleId };
    const index = removeIndexRow(upsertIndexRow(upsertIndexRow(ownIndex(), indexRowOf(stale, 'a'.repeat(40))), indexRowOf(three.sessions[1]!, 'b'.repeat(40))), demoSessionId(998), DEMO_NOW);
    const state: SeedState = {
      index,
      indexSha: 'c'.repeat(40),
      sessionFiles: [
        { path: sessionPath(own.id), sha: 'd'.repeat(40) },
        { path: sessionPath(staleId), sha: 'a'.repeat(40) },
        { path: sessionPath(demoSessionId(998)), sha: 'e'.repeat(40) },
      ],
      water: { file: { version: 1, taps: [...ownWater.taps, { id: 'wt_demozzzz', d: 1, at: '2026-09-01T08:00:00.000Z' }] }, sha: 'f'.repeat(40) },
      health: { record: { ...ownHealth, checkIns: [...ownHealth.checkIns, { date: '2026-09-01', sessionId: staleId, painPeak: 2 }] }, sha: '0'.repeat(40) },
    };
    const plan = planDemoSeed(three, state);
    assert.deepEqual(plan.deletions.sort(), [sessionPath(staleId), sessionPath(demoSessionId(998))].sort());

    const written = new Map(plan.files.map((file) => [file.path, file.content]));
    const nextIndex = written.get(SESSIONS_INDEX_PATH) as SessionIndex;
    assert.deepEqual(nextIndex.items.filter((row) => !isDemoSessionId(row.id)).map((row) => row.id), [own.id]);
    assert.deepEqual(new Set(nextIndex.items.filter((row) => isDemoSessionId(row.id)).map((row) => row.id)), new Set(three.sessions.map((doc) => doc.id)));
    assert.deepEqual(nextIndex.deleted, []);

    const water = written.get(WATER_PATH) as WaterFile;
    assert.ok(water.taps.some((tap) => tap.id === 'wt_aaaaaaaa'));
    assert.ok(!water.taps.some((tap) => tap.id === 'wt_demozzzz'));
    assert.equal(water.taps.filter((tap) => isDemoTapId(tap.id)).length, three.waterTaps.length);

    const health = written.get(HEALTH_PATH) as HealthRecord;
    assert.deepEqual(health.measurements, ownHealth.measurements);
    assert.equal(health.toleranceMode, 'pain_free');
    assert.deepEqual(health.checkIns.filter((item) => !isDemoSessionId(item.sessionId ?? '')), ownHealth.checkIns);
    assert.equal(health.checkIns.filter((item) => isDemoSessionId(item.sessionId ?? '')).length, three.checkIns.length);
  });

  test('bozuk water.json ve health.json ezilmez; onay yoksa sağlık dosyasına dokunulmaz', () => {
    for (const [water, health, expected] of [
      ['broken', 'broken', ['broken', 'broken']],
      ['broken', 'skipped', ['broken', 'no_consent']],
      [null, 'skipped', ['written', 'no_consent']],
    ] as const) {
      const plan = planDemoSeed(three, { ...empty, water, health });
      assert.deepEqual([plan.water, plan.health], expected);
      const paths = plan.files.map((file) => file.path);
      assert.equal(paths.includes(WATER_PATH), expected[0] === 'written');
      assert.equal(paths.includes(HEALTH_PATH), false);
    }
  });

  test('aynı durumda yeniden: değişiklik yok (yazılan her dosya zaten depoda)', () => {
    const first = planDemoSeed(three, empty);
    const content = new Map(first.files.map((file) => [file.path, file.content]));
    const sha = (path: string) => gitBlobSha(jsonText(content.get(path)));
    const again = planDemoSeed(three, {
      index: content.get(SESSIONS_INDEX_PATH) as SessionIndex,
      indexSha: sha(SESSIONS_INDEX_PATH),
      sessionFiles: [...content.keys()].filter((path) => path.startsWith('sessions/')).map((path) => ({ path, sha: sha(path) })),
      water: { file: content.get(WATER_PATH) as WaterFile, sha: sha(WATER_PATH) },
      health: { record: content.get(HEALTH_PATH) as HealthRecord, sha: sha(HEALTH_PATH) },
    });
    assert.deepEqual([again.changed, again.files, again.deletions, again.water, again.health], [false, [], [], 'unchanged', 'unchanged']);
  });
});

describe('deneme geçmişi: depoya yazım', () => {
  function seededRepo() {
    return fakeSessionRepo({
      [sessionPath(own.id)]: own,
      [SESSIONS_INDEX_PATH]: ownIndex(),
      [WATER_PATH]: ownWater,
      [HEALTH_PATH]: ownHealth,
      'program.json': { any: 'program' },
    });
  }

  test('tek commit; danışanın antrenmanı, suyu, yoklaması ve programı yerinde; uygulamanın onarımı bir şey bulmaz', async () => {
    const gh = seededRepo();
    const result = await seedDemoHistory(gh.repo, three, { health: true });
    assert.equal(result.status, 'seeded');
    assert.equal(gh.commitCount(), 1);
    assert.equal(gh.messages()[0], `${SEED_MESSAGE} · ${three.sessions.length} antrenman`);
    assert.deepEqual([result.written, result.removed, result.water, result.health], [three.sessions.length, 0, 'written', 'written']);
    assert.deepEqual(gh.get(sessionPath(own.id)), own);
    assert.deepEqual(gh.get('program.json'), { any: 'program' });
    assert.ok((gh.get(WATER_PATH) as WaterFile).taps.some((tap) => tap.id === 'wt_aaaaaaaa'));
    assert.deepEqual((gh.get(HEALTH_PATH) as HealthRecord).measurements, ownHealth.measurements);
    for (const doc of three.sessions) assert.deepEqual(gh.get(sessionPath(doc.id)), doc);

    const repaired = await readIndex(gh.repo);
    assert.equal(repaired.changed, false);
    assert.deepEqual(repaired.rebuilt, []);
    assert.equal(repaired.index.items.length, three.sessions.length + 1);
  });

  test('aynı geçmiş yeniden: commit yok; daha kısa geçmiş: fazlası aynı commit\'te silinir', async () => {
    const gh = seededRepo();
    await seedDemoHistory(gh.repo, three, { health: true });
    const again = await seedDemoHistory(gh.repo, three, { health: true });
    assert.equal(again.status, 'unchanged');
    assert.equal(gh.commitCount(), 1);

    const shorter = await seedDemoHistory(gh.repo, two, { health: true });
    assert.equal(shorter.status, 'seeded');
    assert.equal(gh.commitCount(), 2);
    const gone = three.sessions.filter((doc) => !two.sessions.some((item) => item.id === doc.id)).map((doc) => doc.id);
    assert.ok(gone.length > 0);
    assert.equal(shorter.removed, gone.length);
    for (const id of gone) assert.equal(gh.get(sessionPath(id)), undefined);
    assert.deepEqual(gh.invalidated.sort(), [...gone].sort());
    const index = gh.get(SESSIONS_INDEX_PATH) as SessionIndex;
    assert.equal(index.items.length, two.sessions.length + 1);
    assert.deepEqual(index.deleted, []);
    const health = gh.get(HEALTH_PATH) as HealthRecord;
    assert.ok(!health.checkIns.some((item) => gone.includes(item.sessionId ?? '')));
    assert.equal((await readIndex(gh.repo)).changed, false);
  });

  test('uygulamada silinmiş deneme antrenmanı yeniden tohumlamada geri gelir (iz dosyası ve silinmişler listesi temizlenir)', async () => {
    const gh = seededRepo();
    await seedDemoHistory(gh.repo, three, { health: true });
    const victim = three.sessions[2]!.id;
    const index = removeIndexRow(gh.get(SESSIONS_INDEX_PATH) as SessionIndex, victim, DEMO_NOW);
    gh.put(sessionPath(victim), tombstoneOf(victim, DEMO_NOW));
    gh.put(SESSIONS_INDEX_PATH, index);

    const result = await seedDemoHistory(gh.repo, three, { health: true });
    assert.equal(result.status, 'seeded');
    assert.deepEqual(gh.get(sessionPath(victim)), three.sessions[2]);
    const next = gh.get(SESSIONS_INDEX_PATH) as SessionIndex;
    assert.deepEqual(next.deleted, []);
    assert.ok(next.items.some((row) => row.id === victim));
  });

  test('onay yoksa health.json okunmaz ve yazılmaz; bozuk water.json ezilmez', async () => {
    const gh = seededRepo();
    gh.putText(WATER_PATH, '{ bozuk');
    const plain = history({ fields: [] });
    const result = await seedDemoHistory(gh.repo, plain, { health: false });
    assert.deepEqual([result.water, result.health], ['broken', 'no_consent']);
    assert.ok(!gh.calls.some((call) => call.includes(HEALTH_PATH)));
    assert.deepEqual(gh.get(HEALTH_PATH), ownHealth);
    assert.deepEqual(gh.lastChanged().filter((path) => !path.startsWith('sessions')), []);
    const raw = await gh.repo.read(WATER_PATH).catch((error: unknown) => error);
    assert.ok(raw instanceof GithubError && raw.status === 500);
  });

  test('çakışma: arada dal ilerlediyse bir kez baştan (araya giren yazma korunur)', async () => {
    const gh = seededRepo();
    gh.onNext('commit', () => gh.put('program.json', { any: 'changed' }, 'PT kaydı'));
    const result = await seedDemoHistory(gh.repo, three, { health: true });
    assert.equal(result.status, 'seeded');
    assert.deepEqual(gh.messages(), ['PT kaydı', `${SEED_MESSAGE} · ${three.sessions.length} antrenman`]);
    assert.deepEqual(gh.get('program.json'), { any: 'changed' });
  });
});
