/**
 * `/giris` ekranının kararı ve metinleri (SPEC §5) — saf, testli (`login-screen.test.ts`).
 *
 * Kimlik adresten (`?c=`), yoksa telefonda saklanandan; ikisi de yoksa bağlantı istenir. Çıkıştan
 * sonra (`?cikis=1`) sayfa, çıkış onayının söylediğiyle aynı şeyi söyler: şifresi olan danışana
 * "şifreni yaz", şifresi olmayana (`&sifre=0`) yeni kare kod gerektiği; şifre kutusu hiç çıkmaz.
 * Şifre bilgisi yalnız çıkış yönlendirmesinden gelir (oturumlu istekte danışanın kendi kaydından):
 * sayfa kimliksiz ziyarette hesabın durumunu sunucudan okumaz, giriş ucunun tek tip yanıtı gibi
 * bir hesabın şifresi olup olmadığını dışarıya söylemez.
 */

export const LOGGED_OUT_NOTICE = 'Çıkış yaptın. Tekrar girmek için şifreni yaz.';
export const NO_PASSWORD_TITLE = 'Çıkış yaptın';
export const NO_PASSWORD_NOTICE = 'Bu hesabın şifresi yok; tekrar girmek için antrenöründen yeni bir kare kod iste.';

export type LoginScreen =
  /** Telefonda saklanan kimlik henüz okunmadı (ilk çizim). */
  | { kind: 'loading' }
  /** Kimlik yok: bağlantıyı aç ya da kare kod iste. */
  | { kind: 'no-id' }
  /** Çıkış yaptı ve şifresi yok: yalnız yeni kare kod açar, şifre kutusu yok. */
  | { kind: 'no-password' }
  | { kind: 'password'; clientId: string; notice: string | null };

export function loginScreen({
  clientId,
  remembered,
  loggedOut,
  passwordless,
}: {
  /** Adresteki (doğrulanmış) kimlik. */
  clientId: string | null;
  /** Telefonda saklanan: `undefined` henüz okunmadı. */
  remembered: string | null | undefined;
  loggedOut: boolean;
  /** Çıkış yönlendirmesi "şifresi yok" dedi (`sifre=0`). */
  passwordless: boolean;
}): LoginScreen {
  if (loggedOut && passwordless) return { kind: 'no-password' };
  const id = clientId ?? remembered;
  if (id === undefined) return { kind: 'loading' };
  if (id === null) return { kind: 'no-id' };
  return { kind: 'password', clientId: id, notice: loggedOut ? LOGGED_OUT_NOTICE : null };
}

/**
 * Danışanın çıkıştan sonra gideceği adres. `password`: oturumdaki kaydın açan bir şifresi var mı
 * (`hasPassword`); okunamadıysa null ve adres şifre bilgisi taşımaz (sayfa şifre kutusunu gösterir).
 */
export function logoutPath(clientId: string | null, password: boolean | null): string {
  const params = new URLSearchParams();
  if (clientId) params.set('c', clientId);
  params.set('cikis', '1');
  if (password === false) params.set('sifre', '0');
  return `/giris?${params.toString()}`;
}
