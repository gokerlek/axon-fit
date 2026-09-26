import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { embedUrl, isValidVideoId, parseVideoUrl, videoUrl } from './video.ts';

const YT = 'dQw4w9WgXcQ';

describe('YouTube bağlantısı', () => {
  test('watch, youtu.be, shorts, embed, live ve mobil adresler', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${YT}`,
      `https://m.youtube.com/watch?v=${YT}`,
      `https://music.youtube.com/watch?v=${YT}`,
      `https://youtu.be/${YT}`,
      `https://youtube.com/shorts/${YT}?feature=share`,
      `https://www.youtube.com/embed/${YT}`,
      `https://www.youtube-nocookie.com/embed/${YT}`,
      `https://www.youtube.com/live/${YT}`,
    ]) {
      assert.deepEqual(parseVideoUrl(link), { provider: 'youtube', id: YT }, link);
    }
  });

  test('zaman parametresi (t=) ve şemasız yapıştırma kimliği bozmaz', () => {
    assert.deepEqual(parseVideoUrl(`https://www.youtube.com/watch?v=${YT}&t=42s`), { provider: 'youtube', id: YT });
    assert.deepEqual(parseVideoUrl(`youtu.be/${YT}?t=10`), { provider: 'youtube', id: YT });
    assert.deepEqual(parseVideoUrl(`  www.youtube.com/watch?v=${YT}  `), { provider: 'youtube', id: YT });
  });

  test('kimlik 11 karakter değilse ya da fazladan karakter taşıyorsa tanınmaz', () => {
    assert.equal(parseVideoUrl('https://youtu.be/dQw4w9WgXc'), null);
    assert.equal(parseVideoUrl(`https://www.youtube.com/watch?v=${YT}"><script>`), null);
    assert.equal(parseVideoUrl('https://www.youtube.com/watch'), null);
  });
});

describe('Vimeo bağlantısı', () => {
  test('düz bağlantı', () => {
    assert.deepEqual(parseVideoUrl('https://vimeo.com/123456789'), { provider: 'vimeo', id: '123456789' });
    assert.deepEqual(parseVideoUrl('vimeo.com/123456789'), { provider: 'vimeo', id: '123456789' });
  });

  test('liste dışı videonun gizli anahtarı kimliğe eklenir (rakamlardan oluşsa da)', () => {
    assert.deepEqual(parseVideoUrl('https://vimeo.com/123456789/abcdef1234'), { provider: 'vimeo', id: '123456789:abcdef1234' });
    assert.deepEqual(parseVideoUrl('https://vimeo.com/123456789/1234567890'), { provider: 'vimeo', id: '123456789:1234567890' });
    assert.deepEqual(parseVideoUrl('https://player.vimeo.com/video/123456789?h=abcdef1234'), {
      provider: 'vimeo',
      id: '123456789:abcdef1234',
    });
    assert.deepEqual(parseVideoUrl('https://vimeo.com/user1/review/123456789/abcdef1234'), {
      provider: 'vimeo',
      id: '123456789:abcdef1234',
    });
  });

  test('showcase ve albüm bağlantısında kimlik videonunki, showcase/albüm numarası değil', () => {
    assert.deepEqual(parseVideoUrl('https://vimeo.com/showcase/11111/video/123456789'), { provider: 'vimeo', id: '123456789' });
    assert.deepEqual(parseVideoUrl('https://vimeo.com/album/2222/video/123456789'), { provider: 'vimeo', id: '123456789' });
    assert.deepEqual(parseVideoUrl('https://vimeo.com/groups/kosu/videos/123456789'), { provider: 'vimeo', id: '123456789' });
  });

  test('kanal bağlantısında kimlik son sayı', () => {
    assert.deepEqual(parseVideoUrl('https://vimeo.com/channels/staffpicks/123456789'), { provider: 'vimeo', id: '123456789' });
    assert.deepEqual(parseVideoUrl('https://vimeo.com/channels/111/222333'), { provider: 'vimeo', id: '222333' });
  });

  test('video kimliği yoksa tanınmaz', () => {
    assert.equal(parseVideoUrl('https://vimeo.com/'), null);
    assert.equal(parseVideoUrl('https://vimeo.com/channels/staffpicks'), null);
  });
});

describe('başka adresler reddedilir', () => {
  test('başka alan adı, benzer alan adı ve tehlikeli şemalar', () => {
    for (const link of [
      'javascript:alert(1)',
      'data:text/html,hi',
      `https://youtube.com.evil.com/watch?v=${YT}`,
      `https://evil.com/youtu.be/${YT}`,
      `https://notyoutube.com/watch?v=${YT}`,
      'https://evil.com/vimeo.com/123456789',
      'https://vimeo.com.evil.com/123456789',
      'https://notvimeo.com/123456789',
      '',
      '   ',
    ]) {
      assert.equal(parseVideoUrl(link), null, link);
    }
  });
});

describe('saklanan kimlikten bağlantı ve oynatıcı', () => {
  test('formdaki bağlantı yeniden okununca aynı kimliği verir', () => {
    for (const ref of [
      { provider: 'youtube', id: YT },
      { provider: 'vimeo', id: '123456789' },
      { provider: 'vimeo', id: '123456789:abcdef1234' },
    ] as const) {
      assert.deepEqual(parseVideoUrl(videoUrl(ref)), ref);
    }
  });

  test('gömme adresleri: YouTube çerezsiz, Vimeo izlemesiz ve anahtarıyla', () => {
    assert.equal(embedUrl({ provider: 'youtube', id: YT }), `https://www.youtube-nocookie.com/embed/${YT}?rel=0`);
    assert.equal(embedUrl({ provider: 'vimeo', id: '123456789' }), 'https://player.vimeo.com/video/123456789?dnt=1');
    assert.equal(
      embedUrl({ provider: 'vimeo', id: '123456789:abcdef1234' }),
      'https://player.vimeo.com/video/123456789?dnt=1&h=abcdef1234',
    );
  });

  test('kimlik doğrulaması', () => {
    assert.equal(isValidVideoId({ provider: 'youtube', id: YT }), true);
    assert.equal(isValidVideoId({ provider: 'youtube', id: 'kisa' }), false);
    assert.equal(isValidVideoId({ provider: 'vimeo', id: '123456789:abcdef1234' }), true);
    assert.equal(isValidVideoId({ provider: 'vimeo', id: '123456789:xyz' }), false);
  });
});
