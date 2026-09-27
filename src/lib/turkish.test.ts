import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accusative, dative } from './turkish.ts';

describe('dative: serbest metin ada yönelme eki', () => {
  test('ünsüz ve ünlüyle biten, kalın ve ince', () => {
    assert.equal(dative('Evde'), "Evde'ye");
    assert.equal(dative('Tatil'), "Tatil'e");
    assert.equal(dative('Kardiyo'), "Kardiyo'ya");
    assert.equal(dative('Salon'), "Salon'a");
    assert.equal(dative('Üst vücut'), "Üst vücut'a");
    assert.equal(dative(' Güç '), "Güç'e");
    assert.equal(dative('Programım'), "Programım'a");
  });

  test('sayıyla ve ünlüsüz kısaltmayla biten', () => {
    assert.equal(dative('Programım 2'), "Programım 2'ye");
    assert.equal(dative('Programım 3'), "Programım 3'e");
    assert.equal(dative('Blok 6'), "Blok 6'ya");
    assert.equal(dative('Hafta 10'), "Hafta 10'a");
    assert.equal(dative('PPL'), "PPL'ye");
  });

  test('boş ad değişmez', () => {
    assert.equal(dative('  '), '');
  });
});

describe('accusative: serbest metin ada belirtme eki', () => {
  test('dörtlü uyum ve kaynaştırma', () => {
    assert.equal(accusative('Evde'), "Evde'yi");
    assert.equal(accusative('Tatil'), "Tatil'i");
    assert.equal(accusative('Kardiyo'), "Kardiyo'yu");
    assert.equal(accusative('Salon'), "Salon'u");
    assert.equal(accusative('Güç'), "Güç'ü");
    assert.equal(accusative('Programım'), "Programım'ı");
  });

  test('sayıyla ve ünlüsüz kısaltmayla biten', () => {
    assert.equal(accusative('Programım 2'), "Programım 2'yi");
    assert.equal(accusative('Programım 3'), "Programım 3'ü");
    assert.equal(accusative('Blok 6'), "Blok 6'yı");
    assert.equal(accusative('Hafta 10'), "Hafta 10'u");
    assert.equal(accusative('PPL'), "PPL'yi");
  });
});
