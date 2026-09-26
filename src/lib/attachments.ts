import 'server-only';
import { ATTACHMENT_LIBRARY } from '@/data/attachment-library';
import { appRepoFiles } from './app-repo-files';
import { ATTACHMENTS, readCatalog, type CatalogFile } from './catalog-store';
import type { Attachment } from './schemas/attachment';

/**
 * Aparat havuzu: hazır liste (pakette) + PT'nin eklediği ya da değiştirdiği aparatlar
 * (repo'da). Aynı kimlik iki tarafta da varsa PT'ninki kazanır. Cihazlarda olduğu gibi
 * sunucuda önbellek yok: kaydın ardından açılan sayfa yeni kaydı görür.
 */

export const CUSTOM_ATTACHMENTS_PATH = ATTACHMENTS.path;

export type AttachmentWithSource = Attachment & { source: 'library' | 'custom' };
export type AttachmentDetail = AttachmentWithSource & { overridesLibrary: boolean };

/** PT'nin dosyası: okunabilen aparatlar, okunamayanlar (sayısı ve ham hâli) ve `sha`. */
export type CustomAttachments = CatalogFile<Attachment>;

/**
 * Taze okuma. Öğe öğe doğrulanır (`src/lib/stored-list.ts`): şemaya uymayan kayıt (ya da aynı
 * kimliğin ikinci kaydı) listede görünmez ama dosyadan da düşmez. Dosya liste değilse hata verir.
 * Yazma uçların çekirdeğinde (`src/lib/catalog-actions.ts`).
 */
export async function readCustomAttachments(): Promise<CustomAttachments> {
  return readCatalog(appRepoFiles(), ATTACHMENTS);
}

/** Hazır havuz + PT'nin aparatları. Dosya zaten okunduysa (`custom`) yeniden okunmaz. */
export async function listAttachments(custom?: Pick<CustomAttachments, 'items'>): Promise<AttachmentWithSource[]> {
  const { items } = custom ?? (await readCustomAttachments());
  const customIds = new Set(items.map((item) => item.id));
  return [
    ...items.map((item) => ({ ...item, source: 'custom' as const })),
    ...ATTACHMENT_LIBRARY.filter((item) => !customIds.has(item.id)).map((item) => ({ ...item, source: 'library' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export async function getAttachment(id: string, list?: AttachmentWithSource[]): Promise<AttachmentDetail | null> {
  const all = list ?? (await listAttachments());
  const found = all.find((item) => item.id === id);
  if (!found) return null;
  return { ...found, overridesLibrary: found.source === 'custom' && ATTACHMENT_LIBRARY.some((item) => item.id === id) };
}
