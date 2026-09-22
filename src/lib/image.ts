/**
 * Görsel kuralları — cihaz ve aparat fotoğrafları için ortak (istemci ve sunucu).
 *
 * SVG kabul edilmez (betik taşıyabilir). Dosyanın gerçekten görsel olduğu ilk
 * baytlarından da denetlenir; tarayıcının bildirdiği türe güvenilmez.
 */

export const IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export const IMAGE_MAX_BYTES = 1024 * 1024;

export const IMAGE_CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;

export type ImageExtension = keyof typeof IMAGE_CONTENT_TYPES;

/** Baytlardan gerçek tür; görsel değilse `null`. */
export function sniffImage(bytes: Uint8Array): ImageExtension | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Seçilen dosya kurallara uymuyorsa nedeni; uyuyorsa `null` (tarayıcıda gösterilir). */
export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES[file.type]) return 'Yalnız PNG, JPG ya da WebP seçebilirsin.';
  if (file.size > IMAGE_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    return `Görsel ${mb} MB; en fazla 1 MB olabilir. Daha küçük bir görsel seç.`;
  }
  return null;
}

/** Dosya adındaki sürüm parçası: yol değişince tarayıcı eskisini göstermez. */
export function imageVersion(path: string): string {
  return path.split('/').pop()?.replace(/\.[a-z]+$/, '') ?? '';
}
