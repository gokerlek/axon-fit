import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_PASSWORDS, passwordProblem } from './password-rules.ts';

describe('şifre kuralları (form ve sunucu aynı kuraldan)', () => {
  test('uzunluk: 8–128 karakter; emoji tek karakter sayılır', () => {
    assert.match(passwordProblem('mavi-de') ?? '', /en az 8/);
    assert.equal(passwordProblem('mavi-den'), null);
    assert.match(passwordProblem('😀😀😀😀') ?? '', /en az 8/);
    assert.match(passwordProblem(`mavi-${'x'.repeat(124)}`) ?? '', /en fazla 128/);
  });

  test('yaygın şifreler (Türkçe dahil): büyük-küçük harf ve Türkçe harf fark etmez', () => {
    assert.ok(COMMON_PASSWORDS.size >= 90);
    for (const weak of ['12345678', 'password1', 'galatasaray1905', 'GALATASARAY1905', 'Fenerbahçe1907', 'beşiktaş1903', 'İstanbul34', 'şifre123', 'qwertyui']) {
      assert.match(passwordProblem(weak) ?? '', /yaygın/, weak);
    }
  });

  test('sıralı ya da tekrarlanan karakterler', () => {
    for (const weak of ['aaaaaaaa', '99999999', 'abcdefgh', 'hgfedcba', '23456789', 'abababab', '56785678', 'xyzxyzxyz']) {
      assert.match(passwordProblem(weak) ?? '', /sıralı ya da tekrarlanan/, weak);
    }
  });

  test('sıradan ama tahmini zor şifreler geçer', () => {
    for (const ok of ['mavi-deniz-42', 'Kırmızı Bisiklet', 'turuncu-dag-77', 'ab12cd34ef']) assert.equal(passwordProblem(ok), null, ok);
  });
});
