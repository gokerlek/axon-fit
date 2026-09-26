import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubError } from '../github/errors.ts';
import { fakeRepo } from './fake-repo.ts';

/** Sahte repo'nun GitHub gibi davrandığı yerler: sha kilidi, hata eşlemesi, JSON gidiş-dönüşü. */
describe('sahte repo', () => {
  test('ilk yazma sha istemez; sonrakiler okunan sha ile', async () => {
    const repo = fakeRepo();
    await repo.files.writeJson('data/a.json', [1], { message: 'ilk' });
    const read = await repo.files.readJson('data/a.json');
    assert.ok(read);
    await repo.files.writeJson('data/a.json', [2], { sha: read.sha, message: 'ikinci' });
    assert.deepEqual(repo.get('data/a.json'), [2]);
    assert.deepEqual(
      repo.changes().map((entry) => entry.message),
      ['ilk', 'ikinci'],
    );
  });

  test('eski sha, sha’sız yazma ya da silinmiş dosyaya sha: 409 çakışma', async () => {
    const repo = fakeRepo({ 'data/a.json': [1] });
    const stale = repo.sha('data/a.json');
    repo.put('data/a.json', [2]); // araya başka yazma girdi
    const conflict = { status: 409, message: 'data/a.json: kayıt sen çalışırken değişti.' };
    await assert.rejects(repo.files.writeJson('data/a.json', [3], { sha: stale, message: 'x' }), conflict);
    await assert.rejects(repo.files.writeJson('data/a.json', [3], { message: 'x' }), conflict);
    await assert.rejects(repo.files.writeJson('data/b.json', [3], { sha: 'sha-yok', message: 'x' }), { status: 409 });
    assert.deepEqual(repo.get('data/a.json'), [2]);
  });

  test('failNext bir kez düşürür; okumada 404 dosya yok demektir', async () => {
    const repo = fakeRepo({ 'data/a.json': [1] });
    repo.failNext('read', 'data/a.json', 404);
    assert.equal(await repo.files.readJson('data/a.json'), null);
    assert.ok(await repo.files.readJson('data/a.json'));

    repo.failNext('write', 'data/a.json', 502);
    const error = await repo.files.writeJson('data/a.json', [2], { sha: repo.sha('data/a.json'), message: 'x' }).catch((caught: unknown) => caught);
    assert.ok(error instanceof GithubError);
    assert.deepEqual([error.status, error.message], [502, "data/a.json: GitHub'a ulaşılamadı."]);
  });

  test('JSON metin olarak saklanır: undefined alan yazılmaz', async () => {
    const repo = fakeRepo();
    await repo.files.writeJson('data/a.json', [{ id: 'x', attachmentId: undefined }], { message: 'x' });
    assert.deepEqual(repo.get('data/a.json'), [{ id: 'x' }]);
  });

  test('silme: dosya yoksa 404, sha eşleşmezse 409', async () => {
    const repo = fakeRepo();
    repo.putBinary('media/a.png', new Uint8Array([1]));
    await assert.rejects(repo.files.deleteFile('media/b.png', { sha: 'x', message: 'x' }), { status: 404 });
    await assert.rejects(repo.files.deleteFile('media/a.png', { sha: 'x', message: 'x' }), { status: 409 });
    await repo.files.deleteFile('media/a.png', { sha: repo.sha('media/a.png') ?? '', message: 'sil' });
    assert.equal(repo.has('media/a.png'), false);
  });
});
