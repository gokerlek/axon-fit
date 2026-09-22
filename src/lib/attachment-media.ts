/**
 * Aparat fotoğrafının adresi (istemci ve sunucu ortak).
 *
 * Dosya adında içerik özeti var (`media/attachments/<kimlik>-<özet>.webp`): fotoğraf
 * değişince adres de değişir, tarayıcı eskisini göstermeye devam etmez.
 */
export function attachmentImageUrl({ id, image }: { id: string; image?: string }): string | null {
  if (!image) return null;
  const version = image.split('/').pop()?.replace(/\.[a-z]+$/, '') ?? '';
  return `/api/attachments/${id}/image?v=${encodeURIComponent(version)}`;
}
