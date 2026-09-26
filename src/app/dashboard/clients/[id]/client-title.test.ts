import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clientTitle } from './client-title.ts';

describe('danışan sayfalarının başlığı', () => {
  test('alt sayfa başlığı danışanın adını ve uygulamayı taşır', () => {
    const title = clientTitle('Ayşe Demir', '%s · Hasan');
    assert.deepEqual(title, { default: 'Ayşe Demir', template: '%s · Ayşe Demir · Hasan' });
    assert.equal(title.template.replace('%s', 'Ölçümler'), 'Ölçümler · Ayşe Demir · Hasan');
  });

  test('üst şablon yoksa yalnız danışanın adı; addaki özel karakterler olduğu gibi', () => {
    assert.deepEqual(clientTitle('Gizem'), { default: 'Gizem', template: '%s · Gizem' });
    assert.equal(clientTitle('A$&B', '%s · Hasan').template, '%s · A$&B · Hasan');
  });
});
