import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { decimalText, measurementAddSchema, measurementDaySchema, measurementFormSchema, parseDecimal } from './measurement.ts';

describe('ondalık virgül', () => {
  test('"81,5" ve "81.5" ikisi de 81,5; boş alan değer değil', () => {
    assert.equal(parseDecimal('81,5'), 81.5);
    assert.equal(parseDecimal('81.5'), 81.5);
    assert.equal(parseDecimal(' 81 , 5 '), 81.5);
    assert.equal(parseDecimal('81'), 81);
    assert.equal(parseDecimal('81,'), 81);
    assert.equal(parseDecimal(',5'), 0.5);
    assert.equal(parseDecimal(''), undefined);
    assert.equal(parseDecimal('   '), undefined);
  });

  test('sayı olmayan metin NaN: sessizce boş sayılmaz', () => {
    for (const text of ['81,5,3', '1.000,5', 'abc', '8a', '-', ',']) {
      assert.ok(Number.isNaN(parseDecimal(text)), text);
    }
  });

  test('kutudaki Türkçe hal geri okunur', () => {
    assert.equal(decimalText(81.5), '81,5');
    assert.equal(decimalText(90), '90');
    assert.equal(parseDecimal(decimalText(12.25)), 12.25);
  });
});

describe('ölçüm formu şeması', () => {
  const form = (values: Record<string, string>) => v.safeParse(measurementFormSchema, { date: '2026-09-26', sex: 'unknown', values });

  test('virgüllü ve noktalı değerler sayıya çevrilir; boş alan çıkar', () => {
    const result = form({ body_mass: '81,5', waist_girth: '87.9', hip_girth: '' });
    assert.ok(result.success);
    assert.equal(result.output.values.body_mass, 81.5);
    assert.equal(result.output.values.waist_girth, 87.9);
    assert.equal(result.output.values.hip_girth, undefined);
  });

  test('geçersiz, negatif ve sınır üstü değerde alanın hatası', () => {
    const message = (values: Record<string, string>) => {
      const result = form(values);
      assert.ok(!result.success);
      return result.issues[0]!.message;
    };
    assert.equal(message({ body_mass: '81,5,3' }), 'Sayı gir.');
    assert.equal(message({ body_mass: '-2' }), 'Negatif olamaz.');
    assert.equal(message({ odi: '120' }), 'En fazla 100.');
  });
});

describe('ölçüm API şeması', () => {
  test('değer sayı ya da virgüllü/noktalı metin olabilir', () => {
    const added = v.safeParse(measurementAddSchema, {
      date: '2026-09-26',
      values: [
        { id: 'body_mass', value: '81,5' },
        { id: 'waist_girth', value: '87.9' },
        { id: 'hip_girth', value: 101 },
      ],
    });
    assert.ok(added.success);
    assert.deepEqual(
      added.output.values.map((item) => item.value),
      [81.5, 87.9, 101],
    );
  });

  test('sayı olmayan metin ve boş değer reddedilir', () => {
    assert.equal(v.safeParse(measurementDaySchema, { values: [{ id: 'body_mass', value: 'seksen' }] }).success, false);
    assert.equal(v.safeParse(measurementDaySchema, { values: [{ id: 'body_mass', value: '' }] }).success, false);
    assert.equal(v.safeParse(measurementDaySchema, { values: [{ id: 'body_mass', value: null }] }).success, false);
  });
});
