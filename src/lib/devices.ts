import 'server-only';
import * as v from 'valibot';
import { DEVICE_LIBRARY } from '@/data/device-library';
import { appRepo } from './github/client';
import { readJson, writeJson } from './github/files';
import { customDevicesSchema, type Device } from './schemas/device';

/**
 * Cihazlar: hazır katalog (pakette) + PT'nin eklediği ya da değiştirdiği cihazlar (repo'da).
 * Aynı kimlik iki tarafta da varsa PT'ninki kazanır (ör. blok adımı farklı bir chest press).
 * Egzersizlerdeki gibi sunucuda önbellek yok: kaydın ardından açılan sayfa yeni kaydı görür.
 */

export const CUSTOM_DEVICES_PATH = 'data/devices.json';

export type DeviceWithSource = Device & { source: 'library' | 'custom' };
export type DeviceDetail = DeviceWithSource & { overridesLibrary: boolean };

export async function readCustomDevices(): Promise<{ items: Device[]; sha: string | null }> {
  const stored = await readJson<unknown>(appRepo(), CUSTOM_DEVICES_PATH);
  if (!stored) return { items: [], sha: null };
  const parsed = v.safeParse(customDevicesSchema, stored.content);
  // Bozuk dosya uygulamayı düşürmez: hazır katalogla devam edilir.
  return { items: parsed.success ? parsed.output : [], sha: stored.sha };
}

export async function writeCustomDevices(items: Device[], message: string, sha: string | null): Promise<void> {
  await writeJson(appRepo(), CUSTOM_DEVICES_PATH, items, { sha: sha ?? undefined, message });
}

export async function listDevices(): Promise<DeviceWithSource[]> {
  const { items } = await readCustomDevices();
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
