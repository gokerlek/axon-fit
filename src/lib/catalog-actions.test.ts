import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import {
  deleteAttachment,
  deleteDevice,
  deleteExercise,
  pinAlternatives,
  removeDeviceImage,
  saveAttachment,
  saveAttachmentImage,
  saveDevice,
  saveDeviceImage,
  saveExercise,
  type Outcome,
} from './catalog-actions.ts';
import { RETIRED_IDS_PATH } from './catalog-store.ts';
import { fakeRepo, type FakeRepo } from './testing/fake-repo.ts';

/**
 * Egzersiz, cihaz ve aparat uçlarının çekirdeği sahte repo'yla (SPEC §7.3, §7.4). Rotalar yalnız
 * oturumu denetleyip bu fonksiyonları çağırır; buradaki senaryolar rotanın yaptığının aynısıdır.
 */

const EX = 'data/exercises.json';
const DEV = 'data/devices.json';
const ATT = 'data/attachments.json';

type Rec = Record<string, unknown> & { id: string };
const list = (repo: FakeRepo, path: string) => (repo.get(path) as Rec[] | undefined) ?? [];
const ids = (repo: FakeRepo, path: string) => list(repo, path).map((item) => item.id);
const find = (repo: FakeRepo, path: string, id: string) => list(repo, path).find((item) => item.id === id);
/** Yazma ve silmeler sırayla: "write data/devices.json". */
const changes = (repo: FakeRepo) => repo.changes().map((entry) => `${entry.op} ${entry.path}`);

/** Formun gönderdiği egzersiz (kimliksiz: yeni kayıt). */
const exercise = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  description: '',
  cues: [],
  category: 'isolation',
  trackingType: 'weight_reps',
  equipment: 'cable',
  pattern: 'elbow_extension',
  primaryMuscles: ['triceps_long'],
  secondaryMuscles: [],
  stabilizerMuscles: [],
  loadStepKg: 2.5,
  minLoadKg: 0,
  ...extra,
});
/** Dosyada duran PT egzersizi. */
const storedExercise = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...exercise(`Hareket ${id}`), ...extra });
/** Şemaya uymayan kayıt (hedef kas yok). */
const broken = (id: string) => storedExercise(id, { primaryMuscles: [] });
const cable = (name: string, extra: Record<string, unknown> = {}) => ({ name, kind: 'cable', baseKg: 5, stepKg: 5, maxKg: 100, ...extra });
const storedCable = (id: string, attachments: string[]) => ({ id, ...cable(`Cihaz ${id}`), pulleyRatio: 1, attachments });

async function expectOk(outcome: Promise<Outcome>): Promise<Record<string, unknown>> {
  const { status, body } = await outcome;
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}
const createdId = async (outcome: Promise<Outcome>) => (await expectOk(outcome)).id as string;

const faceCable = EXERCISE_LIBRARY.find((item) => item.id === 'kablo-face-pull');
assert.ok(faceCable?.attachmentId === 'halat' && faceCable.deviceId === 'kablo-istasyonu', 'hazır kütüphanede kablo-face-pull halatla kablo istasyonunda');
const { id: _faceId, alternatives: _faceAlternatives, ...faceBody } = faceCable;
/** Hazır kablo istasyonunun aparatları, halat olmadan (PT kendi sürümünden halatı çıkarmış). */
const CABLE_WITHOUT_ROPE = ['duz-bar', 'tek-el-tutamagi', 'v-bar-ucgen', 'ez-bar-aparati', 'ayak-bilekligi'];

describe('okunamayan kayıtla aynı kimliğe yazılmaz (409)', () => {
  const BROKEN_EXERCISE = 'Bu kayıt dosyada bozuk; önce data/exercises.json içinde düzelt.';

  test('hazır egzersizin PT sürümü okunamıyorsa sabitleme ikinci kayıt açmaz; düzeltilince tek kayıt kalır', async () => {
    const repo = fakeRepo({ [EX]: [broken('halter-bench-press'), storedExercise('pt-a')] });
    const before = repo.get(EX);

    const { status, body } = await pinAlternatives(repo.files, 'halter-bench-press', { alternatives: ['pt-a'] });
    assert.equal(status, 409);
    assert.equal(body.error, BROKEN_EXERCISE);
    assert.deepEqual(changes(repo), []);
    assert.deepEqual(repo.get(EX), before);

    // PT GitHub'da düzeltir (uyarının önerisi): yine tek kayıt, sabitleme artık yazılır.
    repo.put(EX, [storedExercise('halter-bench-press'), storedExercise('pt-a')]);
    await expectOk(pinAlternatives(repo.files, 'halter-bench-press', { alternatives: ['pt-a'] }));
    assert.deepEqual(ids(repo, EX), ['halter-bench-press', 'pt-a']);
    assert.deepEqual(find(repo, EX, 'halter-bench-press')?.alternatives, ['pt-a']);
  });

  test('egzersiz: düzenleme ve silme durur; aynı kimliğin ikinci kaydı da kilitler', async () => {
    const repo = fakeRepo({ [EX]: [broken('halter-bench-press'), storedExercise('pt-a'), storedExercise('pt-a', { title: 'Kopya' })] });
    for (const outcome of [
      saveExercise(repo.files, { ...exercise('Halter Bench Press'), id: 'halter-bench-press' }),
      saveExercise(repo.files, { ...exercise('PT A'), id: 'pt-a' }),
      deleteExercise(repo.files, 'pt-a'),
      deleteExercise(repo.files, 'halter-bench-press'),
    ]) {
      const { status, body } = await outcome;
      assert.equal(status, 409);
      assert.equal(body.error, BROKEN_EXERCISE);
    }
    assert.deepEqual(changes(repo), []);
  });

  test('cihaz ve aparat: düzenleme, silme ve görsel durur; görsel dosyası da yazılmaz', async () => {
    const repo = fakeRepo({
      [DEV]: [{ id: 'kablo-istasyonu', name: 'Bozuk', kind: 'cable' }],
      [ATT]: [{ id: 'halat', name: 'H' }],
    });
    const cases: [Promise<Outcome>, string][] = [
      [saveDevice(repo.files, { ...cable('Kablo'), id: 'kablo-istasyonu' }), DEV],
      [deleteDevice(repo.files, 'kablo-istasyonu'), DEV],
      [saveDeviceImage(repo.files, 'kablo-istasyonu', new Uint8Array([1, 2, 3]), 'png'), DEV],
      [removeDeviceImage(repo.files, 'kablo-istasyonu'), DEV],
      [saveAttachment(repo.files, { id: 'halat', name: 'Halat' }), ATT],
      [deleteAttachment(repo.files, 'halat'), ATT],
      [saveAttachmentImage(repo.files, 'halat', new Uint8Array([1, 2, 3]), 'png'), ATT],
    ];
    for (const [outcome, path] of cases) {
      const { status, body } = await outcome;
      assert.equal(status, 409, path);
      assert.equal(body.error, `Bu kayıt dosyada bozuk; önce ${path} içinde düzelt.`);
    }
    assert.deepEqual(changes(repo), []);
  });

  test('yeni kayıt okunamayan kaydın kimliğini almaz', async () => {
    const repo = fakeRepo({ [EX]: [broken('benim-pushdown')] });
    assert.equal(await createdId(saveExercise(repo.files, exercise('Benim Pushdown'))), 'benim-pushdown-2');
    // Okunamayan kayıt olduğu gibi sonda.
    assert.deepEqual(list(repo, EX).at(-1), broken('benim-pushdown'));
  });
});

describe('silinen kimlik bir daha verilmez (data/retired-ids.json)', () => {
  test('egzersiz: aynı başlıkla açılan yeni hareket eski kimliği almaz', async () => {
    const repo = fakeRepo();
    const id = await createdId(saveExercise(repo.files, exercise('Benim Pushdown')));
    assert.equal(id, 'benim-pushdown');
    await expectOk(deleteExercise(repo.files, id));
    assert.deepEqual(repo.get(RETIRED_IDS_PATH), { exercises: ['benim-pushdown'], devices: [], attachments: [] });

    // Şablon satırı hâlâ `benim-pushdown`'ı gösteriyor ("Silinmiş egzersiz"); yeni biceps hareketi başka kimlik alır.
    const biceps = exercise('Benim Pushdown', { pattern: 'elbow_flexion', primaryMuscles: ['biceps'] });
    assert.equal(await createdId(saveExercise(repo.files, biceps)), 'benim-pushdown-2');
  });

  test('tek karakterlik ad: v-1 silinince yenisi v-2', async () => {
    const repo = fakeRepo();
    assert.equal(await createdId(saveExercise(repo.files, exercise('V.'))), 'v-1');
    await expectOk(deleteExercise(repo.files, 'v-1'));
    assert.equal(await createdId(saveExercise(repo.files, exercise('V.'))), 'v-2');
  });

  test('cihaz ve aparat da', async () => {
    const repo = fakeRepo();
    assert.equal(await createdId(saveDevice(repo.files, cable('Benim kablo'))), 'benim-kablo');
    await expectOk(deleteDevice(repo.files, 'benim-kablo'));
    assert.equal(await createdId(saveDevice(repo.files, { name: 'Benim kablo', kind: 'selectorized', baseKg: 2.5, stepKg: 2.5, maxKg: 50 })), 'benim-kablo-2');

    assert.equal(await createdId(saveAttachment(repo.files, { name: 'Kısa halat' })), 'kisa-halat');
    await expectOk(deleteAttachment(repo.files, 'kisa-halat'));
    assert.equal(await createdId(saveAttachment(repo.files, { name: 'Kısa halat' })), 'kisa-halat-2');

    assert.deepEqual(repo.get(RETIRED_IDS_PATH), { exercises: [], devices: ['benim-kablo'], attachments: ['kisa-halat'] });
  });

  test('okurken çevrilen eski sabit kimlik (rope → halat) yeni aparata verilmez', async () => {
    const repo = fakeRepo();
    assert.equal(await createdId(saveAttachment(repo.files, { name: 'Rope' })), 'rope-2');
  });

  test('"Varsayılana dön" silme değildir: hazır kimlik listeye girmez', async () => {
    const repo = fakeRepo();
    await expectOk(saveExercise(repo.files, { ...faceBody, id: 'kablo-face-pull', description: 'PT notu' }));
    await expectOk(saveDevice(repo.files, { ...cable('Kablo istasyonu'), id: 'kablo-istasyonu' }));
    await expectOk(saveAttachment(repo.files, { id: 'halat', name: 'Kalın halat' }));

    await expectOk(deleteExercise(repo.files, 'kablo-face-pull'));
    await expectOk(deleteDevice(repo.files, 'kablo-istasyonu'));
    await expectOk(deleteAttachment(repo.files, 'halat'));
    assert.equal(repo.has(RETIRED_IDS_PATH), false);
    assert.deepEqual([ids(repo, EX), ids(repo, DEV), ids(repo, ATT)], [[], [], []]);
  });

  test('eski sekmeden gelen düzenleme silinmiş egzersizi yeniden açmaz', async () => {
    const repo = fakeRepo();
    const id = await createdId(saveExercise(repo.files, exercise('Benim Pushdown')));
    await expectOk(deleteExercise(repo.files, id));
    const { status, body } = await saveExercise(repo.files, { ...exercise('Benim Pushdown'), id });
    assert.equal(status, 404);
    assert.equal(body.error, 'Egzersiz bulunamadı.');
    assert.deepEqual(ids(repo, EX), []);
  });

  test('silinen kimlik listesi okunamıyorsa yeni kimlik üretilmez, hiçbir şey yazılmaz', async () => {
    const repo = fakeRepo({ [RETIRED_IDS_PATH]: { exercises: 'benim-pushdown' } });
    const { status, body } = await saveExercise(repo.files, exercise('Benim Pushdown'));
    assert.equal(status, 500);
    assert.equal(body.error, 'data/retired-ids.json bozuk: silinen kimlikler okunamadı.');
    assert.deepEqual(changes(repo), []);
  });
});

describe('egzersizin cihazı var olmalı', () => {
  test('olmayan cihaz (aparatsız da) 400; hazır ya da PT cihazı 200', async () => {
    const repo = fakeRepo({ [DEV]: [storedCable('benim-kablo', [])] });
    const { status, body } = await saveExercise(repo.files, exercise('Hayalet Cihaz', { deviceId: 'hic-olmayan-cihaz' }));
    assert.equal(status, 400);
    assert.deepEqual(body.fields, { deviceId: 'Bu cihaz bulunamadı: silinmiş ya da dosyada okunamıyor olabilir.' });
    assert.equal(repo.has(EX), false);

    await expectOk(saveExercise(repo.files, exercise('Hazır Cihazla', { deviceId: 'kablo-istasyonu' })));
    await expectOk(saveExercise(repo.files, exercise('Benim Cihazımla', { deviceId: 'benim-kablo' })));
  });

  test('silinen cihaz eski formdan yeniden yazılamaz', async () => {
    const repo = fakeRepo({ [DEV]: [storedCable('benim-kablo', [])] });
    const id = await createdId(saveExercise(repo.files, exercise('Benim Row', { deviceId: 'benim-kablo' })));
    await expectOk(deleteDevice(repo.files, 'benim-kablo'));
    assert.equal(find(repo, EX, id)?.deviceId, undefined);
    const { status, body } = await saveExercise(repo.files, { ...exercise('Benim Row', { deviceId: 'benim-kablo' }), id });
    assert.equal(status, 400);
    assert.deepEqual(body.fields, { deviceId: 'Bu cihaz bulunamadı: silinmiş ya da dosyada okunamıyor olabilir.' });
  });
});

describe('kaydetme denetimleri', () => {
  test('havuzda olmayan aparat seçilen cihaz 400, hiçbir şey yazılmaz', async () => {
    const repo = fakeRepo();
    const { status, body } = await saveDevice(repo.files, cable('Benim kablo', { attachments: ['halat', 'havuzda-hic-olmayan'] }));
    assert.equal(status, 400);
    assert.deepEqual(body.fields, { attachments: 'Havuzda olmayan aparat seçilemez: havuzda-hic-olmayan.' });
    assert.deepEqual(changes(repo), []);
  });

  test('egzersiz: bar + halat 400, cihazsız + aparat 400, kablo + halat 200', async () => {
    const repo = fakeRepo();
    const row = (extra: Record<string, unknown>) =>
      exercise('Row', { equipment: 'barbell', pattern: 'horizontal_pull', primaryMuscles: ['lats_mid'], ...extra });

    const bar = await saveExercise(repo.files, row({ deviceId: 'olimpik-bar', attachmentId: 'halat' }));
    assert.equal(bar.status, 400);
    assert.deepEqual(bar.body.fields, { attachmentId: 'Bu aparat seçili cihaza takılı değil.' });

    const none = await saveExercise(repo.files, row({ attachmentId: 'halat' }));
    assert.equal(none.status, 400);
    assert.deepEqual(none.body.fields, { attachmentId: 'Cihazsız egzersizde aparat seçilemez.' });
    assert.equal(repo.has(EX), false);

    const id = await createdId(saveExercise(repo.files, row({ equipment: 'cable', deviceId: 'kablo-istasyonu', attachmentId: 'halat' })));
    assert.equal(find(repo, EX, id)?.attachmentId, 'halat');
  });

  test('PT aparatı havuzdaysa cihaza takılır ve egzersizde seçilir', async () => {
    const repo = fakeRepo();
    const aid = await createdId(saveAttachment(repo.files, { name: 'Kısa halat' }));
    const did = await createdId(saveDevice(repo.files, cable('Benim kablo', { attachments: [aid] })));
    const id = await createdId(saveExercise(repo.files, exercise('Benim Pushdown', { deviceId: did, attachmentId: aid })));
    assert.deepEqual([find(repo, EX, id)?.deviceId, find(repo, EX, id)?.attachmentId], ['benim-kablo', 'kisa-halat']);
  });
});

describe('cihazın aparatları değişince egzersizin aparatı düşer', () => {
  const setup = () =>
    fakeRepo({
      [ATT]: [{ id: 'kisa-halat', name: 'Kısa halat' }],
      [DEV]: [storedCable('benim-kablo', ['kisa-halat', 'halat'])],
      [EX]: [
        storedExercise('benim-pushdown', { deviceId: 'benim-kablo', attachmentId: 'kisa-halat' }),
        storedExercise('halat-pushdown', { deviceId: 'benim-kablo', attachmentId: 'halat' }),
        storedExercise('baska-kablo', { deviceId: 'kablo-istasyonu', attachmentId: 'kisa-halat' }),
      ],
    });

  test('cihazdan aparat çıkarılınca: cihaz yazılır, sonra o aparat bu cihazın egzersizlerinden düşer', async () => {
    const repo = setup();
    await expectOk(saveDevice(repo.files, { ...cable('Benim kablo', { attachments: ['halat'] }), id: 'benim-kablo' }));
    assert.deepEqual(changes(repo), [`write ${DEV}`, `write ${EX}`]);
    assert.equal(find(repo, EX, 'benim-pushdown')?.attachmentId, undefined);
    assert.equal(find(repo, EX, 'benim-pushdown')?.deviceId, 'benim-kablo');
    assert.equal(find(repo, EX, 'halat-pushdown')?.attachmentId, 'halat');
    // Başka cihazın egzersizine dokunulmaz.
    assert.equal(find(repo, EX, 'baska-kablo')?.attachmentId, 'kisa-halat');
  });

  test('tür aparat almayan bir türe dönünce (bar) bütün seçimler düşer; egzersiz olduğu gibi yeniden kaydedilince 400', async () => {
    const repo = setup();
    await expectOk(saveDevice(repo.files, { name: 'Benim kablo', kind: 'barbell', baseKg: 20, stepKg: 2.5, id: 'benim-kablo' }));
    assert.equal(find(repo, EX, 'benim-pushdown')?.attachmentId, undefined);
    assert.equal(find(repo, EX, 'halat-pushdown')?.attachmentId, undefined);
    const stale = await saveExercise(repo.files, { ...exercise('Benim Pushdown', { deviceId: 'benim-kablo', attachmentId: 'kisa-halat' }), id: 'benim-pushdown' });
    assert.equal(stale.status, 400);
  });

  test('aparatlar değişmediyse egzersiz dosyası yazılmaz', async () => {
    const repo = setup();
    await expectOk(saveDevice(repo.files, { ...cable('Benim kablo (yeni ad)', { attachments: ['halat', 'kisa-halat'] }), id: 'benim-kablo' }));
    assert.deepEqual(changes(repo), [`write ${DEV}`]);
  });

  test('temizlik yazılamazsa söylenir; yeniden kaydetmek tamamlar', async () => {
    const repo = setup();
    repo.failNext('write', EX, 409);
    const { status, body } = await saveDevice(repo.files, { ...cable('Benim kablo', { attachments: ['halat'] }), id: 'benim-kablo' });
    assert.equal(status, 409);
    assert.equal(
      body.error,
      'Cihaz kaydedildi ama cihazdan çıkarılan aparat egzersizlerden düşürülemedi; yeniden kaydet. data/exercises.json: kayıt sen çalışırken değişti.',
    );
    assert.deepEqual(find(repo, DEV, 'benim-kablo')?.attachments, ['halat']);
    assert.equal(find(repo, EX, 'benim-pushdown')?.attachmentId, 'kisa-halat');

    await expectOk(saveDevice(repo.files, { ...cable('Benim kablo', { attachments: ['halat'] }), id: 'benim-kablo' }));
    assert.equal(find(repo, EX, 'benim-pushdown')?.attachmentId, undefined);
  });

  test('"Varsayılana dön": hazır sürümde olmayan aparat düşer, hazır sürümdeki kalır, cihaz kalır', async () => {
    const repo = fakeRepo({
      [ATT]: [{ id: 'kisa-halat', name: 'Kısa halat' }],
      [DEV]: [storedCable('kablo-istasyonu', ['halat', 'kisa-halat'])],
      [EX]: [
        storedExercise('kisa-halat-pushdown', { deviceId: 'kablo-istasyonu', attachmentId: 'kisa-halat' }),
        storedExercise('halat-pushdown', { deviceId: 'kablo-istasyonu', attachmentId: 'halat' }),
      ],
    });
    await expectOk(deleteDevice(repo.files, 'kablo-istasyonu'));
    assert.deepEqual(changes(repo), [`write ${EX}`, `write ${DEV}`]);
    assert.deepEqual(
      [find(repo, EX, 'kisa-halat-pushdown')?.deviceId, find(repo, EX, 'kisa-halat-pushdown')?.attachmentId],
      ['kablo-istasyonu', undefined],
    );
    assert.equal(find(repo, EX, 'halat-pushdown')?.attachmentId, 'halat');
  });

  test('hazır egzersiz, PT cihaz sürümünde aparatı yokken kaydedilebilir: PT sürümü aparatsız açılır', async () => {
    const repo = fakeRepo({ [DEV]: [storedCable('kablo-istasyonu', CABLE_WITHOUT_ROPE)] });
    await expectOk(saveExercise(repo.files, { ...faceBody, id: 'kablo-face-pull', description: 'PT notu' }));
    const saved = find(repo, EX, 'kablo-face-pull');
    assert.deepEqual([saved?.deviceId, saved?.attachmentId, saved?.description], ['kablo-istasyonu', undefined, 'PT notu']);
  });

  test('PT’nin kendi seçtiği, cihazda olmayan aparat yine 400', async () => {
    const repo = fakeRepo({ [DEV]: [storedCable('kablo-istasyonu', CABLE_WITHOUT_ROPE)] });
    const { status, body } = await saveExercise(repo.files, { ...faceBody, id: 'kablo-face-pull', attachmentId: 'mag-tutamagi' });
    assert.equal(status, 400);
    assert.deepEqual(body.fields, { attachmentId: 'Bu aparat seçili cihaza takılı değil.' });
  });

  test('hazır egzersize sabitleme de PT sürümünü aparatsız açar', async () => {
    const repo = fakeRepo({ [DEV]: [storedCable('kablo-istasyonu', CABLE_WITHOUT_ROPE)] });
    await expectOk(pinAlternatives(repo.files, 'kablo-face-pull', { alternatives: ['halter-bench-press'] }));
    const saved = find(repo, EX, 'kablo-face-pull');
    assert.deepEqual([saved?.attachmentId, saved?.alternatives], [undefined, ['halter-bench-press']]);
  });
});

describe('silme temizliği ve sırası', () => {
  const setup = () =>
    fakeRepo({
      [ATT]: [{ id: 'kisa-halat', name: 'Kısa halat', image: 'media/attachments/kisa-halat-abc.png' }],
      [DEV]: [
        { ...storedCable('benim-kablo', ['kisa-halat', 'halat']), image: 'media/devices/benim-kablo-abc.png' },
        storedCable('tek-aparatli', ['kisa-halat']),
      ],
      [EX]: [
        storedExercise('benim-pushdown', { deviceId: 'benim-kablo', attachmentId: 'kisa-halat' }),
        storedExercise('halat-pushdown', { deviceId: 'benim-kablo', attachmentId: 'halat' }),
        storedExercise('squat', { alternatives: ['benim-pushdown', 'halat-pushdown'] }),
        storedExercise('lunge', { alternatives: ['benim-pushdown'] }),
      ],
    });

  test('aparat → cihazlar, egzersizler, aparat, fotoğraf, silinen kimlik', async () => {
    const repo = setup();
    repo.putBinary('media/attachments/kisa-halat-abc.png', new Uint8Array([1]));
    await expectOk(deleteAttachment(repo.files, 'kisa-halat'));
    assert.deepEqual(changes(repo), [
      `write ${DEV}`,
      `write ${EX}`,
      `write ${ATT}`,
      'delete media/attachments/kisa-halat-abc.png',
      `write ${RETIRED_IDS_PATH}`,
    ]);
    assert.deepEqual(find(repo, DEV, 'benim-kablo')?.attachments, ['halat']);
    assert.equal('attachments' in (find(repo, DEV, 'tek-aparatli') ?? {}), false);
    assert.equal(find(repo, EX, 'benim-pushdown')?.attachmentId, undefined);
    assert.equal(find(repo, EX, 'benim-pushdown')?.deviceId, 'benim-kablo');
    assert.deepEqual(ids(repo, ATT), []);
  });

  test('cihaz → egzersizlerin cihazı ve aparatı, cihaz, görsel, silinen kimlik', async () => {
    const repo = setup();
    repo.putBinary('media/devices/benim-kablo-abc.png', new Uint8Array([1]));
    await expectOk(deleteDevice(repo.files, 'benim-kablo'));
    assert.deepEqual(changes(repo), [`write ${EX}`, `write ${DEV}`, 'delete media/devices/benim-kablo-abc.png', `write ${RETIRED_IDS_PATH}`]);
    for (const id of ['benim-pushdown', 'halat-pushdown']) {
      assert.deepEqual([find(repo, EX, id)?.deviceId, find(repo, EX, id)?.attachmentId], [undefined, undefined], id);
    }
    assert.deepEqual(ids(repo, DEV), ['tek-aparatli']);
  });

  test('egzersiz → sabitlemeler aynı yazmada düşer, sonra silinen kimlik', async () => {
    const repo = setup();
    await expectOk(deleteExercise(repo.files, 'benim-pushdown'));
    assert.deepEqual(changes(repo), [`write ${EX}`, `write ${RETIRED_IDS_PATH}`]);
    assert.deepEqual(find(repo, EX, 'squat')?.alternatives, ['halat-pushdown']);
    assert.equal('alternatives' in (find(repo, EX, 'lunge') ?? {}), false);
  });

  test('hazır aparatın PT sürümünde varsayılana dönüş bağları bozmaz', async () => {
    const repo = fakeRepo({
      [ATT]: [{ id: 'halat', name: 'Kalın halat' }],
      [DEV]: [storedCable('benim-kablo', ['halat'])],
      [EX]: [storedExercise('halat-pushdown', { deviceId: 'benim-kablo', attachmentId: 'halat' })],
    });
    await expectOk(deleteAttachment(repo.files, 'halat'));
    assert.deepEqual(changes(repo), [`write ${ATT}`]);
    assert.deepEqual(find(repo, DEV, 'benim-kablo')?.attachments, ['halat']);
    assert.equal(find(repo, EX, 'halat-pushdown')?.attachmentId, 'halat');
  });
});

describe('silme yarıda kalırsa ne yapıldığı söylenir, yeniden deneme tamamlar', () => {
  const setup = () =>
    fakeRepo({
      [ATT]: [{ id: 'kisa-halat', name: 'Kısa halat' }],
      [DEV]: [storedCable('benim-kablo', ['kisa-halat'])],
      [EX]: [storedExercise('benim-pushdown', { deviceId: 'benim-kablo', attachmentId: 'kisa-halat' })],
    });

  test('aparat: egzersizler yazılamazsa aparat yerinde durur; ikinci deneme temiz biter', async () => {
    const repo = setup();
    repo.failNext('write', EX, 409);
    const first = await deleteAttachment(repo.files, 'kisa-halat');
    assert.equal(first.status, 409);
    assert.equal(
      first.body.error,
      'Aparat silinmedi: cihazlardan çıkarıldı ama seçili olduğu egzersizlerden çıkarılamadı. data/exercises.json: kayıt sen çalışırken değişti.',
    );
    assert.deepEqual(ids(repo, ATT), ['kisa-halat']);
    assert.equal('attachments' in (find(repo, DEV, 'benim-kablo') ?? {}), false);
    assert.equal(find(repo, EX, 'benim-pushdown')?.attachmentId, 'kisa-halat');

    await expectOk(deleteAttachment(repo.files, 'kisa-halat'));
    assert.deepEqual(ids(repo, ATT), []);
    assert.equal(find(repo, EX, 'benim-pushdown')?.attachmentId, undefined);
    assert.deepEqual(repo.get(RETIRED_IDS_PATH), { exercises: [], devices: [], attachments: ['kisa-halat'] });
  });

  test('aparat: cihazlar yazılamazsa hiçbir şey değişmez', async () => {
    const repo = setup();
    repo.failNext('write', DEV, 502);
    const { status, body } = await deleteAttachment(repo.files, 'kisa-halat');
    assert.equal(status, 502);
    assert.equal(body.error, "Aparat silinmedi: seçili olduğu cihazlardan çıkarılamadı. data/devices.json: GitHub'a ulaşılamadı.");
    assert.deepEqual(changes(repo), [`write ${DEV}`]);
    assert.deepEqual(find(repo, DEV, 'benim-kablo')?.attachments, ['kisa-halat']);
  });

  test('aparat: bağlar kalktı ama aparat dosyası çakıştı; ikinci deneme siler', async () => {
    const repo = setup();
    repo.failNext('write', ATT, 409);
    const first = await deleteAttachment(repo.files, 'kisa-halat');
    assert.equal(first.status, 409);
    assert.equal(first.body.error, 'Aparat bağlı kayıtlarından çıkarıldı ama silinemedi. data/attachments.json: kayıt sen çalışırken değişti.');
    await expectOk(deleteAttachment(repo.files, 'kisa-halat'));
    assert.deepEqual(ids(repo, ATT), []);
  });

  test('cihaz: egzersizler yazılamazsa cihaz durur; cihaz yazılamazsa söylenir; ikinci deneme temiz biter', async () => {
    const repo = setup();
    repo.failNext('write', EX, 409);
    const first = await deleteDevice(repo.files, 'benim-kablo');
    assert.equal(first.status, 409);
    assert.equal(first.body.error, 'Cihaz silinmedi: bağlı egzersizlerden çıkarılamadı. data/exercises.json: kayıt sen çalışırken değişti.');
    assert.deepEqual(ids(repo, DEV), ['benim-kablo']);

    repo.failNext('write', DEV, 409);
    const second = await deleteDevice(repo.files, 'benim-kablo');
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'Cihaz bağlı egzersizlerden çıkarıldı ama silinemedi. data/devices.json: kayıt sen çalışırken değişti.');

    await expectOk(deleteDevice(repo.files, 'benim-kablo'));
    assert.deepEqual(ids(repo, DEV), []);
    assert.equal(find(repo, EX, 'benim-pushdown')?.deviceId, undefined);
  });

  test('son adım (silinen kimlik) yazılamazsa söylenir; yeniden silmek kimliği ayırır', async () => {
    const repo = setup();
    repo.failNext('write', RETIRED_IDS_PATH, 409);
    const first = await deleteExercise(repo.files, 'benim-pushdown');
    assert.equal(first.status, 409);
    assert.equal(
      first.body.error,
      'Egzersiz silindi ama silinenler listesine yazılamadı; silmeyi tekrar dene. data/retired-ids.json: kayıt sen çalışırken değişti.',
    );
    assert.deepEqual(ids(repo, EX), []);
    assert.equal(repo.has(RETIRED_IDS_PATH), false);

    await expectOk(deleteExercise(repo.files, 'benim-pushdown'));
    assert.deepEqual(repo.get(RETIRED_IDS_PATH), { exercises: ['benim-pushdown'], devices: [], attachments: [] });
    assert.equal(await createdId(saveExercise(repo.files, exercise('Benim Pushdown'))), 'benim-pushdown-2');
    // Zaten ayrılmış kimliği yeniden silmek bir şey yazmaz.
    const before = changes(repo).length;
    await expectOk(deleteExercise(repo.files, 'benim-pushdown'));
    assert.equal(changes(repo).length, before);
  });

  test('hazır kaydın PT sürümü yoksa silinemez; kimlik biçimine uymayan yol yazılmaz', async () => {
    const repo = fakeRepo();
    const library = await deleteExercise(repo.files, 'halter-bench-press');
    assert.deepEqual([library.status, library.body.error], [404, 'Bu egzersiz hazır kütüphaneden geliyor, silinemez.']);
    const invalid = await deleteDevice(repo.files, 'Geçersiz Kimlik');
    assert.deepEqual([invalid.status, invalid.body.error], [404, 'Cihaz bulunamadı.']);
    assert.deepEqual(changes(repo), []);
  });
});

describe('görseller', () => {
  test('hazır cihaza görsel PT sürümünü açar; yenisi eskisinin yerine geçer; kaldırınca dosya silinir', async () => {
    const repo = fakeRepo();
    const first = await expectOk(saveDeviceImage(repo.files, 'kablo-istasyonu', new Uint8Array([1, 2, 3]), 'png'));
    assert.match(String(first.image), /^media\/devices\/kablo-istasyonu-[0-9a-f]{10}\.png$/);
    assert.equal(find(repo, DEV, 'kablo-istasyonu')?.image, first.image);
    assert.ok(repo.bytes(String(first.image)));

    const second = await expectOk(saveDeviceImage(repo.files, 'kablo-istasyonu', new Uint8Array([4, 5, 6]), 'webp'));
    assert.equal(repo.has(String(first.image)), false);
    assert.equal(find(repo, DEV, 'kablo-istasyonu')?.image, second.image);

    await expectOk(removeDeviceImage(repo.files, 'kablo-istasyonu'));
    assert.equal('image' in (find(repo, DEV, 'kablo-istasyonu') ?? {}), false);
    assert.equal(repo.has(String(second.image)), false);
  });

  test('aparat fotoğrafı da aynı yoldan; bilinmeyen aparat 404', async () => {
    const repo = fakeRepo();
    const saved = await expectOk(saveAttachmentImage(repo.files, 'halat', new Uint8Array([1]), 'jpg'));
    assert.match(String(saved.image), /^media\/attachments\/halat-[0-9a-f]{10}\.jpg$/);
    const missing = await saveAttachmentImage(repo.files, 'yok-boyle', new Uint8Array([1]), 'jpg');
    assert.deepEqual([missing.status, missing.body.error], [404, 'Aparat bulunamadı.']);
  });
});
