import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentChoiceProblem,
  attachmentChoices,
  dropAttachmentFromDevices,
  dropAttachmentFromExercises,
  dropDetachedAttachments,
  dropDeviceFromExercises,
  dropPinnedAlternative,
  unknownAttachmentsProblem,
} from './catalog-refs.ts';

/** Dosyaya yazılan hâl: `undefined` alanlar düşer. */
const asWritten = (value: unknown) => JSON.parse(JSON.stringify(value));

const devices = [
  { id: 'benim-kablo', name: 'Benim kablo', attachments: ['kisa-halat', 'halat'] },
  { id: 'tek-aparatli', name: 'Tek aparatlı', attachments: ['kisa-halat'] },
  { id: 'aparatsiz', name: 'Aparatsız' },
];

const exercises = [
  { id: 'benim-pushdown', deviceId: 'benim-kablo', attachmentId: 'kisa-halat', equipment: 'cable', loadStepKg: 2.5 },
  { id: 'halat-pushdown', deviceId: 'benim-kablo', attachmentId: 'halat', equipment: 'cable', loadStepKg: 2.5 },
  { id: 'squat', equipment: 'barbell', loadStepKg: 2.5, alternatives: ['benim-pushdown', 'halat-pushdown'] },
  { id: 'lunge', equipment: 'barbell', loadStepKg: 2.5, alternatives: ['benim-pushdown'] },
];

describe('silinen aparat', () => {
  test('seçili olduğu cihazlardan düşer; boşalan liste dosyaya yazılmaz', () => {
    const next = dropAttachmentFromDevices(devices, 'kisa-halat');
    assert.ok(next);
    assert.deepEqual(asWritten(next), [
      { id: 'benim-kablo', name: 'Benim kablo', attachments: ['halat'] },
      { id: 'tek-aparatli', name: 'Tek aparatlı' },
      { id: 'aparatsiz', name: 'Aparatsız' },
    ]);
    // Etkilenmeyen kayıt olduğu gibi kalır.
    assert.equal(next[2], devices[2]);
  });

  test('seçili olduğu egzersizlerden düşer; cihazı ve diğer alanları kalır', () => {
    const next = dropAttachmentFromExercises(exercises, 'kisa-halat');
    assert.ok(next);
    assert.deepEqual(asWritten(next[0]), { id: 'benim-pushdown', deviceId: 'benim-kablo', equipment: 'cable', loadStepKg: 2.5 });
    assert.equal(next[1], exercises[1]);
  });

  test('hiçbir yerde seçili değilse yazılacak bir şey yok', () => {
    assert.equal(dropAttachmentFromDevices(devices, 'v-bar-ucgen'), null);
    assert.equal(dropAttachmentFromExercises(exercises, 'v-bar-ucgen'), null);
  });

  test('aynı adla yeniden açılan aparat eski bağları devralmaz', () => {
    const cleanedDevices = dropAttachmentFromDevices(devices, 'kisa-halat') ?? devices;
    const cleanedExercises = dropAttachmentFromExercises(exercises, 'kisa-halat') ?? exercises;
    // Yeni "Kısa halat" yine `kisa-halat` kimliğini alsa da ona bağlı kayıt kalmadı.
    assert.ok(!cleanedDevices.some((device) => device.attachments?.includes('kisa-halat')));
    assert.ok(!cleanedExercises.some((exercise) => exercise.attachmentId === 'kisa-halat'));
  });
});

describe('silinen cihaz', () => {
  test('bağlı egzersizler cihazsız kalır, cihazdan seçilen aparat da düşer', () => {
    const next = dropDeviceFromExercises(exercises, 'benim-kablo');
    assert.ok(next);
    assert.deepEqual(asWritten(next.slice(0, 2)), [
      { id: 'benim-pushdown', equipment: 'cable', loadStepKg: 2.5 },
      { id: 'halat-pushdown', equipment: 'cable', loadStepKg: 2.5 },
    ]);
    assert.equal(next[2], exercises[2]);
  });

  test('bağlı egzersiz yoksa yazılacak bir şey yok', () => {
    assert.equal(dropDeviceFromExercises(exercises, 'olimpik-bar'), null);
  });
});

describe('cihazın aparatları değişti (aparat çıkarma, tür değişimi, varsayılana dönüş)', () => {
  test('cihazda artık olmayan aparat o cihazın egzersizlerinden düşer; cihaz kalır', () => {
    const next = dropDetachedAttachments(exercises, 'benim-kablo', ['halat']);
    assert.ok(next);
    assert.deepEqual(asWritten(next[0]), { id: 'benim-pushdown', deviceId: 'benim-kablo', equipment: 'cable', loadStepKg: 2.5 });
    // Halat cihazda duruyor: seçimi kalır.
    assert.equal(next[1], exercises[1]);
    assert.equal(next[2], exercises[2]);
  });

  test('aparatı kalmayan cihaz (ör. bar yapıldı): bütün seçimler düşer', () => {
    const next = dropDetachedAttachments(exercises, 'benim-kablo', undefined);
    assert.ok(next);
    assert.deepEqual(
      next.map((exercise) => exercise.attachmentId),
      [undefined, undefined, undefined, undefined],
    );
  });

  test('başka cihazın egzersizine dokunulmaz; değişen yoksa yazılacak bir şey yok', () => {
    const other = [{ id: 'tek-kol', deviceId: 'tek-aparatli', attachmentId: 'kisa-halat' }];
    assert.equal(dropDetachedAttachments(other, 'benim-kablo', []), null);
    assert.equal(dropDetachedAttachments(exercises, 'benim-kablo', ['kisa-halat', 'halat']), null);
  });
});

describe('silinen egzersiz', () => {
  test('başka egzersizlerdeki sabitlemelerden düşer; boşalan liste dosyaya yazılmaz', () => {
    const next = dropPinnedAlternative(exercises, 'benim-pushdown');
    assert.ok(next);
    assert.deepEqual(next[2]?.alternatives, ['halat-pushdown']);
    assert.equal('alternatives' in asWritten(next[3]), false);
    assert.equal(next[0], exercises[0]);
  });

  test('hiçbir yerde sabitli değilse yazılacak bir şey yok', () => {
    assert.equal(dropPinnedAlternative(exercises, 'deadlift'), null);
  });
});

describe('kaydederken bağlar denetlenir', () => {
  test('cihazın aparatları havuzda olmalı', () => {
    const pool = new Set(['halat', 'kisa-halat']);
    assert.equal(unknownAttachmentsProblem(['halat', 'kisa-halat'], pool), null);
    assert.equal(
      unknownAttachmentsProblem(['kisa-halat', 'havuzda-hic-olmayan'], pool),
      'Havuzda olmayan aparat seçilemez: havuzda-hic-olmayan.',
    );
  });

  test('egzersizin aparatı cihazının aparatlarından biri olmalı', () => {
    const cable = { attachments: ['halat', 'kisa-halat'] };
    assert.equal(attachmentChoiceProblem({ deviceId: 'benim-kablo', attachmentId: 'halat' }, cable), null);
    assert.equal(attachmentChoiceProblem({ deviceId: 'benim-kablo' }, cable), null);
    assert.equal(attachmentChoiceProblem({}, undefined), null);
    assert.equal(
      attachmentChoiceProblem({ deviceId: 'olimpik-bar', attachmentId: 'halat' }, { attachments: undefined }),
      'Bu aparat seçili cihaza takılı değil.',
    );
    assert.equal(
      attachmentChoiceProblem({ deviceId: 'silinmis-cihaz', attachmentId: 'halat' }, undefined),
      'Bu aparat seçili cihaza takılı değil.',
    );
    assert.equal(attachmentChoiceProblem({ attachmentId: 'halat' }, undefined), 'Cihazsız egzersizde aparat seçilemez.');
  });

  test('formda seçilebilen aparatlar: cihaza takılı ve havuzda olanlar, cihazdaki sırayla', () => {
    const pool = new Map([
      ['halat', { id: 'halat', name: 'Halat' }],
      ['kisa-halat', { id: 'kisa-halat', name: 'Kısa halat' }],
    ]);
    assert.deepEqual(
      attachmentChoices({ attachments: ['kisa-halat', 'silinmis', 'halat'] }, pool).map((item) => item.id),
      ['kisa-halat', 'halat'],
    );
    assert.deepEqual(attachmentChoices({}, pool), []);
    assert.deepEqual(attachmentChoices(undefined, pool), []);
  });
});
