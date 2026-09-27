import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubError } from './github/errors.ts';
import { deleteOwnProgram, readOwnState, saveOwnProgram, scheduleOwnProgram, selectOwnActive, shareOwnProgram, type OwnGuard } from './own-program-files.ts';
import type { OwnIndex } from './own-program-index.ts';
import { OWN_INDEX_PATH, type OwnProgram } from './own-programs.ts';
import type { DiffContext } from './program-diff.ts';
import type { OwnProgramSaveBody } from './schemas/own-program.ts';
import { fakeSessionRepo } from './testing/fake-session-repo.ts';
import { OWN_ID, ownProgram } from './testing/own-fixtures.ts';
import { at, programFile, sessionDoc } from './testing/session-fixtures.ts';
import { DEVICES, EXERCISES } from './testing/workout-fixtures.ts';

const NOW = new Date('2026-09-27T10:00:00.000Z');
const PATH = `own-programs/${OWN_ID}.json`;
const library = { exercises: EXERCISES, deviceIds: new Set(DEVICES.keys()) };
const ctx: DiffContext = {
  exercises: new Map([...EXERCISES.values()].map((exercise) => [exercise.id, { title: exercise.title, trackingType: exercise.trackingType }])),
  devices: new Map(),
};

function createBody(overrides: Partial<OwnProgramSaveBody> = {}): OwnProgramSaveBody {
  const program = ownProgram();
  return { name: 'Evde', currentPhaseId: program.current.phaseId, phases: program.phases, baseRevision: null, ...overrides };
}

function saveBody(program: OwnProgram, overrides: Partial<OwnProgramSaveBody> = {}): OwnProgramSaveBody {
  return { name: program.name, currentPhaseId: program.current.phaseId, phases: structuredClone(program.phases), baseRevision: program.revision, baseCreatedAt: program.createdAt, ...overrides };
}

const save = (gh: ReturnType<typeof fakeSessionRepo>, body: OwnProgramSaveBody, by: 'client' | 'pt' = 'client', id = OWN_ID, guard?: OwnGuard) =>
  saveOwnProgram(gh.repo, { id, body, by, library, ctx, now: NOW, guard });

/** Kısıt denetimi: yasaklı hareketler ve danışanlara açık şablonların hareketleri. */
function guardOf(blocked: string[], templates: Record<string, string[]> = {}): OwnGuard {
  return { blocked: new Set(blocked), templateExercises: async (id) => templates[id] ?? null };
}

/** Günün sonuna tek hareketlik blok. */
function withRow(phases: OwnProgramSaveBody['phases'], dayIndex: number, exerciseId: string, suffix = 'x'): OwnProgramSaveBody['phases'] {
  const next = structuredClone(phases);
  next[0]!.days[dayIndex]!.blocks.push({ id: `b_add${suffix}a`, kind: 'single', restSeconds: 60, rows: [{ id: `r_add${suffix}a`, exerciseId, sets: [{ min: 8, max: 12 }] }] });
  return next;
}

describe('oluşturma', () => {
  test('program ve index tek commit; PT\'nin programı varken seçilmez', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    const result = await save(gh, createBody());
    assert.equal(result.status, 'created');
    assert.equal(gh.commitCount(), 1);
    assert.deepEqual(gh.lastChanged(), [OWN_INDEX_PATH, PATH].sort());
    assert.match(gh.messages()[0] ?? '', /^Kendi programı \(Evde\): /);
    const index = gh.get(OWN_INDEX_PATH) as OwnIndex;
    assert.equal(index.items[0]?.sha, gh.sha(PATH), 'satırın sha\'sı dosyanınki');
    assert.equal(index.active, undefined);
  });

  test('PT\'nin programı yokken ilk kendi program kendiliğinden seçilir', async () => {
    const gh = fakeSessionRepo();
    await save(gh, createBody());
    assert.equal((gh.get(OWN_INDEX_PATH) as OwnIndex).active?.programId, OWN_ID);
  });

  test('yeniden deneme: aynı gövde unchanged (yazma yok), farklı gövde exists', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    assert.equal((await save(gh, createBody())).status, 'unchanged');
    assert.equal((await save(gh, createBody({ name: 'Başka' }))).status, 'exists');
    assert.equal(gh.commitCount(), 1);
  });

  test('ad çakışması alan hatası; 5 program sınırı', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    const clash = await save(gh, createBody({ name: 'EVDE' }), 'client', 'op_ikinci01');
    assert.deepEqual(clash, { status: 'invalid', errors: { name: 'Bu adda bir programın var.' } });
    for (const n of [2, 3, 4, 5]) assert.equal((await save(gh, createBody({ name: `P${n}` }), 'client', `op_prog000${n}`)).status, 'created');
    assert.equal((await save(gh, createBody({ name: 'P6' }), 'client', 'op_prog0006')).status, 'limit');
  });

  test('kimlik çakışması: PT programındaki gün kimliği yeniden üretilir', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    const body = createBody();
    body.phases[0]!.days[0]!.id = 'd_aaaaaa';
    await save(gh, body);
    const stored = gh.get(PATH) as OwnProgram;
    assert.notEqual(stored.phases[0]?.days[0]?.id, 'd_aaaaaa');
  });

  test('kütüphanede olmayan egzersiz alan hatası', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    const body = createBody();
    body.phases[0]!.days[0]!.blocks[0]!.rows[0]!.exerciseId = 'yok-boyle';
    const result = await save(gh, body);
    assert.equal(result.status, 'invalid');
    assert.equal(gh.commitCount(), 0);
  });
});

describe('kayıt', () => {
  async function created() {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    return { gh, program: gh.get(PATH) as OwnProgram };
  }

  test('danışanın kaydı; eski sürümle 412; değişiklik yoksa yazma yok', async () => {
    const { gh, program } = await created();
    assert.equal((await save(gh, saveBody(program))).status, 'unchanged');
    const body = saveBody(program);
    body.phases[0]!.days[1]!.name = 'Karın';
    const saved = await save(gh, body);
    assert.equal(saved.status, 'saved');
    assert.equal((gh.get(PATH) as OwnProgram).revision, 2);
    assert.equal((gh.get(OWN_INDEX_PATH) as OwnIndex).items[0]?.revision, 2);
    assert.equal((await save(gh, body)).status, 'stale');
  });

  test('PT: paylaşılmamış programa 403; paylaşılınca kaydeder (by pt, ptEditedAt)', async () => {
    const { gh, program } = await created();
    const body = saveBody(program);
    body.phases[0]!.days[1]!.name = 'Karın';
    assert.equal((await save(gh, body, 'pt')).status, 'forbidden');
    await shareOwnProgram(gh.repo, OWN_ID, true, NOW);
    const shared = gh.get(PATH) as OwnProgram;
    assert.equal((await save(gh, saveBody(shared, { phases: body.phases, name: 'Değişmez' }), 'pt')).status, 'saved');
    const stored = gh.get(PATH) as OwnProgram;
    assert.equal(stored.log[0]?.by, 'pt');
    assert.equal(stored.name, 'Evde');
    assert.equal((gh.get(OWN_INDEX_PATH) as OwnIndex).items[0]?.ptEditedAt, NOW.toISOString());
  });

  test('PT kaydederken paylaşım kapanırsa: ref çakışması, yeniden okuma, shared yeniden denetlenir → 403', async () => {
    const { gh } = await created();
    await shareOwnProgram(gh.repo, OWN_ID, true, NOW);
    const shared = gh.get(PATH) as OwnProgram;
    const body = saveBody(shared);
    body.phases[0]!.days[1]!.name = 'Karın';
    // Commit'ten hemen önce danışan paylaşımı kapatır: dal ilerler, PT'nin commit'i 409 alır.
    gh.onNext('commit', async () => {
      const { name: _name, ...rest } = shared;
      const closed = { ...rest, name: shared.name };
      delete (closed as Partial<OwnProgram>).shared;
      gh.put(PATH, closed, 'Paylaşım kapatıldı');
    });
    assert.equal((await save(gh, body, 'pt')).status, 'forbidden');
    assert.equal((gh.get(PATH) as OwnProgram).phases[0]?.days[1]?.name, 'Gün B');
  });
});

describe('kısıt: kütüphaneden eklenen yasak', () => {
  const PATH_B = 'phases.0.days.1.blocks.1.rows.0.exerciseId';

  test('oluştururken eklenen yasaklı hareket reddedilir (alan hatası, yazma yok)', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    const result = await save(gh, createBody({ phases: withRow(createBody().phases, 1, 'crunch') }), 'client', OWN_ID, guardOf(['crunch']));
    assert.deepEqual(result, { status: 'blocked', errors: { [PATH_B]: 'Bu hareket şu an sana önerilmiyor; antrenörüne sor.' } });
    assert.equal(gh.commitCount(), 0);
  });

  test('önceki kayıtta duran yasak başka değişikliği engellemez; yeni eklenen engeller', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    const program = gh.get(PATH) as OwnProgram;
    const body = saveBody(program);
    body.phases[0]!.days[1]!.name = 'Karın';
    assert.equal((await save(gh, body, 'client', OWN_ID, guardOf(['goblet-squat']))).status, 'saved');
    const stored = gh.get(PATH) as OwnProgram;
    const added = saveBody(stored, { phases: withRow(stored.phases, 1, 'crunch') });
    assert.equal((await save(gh, added, 'client', OWN_ID, guardOf(['goblet-squat', 'crunch']))).status, 'blocked');
    assert.equal((gh.get(PATH) as OwnProgram).revision, 2);
  });

  test('antrenörünün programındaki yasak kopyayla gelir: işaretli kalır, kayıt sürer', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    const body = createBody({ phases: withRow(createBody().phases, 0, 'bench-press') });
    const sourceDay = programFile().phases[0]!.days[0]!;
    body.phases[0]!.days[0]!.copiedFrom = { dayId: sourceDay.id, dayName: sourceDay.name, at: NOW.toISOString() };
    assert.equal((await save(gh, body, 'client', OWN_ID, guardOf(['bench-press']))).status, 'created');
  });

  test('danışanlara açık şablondan gelen yasak kalır; şablon okunamıyorsa reddedilir', async () => {
    const source = { templateId: 't_evdeaaaa', templateName: 'Karın', at: NOW.toISOString() };
    const phases = withRow(createBody().phases, 1, 'crunch');
    phases[0]!.days[1] = { ...phases[0]!.days[1]!, source };
    const blocked = await save(fakeSessionRepo({ 'program.json': programFile() }), createBody({ phases }), 'client', OWN_ID, guardOf(['crunch']));
    assert.equal(blocked.status, 'blocked');
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    assert.equal((await save(gh, createBody({ phases }), 'client', OWN_ID, guardOf(['crunch'], { t_evdeaaaa: ['crunch', 'plank'] }))).status, 'created');
  });

  test('PT\'nin kaydı denetlenmez (yasağı PT izinle açar)', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    await shareOwnProgram(gh.repo, OWN_ID, true, NOW);
    const shared = gh.get(PATH) as OwnProgram;
    const body = saveBody(shared, { phases: withRow(shared.phases, 1, 'crunch') });
    assert.equal((await save(gh, body, 'pt', OWN_ID, guardOf(['crunch']))).status, 'saved');
  });
});

describe('silme, paylaşım, seçim, günler', () => {
  test('yarım antrenman bu programdansa silinmez; bitmişse silinir, seçim PT\'ye, paylaşılmışsa olay', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    await shareOwnProgram(gh.repo, OWN_ID, true, NOW);
    await selectOwnActive(gh.repo, OWN_ID, NOW);
    const half = sessionDoc({ program: { revision: 1, dayId: 'd_ownaaa', dayName: 'Gün A', programId: OWN_ID } });
    gh.put(`sessions/${half.id}.json`, half);
    assert.deepEqual(await deleteOwnProgram(gh.repo, OWN_ID, NOW), { status: 'active_session', sessionId: half.id });
    gh.put(`sessions/${half.id}.json`, { ...half, status: 'finished', finishedAt: at(40) });
    assert.deepEqual(await deleteOwnProgram(gh.repo, OWN_ID, NOW), { status: 'deleted' });
    assert.equal(gh.get(PATH), undefined);
    assert.equal(gh.messages().at(-1), 'Kendi programı silindi');
    const index = gh.get(OWN_INDEX_PATH) as OwnIndex;
    assert.deepEqual([index.items.length, index.active?.programId, index.events[0]?.kind], [0, null, 'deleted']);
    assert.deepEqual(await deleteOwnProgram(gh.repo, OWN_ID, NOW), { status: 'missing' });
  });

  test('paylaşımı kapatmak unshared olayı; revision artmaz; aynıysa yazma yok', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    assert.equal((await shareOwnProgram(gh.repo, OWN_ID, false, NOW)).status, 'unchanged');
    await shareOwnProgram(gh.repo, OWN_ID, true, NOW);
    await shareOwnProgram(gh.repo, OWN_ID, false, NOW);
    const index = gh.get(OWN_INDEX_PATH) as OwnIndex;
    assert.deepEqual(index.events.map((event) => event.kind), ['unshared']);
    assert.equal((gh.get(PATH) as OwnProgram).revision, 1);
  });

  test('seçim: bilinmeyen program 404, aynıysa yazma yok, PT\'ye dönüş', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    assert.deepEqual(await selectOwnActive(gh.repo, 'op_yokyok01', NOW), { status: 'missing' });
    assert.deepEqual(await selectOwnActive(gh.repo, OWN_ID, NOW), { status: 'saved' });
    const count = gh.commitCount();
    assert.deepEqual(await selectOwnActive(gh.repo, OWN_ID, NOW), { status: 'unchanged' });
    assert.equal(gh.commitCount(), count);
    assert.deepEqual(await selectOwnActive(gh.repo, null, NOW), { status: 'saved' });
    assert.equal((gh.get(OWN_INDEX_PATH) as OwnIndex).active?.programId, null);
  });

  test('Günlerini değiştir: program ve index (günler, anı) tek commit', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    const result = await scheduleOwnProgram(gh.repo, OWN_ID, [2, 4], NOW);
    assert.equal(result.status, 'saved');
    assert.deepEqual(gh.lastChanged(), [OWN_INDEX_PATH, PATH].sort());
    const item = (gh.get(OWN_INDEX_PATH) as OwnIndex).items[0];
    assert.deepEqual([item?.weekdays, item?.weekdaysAt], [[2, 4], NOW.toISOString()]);
  });

  test('okuma: index bozuksa dosyalardan kurulur; satırın sha\'sı tutmayan dosya yeniden okunur', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    await save(gh, createBody());
    gh.putText(OWN_INDEX_PATH, '{"items": [');
    const state = await readOwnState(gh.repo);
    assert.deepEqual(state.index.items.map((item) => item.id), [OWN_ID]);
    assert.equal(state.changed, true);
    gh.put(PATH, { ...(gh.get(PATH) as OwnProgram), name: 'Elle' });
    assert.equal((await readOwnState(gh.repo)).index.items[0]?.name, 'Elle');
  });

  test('GitHub hatası yukarı çıkar', async () => {
    const gh = fakeSessionRepo({ 'program.json': programFile() });
    gh.failNext('head', new GithubError('sınır', 403, { rateLimited: true }));
    await assert.rejects(save(gh, createBody()));
  });
});


test('PT programında bulunması kopyalanmayan güne yeni yasaklı hareket ekleme izni değildir', async () => {
  const gh = fakeSessionRepo({ 'program.json': programFile() });
  const body = createBody({ phases: withRow(createBody().phases, 0, 'bench-press') });
  assert.equal((await save(gh, body, 'client', OWN_ID, guardOf(['bench-press']))).status, 'blocked');
  assert.equal(gh.commitCount(), 0);
});
test('bir günün şablonu başka günün yasaklı hareketine izin vermez', async () => {
  const gh = fakeSessionRepo({ 'program.json': programFile() });
  const phases = withRow(createBody().phases, 1, 'crunch');
  phases[0]!.days[0]!.source = { templateId: 't_evdeaaaa', templateName: 'Karın', at: NOW.toISOString() };
  assert.equal((await save(gh, createBody({ phases }), 'client', OWN_ID, guardOf(['crunch'], { t_evdeaaaa: ['crunch'] }))).status, 'blocked');
  assert.equal(gh.commitCount(), 0);
});
