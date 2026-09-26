import { SESSION_LIMITS } from './schemas/session.ts';
import { LATE_MS } from './workout-rest.ts';

/**
 * Süreli set (tasarım §2.4 "Set türleri") — saf. "Başlat ▶" sayacı kurar, sayaç sayar (kronometre);
 * hedefin alt sınırına geri sayım yazılır ve alt sınırda tek bip çalar; "Bitir ■" geçen saniyeyi seti
 * olarak yazar. Elle stepper da vardır (sayaç kurulmadan "Set bitti").
 *
 * Sayaç zaman damgasındandır (`startedAt`, epoch ms): telefon uyusa ya da sayfa yenilense de doğru
 * kalır (telefondaki kayıtta durur, `workout-outbox.ts`). Geç fark edilen alt sınır sessizdir (sekme
 * arkadaydı): dönüşte bip çalmaz.
 */

export type SetTimer = {
  /** Sayılan set: satır ve satırdaki yeri. */
  rowId: string;
  setIndex: number;
  startedAt: number;
  /** Hedef (sn): alt sınırda bip. */
  min: number;
  max: number;
  /** Alt sınır bipi çaldı (ya da geç fark edildi). */
  beeped: boolean;
};

export type SetTimerTick = {
  timer: SetTimer;
  /** Geçen tam saniye. */
  seconds: number;
  /** Alt sınıra kalan (ulaşıldıysa 0). */
  toMin: number;
  /** Alt sınıra ilerleme, 0–1 (çubuk). */
  fraction: number;
  phase: 'below' | 'reached' | 'above';
  events: 'min'[];
};

export function startSetTimer(input: { rowId: string; setIndex: number; target: { min: number; max: number } }, now: number): SetTimer {
  return { rowId: input.rowId, setIndex: input.setIndex, startedAt: now, min: input.target.min, max: input.target.max, beeped: false };
}

export function tickSetTimer(timer: SetTimer, now: number): SetTimerTick {
  const elapsedMs = Math.max(0, now - timer.startedAt);
  const seconds = Math.floor(elapsedMs / 1000);
  const events: 'min'[] = [];
  let next = timer;
  if (!timer.beeped && elapsedMs >= timer.min * 1000) {
    next = { ...timer, beeped: true };
    if (elapsedMs - timer.min * 1000 <= LATE_MS) events.push('min');
  }
  return {
    timer: next,
    seconds,
    toMin: Math.max(0, timer.min - seconds),
    fraction: timer.min > 0 ? Math.min(1, elapsedMs / (timer.min * 1000)) : 1,
    phase: seconds < timer.min ? 'below' : seconds > timer.max ? 'above' : 'reached',
    events,
  };
}

/** "Bitir ■": geçen saniye (en az 1, şemanın sınırında). */
export function stopSetTimer(timer: SetTimer, now: number): number {
  return Math.min(SESSION_LIMITS.seconds, Math.max(1, Math.floor((now - timer.startedAt) / 1000)));
}

/** Telefondaki kayıttan; biçimi bozuksa null. */
export function parseSetTimer(value: unknown): SetTimer | null {
  if (typeof value !== 'object' || value === null) return null;
  const { rowId, setIndex, startedAt, min, max, beeped } = value as Record<string, unknown>;
  const numbers = [setIndex, startedAt, min, max];
  if (typeof rowId !== 'string' || numbers.some((item) => typeof item !== 'number' || !Number.isFinite(item))) return null;
  return { rowId, setIndex: setIndex as number, startedAt: startedAt as number, min: min as number, max: max as number, beeped: beeped === true };
}
