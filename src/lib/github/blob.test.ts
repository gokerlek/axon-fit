import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, jsonText } from './blob.ts';
import { GithubError, rateLimitOf } from './errors.ts';

describe('blob kimliği', () => {
  test('git hash-object ile aynı ("hello\\n", boş dosya)', () => {
    assert.equal(gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
    assert.equal(gitBlobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });

  test('JSON metni: 2 boşluk, sonda satır sonu; Türkçe harfler UTF-8 bayt sayısıyla', () => {
    assert.equal(jsonText({ a: 1 }), '{\n  "a": 1\n}\n');
    assert.notEqual(gitBlobSha(jsonText({ ad: 'Gün A' })), gitBlobSha(jsonText({ ad: 'Gun A' })));
  });
});

describe('istek sınırı', () => {
  test('429 her zaman sınır; başlıklar sayıya', () => {
    assert.deepEqual(rateLimitOf(429, { 'retry-after': '30', 'x-ratelimit-remaining': '12' }), { rateLimited: true, retryAfter: 30, remaining: 12 });
  });

  test('403 yalnız kota bittiyse, retry-after geldiyse ya da ikincil sınır mesajıysa', () => {
    assert.equal(rateLimitOf(403, { 'x-ratelimit-remaining': '0' }).rateLimited, true);
    assert.equal(rateLimitOf(403, { 'retry-after': '60' }).rateLimited, true);
    assert.equal(rateLimitOf(403, {}, 'You have exceeded a secondary rate limit').rateLimited, true);
    assert.deepEqual(rateLimitOf(403, { 'x-ratelimit-remaining': '4000' }), { remaining: 4000 });
    assert.deepEqual(rateLimitOf(404, undefined), {});
  });

  test('GithubError alanları: varsayılan sınır değil', () => {
    const plain = new GithubError('x', 502);
    assert.deepEqual([plain.rateLimited, plain.retryAfter, plain.remaining], [false, undefined, undefined]);
    const limited = new GithubError('y', 429, { rateLimited: true, retryAfter: 5 });
    assert.deepEqual([limited.rateLimited, limited.retryAfter], [true, 5]);
  });
});
