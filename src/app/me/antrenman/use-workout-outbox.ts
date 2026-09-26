'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SessionDoc } from '@/lib/schemas/session';
import { acknowledge, backoffMs, hasUnsent, KEEPALIVE_MAX_BYTES, sendDelay, sendPending, type LocalWorkout } from '@/lib/workout-outbox';

/**
 * Gönderim kuyruğu (tasarım §4.3) — tarayıcıya bağlı kısım; kurallar `workout-outbox.ts`'te.
 * - Uçta aynı anda tek istek; dönünce belge yine kirliyse son hâl gider. Set yazımı birleştirme
 *   penceresine uyar (son yazmadan 15 sn; kota azsa 60 sn). Boşta gönderim yok.
 * - Bağlantı yoksa ya da sınır/geçici hata: üstel bekleme; bağlantı gelince (`online`) hemen.
 * - Sayfa gizlenince ya da kapanınca yalnız onaylanmamış değişiklik varsa `keepalive`'la son hâl;
 *   ilk setten önce hiçbir şey (dosya ilk sette oluşur, öncesi o yazıma ya da bitişe biner).
 * - 410: antrenman silinmiş; 409 `finished`: başka cihazda bitirilmiş (çağıran sorar); 401: oturum
 *   kapandı (veri telefonda kalır); şema hatası (4xx): "Tekrar dene"ye kadar durur.
 */

export type OutboxProblem = 'offline' | 'limited' | 'error' | 'session' | null;

type Options = {
  localRef: { readonly current: LocalWorkout | null };
  commit: (next: LocalWorkout) => void;
  onGone: () => void;
  onFinishedElsewhere: (server: SessionDoc) => void;
};

const url = (id: string) => `/api/me/sessions/${id}`;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function createRunner(get: () => Options, report: (problem: OutboxProblem) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let stopped = false;
  let halted = false;
  let attempt = 0;
  let notBefore = 0;

  const wait = () => {
    notBefore = Date.now() + backoffMs(attempt);
    attempt += 1;
  };

  function schedule() {
    clearTimeout(timer);
    const local = get().localRef.current;
    if (stopped || halted || inFlight || !local || !sendPending(local)) return;
    const now = Date.now();
    timer = setTimeout(() => void send(), Math.max(0, sendDelay(local, now), notBefore - now));
  }

  async function send() {
    const local = get().localRef.current;
    if (stopped || halted || inFlight || !local || !sendPending(local)) return;
    inFlight = true;
    const sentRev = local.rev;
    const doc = local.doc;
    get().commit({ ...local, lastSentAt: Date.now() });
    let response: Response;
    try {
      response = await fetch(url(doc.id), { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(doc) });
    } catch {
      inFlight = false;
      wait();
      report('offline');
      schedule();
      return;
    }
    inFlight = false;
    const body = (await response.json().catch(() => null)) as { doc?: SessionDoc; slow?: boolean; reason?: string } | null;
    if (stopped) return;
    if (response.ok && body?.doc) {
      attempt = 0;
      notBefore = 0;
      const current = get().localRef.current;
      if (current && current.doc.id === doc.id) get().commit(acknowledge(current, body.doc, sentRev, { slow: body.slow === true }));
      report(null);
      schedule();
      return;
    }
    if (response.status === 410) {
      stopped = true;
      get().onGone();
      return;
    }
    if (response.status === 409 && body?.reason === 'finished' && body.doc) {
      stopped = true;
      get().onFinishedElsewhere(body.doc);
      return;
    }
    if (response.status === 401) {
      halted = true;
      report('session');
      return;
    }
    if (response.status === 429 || response.status === 503 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      wait();
      if (Number.isFinite(retryAfter) && retryAfter > 0) notBefore = Math.max(notBefore, Date.now() + retryAfter * 1000);
      report('limited');
      schedule();
      return;
    }
    // Şema ya da köken hatası: kendiliğinden yeniden denemek aynı sonucu verir.
    halted = true;
    report('error');
  }

  /** Sayfa gizlenirken ya da kapanırken: onaylanmamış değişiklik varsa son hâl (sırası önemsiz). */
  function keepalive() {
    const local = get().localRef.current;
    // Dosya ilk sette oluşur (§4.3): henüz onaylı belge yoksa yalnız bekleyen set değişikliği gider.
    if (stopped || !local || !hasUnsent(local) || (local.acked === null && !sendPending(local))) return;
    const body = JSON.stringify(local.doc);
    if (body.length > KEEPALIVE_MAX_BYTES) return;
    try {
      void fetch(url(local.doc.id), { method: 'PUT', headers: JSON_HEADERS, body, keepalive: true }).catch(() => undefined);
    } catch {
      // Tarayıcı isteği reddettiyse kopya telefonda; açılışta gider.
    }
  }

  return {
    schedule,
    keepalive,
    /** Bağlantı geldi ya da danışan "Tekrar dene"ye dokundu: beklemeden. */
    retry() {
      halted = false;
      attempt = 0;
      notBefore = 0;
      schedule();
    },
    /** Bitiş sürerken yazma yok (bitiş belgenin tamamını gönderir). */
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    resume() {
      stopped = false;
      schedule();
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}

export type Outbox = ReturnType<typeof createRunner>;

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useWorkoutOutbox(options: Options): { outbox: Outbox; problem: OutboxProblem; online: boolean } {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [problem, setProblem] = useState<OutboxProblem>(null);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [outbox] = useState(() => createRunner(() => latest.current, setProblem));

  useEffect(() => {
    const onOnline = () => outbox.retry();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') outbox.keepalive();
    };
    const onPageHide = () => outbox.keepalive();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    // Açılışta gönderilmemiş set varsa (yenileme, çökme, çevrimdışı birikim) hemen.
    outbox.schedule();
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      // Sayfadan çıkış (Ara ver): kalan değişiklik yolda kaybolmasın.
      outbox.keepalive();
      outbox.dispose();
    };
  }, [outbox]);

  return { outbox, problem, online };
}
