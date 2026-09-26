/**
 * Düzenleyicinin kutularında Enter (tasarım §8). Form hiçbir kutudan Enter'la gönderilmez: değişiklik
 * varken başlıkta `type="submit"` Kaydet durur ve tarayıcı tek satırlık kutuda Enter'ı formu göndermeye
 * çevirir (şablonda kaydedip detaya gider, programda değişikliği danışana yayınlar). Kaydet yalnız
 * düğmesiyle. Değiştirici tuşlarla (Shift, Ctrl/⌘, Alt) basılan Enter da göndermez.
 * - `set`: set satırının sayı kutusu. Enter aynı sütunda sonraki, Shift+Enter önceki sete gider.
 * - `line`: tek satırlık kutu (Hedef, Not; Set, Dinlenme, Tur ve İstasyon arası stepper'ları; şablon,
 *   gün ve evre adı, evre süresi). Enter hiçbir şey yapmaz, odak kutuda kalır.
 * Yazı birleştirilirken (IME) Enter seçimi onaylar; ona dokunulmaz (`pass`).
 *
 * Saf; testler Node'un kendi test aracıyla çalışır.
 */

export type EnterField = 'set' | 'line';

/** `pass`: tarayıcıya bırak; `block`: engelle, başka bir şey yapma; `next` / `previous`: engelle ve sete geç. */
export type EnterAction = 'pass' | 'block' | 'next' | 'previous';

type Key = { key: string; shiftKey: boolean; isComposing: boolean };

export function enterAction(field: EnterField, event: Key): EnterAction {
  if (event.key !== 'Enter' || event.isComposing) return 'pass';
  if (field === 'line') return 'block';
  return event.shiftKey ? 'previous' : 'next';
}

/** Tek satırlık kutunun (Hedef, Not, stepper, adlar) `onKeyDown`'ı: Enter formu göndermez. */
export function keepLineEnter(event: { nativeEvent: Key; preventDefault: () => void }): void {
  if (enterAction('line', event.nativeEvent) === 'block') event.preventDefault();
}
