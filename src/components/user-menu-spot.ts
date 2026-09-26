/**
 * Sağ üstteki kullanıcı menüsünün yeri (`dashboard/layout.tsx`, SPEC §6: üst çubuk yok). Menü
 * sayfayla birlikte kayar ve sayfanın ilk satırında durur; o satır sağda ona yer bırakır ki
 * menü içeriğin üstüne binmesin: 44 px düğme + 12 px boşluk.
 */

/** İlk satır metin ise (sayfa yolu, başlık): sağ boşluk. */
export const USER_MENU_GUTTER = 'pr-14';

/** İlk satır esnek bir sıra ise (Kütüphane sekmeleri): menünün yerini tutan boş öğe. */
export const USER_MENU_SPOT = 'h-8 w-11 shrink-0';
