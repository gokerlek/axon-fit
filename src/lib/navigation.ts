import type { LinkClick } from './unsaved-changes.ts';

/**
 * PT kabuğunun gezinme kuralları (SPEC §6), tarayıcıdan ve Next'ten bağımsız saf mantık:
 * sayfa geçişi göstergesi, girişten sonra dönülecek yol, "sayfa yok" ekranının dönüş bağlantısı
 * ve geçişte gösterilecek iskelet.
 */

/**
 * Bir bağlantı tıklaması uygulamanın başka bir SAYFASINA geçiş başlatıyor mu: başlatıyorsa gidilen
 * yol, başlatmıyorsa null. Yeni sekme, indirme, değiştirici tuş, orta tık, başka site, `mailto:`,
 * aynı adres (yalnız çapa) ve `/api/` uçları (dosya, yönlendirme) sayfa geçişi değildir.
 * Kaydedilmemiş değişiklik korumasının süzgeciyle (`leaveHref`) aynı kurallar.
 */
export function navigationHref(click: LinkClick): string | null {
  if (click.href === null || click.button !== 0 || click.modified || click.download) return null;
  if (click.target && click.target !== '_self') return null;
  let here: URL;
  let url: URL;
  try {
    here = new URL(click.location);
    url = new URL(click.href, here);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Girişten sonra dönülecek yolun sorgu parametresi (`/login?next=…`). */
export const RETURN_PARAM = 'next';

/**
 * İstenen PT sayfasının yolu: `src/proxy.ts` her `/dashboard` isteğine koyar, oturum yoksa
 * `requirePt` girişe bununla yollar (sunucu bileşeni adresi başka yoldan bilemez). İstemcinin
 * gönderdiği aynı adlı başlığı proxy ezer; değer yine `safeReturnPath`'ten geçer.
 */
export const PATH_HEADER = 'x-pulsecoach-path';

const PT_AREA = '/dashboard';
const BASE = 'http://pulsecoach.invalid';

/**
 * Oturumsuz açılan PT sayfasına girişten sonra dönmek için güvenli yol, değilse null. Yalnız aynı
 * kökende `/dashboard` altı kabul edilir (açık yönlendirme yok): `//site`, `/\site`, `https://…`,
 * `javascript:` ve başka alanlar düşer. Yol URL ayrıştırıcısının çıktısından kurulur (sekme, satır
 * sonu, `..` temizlenmiş olur); Next'in iç `_rsc` parametresi atılır.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (url.pathname !== PT_AREA && !url.pathname.startsWith(`${PT_AREA}/`)) return null;
  url.searchParams.delete('_rsc');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Oturum yokken gidilecek giriş adresi: istenen PT sayfası dönüş yolu olarak taşınır. */
export function loginPath(from: string | null | undefined): string {
  const next = safeReturnPath(from);
  return next && next !== PT_AREA ? `/login?${RETURN_PARAM}=${encodeURIComponent(next)}` : '/login';
}

/** "Sayfa yok" ekranında dönülecek liste: adresin ait olduğu bölüm, yoksa genel bakış. */
const SECTIONS: Record<string, { href: string; label: string }> = {
  templates: { href: '/dashboard/templates', label: 'Şablonlara dön' },
  exercises: { href: '/dashboard/exercises', label: 'Egzersizlere dön' },
  devices: { href: '/dashboard/devices', label: 'Cihazlara dön' },
  attachments: { href: '/dashboard/attachments', label: 'Aparatlara dön' },
  clients: { href: '/dashboard/clients', label: 'Danışanlara dön' },
};

export function notFoundBackLink(pathname: string): { href: string; label: string } {
  const [root, section] = pathname.split('/').filter(Boolean);
  // `in` değil: "constructor" gibi yollar nesnenin prototipine düşmesin.
  if (root === 'dashboard' && section && Object.hasOwn(SECTIONS, section)) return SECTIONS[section]!;
  return root === 'dashboard' ? { href: PT_AREA, label: 'Genel bakışa dön' } : { href: '/', label: 'Ana sayfaya dön' };
}

/** Kütüphane bölümünün listeleri (sekmeleriyle açılan sayfalar). */
const LIBRARY_LISTS = ['/dashboard/templates', '/dashboard/exercises', '/dashboard/devices', '/dashboard/attachments'];

/**
 * Sayfa geçişinde yüklenirken gösterilecek iskeletin biçimi; hedef sayfanın yerleşimine benzer
 * (`dashboard/route-skeleton.tsx`).
 * - `overview`: genel bakış · `library`: Kütüphane listesi (sekmeler + kart ızgarası)
 * - `list`: danışan listesi · `form`: oluşturma, düzenleme ve ayarlar
 * - `client`: danışanın sayfası (başlık + sekmeler) · `detail`: kaydın detayı
 */
export type SkeletonKind = 'overview' | 'library' | 'list' | 'form' | 'client' | 'detail';

export function skeletonKind(pathname: string): SkeletonKind {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === PT_AREA) return 'overview';
  if (LIBRARY_LISTS.includes(path)) return 'library';
  if (path === '/dashboard/clients') return 'list';
  // Danışanın bütün sayfaları (düzenleme dahil) aynı başlık ve sekmelerin altında açılır.
  if (path.startsWith('/dashboard/clients/') && path !== '/dashboard/clients/new') return 'client';
  if (path === '/dashboard/settings' || path.endsWith('/new') || path.endsWith('/edit')) return 'form';
  return 'detail';
}
