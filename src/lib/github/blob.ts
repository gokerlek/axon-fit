import { createHash } from 'node:crypto';

/**
 * JSON dosyalarının depodaki metni ve git blob kimliği — saf (ağ yok).
 *
 * Contents API ile yazılan (`writeJson`) ve Git Data API ile tek commit'te yazılan (`commitFiles`)
 * dosya aynı metni taşır: 2 boşluk girinti ve sonda satır sonu (git'te düzgün fark verir). Blob
 * kimliği metinden hesaplanır (`blob <bayt>\0<içerik>` üstünde SHA-1); böylece bitiş commit'inde
 * seans dosyasının yeni `sha`'sı index satırına, commit'ten önce yazılabilir.
 */

export function jsonText(content: unknown): string {
  return `${JSON.stringify(content, null, 2)}\n`;
}

export function gitBlobSha(text: string): string {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
