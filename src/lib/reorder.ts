/** Sıralama hedefi: bir yukarı/aşağı ya da uçlara. */
export type ReorderTarget = 'up' | 'down' | 'top' | 'end';

/**
 * Anahtarı listede taşır (klavyeyle sıralama). Değiştirmez: yeni dizi döner; anahtar yoksa
 * ya da zaten o uçtaysa aynı dizi döner (çağıran `===` ile "taşınmadı"yı anlar).
 */
export function moveKey<K>(keys: readonly K[], key: K, target: ReorderTarget): readonly K[] {
  const from = keys.indexOf(key);
  if (from === -1) return keys;
  const to = target === 'up' ? from - 1 : target === 'down' ? from + 1 : target === 'top' ? 0 : keys.length - 1;
  if (to < 0 || to >= keys.length || to === from) return keys;
  const next = keys.slice();
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}
