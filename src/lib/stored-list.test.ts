import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { customAttachmentsSchema } from './schemas/attachment.ts';
import { customDevicesSchema } from './schemas/device.ts';
import { customExercisesSchema } from './schemas/exercise.ts';
import { brokenRecordMessage, hasUnreadable, parseStoredList, storedIds, storedListContent } from './stored-list.ts';

const exercise = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Hareket ${id}`,
  description: '',
  cues: [],
  category: 'compound',
  trackingType: 'weight_reps',
  equipment: 'barbell',
  pattern: 'squat',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['glutes'],
  stabilizerMuscles: [],
  loadStepKg: 2.5,
  minLoadKg: 20,
  ...extra,
});

// 12'li dönemden kalma kayıt: 6 eski yardımcı kas çevrilince 12 parça olur, sınır 10.
const legacy = {
  id: 'benim-burpee',
  title: 'Benim Burpee',
  description: '',
  cues: [],
  category: 'compound',
  trackingType: 'bodyweight_reps',
  equipment: 'bodyweight',
  targetMuscle: 'chest',
  secondaryMuscles: ['shoulders', 'triceps', 'core', 'quadriceps', 'glutes', 'calves'],
  loadIncrementKg: 0,
  minLoadKg: 0,
};

describe('PT kayıt dosyası öğe öğe okunur', () => {
  test('şemaya uymayan tek kayıt yalnız kendisi düşer; diğerleri okunur', () => {
    const file = parseStoredList(customExercisesSchema, [exercise('pt-squat-a'), legacy, exercise('pt-squat-b')]);
    assert.ok(file);
    assert.deepEqual(
      file.items.map((item) => item.id),
      ['pt-squat-a', 'pt-squat-b'],
    );
    assert.deepEqual(file.unreadable, [legacy]);
  });

  test('yeni kayıt eklemek okunamayanı silmez: olduğu gibi listenin sonuna yazılır', () => {
    const file = parseStoredList(customExercisesSchema, [exercise('pt-squat-a'), legacy, exercise('pt-squat-b')]);
    assert.ok(file);
    const written = storedListContent([...file.items, exercise('yeni-hareket')], file.unreadable);
    assert.deepEqual(
      written.map((item) => (item as { id: string }).id),
      ['pt-squat-a', 'pt-squat-b', 'yeni-hareket', 'benim-burpee'],
    );
    // Ham hâliyle: çevrilmez, alanları değişmez.
    assert.deepEqual(written.at(-1), legacy);

    // Yazılan dosya yeniden okununca aynı ayrım çıkar; hiçbir kayıt kaybolmaz.
    const reread = parseStoredList(customExercisesSchema, JSON.parse(JSON.stringify(written)));
    assert.ok(reread);
    assert.deepEqual(
      reread.items.map((item) => item.id),
      ['pt-squat-a', 'pt-squat-b', 'yeni-hareket'],
    );
    assert.deepEqual(reread.unreadable, [legacy]);
  });

  test('bütün kayıtlar okunamasa da dosya boş sayılmaz', () => {
    const file = parseStoredList(customExercisesSchema, [legacy, exercise('v')]);
    assert.ok(file);
    assert.deepEqual(file.items, []);
    assert.equal(file.unreadable.length, 2);
    assert.equal(storedListContent(file.items, file.unreadable).length, 2);
  });

  test('aynı kimlikte geçerli olan kullanılır, okunamayan yine korunur', () => {
    const broken = exercise('pt-squat-a', { primaryMuscles: [] });
    const file = parseStoredList(customExercisesSchema, [broken, exercise('pt-squat-a')]);
    assert.ok(file);
    assert.deepEqual(
      file.items.map((item) => item.id),
      ['pt-squat-a'],
    );
    assert.deepEqual(file.unreadable, [broken]);
    assert.deepEqual(storedListContent(file.items, file.unreadable).at(-1), broken);
  });

  test('cihaz ve aparat dosyalarında da tek karakterlik kimlik yalnız kendi kaydını düşürür', () => {
    const devices = parseStoredList(customDevicesSchema, [
      { id: 'cihaz-bir', name: 'Cihaz Bir', kind: 'bodyweight' },
      { id: 'x', name: 'X.', kind: 'bodyweight' },
    ]);
    assert.ok(devices);
    assert.deepEqual(
      devices.items.map((item) => item.id),
      ['cihaz-bir'],
    );
    assert.equal(devices.unreadable.length, 1);

    const attachments = parseStoredList(customAttachmentsSchema, [
      { id: 'aparat-bir', name: 'Aparat Bir' },
      { id: 'v', name: 'V.' },
    ]);
    assert.ok(attachments);
    assert.deepEqual(
      attachments.items.map((item) => item.id),
      ['aparat-bir'],
    );
    assert.deepEqual(attachments.unreadable, [{ id: 'v', name: 'V.' }]);
  });

  test('içerik liste değilse dosya bozuk sayılır (null): üzerine yazılmaz', () => {
    assert.equal(parseStoredList(customExercisesSchema, { id: 'x' }), null);
    assert.equal(parseStoredList(customExercisesSchema, null), null);
    assert.equal(parseStoredList(customAttachmentsSchema, 'metin'), null);
  });

  test('okunamayan kayıtların kimlikleri de dolu sayılır', () => {
    const file = parseStoredList(customAttachmentsSchema, [{ id: 'aparat-bir', name: 'Aparat Bir' }, { id: 'eski-aparat', name: 'X' }, 42]);
    assert.ok(file);
    assert.deepEqual(storedIds(file), ['aparat-bir', 'eski-aparat']);
  });
});

describe('aynı kimlik dosyada iki kez (elle çoğaltma ya da eski hatanın bıraktığı kayıt)', () => {
  test('ilk geçerli kayıt kullanılır; ikincisi okunamayan sayılır ve ham hâliyle korunur', () => {
    const first = exercise('halter-bench-press', { title: 'Uygulamada sabitlenen sürüm', alternatives: ['pt-a'] });
    const second = exercise('halter-bench-press', { title: "GitHub'da düzeltilen eski kayıt" });
    const file = parseStoredList(customExercisesSchema, [exercise('pt-a'), first, second]);
    assert.ok(file);
    assert.deepEqual(
      file.items.map((item) => [item.id, item.title]),
      [
        ['pt-a', 'Hareket pt-a'],
        ['halter-bench-press', 'Uygulamada sabitlenen sürüm'],
      ],
    );
    assert.deepEqual(file.unreadable, [second]);
    // Yazınca kaybolmaz: sona, olduğu gibi.
    assert.deepEqual(storedListContent(file.items, file.unreadable).at(-1), second);
  });

  test('cihaz ve aparat dosyalarında da tekilleşir', () => {
    const devices = parseStoredList(customDevicesSchema, [
      { id: 'benim-kablo', name: 'İlk', kind: 'bodyweight' },
      { id: 'benim-kablo', name: 'İkinci', kind: 'bodyweight' },
    ]);
    assert.ok(devices);
    assert.deepEqual(
      devices.items.map((item) => item.name),
      ['İlk'],
    );
    const attachments = parseStoredList(customAttachmentsSchema, [
      { id: 'kisa-halat', name: 'Kısa halat' },
      { id: 'kisa-halat', name: 'Kısa halat (kopya)' },
    ]);
    assert.ok(attachments);
    assert.deepEqual(
      attachments.items.map((item) => item.name),
      ['Kısa halat'],
    );
    assert.equal(attachments.unreadable.length, 1);
  });
});

describe('okunamayan kaydın kimliğine yazılmaz', () => {
  test('bozuk kayıt ya da ikinci kayıt o kimliği kilitler; diğer kimlikler serbest', () => {
    const broken = exercise('halter-bench-press', { primaryMuscles: [] });
    const file = parseStoredList(customExercisesSchema, [broken, exercise('pt-a'), exercise('pt-a', { title: 'Kopya' }), 42]);
    assert.ok(file);
    assert.equal(hasUnreadable(file, 'halter-bench-press'), true);
    assert.equal(hasUnreadable(file, 'pt-a'), true);
    assert.equal(hasUnreadable(file, 'pt-b'), false);
  });

  test('mesaj düzeltilecek dosyayı söyler', () => {
    assert.equal(brokenRecordMessage('data/exercises.json'), 'Bu kayıt dosyada bozuk; önce data/exercises.json içinde düzelt.');
  });
});
