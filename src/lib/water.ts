import * as v from 'valibot';
import { todayIn } from './format.ts';
import { waterTapSchema, type WaterTap } from './schemas/session.ts';

/**
 * Antrenman dışı su (tasarım §0, §4.1) — saf. Bugün'deki "+1" bardakları danışan repo'sunda
 * `water.json`'a yazar: `{ "version": 1, "taps": [ { "id": "wt_…", "d": 1, "at": "…" } ] }`. Antrenman
 * sırasındaki su seans dosyasında kalır (`waterTaps`); günün toplamı ikisinin toplamıdır, çift sayılmaz.
 *
 * Seanstaki gibi bir dokunuş listesi: telefon dokunuşları 10 sn biriktirip tek istekte gönderir,
 * sunucu kimlikle birleştirir (aynı dokunuşu yeniden göndermek zararsız). "Geri al" bir −1
 * dokunuşudur; toplam gün başına en az 0. Liste sınırı aşınca en eski dokunuşlar düşer (yalnız çok
 * eski günlerin toplamı etkilenir).
 */

export const WATER_PATH = 'water.json';

export const WATER_LIMITS = {
  /** Dosyada tutulan dokunuş: günde 10 bardakla ~1,5 yıl. */
  taps: 5000,
  /** Bir istekte (10 sn'lik birikim). */
  perRequest: 50,
} as const;

/** Telefonun dokunuşları biriktirdiği süre (tasarım §0). */
export const WATER_BATCH_MS = 10_000;

export type WaterFile = { version: 1; taps: WaterTap[] };

export const waterPostSchema = v.object({
  taps: v.pipe(v.array(waterTapSchema), v.minLength(1, 'Değişiklik yok.'), v.maxLength(WATER_LIMITS.perRequest)),
});
export type WaterPost = v.InferOutput<typeof waterPostSchema>;

export function emptyWaterFile(): WaterFile {
  return { version: 1, taps: [] };
}

function time(iso: string): number {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : at;
}

function byTime(a: WaterTap, b: WaterTap): number {
  return time(a.at) - time(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Dosya dokunuş dokunuş okunur: uymayan dokunuş düşer (sayısı döner), dosyanın kendisi okunamıyorsa
 * boş liste. Aynı kimlik iki kez varsa ilki kalır.
 */
export function parseWaterFile(raw: unknown): { file: WaterFile; dropped: number } {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(record.taps) ? record.taps : [];
  const seen = new Set<string>();
  const taps: WaterTap[] = [];
  let dropped = 0;
  for (const row of rows) {
    const parsed = v.safeParse(waterTapSchema, row);
    if (!parsed.success || seen.has(parsed.output.id)) {
      dropped += 1;
      continue;
    }
    seen.add(parsed.output.id);
    taps.push({ id: parsed.output.id, d: parsed.output.d, at: parsed.output.at });
  }
  return { file: { version: 1, taps: taps.sort(byTime) }, dropped };
}

/**
 * Gelen dokunuşları kimlikle ekler (kayıttaki dokunuş değişmez). `changed` false ise yazılmaz.
 * Sınır aşılınca en eskiler düşer.
 */
export function mergeWaterTaps(file: WaterFile, incoming: readonly WaterTap[]): { file: WaterFile; added: WaterTap[]; changed: boolean } {
  const known = new Set(file.taps.map((tap) => tap.id));
  const added: WaterTap[] = [];
  for (const tap of incoming) {
    if (known.has(tap.id)) continue;
    known.add(tap.id);
    added.push({ id: tap.id, d: tap.d, at: tap.at });
  }
  if (added.length === 0) return { file, added, changed: false };
  const taps = [...file.taps, ...added].sort(byTime).slice(-WATER_LIMITS.taps);
  return { file: { version: 1, taps }, added, changed: true };
}

/** O günün bardak sayısı (uygulamanın saat diliminde), en az 0. */
export function waterOnDay(taps: readonly Pick<WaterTap, 'd' | 'at'>[], day: string, timeZone: string): number {
  let total = 0;
  for (const tap of taps) {
    const at = time(tap.at);
    if (at > 0 && todayIn(timeZone, new Date(at)) === day) total += tap.d;
  }
  return Math.max(0, total);
}

/** Commit mesajı: "Su · +2", geri almada "Su · +1 · −1". Değer olarak yalnız bardak sayısı. */
export function waterMessage(added: readonly Pick<WaterTap, 'd'>[]): string {
  const plus = added.filter((tap) => tap.d > 0).length;
  const minus = added.length - plus;
  return ['Su', plus > 0 ? `+${plus}` : null, minus > 0 ? `−${minus}` : null].filter(Boolean).join(' · ');
}
