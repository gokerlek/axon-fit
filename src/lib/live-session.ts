import type { LiveSession } from './live-text.ts';
import type { Program } from './schemas/program.ts';
import { parseStoredSession, sessionIdOfPath, type SessionDoc } from './schemas/session.ts';
import { completion, dayOf } from './session-finish.ts';
import { workingSetCount } from './session-index.ts';

/**
 * PT'nin canlı görünümü (tasarım §4.6, §8 satır 12; SPEC §7) — saf. GitHub'a bağlama `live-store.ts`'te,
 * metinler `live-text.ts`'te (tarayıcıda da).
 *
 * Dosya adında tarih olmadığından açık antrenman şöyle bulunur (§4.6): danışanın `sessions/` klasörüne dokunan
 * son commit (ETag'li; değişmediyse 304, birincil kotadan düşmez) → o commit'in değiştirdiği antrenman dosyası
 * (commit değişmez, kimliğiyle önbellekte) → dosyanın blob'u (kimliğiyle önbellekte). Son yazım 3 saatten
 * eskiyse ya da dosya etkin değilse (bitti, silindi) kimse çalışmıyor: 3 saattir yazmayan etkin antrenman
 * "yarım" sayılır, canlı değildir. Böylece her tazeleme, değişiklik yokken tek bir koşullu okumadır.
 *
 * "7/17 set": yapılan ve planlanan çalışma setleri bitişteki hesapla aynı (`completion`: günün planı
 * programdan; geçilen hareketin setleri planda sayılır, plandan fazla set sayılmaz). Gün programda yoksa (o
 * arada değişti) yalnız yapılan setler.
 */

/** Bu kadar süredir yazılmayan etkin antrenman canlı değil, "yarım"dır (§4.6: 3 saat). */
export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Son yazım canlı pencerede mi. Gelecekteki an (saat farkı) pencerede sayılır, bozuk an sayılmaz. */
export function withinLiveWindow(committedAt: string, now: Date): boolean {
  const at = Date.parse(committedAt);
  return !Number.isNaN(at) && now.getTime() - at <= LIVE_WINDOW_MS;
}

/**
 * Commit'in değiştirdiği antrenman dosyası (commits API'nin `files` listesi); silinen dosya ve `sessions/`
 * dışındakiler sayılmaz. Birden çoksa ilki (bitiş ve set yazımı tek antrenman dosyasına dokunur).
 */
export function sessionFileOfCommit(
  files: readonly { filename: string; status?: string | undefined; sha?: string | null | undefined }[],
): { path: string; sha: string } | null {
  for (const file of files) {
    if (file.status === 'removed' || !file.sha) continue;
    if (sessionIdOfPath(file.filename)) return { path: file.filename, sha: file.sha };
  }
  return null;
}

/** Dosya etkin bir antrenmansa belgesi; bitmiş, silinmiş ya da okunamıyorsa null. */
export function activeSessionOf(raw: unknown): SessionDoc | null {
  const stored = parseStoredSession(raw);
  return stored && stored.status === 'active' ? stored : null;
}

/** Açık antrenmanın özeti; son yazım pencerenin dışındaysa null. */
export function liveSessionOf(input: { doc: SessionDoc; program: Program | null; committedAt: string; now: Date }): LiveSession | null {
  const { doc } = input;
  if (doc.status !== 'active' || !withinLiveWindow(input.committedAt, input.now)) return null;
  const day = dayOf(input.program, doc.program?.dayId);
  const counts = day ? completion(doc, day) : null;
  const lastSetAt = doc.entries.flatMap((entry) => entry.sets.map((set) => set.at)).sort().at(-1) ?? null;
  return {
    sessionId: doc.id,
    dayName: doc.program?.dayName ?? 'Antrenman',
    done: counts ? counts.done : workingSetCount(doc),
    planned: counts && counts.planned > 0 ? counts.planned : null,
    startedAt: doc.startedAt,
    lastSetAt,
    updatedAt: input.committedAt,
  };
}
