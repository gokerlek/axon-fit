import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICES,
  EXERCISES,
  RETIRED_IDS_PATH,
  readCatalog,
  readRetiredIds,
  retireId,
  updateCatalog,
  withLibrary,
  writeCatalog,
} from './catalog-store.ts';
import { fakeRepo } from './testing/fake-repo.ts';

const device = (id: string, name = `Cihaz ${id}`) => ({ id, name, kind: 'bodyweight' as const });

describe('katalog dosyası', () => {
  test('dosya yoksa boş ve sha null; liste değilse ya da JSON bozuksa 500', async () => {
    const repo = fakeRepo();
    assert.deepEqual(await readCatalog(repo.files, DEVICES), { items: [], unreadable: [], invalid: 0, sha: null });

    repo.put(DEVICES.path, { not: 'a list' });
    await assert.rejects(readCatalog(repo.files, DEVICES), { status: 500, message: 'data/devices.json bozuk: kayıt listesi değil.' });
    repo.putText(DEVICES.path, '[{"id": "a",');
    await assert.rejects(readCatalog(repo.files, DEVICES), { status: 500, message: 'data/devices.json bozuk JSON içeriyor.' });
  });

  test('aynı kimliğin ikinci kaydı okunamayan sayılır, yazınca sonda korunur', async () => {
    const repo = fakeRepo({ [DEVICES.path]: [device('benim-kablo', 'İlk'), device('diger'), device('benim-kablo', 'İkinci')] });
    const file = await readCatalog(repo.files, DEVICES);
    assert.deepEqual(
      file.items.map((item) => item.name),
      ['İlk', 'Cihaz diger'],
    );
    assert.equal(file.invalid, 1);

    await writeCatalog(repo.files, DEVICES, [...file.items, device('yeni')], 'Cihaz eklendi: Yeni', file);
    assert.deepEqual(
      (repo.get(DEVICES.path) as { id: string; name: string }[]).map((item) => item.name),
      ['İlk', 'Cihaz diger', 'Cihaz yeni', 'İkinci'],
    );
  });

  test('yan etki: değişen yoksa yazılmaz; varsa taze okunan sha ile yazılır', async () => {
    const repo = fakeRepo({ [DEVICES.path]: [device('benim-kablo')] });
    assert.equal(await updateCatalog(repo.files, DEVICES, () => null, 'x'), false);
    assert.deepEqual(repo.changes(), []);
    assert.equal(await updateCatalog(repo.files, DEVICES, (items) => items.filter((item) => item.id !== 'benim-kablo'), 'Silindi'), true);
    assert.deepEqual(repo.get(DEVICES.path), []);
  });

  test('PT kaydı aynı kimlikteki hazır kaydın yerine geçer', () => {
    const merged = withLibrary([{ ...EXERCISES.library[0]!, title: 'PT sürümü' }], EXERCISES.library);
    assert.equal(merged.length, EXERCISES.library.length);
    assert.equal(merged.filter((item) => item.id === EXERCISES.library[0]!.id).length, 1);
    assert.equal(merged[0]?.title, 'PT sürümü');
  });
});

describe('silinen kimlikler (data/retired-ids.json)', () => {
  test('dosya yoksa boş listeler; eksik alan boş sayılır', async () => {
    const repo = fakeRepo();
    assert.deepEqual(await readRetiredIds(repo.files), { ids: { exercises: [], devices: [], attachments: [] }, sha: null });
    repo.put(RETIRED_IDS_PATH, { devices: ['benim-kablo'] });
    assert.deepEqual((await readRetiredIds(repo.files)).ids, { exercises: [], devices: ['benim-kablo'], attachments: [] });
  });

  test('ekleme sha kilidiyle; zaten varsa yazılmaz; bilinmeyen alan korunur', async () => {
    const repo = fakeRepo({ [RETIRED_IDS_PATH]: { exercises: ['a-1'], note: 'elle eklendi' } });
    await retireId(repo.files, 'exercises', 'benim-pushdown', 'Silinen kimlik');
    await retireId(repo.files, 'exercises', 'benim-pushdown', 'Silinen kimlik');
    assert.equal(repo.changes().length, 1);
    assert.deepEqual(repo.get(RETIRED_IDS_PATH), {
      exercises: ['a-1', 'benim-pushdown'],
      devices: [],
      attachments: [],
      note: 'elle eklendi',
    });
  });

  test('biçimi bozuksa 500: kimlik üretilmez, üzerine yazılmaz', async () => {
    const repo = fakeRepo({ [RETIRED_IDS_PATH]: ['benim-pushdown'] });
    await assert.rejects(readRetiredIds(repo.files), { status: 500, message: 'data/retired-ids.json bozuk: silinen kimlikler okunamadı.' });
    await assert.rejects(retireId(repo.files, 'devices', 'x-1', 'Silinen kimlik'));
    assert.deepEqual(repo.changes(), []);
  });

  test('araya başka yazma girerse 409 (sha kilidi)', async () => {
    const repo = fakeRepo();
    repo.failNext('write', RETIRED_IDS_PATH, 409);
    await assert.rejects(retireId(repo.files, 'attachments', 'kisa-halat', 'Silinen kimlik'), {
      status: 409,
      message: 'data/retired-ids.json: kayıt sen çalışırken değişti.',
    });
  });
});
