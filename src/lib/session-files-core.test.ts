import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubError } from './github/errors.ts';
import { HEALTH_CONSENT_VERSION, type Client } from './schemas/client.ts';
import type { SessionDoc, SessionIndex } from './schemas/session.ts';
import { deleteSession, finishSession, patchSession, putSession, readIndex, readSession } from './session-files-core.ts';
import { tombstoneOf, withDeletions } from './session-merge.ts';
import { fakeSessionRepo } from './testing/fake-session-repo.ts';
import { at, DAY_A, programFile, sessionDoc, sessionEntry, W1, W2, workingSet } from './testing/session-fixtures.ts';

const ctx = { now: new Date(at(60)), timeZone: 'Europe/Istanbul' };
const client: Pick<Client, 'modules' | 'consents'> = { modules: { health: { enabled: false, fields: [] } }, consents: {} };
const PATH = 'sessions/s_k2m9x4qa.json';
const INDEX = 'sessions-index.json';

const set = (id: string, minute: number, index: number, extra: Partial<ReturnType<typeof workingSet>> = {}) =>
  workingSet(id, minute, { setIndex: index, plannedSetCount: 3, target: { min: 8, max: 10 }, ...extra });

/** Gün A'nın belgesi: Bench (r_aaaaaa) ve Leg Press (r_bbbbbb). */
function doc(bench: ReturnType<typeof workingSet>[], leg: ReturnType<typeof workingSet>[] = [], overrides: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({
    entries: [
      sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: bench }),
      sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press', sets: leg }),
    ],
    ...overrides,
  });
}

const s1 = set('st_aaaaaaa1', 3, 0);
const s2 = set('st_aaaaaaa2', 6, 1, { reps: 9 });
const s3 = set('st_aaaaaaa3', 9, 2, { reps: 8 });
const l1 = set('st_bbbbbbb1', 14, 0, { plannedSetCount: 2 });
const l2 = set('st_bbbbbbb2', 17, 1, { plannedSetCount: 2 });

describe('PUT', () => {
  test('ilk set dosyayı açar (tek yazma); aynı belge yeniden gelirse hiç yazılmaz', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    const created = await putSession(gh.repo, ctx, doc([s1]));
    assert.equal(created.status, 'created');
    assert.deepEqual(gh.messages(), ['Set 1/3 · Bench Press · 60 kg × 10']);
    assert.equal((gh.get(PATH) as SessionDoc).date, '2026-09-26');

    const again = await putSession(gh.repo, ctx, { ...doc([s1]), writer: W2 });
    assert.equal(again.status, 'unchanged');
    assert.equal(gh.commitCount(), 1);
  });

  test('ikinci anlık görüntü: fazladan set ve silme birleşir, tek commit, değersiz silme notu', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, doc([s1, s2]));
    const second = withDeletions(doc([s1, s2, s3, set('st_aaaaaaa4', 11, 3, { extra: true })]), { setIds: ['st_aaaaaaa2'] });
    const result = await putSession(gh.repo, ctx, second);
    assert.equal(result.status, 'saved');
    assert.equal(gh.commitCount(), 2);
    assert.equal(gh.messages()[1], 'Set 4 (fazladan) · Bench Press · 60 kg × 10 (+1 set) · kayıt silindi');
    const stored = gh.get(PATH) as SessionDoc;
    assert.deepEqual(stored.entries[0]?.sets.map((item) => item.id), ['st_aaaaaaa1', 'st_aaaaaaa3', 'st_aaaaaaa4']);
    assert.deepEqual(stored.deletedSetIds, ['st_aaaaaaa2']);
  });

  test('geç gelen eski anlık görüntü (keepalive) yeniyi ezmez, silineni geri getirmez', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, withDeletions(doc([s1, s3]), { setIds: ['st_aaaaaaa2'] }));
    const stale = await putSession(gh.repo, ctx, doc([s1, s2]));
    assert.equal(stale.status, 'unchanged');
    assert.equal(gh.commitCount(), 1);
  });

  test('çakışma: arada başka cihaz yazdı → taze okuyup bir kez daha birleştirir', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, doc([s1]));
    gh.onNext('write', async () => {
      // Öteki telefon aynı anda Leg Press'in setini yazdı.
      gh.put(PATH, { ...(gh.get(PATH) as SessionDoc), entries: doc([s1], [l1]).entries }, 'Set 1/2 · Leg Press · 60 kg × 10');
    });
    const result = await putSession(gh.repo, ctx, doc([s1, s2]));
    assert.equal(result.status, 'saved');
    const stored = gh.get(PATH) as SessionDoc;
    assert.deepEqual(stored.entries.flatMap((entry) => entry.sets.map((item) => item.id)), ['st_aaaaaaa1', 'st_aaaaaaa2', 'st_bbbbbbb1']);
    // İlk yazma, çakışan deneme, yeniden deneme.
    assert.equal(gh.calls.filter((call) => call.startsWith('write')).length, 3);
  });

  test('iki cihaz aynı anda: ikisinin setleri de kalır', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, doc([s1]));
    await Promise.all([putSession(gh.repo, ctx, doc([s1, s2])), putSession(gh.repo, ctx, { ...doc([s1], [l1]), writer: W2 })]);
    const stored = gh.get(PATH) as SessionDoc;
    assert.equal(stored.entries.flatMap((entry) => entry.sets).length, 3);
  });

  test('bitmiş dosya 409 ve değişmez; silinmiş 410; iz dosyası kaybolsa da index\'teki silinmiş kimlik diriltilmez', async () => {
    const finished = { ...doc([s1]), status: 'finished' as const, finishedAt: at(50) };
    const gh = fakeSessionRepo({ [PATH]: finished });
    const result = await putSession(gh.repo, ctx, doc([s1, s2]));
    assert.equal(result.status, 'finished');
    assert.equal(gh.commitCount(), 0);

    const gone = fakeSessionRepo({ [PATH]: tombstoneOf('s_k2m9x4qa', new Date(at(55))) });
    assert.deepEqual(await putSession(gone.repo, ctx, doc([s1])), { status: 'deleted' });

    const index: SessionIndex = { version: 1, items: [], deleted: [{ id: 's_k2m9x4qa', at: at(55) }] };
    const lost = fakeSessionRepo({ [INDEX]: index });
    assert.deepEqual(await putSession(lost.repo, ctx, doc([s1])), { status: 'deleted' });
    assert.equal(lost.commitCount(), 0);
  });

  test('bozuk dosyanın üzerine yazılmaz (500)', async () => {
    const gh = fakeSessionRepo();
    gh.putText(PATH, '{"yarım');
    await assert.rejects(putSession(gh.repo, ctx, doc([s1])), (error: unknown) => error instanceof GithubError && error.status === 500);
    gh.put(PATH, { id: 's_k2m9x4qa', status: 'active' });
    await assert.rejects(putSession(gh.repo, ctx, doc([s1])), (error: unknown) => error instanceof GithubError && error.status === 500);
  });
});

describe('bitiş', () => {
  test('TEK commit: seans + index + program; index sha dosyanınki; yeniden deneme no-op', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await putSession(gh.repo, ctx, doc([s1, s2, s3], [l1]));
    const before = gh.commitCount();
    const result = await finishSession(gh.repo, { ...ctx, client }, { doc: { ...doc([s1, s2, s3], [l1, l2]), status: 'finished', finishedAt: at(55) } });
    assert.equal(result.status, 'finished');
    assert.equal(gh.commitCount(), before + 1);
    assert.deepEqual(gh.lastChanged(), [PATH, 'program.json', INDEX].sort());
    assert.equal(gh.messages().at(-1), 'Antrenman bitti · Gün A · 5 set');
    const index = gh.get(INDEX) as SessionIndex;
    assert.equal(index.items[0]?.sha, gh.sha(PATH));
    assert.equal((gh.get('program.json') as ReturnType<typeof programFile>).rotation.lastDayId, DAY_A);

    const again = await finishSession(gh.repo, { ...ctx, client }, { doc: doc([s1, s2, s3], [l1, l2]) });
    assert.equal(again.status, 'already');
    assert.equal(gh.commitCount(), before + 1);
    // Bitmişe PUT 409.
    assert.equal((await putSession(gh.repo, ctx, doc([s1]))).status, 'finished');
  });

  test('çevrimdışı bitiş: dosya hiç yoksa bitiş ilk ve tek yazmadır', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await finishSession(gh.repo, { ...ctx, client }, { doc: doc([s1, s2, s3], [l1, l2]) });
    assert.equal(gh.commitCount(), 1);
    assert.equal((gh.get(PATH) as SessionDoc).status, 'finished');
  });

  test('arada dal ilerledi (PT programı kaydetti): baştan bir kez, PT\'nin kaydı korunur', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await putSession(gh.repo, ctx, doc([s1, s2, s3], [l1, l2]));
    gh.onNext('commit', () => {
      gh.put('program.json', { ...programFile(), revision: 8, updatedAt: at(58) }, 'Program düzenlendi');
    });
    const result = await finishSession(gh.repo, { ...ctx, client }, { doc: doc([s1, s2, s3], [l1, l2]) });
    assert.equal(result.status, 'finished');
    const program = gh.get('program.json') as ReturnType<typeof programFile>;
    assert.equal(program.revision, 8);
    assert.equal(program.rotation.lastDayId, DAY_A);
    assert.deepEqual(gh.messages().slice(-2), ['Program düzenlendi', 'Antrenman bitti · Gün A · 5 set']);
  });

  test('iki kez çakışırsa 409 ve bekleme süresi; hiçbir dosya yarım yazılmaz', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await putSession(gh.repo, ctx, doc([s1]));
    const bump = () => gh.put('notes.json', { at: Math.random() }, 'Araya giren');
    gh.onNext('commit', bump);
    gh.onNext('commit', bump);
    await assert.rejects(
      finishSession(gh.repo, { ...ctx, client }, { doc: doc([s1]) }),
      (error: unknown) => error instanceof GithubError && error.status === 409 && error.retryAfter === 5,
    );
    assert.equal((gh.get(PATH) as SessionDoc).status, 'active');
  });

  test('index onarımı bitişe biner: satırı olmayan eski antrenman da yazılır', async () => {
    const old = { ...sessionDoc({ id: 's_oldoldol', startedAt: at(-3000) }), status: 'finished' as const, finishedAt: at(-2950) };
    const gh = fakeSessionRepo({ 'sessions/s_oldoldol.json': old, 'program.json': programFile() });
    await finishSession(gh.repo, { ...ctx, client }, { doc: doc([s1, s2, s3], [l1, l2]) });
    const index = gh.get(INDEX) as SessionIndex;
    assert.deepEqual(index.items.map((row) => row.id), ['s_k2m9x4qa', 's_oldoldol']);
  });

  test('sağlık ayrıntısı onay yoksa atılır, health.json oluşmaz', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    const result = await finishSession(gh.repo, { ...ctx, client }, { doc: doc([s1]), health: { adjustReason: 'pain' } });
    assert.equal(result.status === 'finished' && result.plan.health, 'dropped');
    assert.equal(gh.get('health.json'), undefined);

    const consenting: Pick<Client, 'modules' | 'consents'> = {
      modules: { health: { enabled: true, fields: ['check_in'] } },
      consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['check_in'], at: at(-100) } },
    };
    const other = fakeSessionRepo({ 'program.json': programFile() });
    await finishSession(other.repo, { ...ctx, client: consenting }, { doc: doc([s1]), health: { adjustReason: 'pain' } });
    assert.equal(other.commitCount(), 1);
    assert.deepEqual((other.get('health.json') as { checkIns: unknown[] }).checkIns, [{ date: '2026-09-26', sessionId: 's_k2m9x4qa', adjustReason: 'pain' }]);
  });

  test('bozuk JSON health.json boş kayıtla ezilmez: sağlık ayrıntısı yazılmaz, seans yine biter', async () => {
    const consenting: Pick<Client, 'modules' | 'consents'> = {
      modules: { health: { enabled: true, fields: ['check_in'] } },
      consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['check_in'], at: at(-100) } },
    };
    const gh = fakeSessionRepo();
    gh.putText('health.json', '{"conditions":[');
    const before = gh.sha('health.json');
    const result = await finishSession(gh.repo, { ...ctx, client: consenting }, { doc: doc([s1]), health: { adjustReason: 'pain' } });
    assert.equal(result.status === 'finished' && result.plan.health, 'broken');
    assert.equal(gh.sha('health.json'), before);
    assert.deepEqual(gh.lastChanged(), [PATH, INDEX].sort());
    assert.equal((gh.get(PATH) as SessionDoc).status, 'finished');
  });
});

describe('birleşim şemayı bozarsa yazılmaz (422)', () => {
  const rejected = (error: unknown) => error instanceof GithubError && error.status === 422;
  /** Bench'in `count` ayrı seti; kimlikler `prefix` harfiyle ayrışır. */
  const many = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => workingSet(`st_${prefix}${String(i).padStart(7, '0')}`, i, { setIndex: i }));

  test('var olan set kimliği başka harekette gelirse 422; dosya değişmez', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, doc([s1]));
    const before = gh.sha(PATH);
    await assert.rejects(putSession(gh.repo, ctx, doc([], [{ ...s1 }])), rejected);
    assert.equal(gh.sha(PATH), before);
    assert.equal(gh.commitCount(), 1);
    assert.equal((await readSession(gh.repo, 's_k2m9x4qa')).status, 'ok');
  });

  test('iki anlık görüntü bir harekette 60 set eder (sınır 40): ikincisi 422', async () => {
    const gh = fakeSessionRepo();
    assert.equal((await putSession(gh.repo, ctx, doc(many('c', 30)))).status, 'created');
    await assert.rejects(putSession(gh.repo, ctx, doc(many('d', 30))), rejected);
    assert.equal((gh.get(PATH) as SessionDoc).entries[0]?.sets.length, 30);
    assert.equal((await readSession(gh.repo, 's_k2m9x4qa')).status, 'ok');
  });

  test('silinen hareket izleri 200\'ü aşarsa PATCH 422; önceki düzeltmeler kalır', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, doc([s1]));
    const entryIds = (batch: number) => Array.from({ length: 60 }, (_, i) => `e_${batch}${String(i).padStart(5, '0')}`);
    for (const batch of [1, 2, 3]) {
      assert.equal((await patchSession(gh.repo, ctx, 's_k2m9x4qa', { writer: W1, deleteEntryIds: entryIds(batch) })).status, 'saved');
    }
    const before = gh.sha(PATH);
    await assert.rejects(patchSession(gh.repo, ctx, 's_k2m9x4qa', { writer: W1, deleteEntryIds: entryIds(4) }), rejected);
    assert.equal(gh.sha(PATH), before);
    assert.equal((gh.get(PATH) as SessionDoc).deletedEntryIds.length, 180);
  });
});

describe('geçmişte düzeltme ve silme', () => {
  async function finishedRepo() {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await finishSession(gh.repo, { ...ctx, client }, { doc: doc([s1, s2, s3], [l1, l2]) });
    return gh;
  }

  test('bitmiş seansta set silme: dosya ve index satırı tek commit, genel mesaj', async () => {
    const gh = await finishedRepo();
    const before = gh.commitCount();
    const result = await patchSession(gh.repo, ctx, 's_k2m9x4qa', { writer: W1, deleteSetIds: ['st_aaaaaaa2'] });
    assert.equal(result.status, 'saved');
    assert.equal(gh.commitCount(), before + 1);
    assert.deepEqual(gh.lastChanged(), [PATH, INDEX].sort());
    assert.equal(gh.messages().at(-1), 'Kayıt silindi');
    const index = gh.get(INDEX) as SessionIndex;
    assert.equal(index.items[0]?.sha, gh.sha(PATH));
    assert.equal(index.items[0]?.sets, 4);
    // Aynı istek yeniden: değişiklik yok.
    assert.equal((await patchSession(gh.repo, ctx, 's_k2m9x4qa', { writer: W1, deleteSetIds: ['st_aaaaaaa2'] })).status, 'unchanged');
    assert.equal(gh.commitCount(), before + 1);
  });

  test('etkin seansta düzeltme tek dosya yazar', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, doc([s1, s2]));
    await patchSession(gh.repo, ctx, 's_k2m9x4qa', { writer: W1, waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(20) }] });
    assert.deepEqual(gh.messages(), ['Set 2/3 · Bench Press · 60 kg × 9 (+1 set)', 'Su güncellendi']);
    assert.equal(gh.get(INDEX), undefined);
  });

  test('antrenmanı silme: iz dosyası + index tek commit; sonra PUT 410, okuma "silinmiş", ikinci silme no-op', async () => {
    const gh = await finishedRepo();
    const before = gh.commitCount();
    assert.deepEqual(await deleteSession(gh.repo, ctx, 's_k2m9x4qa'), { status: 'deleted' });
    assert.equal(gh.commitCount(), before + 1);
    assert.equal(gh.messages().at(-1), 'Kayıt silindi');
    assert.deepEqual(gh.get(PATH), { version: 1, id: 's_k2m9x4qa', status: 'deleted', deletedAt: at(60) });
    const index = gh.get(INDEX) as SessionIndex;
    assert.deepEqual([index.items.length, index.deleted], [0, [{ id: 's_k2m9x4qa', at: at(60) }]]);
    assert.deepEqual(gh.invalidated, ['s_k2m9x4qa']);

    assert.deepEqual(await putSession(gh.repo, ctx, doc([s1])), { status: 'deleted' });
    assert.deepEqual(await readSession(gh.repo, 's_k2m9x4qa'), { status: 'deleted' });
    assert.deepEqual(await patchSession(gh.repo, ctx, 's_k2m9x4qa', { writer: W1, deleteSetIds: ['st_aaaaaaa1'] }), { status: 'deleted' });
    assert.deepEqual(await deleteSession(gh.repo, ctx, 's_k2m9x4qa'), { status: 'already' });
    assert.equal(gh.commitCount(), before + 1);
    // Silinmiş antrenmanın değerleri dosyada yok (git geçmişinde kalır; metin bunu söyler).
    assert.equal(JSON.stringify(gh.get(PATH)).includes('Bench'), false);
  });

  test('şemaya uymayan dosya da silinir: iz dosyası yazılır', async () => {
    const gh = fakeSessionRepo({ [PATH]: { id: 's_k2m9x4qa', status: 'active' } });
    assert.deepEqual(await deleteSession(gh.repo, ctx, 's_k2m9x4qa'), { status: 'deleted' });
    assert.deepEqual(gh.get(PATH), { version: 1, id: 's_k2m9x4qa', status: 'deleted', deletedAt: at(60) });
    assert.deepEqual((gh.get(INDEX) as SessionIndex).deleted, [{ id: 's_k2m9x4qa', at: at(60) }]);
    assert.deepEqual(await readSession(gh.repo, 's_k2m9x4qa'), { status: 'deleted' });
  });

  test('geçmiş listesi onarılır ama yazılmaz', async () => {
    const gh = fakeSessionRepo();
    await putSession(gh.repo, ctx, doc([s1]));
    const result = await readIndex(gh.repo);
    assert.deepEqual(result.index.items.map((row) => [row.id, row.finishedAt]), [['s_k2m9x4qa', undefined]]);
    assert.equal(result.changed, true);
    assert.equal(gh.commitCount(), 1);
  });
});
