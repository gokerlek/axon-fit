import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loginPath, navigationHref, notFoundBackLink, safeReturnPath, skeletonKind } from './navigation.ts';
import type { LinkClick } from './unsaved-changes.ts';

const HERE = 'http://localhost:3000/dashboard/templates';

function click(overrides: Partial<LinkClick>): LinkClick {
  return { href: '/dashboard/exercises', target: null, download: false, button: 0, modified: false, location: HERE, ...overrides };
}

describe('navigationHref: tıklama sayfa geçişi başlatıyor mu', () => {
  test('uygulamanın başka sayfası: yol döner', () => {
    assert.equal(navigationHref(click({})), '/dashboard/exercises');
    assert.equal(navigationHref(click({ href: '/dashboard/exercises?muscle=chest#liste' })), '/dashboard/exercises?muscle=chest#liste');
    assert.equal(navigationHref(click({ href: 'http://localhost:3000/dashboard' })), '/dashboard');
    assert.equal(navigationHref(click({ href: '?muscle=chest' })), '/dashboard/templates?muscle=chest');
  });

  test('yeni sekme, indirme, değiştirici tuş ve orta tık geçiş sayılmaz', () => {
    assert.equal(navigationHref(click({ target: '_blank' })), null);
    assert.equal(navigationHref(click({ download: true })), null);
    assert.equal(navigationHref(click({ modified: true })), null);
    assert.equal(navigationHref(click({ button: 1 })), null);
    assert.equal(navigationHref(click({ target: '_self' })), '/dashboard/exercises');
  });

  test('başka site, şema, aynı adres ve yalnız çapa geçiş sayılmaz', () => {
    assert.equal(navigationHref(click({ href: 'https://github.com/x' })), null);
    assert.equal(navigationHref(click({ href: 'mailto:pt@example.com' })), null);
    assert.equal(navigationHref(click({ href: '/dashboard/templates' })), null);
    assert.equal(navigationHref(click({ href: '#liste' })), null);
    assert.equal(navigationHref(click({ href: null })), null);
  });

  test('/api/ uçları sayfa değildir (dosya, dış yönlendirme)', () => {
    assert.equal(navigationHref(click({ href: '/api/auth/github' })), null);
    assert.equal(navigationHref(click({ href: '/api' })), null);
    assert.equal(navigationHref(click({ href: '/apiler' })), '/apiler');
  });
});

describe('safeReturnPath: girişten sonra yalnız aynı kökende PT sayfasına dönülür', () => {
  test('PT sayfaları sorgu ve çapasıyla kabul edilir', () => {
    assert.equal(safeReturnPath('/dashboard'), '/dashboard');
    assert.equal(safeReturnPath('/dashboard/clients/c_b4b572ef'), '/dashboard/clients/c_b4b572ef');
    assert.equal(safeReturnPath('/dashboard/exercises?muscle=chest#x'), '/dashboard/exercises?muscle=chest#x');
  });

  test('Next iç parametresi atılır, yol normalleşir', () => {
    assert.equal(safeReturnPath('/dashboard/clients?_rsc=abc'), '/dashboard/clients');
    assert.equal(safeReturnPath('/dashboard/a/../clients'), '/dashboard/clients');
  });

  test('başka site ve şemalar reddedilir (açık yönlendirme yok)', () => {
    for (const raw of [
      '//evil.example',
      '//evil.example/dashboard',
      '/\\evil.example',
      '/\t/evil.example/dashboard',
      'https://evil.example/dashboard',
      'javascript:alert(1)',
      'dashboard',
      '',
      null,
      undefined,
    ]) {
      assert.equal(safeReturnPath(raw), null, String(raw));
    }
  });

  test('PT alanı dışı ve benzer adlar reddedilir', () => {
    assert.equal(safeReturnPath('/me'), null);
    assert.equal(safeReturnPath('/login'), null);
    assert.equal(safeReturnPath('/dashboardx'), null);
    assert.equal(safeReturnPath('/dashboard/../me'), null);
    assert.equal(safeReturnPath('/api/auth/logout'), null);
  });

  test('çift eğik çizgili PT yolu aynı kökende kalır', () => {
    assert.equal(safeReturnPath('/dashboard//evil.example'), '/dashboard//evil.example');
  });
});

describe('loginPath', () => {
  test('istenen PT sayfası kodlanıp taşınır', () => {
    assert.equal(loginPath('/dashboard/clients/c_x'), '/login?next=%2Fdashboard%2Fclients%2Fc_x');
    assert.equal(loginPath('/dashboard/exercises?muscle=chest'), '/login?next=%2Fdashboard%2Fexercises%3Fmuscle%3Dchest');
  });

  test('giriş sayfası zaten genel bakışa döner; geçersiz yol taşınmaz', () => {
    assert.equal(loginPath('/dashboard'), '/login');
    assert.equal(loginPath(null), '/login');
    assert.equal(loginPath('//evil.example'), '/login');
  });
});

describe('notFoundBackLink', () => {
  test('kaydın bölümünün listesine döner', () => {
    assert.deepEqual(notFoundBackLink('/dashboard/exercises/yok'), { href: '/dashboard/exercises', label: 'Egzersizlere dön' });
    assert.deepEqual(notFoundBackLink('/dashboard/templates/t_yok/edit'), { href: '/dashboard/templates', label: 'Şablonlara dön' });
    assert.deepEqual(notFoundBackLink('/dashboard/clients/c_yok'), { href: '/dashboard/clients', label: 'Danışanlara dön' });
    assert.deepEqual(notFoundBackLink('/dashboard/devices/yok'), { href: '/dashboard/devices', label: 'Cihazlara dön' });
    assert.deepEqual(notFoundBackLink('/dashboard/attachments/yok'), { href: '/dashboard/attachments', label: 'Aparatlara dön' });
  });

  test('bilinmeyen bölümde genel bakış, panel dışında ana sayfa', () => {
    assert.deepEqual(notFoundBackLink('/dashboard/bilinmeyen-sayfa'), { href: '/dashboard', label: 'Genel bakışa dön' });
    assert.deepEqual(notFoundBackLink('/dashboard/constructor'), { href: '/dashboard', label: 'Genel bakışa dön' });
    assert.deepEqual(notFoundBackLink('/olmayan'), { href: '/', label: 'Ana sayfaya dön' });
  });
});

describe('skeletonKind: geçişte hedef sayfaya benzeyen iskelet', () => {
  test('bölüm girişleri', () => {
    assert.equal(skeletonKind('/dashboard'), 'overview');
    assert.equal(skeletonKind('/dashboard/'), 'overview');
    assert.equal(skeletonKind('/dashboard/templates'), 'library');
    assert.equal(skeletonKind('/dashboard/exercises'), 'library');
    assert.equal(skeletonKind('/dashboard/devices'), 'library');
    assert.equal(skeletonKind('/dashboard/attachments'), 'library');
    assert.equal(skeletonKind('/dashboard/clients'), 'list');
  });

  test('formlar ve detaylar', () => {
    assert.equal(skeletonKind('/dashboard/settings'), 'form');
    assert.equal(skeletonKind('/dashboard/templates/new'), 'form');
    assert.equal(skeletonKind('/dashboard/exercises/halter-bench-press/edit'), 'form');
    assert.equal(skeletonKind('/dashboard/clients/new'), 'form');
    assert.equal(skeletonKind('/dashboard/exercises/halter-bench-press'), 'detail');
    assert.equal(skeletonKind('/dashboard/templates/t_5qq5ax0h'), 'detail');
  });

  test('danışanın bütün sayfaları başlık ve sekmelerle açılır', () => {
    assert.equal(skeletonKind('/dashboard/clients/c_b4b572ef'), 'client');
    assert.equal(skeletonKind('/dashboard/clients/c_b4b572ef/program/edit'), 'client');
    assert.equal(skeletonKind('/dashboard/clients/c_b4b572ef/measurements/new'), 'client');
  });
});
