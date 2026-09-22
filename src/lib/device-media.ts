/**
 * Cihaz görselinin adresi (istemci ve sunucu ortak).
 *
 * Dosya adında içerik özeti var (`media/devices/<id>-<özet>.webp`): görsel değişince
 * adres de değişir, tarayıcı eskisini göstermeye devam etmez.
 */
export function deviceImageUrl({ id, image }: { id: string; image?: string }): string | null {
  if (!image) return null;
  const version = image.split('/').pop()?.replace(/\.[a-z]+$/, '') ?? '';
  return `/api/devices/${id}/image?v=${encodeURIComponent(version)}`;
}
