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

/** Aparat fotoğrafının adresi; dosya adındaki özet sürüm olarak gider. */
export function attachmentImageUrl(deviceId: string, attachment: { name: string; image?: string }): string | null {
  if (!attachment.image) return null;
  const version = attachment.image.split('/').pop()?.replace(/\.[a-z]+$/, '') ?? '';
  return `/api/devices/${deviceId}/attachments/image?name=${encodeURIComponent(attachment.name)}&v=${encodeURIComponent(version)}`;
}
