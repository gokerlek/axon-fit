import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { GEMINI_KEY_ERRORS, geminiKeyError, geminiKeySchema } from './gemini-key-input.ts';
const key = 'AIza_test_only_fake_key_123456789012345678';
test('authorization keys with an AQ prefix preserve their separator', () => {
  const authKey = 'AQ.test_only_fake_key_123456789012345678';
  assert.equal(v.parse(geminiKeySchema, ` ${authKey}\n`), authKey);
  assert.equal(geminiKeyError(authKey), '');
});
test('complete keys accept surrounding whitespace and preserve the exact internal value', () => {
  assert.equal(v.parse(geminiKeySchema, ` \n${key}\t `), key);
  assert.equal(geminiKeyError(key), '');
});
test('short values get an incomplete-key error instead of claiming whitespace', () => {
  assert.equal(geminiKeyError('test@short'), GEMINI_KEY_ERRORS.incomplete);
  assert.equal(geminiKeyError(''), GEMINI_KEY_ERRORS.incomplete);
});
test('masked previews, embedded whitespace and other invalid characters are distinguished', () => {
  assert.equal(geminiKeyError('AIza…1234'), GEMINI_KEY_ERRORS.masked);
  assert.equal(geminiKeyError('AIza********1234'), GEMINI_KEY_ERRORS.masked);
  assert.equal(geminiKeyError(key.slice(0, 10) + '\n' + key.slice(10)), GEMINI_KEY_ERRORS.spaces);
  assert.equal(geminiKeyError(key + '@'), GEMINI_KEY_ERRORS.characters);
  assert.equal(geminiKeyError('x'.repeat(201)), GEMINI_KEY_ERRORS.long);
});
test('errors never include supplied credentials, even with unexpected input types', () => {
  for (const input of [null, {}, 123, key + '@', `${key}\ninvalid`]) {
    assert.ok(!geminiKeyError(input).includes(key));
  }
});
