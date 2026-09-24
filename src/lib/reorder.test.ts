import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { moveKey } from './reorder.ts';

describe('moveKey', () => {
  const keys = Object.freeze(['a', 'b', 'c']);

  test('bir yukarı ve bir aşağı', () => {
    assert.deepEqual(moveKey(keys, 'b', 'up'), ['b', 'a', 'c']);
    assert.deepEqual(moveKey(keys, 'b', 'down'), ['a', 'c', 'b']);
  });

  test('başa ve sona', () => {
    assert.deepEqual(moveKey(keys, 'c', 'top'), ['c', 'a', 'b']);
    assert.deepEqual(moveKey(keys, 'a', 'end'), ['b', 'c', 'a']);
  });

  test('uçta, bilinmeyen anahtarda ve tek öğede aynı dizi döner', () => {
    assert.equal(moveKey(keys, 'a', 'up'), keys);
    assert.equal(moveKey(keys, 'a', 'top'), keys);
    assert.equal(moveKey(keys, 'c', 'down'), keys);
    assert.equal(moveKey(keys, 'c', 'end'), keys);
    assert.equal(moveKey(keys, 'x', 'up'), keys);
    const one = Object.freeze(['a']);
    assert.equal(moveKey(one, 'a', 'down'), one);
    assert.equal(moveKey(one, 'a', 'top'), one);
  });

  test('girdiyi değiştirmez', () => {
    const before = [...keys];
    moveKey(keys, 'b', 'up');
    moveKey(keys, 'a', 'end');
    assert.deepEqual(keys, before);
  });
});
