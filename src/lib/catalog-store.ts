import * as v from 'valibot';
import { ATTACHMENT_LIBRARY } from '../data/attachment-library.ts';
import { DEVICE_LIBRARY } from '../data/device-library.ts';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { GithubError } from './github/errors.ts';
import type { RepoFiles } from './repo-files.ts';
import { customAttachmentsSchema, type Attachment } from './schemas/attachment.ts';
import { customDevicesSchema, type Device } from './schemas/device.ts';
import { customExercisesSchema, type Exercise } from './schemas/exercise.ts';
import { parseStoredList, storedListContent, type StoredList } from './stored-list.ts';

/**
 * Katalog dosyaları: hazır kütüphane (pakette) + PT'nin kayıtları (uygulama repo'sunda). Aynı
 * kimlikte PT'ninki kazanır. Saf: GitHub'a `RepoFiles` ile erişir (sunucuda `appRepoFiles()`,
 * testlerde `testing/fake-repo.ts`).
 *
 * Dosyalar öğe öğe okunur (`stored-list.ts`): okunamayan kayıt listede görünmez ama dosyadan da
 * düşmez. Dosya liste değilse 500: üzerine yazılmaz.
 */

export type CatalogKind = 'exercises' | 'devices' | 'attachments';

export type Catalog<T extends { id: string }> = {
  kind: CatalogKind;
  path: string;
  library: readonly T[];
  parse(content: unknown): StoredList<T> | null;
};

export const EXERCISES: Catalog<Exercise> = {
  kind: 'exercises',
  path: 'data/exercises.json',
  library: EXERCISE_LIBRARY,
  parse: (content) => parseStoredList(customExercisesSchema, content),
};

export const DEVICES: Catalog<Device> = {
  kind: 'devices',
  path: 'data/devices.json',
  library: DEVICE_LIBRARY,
  parse: (content) => parseStoredList(customDevicesSchema, content),
};

export const ATTACHMENTS: Catalog<Attachment> = {
  kind: 'attachments',
  path: 'data/attachments.json',
  library: ATTACHMENT_LIBRARY,
  parse: (content) => parseStoredList(customAttachmentsSchema, content),
};

/** PT'nin dosyası: okunabilen kayıtlar, okunamayanlar (sayısı ve ham hâli) ve `sha` (dosya yoksa null). */
export type CatalogFile<T> = StoredList<T> & { invalid: number; sha: string | null };

/** Taze okuma (yazmadan önce `sha` için ve silme/güncelleme kararları için). */
export async function readCatalog<T extends { id: string }>(files: RepoFiles, catalog: Catalog<T>): Promise<CatalogFile<T>> {
  const stored = await files.readJson(catalog.path);
  if (!stored) return { items: [], unreadable: [], invalid: 0, sha: null };
  const parsed = catalog.parse(stored.content);
  if (!parsed) throw new GithubError(`${catalog.path} bozuk: kayıt listesi değil.`, 500);
  return { ...parsed, invalid: parsed.unreadable.length, sha: stored.sha };
}

/** `file` okunan dosyadır: `sha`'sıyla yazılır, okunamayan kayıtları olduğu gibi sona eklenir. */
export async function writeCatalog<T extends { id: string }>(
  files: RepoFiles,
  catalog: Catalog<T>,
  items: readonly T[],
  message: string,
  file: Pick<CatalogFile<T>, 'sha' | 'unreadable'>,
): Promise<void> {
  await files.writeJson(catalog.path, storedListContent(items, file.unreadable), { sha: file.sha ?? undefined, message });
}

/**
 * Başka bir kaydın yan etkisi (ör. silinen cihazın bağları): dosya taze okunur, `change`
 * uygulanır, değişen varsa kendi `sha`'sıyla yazılır. Yazdıysa `true`.
 */
export async function updateCatalog<T extends { id: string }>(
  files: RepoFiles,
  catalog: Catalog<T>,
  change: (items: T[]) => T[] | null,
  message: string,
): Promise<boolean> {
  const file = await readCatalog(files, catalog);
  const next = change(file.items);
  if (!next) return false;
  await writeCatalog(files, catalog, next, message, file);
  return true;
}

/** PT'nin kayıtları + onlarla ezilmeyen hazır kayıtlar (sırasız). */
export function withLibrary<T extends { id: string }>(items: readonly T[], library: readonly T[]): T[] {
  const own = new Set(items.map((item) => item.id));
  return [...items, ...library.filter((item) => !own.has(item.id))];
}

/**
 * Silinen kimlikler (`data/retired-ids.json`): PT'nin sildiği egzersiz, cihaz ve aparatın kimliği
 * yeni kayda bir daha verilmez. Şablon ve program satırları (`exerciseId`, `deviceId`) silinen
 * kaydı göstermeye devam eder ("Silinmiş egzersiz" uyarısı, SPEC §7.4); aynı adla açılan yeni
 * kayıt onları devralmasın. Hazır kütüphanenin kimlikleri buraya girmez: "Varsayılana dön" silme
 * değildir, kimlik hazır kayıtta yaşar.
 *
 * `{ "exercises": [], "devices": [], "attachments": [] }`; bilinmeyen alanlar olduğu gibi korunur.
 * Okunamazsa 500: kimlik üretilmez (silinmiş bir kimlik yeniden verilebilirdi), üzerine yazılmaz.
 */
export const RETIRED_IDS_PATH = 'data/retired-ids.json';

const retiredIdsSchema = v.looseObject({
  exercises: v.optional(v.array(v.string()), () => []),
  devices: v.optional(v.array(v.string()), () => []),
  attachments: v.optional(v.array(v.string()), () => []),
});

export type RetiredIds = v.InferOutput<typeof retiredIdsSchema>;

export async function readRetiredIds(files: RepoFiles): Promise<{ ids: RetiredIds; sha: string | null }> {
  const stored = await files.readJson(RETIRED_IDS_PATH);
  if (!stored) return { ids: { exercises: [], devices: [], attachments: [] }, sha: null };
  // Liste de bir "nesne" sayılır (looseObject kabul ederdi); dosya bir nesne olmalı.
  const parsed = Array.isArray(stored.content) ? null : v.safeParse(retiredIdsSchema, stored.content);
  if (!parsed?.success) throw new GithubError(`${RETIRED_IDS_PATH} bozuk: silinen kimlikler okunamadı.`, 500);
  return { ids: parsed.output, sha: stored.sha };
}

/** Silinen kimliği listeye ekler (silmenin son adımı); zaten varsa hiçbir şey yazmaz. */
export async function retireId(files: RepoFiles, kind: CatalogKind, id: string, message: string): Promise<void> {
  const { ids, sha } = await readRetiredIds(files);
  if (ids[kind].includes(id)) return;
  await files.writeJson(RETIRED_IDS_PATH, { ...ids, [kind]: [...ids[kind], id] }, { sha: sha ?? undefined, message });
}
