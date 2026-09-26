import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { passwordLoginSchema, setPasswordSchema } from './auth.ts';

function issues(input: unknown): Record<string, string> {
  const result = v.safeParse(setPasswordSchema, input);
  if (result.success) return {};
  return Object.fromEntries(result.issues.map((issue) => [issue.path?.map((segment) => String(segment.key)).join('.') ?? '', issue.message]));
}

describe('şifre belirleme şeması (form ve uç aynı)', () => {
  test('7 karakter reddedilir, 8 geçer; kırpılmaz', () => {
    assert.match(issues({ password: 'mavi-de', confirm: 'mavi-de' }).password ?? '', /en az 8/);
    assert.deepEqual(issues({ password: 'mavi-den', confirm: 'mavi-den' }), {});
    assert.equal(v.parse(setPasswordSchema, { password: ' mavi-den ', confirm: ' mavi-den ' }).password, ' mavi-den ');
  });

  test('yaygın ve sıralı şifre, uyuşmayan tekrar alan hatasıyla', () => {
    assert.match(issues({ password: 'galatasaray1905', confirm: 'galatasaray1905' }).password ?? '', /yaygın/);
    assert.match(issues({ password: 'abcdefgh', confirm: 'abcdefgh' }).password ?? '', /sıralı/);
    assert.deepEqual(issues({ password: 'mavi-deniz-42', confirm: 'mavi-deniz-43' }), { confirm: 'Şifreler aynı değil.' });
  });

  test('giriş şeması uzunluğu denetlemez (yanlış şifre "yanlış" yanıtını alsın), boş ve aşırı uzunu keser', () => {
    assert.equal(v.is(passwordLoginSchema, { password: '1234' }), true);
    assert.equal(v.is(passwordLoginSchema, { password: '' }), false);
    assert.equal(v.is(passwordLoginSchema, { password: 'x'.repeat(129) }), false);
  });
});
