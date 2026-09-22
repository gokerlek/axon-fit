import 'server-only';
import * as v from 'valibot';
import { ATTACHMENT_LIBRARY } from '@/data/attachment-library';
import { appRepo } from './github/client';
import { readJson, writeJson } from './github/files';
import { customAttachmentsSchema, type Attachment } from './schemas/attachment';

/**
 * Aparat havuzu: hazır liste (pakette) + PT'nin eklediği ya da değiştirdiği aparatlar
 * (repo'da). Aynı kimlik iki tarafta da varsa PT'ninki kazanır. Cihazlarda olduğu gibi
 * sunucuda önbellek yok: kaydın ardından açılan sayfa yeni kaydı görür.
 */

export const CUSTOM_ATTACHMENTS_PATH = 'data/attachments.json';

export type AttachmentWithSource = Attachment & { source: 'library' | 'custom' };
export type AttachmentDetail = AttachmentWithSource & { overridesLibrary: boolean };

export async function readCustomAttachments(): Promise<{ items: Attachment[]; sha: string | null }> {
  const stored = await readJson<unknown>(appRepo(), CUSTOM_ATTACHMENTS_PATH);
  if (!stored) return { items: [], sha: null };
  const parsed = v.safeParse(customAttachmentsSchema, stored.content);
  // Bozuk dosya uygulamayı düşürmez: hazır havuzla devam edilir.
  return { items: parsed.success ? parsed.output : [], sha: stored.sha };
}

export async function writeCustomAttachments(items: Attachment[], message: string, sha: string | null): Promise<void> {
  await writeJson(appRepo(), CUSTOM_ATTACHMENTS_PATH, items, { sha: sha ?? undefined, message });
}

export async function listAttachments(): Promise<AttachmentWithSource[]> {
  const { items } = await readCustomAttachments();
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
