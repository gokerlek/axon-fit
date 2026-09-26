import 'server-only';
import { DEVICE_LIBRARY } from '@/data/device-library';
import { appRepoFiles } from './app-repo-files';
import { DEVICES, readCatalog, type CatalogFile } from './catalog-store';
import type { Device } from './schemas/device';

/**
 * Cihazlar: hazır katalog (pakette) + PT'nin eklediği ya da değiştirdiği cihazlar (repo'da).
 * Aynı kimlik iki tarafta da varsa PT'ninki kazanır (ör. blok adımı farklı bir chest press).
 * Egzersizlerdeki gibi sunucuda önbellek yok: kaydın ardından açılan sayfa yeni kaydı görür.
 */

export const CUSTOM_DEVICES_PATH = DEVICES.path;

export type DeviceWithSource = Device & { source: 'library' | 'custom' };
export type DeviceDetail = DeviceWithSource & { overridesLibrary: boolean };

/** PT'nin dosyası: okunabilen cihazlar, okunamayanlar (sayısı ve ham hâli) ve `sha`. */
export type CustomDevices = CatalogFile<Device>;

/**
 * Taze okuma. Öğe öğe doğrulanır (`src/lib/stored-list.ts`): şemaya uymayan kayıt (ya da aynı
 * kimliğin ikinci kaydı) listede görünmez ama dosyadan da düşmez. Dosya liste değilse hata verir.
 * Yazma uçların çekirdeğinde (`src/lib/catalog-actions.ts`).
 */
export async function readCustomDevices(): Promise<CustomDevices> {
  return readCatalog(appRepoFiles(), DEVICES);
}

/** Hazır katalog + PT'nin cihazları. Dosya zaten okunduysa (`custom`) yeniden okunmaz. */
export async function listDevices(custom?: Pick<CustomDevices, 'items'>): Promise<DeviceWithSource[]> {
  const { items } = custom ?? (await readCustomDevices());
  const customIds = new Set(items.map((item) => item.id));
  return [
    ...items.map((item) => ({ ...item, source: 'custom' as const })),
    ...DEVICE_LIBRARY.filter((item) => !customIds.has(item.id)).map((item) => ({ ...item, source: 'library' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export async function getDevice(id: string, list?: DeviceWithSource[]): Promise<DeviceDetail | null> {
  const all = list ?? (await listDevices());
  const found = all.find((item) => item.id === id);
  if (!found) return null;
  return { ...found, overridesLibrary: found.source === 'custom' && DEVICE_LIBRARY.some((item) => item.id === id) };
}
