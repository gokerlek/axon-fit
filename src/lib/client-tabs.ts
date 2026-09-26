/**
 * Danışan uygulamasının sekmeleri (docs/design/antrenman-ekrani.md §0), tarayıcıdan ve Next'ten
 * bağımsız saf mantık: dock'un etkin öğesi ve sekme değişiminde içeriğin geldiği yön. İkonlar ve
 * dock `src/app/me/client-dock.tsx`'te; hesapla ilgili her şey (Ayarlar, Çıkış) avatar menüsünde
 * kalır ve dock'ta tekrarlanmaz. Programlar sekmesi sonraki fazda; gelene kadar listede yok.
 */

export const CLIENT_TABS = [
  { href: '/me', label: 'Bugün' },
  { href: '/me/gecmis', label: 'Geçmiş' },
  { href: '/me/ilerleme', label: 'İlerleme' },
] as const;

export type ClientTab = (typeof CLIENT_TABS)[number];

/**
 * Adresin ait olduğu sekmenin sırası; sekme dışındaki sayfada (Ayarlar) -1. Bugün yalnız tam
 * eşleşmede etkindir (`/me` bütün danışan adreslerinin önekidir); öteki sekmeler alt sayfalarında
 * da (`/me/gecmis/[id]`). Sondaki eğik çizgi yok sayılır; `/me/gecmisler` Geçmiş değildir.
 */
export function clientTabIndex(pathname: string): number {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return CLIENT_TABS.findIndex(({ href }) => (href === '/me' ? path === href : path === href || path.startsWith(`${href}/`)));
}

/**
 * Sekme değişiminde yeni içeriğin geldiği yön: dock'ta sağdaki sekmeye geçince sağdan (1),
 * soldakine geçince soldan (-1). İlk çizimde (`from` yok), aynı sekmede ve sekme dışı sayfaya
 * giriş ya da çıkışta 0: yalnız saydamlık, kayma yok.
 */
export function tabDirection(from: number | null, to: number): -1 | 0 | 1 {
  if (from === null || from < 0 || to < 0 || from === to) return 0;
  return to > from ? 1 : -1;
}
