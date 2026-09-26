import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_TABS, clientTabIndex, tabDirection } from './client-tabs.ts';

describe("clientTabIndex: dock'un etkin sekmesi", () => {
  test("sıra dock'taki sırayla aynı: Bugün · Geçmiş · İlerleme", () => {
    assert.deepEqual(CLIENT_TABS.map(({ label }) => label), ['Bugün', 'Geçmiş', 'İlerleme']);
    assert.equal(clientTabIndex('/me'), 0);
    assert.equal(clientTabIndex('/me/gecmis'), 1);
    assert.equal(clientTabIndex('/me/ilerleme'), 2);
  });

  test('Bugün yalnız tam eşleşmede; öteki sekmeler alt sayfalarında da etkin', () => {
    assert.equal(clientTabIndex('/me/gecmis/s_k2m9x4qa'), 1);
    assert.equal(clientTabIndex('/me/ilerleme/bench-press'), 2);
    assert.equal(clientTabIndex('/me/ayarlar'), -1);
    assert.equal(clientTabIndex('/me/antrenman'), -1);
  });

  test('sondaki eğik çizgi yok sayılır; benzer önekli adres sekme sayılmaz', () => {
    assert.equal(clientTabIndex('/me/'), 0);
    assert.equal(clientTabIndex('/me/gecmis/'), 1);
    assert.equal(clientTabIndex('/me/gecmisler'), -1);
    assert.equal(clientTabIndex('/meler'), -1);
    assert.equal(clientTabIndex('/dashboard'), -1);
  });
});

describe('tabDirection: sekme değişiminde içeriğin geldiği yön', () => {
  test('sağdaki sekmeye geçince sağdan, soldakine geçince soldan', () => {
    assert.equal(tabDirection(0, 1), 1);
    assert.equal(tabDirection(0, 2), 1);
    assert.equal(tabDirection(2, 0), -1);
    assert.equal(tabDirection(1, 0), -1);
  });

  test('ilk çizim, aynı sekme ve sekme dışı sayfa: kayma yok', () => {
    assert.equal(tabDirection(null, 1), 0);
    assert.equal(tabDirection(1, 1), 0);
    assert.equal(tabDirection(-1, 2), 0);
    assert.equal(tabDirection(0, -1), 0);
  });
});
