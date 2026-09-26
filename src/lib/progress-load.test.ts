import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { GithubError } from './github/errors.ts';
import type { SessionDigest } from './progress.ts';
import { loadProgressWith, mapLimit, PROGRESS_ERROR, type ProgressDeps } from './progress-load.ts';
import { emptySessionIndex, sessionPath, SESSIONS_INDEX_PATH, type SessionDoc, type SessionIndexRow } from './schemas/session.ts';
import { indexRowOf, upsertIndexRow } from './session-index.ts';
import type { PlanExercise } from './template-plan.ts';
import { fakeSessionRepo } from './testing/fake-session-repo.ts';
import { sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';

const BENCH: PlanExercise = {
  id: 'bench-press',
  title: 'Bench Press',
  category: 'compound',
  trackingType: 'weight_reps',
  equipment: 'barbell',
  primaryMuscles: ['chest_lower'],
  secondaryMuscles: [],
};

function finished(id: string, date: string, kg: number, fields: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({
    id,
    date,
    status: 'finished',
    startedAt: `${date}T15:00:00.000Z`,
    finishedAt: `${date}T16:00:00.000Z`,
    entries: [sessionEntry('e_aaaaaa', { status: 'done', sets: [workingSet('st_aaaaaaaa', 2, { kg }), workingSet('st_bbbbbbbb', 4, { kg })] })],
    ...fields,
  });
}

/** Dosyalar ve onlarla tutarlı index (onarım hiçbir dosyayı yeniden okumasın). */
function repoWith(docs: SessionDoc[]) {
  let index = emptySessionIndex();
  const files: Record<string, unknown> = {};
  for (const doc of docs) {
    files[sessionPath(doc.id)] = doc;
    index = upsertIndexRow(index, indexRowOf(doc, gitBlobSha(jsonText(doc))));
  }
  return fakeSessionRepo({ ...files, [SESSIONS_INDEX_PATH]: index });
}

const DOCS = [
  finished('s_aaaaaaa1', '2026-09-01', 60),
  finished('s_aaaaaaa2', '2026-09-08', 62.5),
  finished('s_aaaaaaa3', '2026-09-15', 65),
  sessionDoc({ id: 's_aaaaaaa4', date: '2026-09-25', startedAt: '2026-09-25T15:00:00.000Z', entries: [] }),
];

const now = new Date('2026-09-26T12:00:00.000Z');
const today = '2026-09-26';

function deps(gh: ReturnType<typeof fakeSessionRepo>, overrides: Partial<ProgressDeps<PlanExercise>> = {}): ProgressDeps<PlanExercise> & { logs: string[] } {
  const logs: string[] = [];
  return {
    repo: gh.repo,
    digest: (_row, read) => read(),
    catalog: async () => ({ exercises: [BENCH], deviceNames: new Map() }),
    weeklyTarget: async () => 2,
    setWeightsOf: (exercise) => Object.fromEntries(exercise.primaryMuscles.map((muscle) => [muscle, 1])),
    log: (message) => logs.push(message),
    logs,
    ...overrides,
  };
}

const blobReads = (gh: ReturnType<typeof fakeSessionRepo>) => gh.calls.filter((call) => call.startsWith('blob')).length;

describe('İlerleme okuması', () => {
  test('yalnız bitmiş antrenmanların dosyaları okunur; sayılar index\'ten, seri hedefi programdan', async () => {
    const gh = repoWith(DOCS);
    const result = await loadProgressWith(deps(gh), { id: 'c_test' }, now, today);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(blobReads(gh), 3);
    assert.equal(result.view.workouts, 3);
    assert.equal(result.view.streak.target, 2);
    assert.deepEqual(result.view.exercises.map((item) => [item.key, item.sessions]), [['bench-press', 3]]);
    assert.equal(result.view.records, 2);
    assert.deepEqual([result.view.skipped, result.view.truncated], [0, false]);
  });

  test('en çok `max` son antrenman okunur; eskiler kesilir ama sayılara girer', async () => {
    const gh = repoWith(DOCS);
    const result = await loadProgressWith(deps(gh, { max: 2 }), { id: 'c_test' }, now, today);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(blobReads(gh), 2);
    assert.equal(result.view.truncated, true);
    assert.equal(result.view.workouts, 3);
    assert.deepEqual(result.view.exercises[0]!.points.map((point) => point.date), ['2026-09-08', '2026-09-15']);
  });

  test('özet önbelleği: ikinci açılışta dosya yeniden okunmaz', async () => {
    const gh = repoWith(DOCS);
    const cache = new Map<string, SessionDigest | null>();
    const cached: ProgressDeps<PlanExercise>['digest'] = async (row, read) => {
      if (!cache.has(row.sha)) cache.set(row.sha, await read());
      return cache.get(row.sha) ?? null;
    };
    await loadProgressWith(deps(gh, { digest: cached }), { id: 'c_test' }, now, today);
    await loadProgressWith(deps(gh, { digest: cached }), { id: 'c_test' }, now, today);
    assert.equal(blobReads(gh), 3);
  });

  test('okunamayan dosya sayfayı durdurmaz: sayılır ve günlüğe değer yazılmaz', async () => {
    const gh = repoWith(DOCS);
    const failing = deps(gh, {
      digest: (row: SessionIndexRow, read) => (row.id === 's_aaaaaaa2' ? Promise.reject(new GithubError('sınır', 403)) : read()),
    });
    const result = await loadProgressWith(failing, { id: 'c_test' }, now, today);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.view.skipped, 1);
    assert.equal(result.view.workouts, 3);
    assert.deepEqual(result.view.exercises[0]!.points.map((point) => point.date), ['2026-09-01', '2026-09-15']);
    assert.deepEqual(failing.logs, ['[ilerleme] c_test: 1 antrenman dosyası okunamadı.']);
  });

  test('program okunamazsa seri hedefi 1', async () => {
    const gh = repoWith(DOCS);
    const result = await loadProgressWith(deps(gh, { weeklyTarget: () => Promise.reject(new Error('yok')) }), { id: 'c_test' }, now, today);
    assert.equal(result.status === 'ok' && result.view.streak.target, 1);
  });

  test('index okunamazsa danışana dönük hata', async () => {
    const gh = repoWith(DOCS);
    gh.failNext('head', new GithubError('ağ', 502));
    const failing = deps(gh);
    const result = await loadProgressWith(failing, { id: 'c_test' }, now, today);
    assert.deepEqual(result, { status: 'error', message: PROGRESS_ERROR });
    assert.deepEqual(failing.logs, ['[ilerleme] c_test: ağ']);
  });

  test('antrenman yoksa boş görünüm', async () => {
    const gh = fakeSessionRepo();
    const result = await loadProgressWith(deps(gh), { id: 'c_test' }, now, today);
    assert.equal(result.status === 'ok' && result.view.workouts, 0);
  });
});

describe('sınırlı eşzamanlılık', () => {
  test('sıra korunur, aynı anda en çok `limit` iş', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, value));
      running -= 1;
      return value * 10;
    });
    assert.deepEqual(results, [50, 10, 40, 20, 30, 0]);
    assert.equal(peak, 2);
  });

  test('boş liste', async () => {
    assert.deepEqual(await mapLimit([], 4, async (value: number) => value), []);
  });
});
