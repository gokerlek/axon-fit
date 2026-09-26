import type { WaterTap } from '@/lib/schemas/session';
import { randomId } from '@/lib/template-plan';
import {
  localWorkoutKey,
  parseLocalWorkout,
  workoutCacheKey,
  WRITER_KEY,
  type LocalWorkout,
} from '@/lib/workout-outbox';
import type { WorkoutResponse } from '@/lib/workout-routes';

/**
 * Telefondaki antrenman verisi — `localStorage` (tasarım §4.3). Her erişim `try/catch` içinde: özel
 * pencerede ya da dolu depoda okuma/yazma düşer, uygulama bellekteki kopyayla sürer (çağıran bir kez
 * uyarır). Aynı sekmedeki dinleyiciler (Bugün'ün yarım antrenman kartı) değişiklikte haber alır.
 *
 * - `pulsecoach.session.<danışan>`: etkin antrenman ve gönderim kuyruğu (`workout-outbox.ts`).
 * - `pulsecoach.workout.<danışan>`: son okunan gün planı ve Bugün'ün sayıları: "Antrenmana başla" ağ
 *   beklemez, çevrimdışı başlangıç son planla olur.
 * - `pulsecoach.water.<danışan>`: Bugün'de henüz gönderilmemiş su dokunuşları (10 sn'lik birikim).
 * - `pulsecoach.writer`: bu telefonun yazan kimliği.
 */

const CHANGE_EVENT = 'pulsecoach:local-workout';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Depo kapalıysa silinecek bir şey de yok.
  }
}

let memoryWriter: string | null = null;

/** Bu telefonun kimliği (`w_…`): ilk açılışta üretilir; depo kapalıysa sayfa boyunca bellekte. */
export function writerId(): string {
  const stored = read(WRITER_KEY);
  if (stored && /^w_[a-z0-9]{6}$/.test(stored)) return stored;
  memoryWriter ??= randomId('w', 6, new Set());
  write(WRITER_KEY, memoryWriter);
  return memoryWriter;
}

/* --- etkin antrenman --- */

export function readLocalWorkout(clientId: string): LocalWorkout | null {
  return parseLocalWorkout(read(localWorkoutKey(clientId)));
}

/** Yazar; yazılamazsa false (belge bellekte kalır). */
export function saveLocalWorkout(clientId: string, local: LocalWorkout): boolean {
  const ok = write(localWorkoutKey(clientId), JSON.stringify(local));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return ok;
}

/** Bitiş ya da silinme sunucuda onaylanınca. */
export function clearLocalWorkout(clientId: string): void {
  remove(localWorkoutKey(clientId));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Aynı sekmedeki ve öteki sekmelerdeki değişiklikler (`useSyncExternalStore`). */
export function subscribeLocalWorkout(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** `useSyncExternalStore` anlık görüntüsü: ham metin (değişmediyse aynı dize, yeniden çizim yok). */
export function localWorkoutText(clientId: string): string | null {
  return read(localWorkoutKey(clientId));
}

/* --- gün planı önbelleği --- */

export type CachedWorkout = { at: number; data: WorkoutResponse };

export function readWorkoutCache(clientId: string): CachedWorkout | null {
  const text = read(workoutCacheKey(clientId));
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as CachedWorkout;
    return typeof parsed?.at === 'number' && parsed.data && typeof parsed.data.today === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveWorkoutCache(clientId: string, data: WorkoutResponse): void {
  write(workoutCacheKey(clientId), JSON.stringify({ at: Date.now(), data } satisfies CachedWorkout));
}

/** Bitişten sonra: sıradaki gün ve plan değişti, eski plan başlangıçta kullanılmasın. */
export function clearWorkoutCache(clientId: string): void {
  remove(workoutCacheKey(clientId));
}

/* --- Bugün'ün suyu --- */

function waterKey(clientId: string): string {
  return `pulsecoach.water.${clientId}`;
}

export function readPendingWater(clientId: string): WaterTap[] {
  const text = read(waterKey(clientId));
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((tap): tap is WaterTap => typeof tap?.id === 'string' && (tap.d === 1 || tap.d === -1) && typeof tap.at === 'string')
      : [];
  } catch {
    return [];
  }
}

export function savePendingWater(clientId: string, taps: readonly WaterTap[]): void {
  if (taps.length === 0) remove(waterKey(clientId));
  else write(waterKey(clientId), JSON.stringify(taps));
}
