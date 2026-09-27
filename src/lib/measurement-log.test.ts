import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {
  addMeasurements,
  checkValues,
  isCalendarDate,
  MEASUREMENT_SLOTS,
  measurementDays,
  measurementLock,
  measurementsOn,
  removeMeasurementDate,
  replaceMeasurements,
  slotKey,
  slotsFromValues,
  valuesFromSlots,
} from './measurement-log.ts';
import { MEASUREMENT_IDS } from './measurements.ts';
import { HEALTH_CONSENT_VERSION, type Client, type HealthField } from './schemas/client.ts';
import { healthRecordSchema, type MeasurementEntry } from './schemas/health.ts';

describe('form alanları', () => {
  test('iki taraflı ölçümde sol ve sağ ayrı alan, diğerlerinde tek alan', () => {
    const keys = MEASUREMENT_SLOTS.map((slot) => slot.key);
    assert.ok(keys.includes('waist_girth'));
    assert.ok(keys.includes('calf_girth:left') && keys.includes('calf_girth:right'));
    assert.ok(!keys.includes('calf_girth'));
    // Hata yolu noktayla bölünür: anahtarda nokta olmamalı.
    assert.ok(keys.every((key) => !key.includes('.')));
    for (const id of MEASUREMENT_IDS) assert.ok(MEASUREMENT_SLOTS.some((slot) => slot.id === id), `${id} alanı yok`);
  });

  test('yalnız doldurulan alanlar değere dönüşür, katalog sırasıyla', () => {
    const values = valuesFromSlots({
      'calf_girth:right': 38,
      body_mass: 72.5,
      waist_girth: undefined,
      hip_girth: Number.NaN,
      unknown_thing: 3,
    });
    assert.deepEqual(values, [
      { id: 'body_mass', value: 72.5 },
      { id: 'calf_girth', value: 38, side: 'right' },
    ]);
  });

  test('kayıttan alanlara ve geri', () => {
    const entries: MeasurementEntry[] = [
      { date: '2026-09-01', id: 'waist_girth', value: 82 },
      { date: '2026-09-01', id: 'side_bridge_endurance', value: 60, side: 'left' },
    ];
    const slots = slotsFromValues(entries);
    assert.deepEqual(slots, { waist_girth: 82, [slotKey('side_bridge_endurance', 'left')]: 60 });
    assert.deepEqual(valuesFromSlots(slots), [
      { id: 'waist_girth', value: 82 },
      { id: 'side_bridge_endurance', value: 60, side: 'left' },
    ]);
  });
});

describe('sunucu denetimi', () => {
  test('taraf kuralı, aralık ve tekrar alan anahtarıyla döner', () => {
    const { values, errors } = checkValues([
      { id: 'calf_girth', value: 38 },
      { id: 'waist_girth', value: 80, side: 'left' },
      { id: 'odi', value: 120 },
      { id: 'body_mass', value: -1 },
      { id: 'hip_girth', value: 100 },
      { id: 'hip_girth', value: 101 },
    ]);
    assert.deepEqual(values, [{ id: 'hip_girth', value: 100 }]);
    assert.deepEqual(errors, {
      'calf_girth:left': 'Sol ya da sağ taraf belirtilmeli.',
      waist_girth: 'Bu ölçüm tek değerdir; taraf yok.',
      odi: 'En fazla 100.',
      body_mass: 'Negatif olamaz.',
      hip_girth: 'Aynı ölçüm iki kez girilmiş.',
    });
  });

  test('geçerli değerler katalog ve taraf sırasına dizilir', () => {
    const { values, errors } = checkValues([
      { id: 'side_bridge_endurance', value: 50, side: 'right' },
      { id: 'side_bridge_endurance', value: 55, side: 'left' },
      { id: 'body_mass', value: 70 },
    ]);
    assert.deepEqual(errors, {});
    assert.deepEqual(
      values.map((value) => slotKey(value.id, value.side)),
      ['body_mass', 'side_bridge_endurance:left', 'side_bridge_endurance:right'],
    );
  });

  test('takvim günü', () => {
    assert.equal(isCalendarDate('2026-09-01'), true);
    assert.equal(isCalendarDate('2024-02-29'), true);
    assert.equal(isCalendarDate('2026-02-30'), false);
    assert.equal(isCalendarDate('2026-9-1'), false);
    assert.equal(isCalendarDate('../health'), false);
  });
});

describe('kayıt şeması', () => {
  const kayit = {
    conditions: [],
    surgeryDate: '2026-08-01',
    checkIns: [{ date: '2026-09-01', redFlag: 'none' }],
    measurements: [{ date: '2024-02-29', id: 'waist_girth', value: 82 }],
    movementScreens: [{ date: '2026-09-01', entries: { deep_squat: { score: 2 } } }],
  };

  test('takvimde olmayan gün kaydı bozuk sayar: sayfada sorun görünür, üzerine yazılmaz', () => {
    assert.equal(v.safeParse(healthRecordSchema, kayit).success, true);
    // Elle düzenlenmiş dosyada 30 Şubat: "2 Mart" diye listelenip düzenlenemez ve silinemez olmasın.
    const bozuklar = [
      { ...kayit, measurements: [{ date: '2026-02-30', id: 'waist_girth', value: 82 }] },
      { ...kayit, checkIns: [{ date: '2026-04-31' }] },
      { ...kayit, surgeryDate: '2026-06-31' },
    ];
    for (const bozuk of bozuklar) assert.equal(v.safeParse(healthRecordSchema, bozuk).success, false, JSON.stringify(bozuk));
  });
});

describe('kayıt listesi', () => {
  const list: MeasurementEntry[] = [
    { date: '2026-08-01', id: 'waist_girth', value: 84 },
    { date: '2026-09-01', id: 'waist_girth', value: 82 },
    { date: '2026-09-01', id: 'calf_girth', value: 37, side: 'left' },
  ];

  test('aynı güne ekleme: aynı ölçüm yenilenir, diğerleri kalır', () => {
    const next = addMeasurements(list, '2026-09-01', [
      { id: 'waist_girth', value: 81 },
      { id: 'calf_girth', value: 38, side: 'right' },
      { id: 'body_mass', value: 70 },
    ]);
    assert.deepEqual(next, [
      { date: '2026-08-01', id: 'waist_girth', value: 84 },
      { date: '2026-09-01', id: 'body_mass', value: 70 },
      { date: '2026-09-01', id: 'waist_girth', value: 81 },
      { date: '2026-09-01', id: 'calf_girth', value: 37, side: 'left' },
      { date: '2026-09-01', id: 'calf_girth', value: 38, side: 'right' },
    ]);
    // Girdi değişmez.
    assert.equal(list.length, 3);
  });

  test('yeni gün tarih sırasına girer', () => {
    const next = addMeasurements(list, '2026-08-15', [{ id: 'waist_girth', value: 83 }]);
    assert.deepEqual(
      next.map((entry) => entry.date),
      ['2026-08-01', '2026-08-15', '2026-09-01', '2026-09-01'],
    );
  });

  test('günü değiştirme: boşaltılan değer çıkar, başka günlere dokunulmaz', () => {
    const next = replaceMeasurements(list, '2026-09-01', [{ id: 'waist_girth', value: 80 }]);
    assert.deepEqual(next, [
      { date: '2026-08-01', id: 'waist_girth', value: 84 },
      { date: '2026-09-01', id: 'waist_girth', value: 80 },
    ]);
  });

  test('günü silme', () => {
    assert.deepEqual(removeMeasurementDate(list, '2026-09-01'), [{ date: '2026-08-01', id: 'waist_girth', value: 84 }]);
    assert.deepEqual(removeMeasurementDate(list, '2026-07-01'), list);
  });

  test('günün değerleri ve gün listesi (en yenisi önce)', () => {
    assert.equal(measurementsOn(list, '2026-09-01').length, 2);
    assert.deepEqual(measurementDays(list), [
      { date: '2026-09-01', ids: ['waist_girth', 'calf_girth'], count: 2 },
      { date: '2026-08-01', ids: ['waist_girth'], count: 1 },
    ]);
  });
});

describe('kayıt izni', () => {
  const at = '2026-09-01T10:00:00.000Z';
  function client(
    enabled: boolean,
    fields: HealthField[],
    consent?: { granted: boolean; fields: HealthField[]; version?: string },
  ): Pick<Client, 'modules' | 'consents'> {
    return {
      modules: { health: { enabled, fields, ...(enabled ? { enabledAt: at } : {}) } },
      consents: consent
        ? { health: { granted: consent.granted, fields: consent.fields, version: consent.version ?? HEALTH_CONSENT_VERSION, at } }
        : {},
    };
  }

  test('modül açık, parça seçili ve güncel onay varsa yazılır', () => {
    assert.equal(measurementLock(client(true, ['measurements'], { granted: true, fields: ['measurements'] })), null);
  });

  test('her kilidin nedeni ayrı', () => {
    assert.equal(measurementLock(client(false, [])), 'off');
    assert.equal(measurementLock(client(true, ['conditions'], { granted: true, fields: ['conditions'] })), 'not_selected');
    assert.equal(measurementLock(client(true, ['measurements'])), 'pending');
    assert.equal(measurementLock(client(true, ['measurements'], { granted: false, fields: [] })), 'declined');
    // Onay "Ölçümler" eklenmeden önce verilmiş.
    assert.equal(measurementLock(client(true, ['conditions', 'measurements'], { granted: true, fields: ['conditions'] })), 'outdated');
    // Eski metin sürümüne verilmiş onay.
    assert.equal(
      measurementLock(client(true, ['measurements'], { granted: true, fields: ['measurements'], version: '2020-01' })),
      'outdated',
    );
  });
});
