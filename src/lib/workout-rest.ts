import { WORKOUT } from './motion.ts';

/**
 * Dinlenme sayacı (tasarım §2.5, §3) — saf. Sayaç zaman damgasındandır (`endsAt`, epoch ms): telefon
 * uyusa, sekme değişse ya da sayfa yenilense de doğru kalır (v1). Kare kare çağrılan `tickRest` hem
 * durumu (koşuyor · son 10 sn · bitti) hem o anda çalınacak sesleri verir:
 * - son 10 sn'ye girince tek bip (`warn`);
 * - bitince 3 bip (`end`); danışan dokunana kadar 15 sn'de bir, en çok 3 kez yinelenir (`alarm`).
 * Geç fark edilen an sessizdir: sayfaya dinlenme bittikten sonra dönülürse bip çalmaz, aşım yazılır
 * ("Dinlenme 1:40 önce bitti"); arkadayken biriken alarmlar da dönüşte art arda çalmaz.
 */

/** Olay bu kadar geç fark edildiyse ses yok (sekme arkadaydı, telefon kilitliydi). */
export const LATE_MS = 2000;

export type RestTimer = {
  /** Dinlenmenin ardından geldiği set ("Set 2 kaydedildi · Düzelt"). */
  setId: string;
  startedAt: number;
  endsAt: number;
  /** Halkanın tamamı (sn); ±15 ile büyüyebilir. */
  total: number;
  warned: boolean;
  /** Bitişin fark edildiği an; bitmediyse null. */
  endedAt: number | null;
  /** Çalınan yinelenen alarm sayısı. */
  alarms: number;
  lastAlarmAt: number | null;
  /** Danışan dokundu: yinelenen alarm susar. */
  ack: boolean;
  /** Tam panel ya da 48 px'lik şerit ("Küçült"). */
  mode: 'full' | 'mini';
};

export type RestEvent = 'warn' | 'end' | 'alarm';

export type RestTick = {
  timer: RestTimer;
  remainingMs: number;
  /** Bitişten beri geçen (bitmediyse 0). */
  overrunMs: number;
  state: 'running' | 'warn' | 'ended';
  /** Halkanın dolu kısmı: kalan / toplam, 0–1. */
  fraction: number;
  events: RestEvent[];
};

export function startRest(setId: string, seconds: number, now: number): RestTimer {
  return {
    setId,
    startedAt: now,
    endsAt: now + seconds * 1000,
    total: seconds,
    warned: false,
    endedAt: null,
    alarms: 0,
    lastAlarmAt: null,
    ack: false,
    mode: 'full',
  };
}

/**
 * ±15 sn (yalnız bu dinlenme): bitiş en erken bir saniye sonrası. Uzayınca son 10 sn uyarısı yeniden
 * kurulur; bitmiş dinlenme uzatılırsa yeniden koşar ve bitişte yine çalar.
 */
export function adjustRest(timer: RestTimer, deltaSeconds: number, now: number): RestTimer {
  const endsAt = Math.max(now + 1000, timer.endsAt + deltaSeconds * 1000);
  const remaining = endsAt - now;
  const rearm = timer.endedAt !== null;
  return {
    ...timer,
    endsAt,
    total: Math.max(timer.total, Math.ceil(remaining / 1000)),
    warned: remaining > WORKOUT.restWarnSeconds * 1000 ? false : timer.warned,
    ...(rearm ? { endedAt: null, alarms: 0, lastAlarmAt: null, ack: false } : {}),
  };
}

/** Danışan panele dokundu (Küçült, ±15, Su içtim…): yinelenen alarm susar. */
export function acknowledgeRest(timer: RestTimer): RestTimer {
  return timer.ack ? timer : { ...timer, ack: true };
}

export function tickRest(timer: RestTimer, now: number): RestTick {
  const remainingMs = timer.endsAt - now;
  const warnMs = WORKOUT.restWarnSeconds * 1000;
  const events: RestEvent[] = [];
  let next = timer;

  if (remainingMs > 0) {
    if (remainingMs <= warnMs && !timer.warned) {
      next = { ...next, warned: true };
      if (remainingMs > warnMs - LATE_MS) events.push('warn');
    }
    return {
      timer: next,
      remainingMs,
      overrunMs: 0,
      state: remainingMs <= warnMs ? 'warn' : 'running',
      fraction: Math.min(1, remainingMs / Math.max(1, timer.total * 1000)),
      events,
    };
  }

  const overrunMs = -remainingMs;
  if (timer.endedAt === null) {
    const late = overrunMs > LATE_MS;
    next = { ...next, warned: true, endedAt: now, lastAlarmAt: now, ...(late ? { alarms: WORKOUT.alarmRepeats } : {}) };
    if (!late) events.push('end');
  } else if (!timer.ack && timer.alarms < WORKOUT.alarmRepeats && now - (timer.lastAlarmAt ?? now) >= WORKOUT.alarmRepeatMs) {
    const lateAlarm = now - (timer.lastAlarmAt ?? now) - WORKOUT.alarmRepeatMs > LATE_MS;
    next = { ...next, alarms: lateAlarm ? WORKOUT.alarmRepeats : timer.alarms + 1, lastAlarmAt: now };
    if (!lateAlarm) events.push('alarm');
  }
  return { timer: next, remainingMs, overrunMs, state: 'ended', fraction: 0, events };
}

/** Alarm hâlâ yineleyecek mi ("dokununca alarm susar" ipucu). */
export function alarmPending(timer: RestTimer): boolean {
  return timer.endedAt !== null && !timer.ack && timer.alarms < WORKOUT.alarmRepeats;
}
