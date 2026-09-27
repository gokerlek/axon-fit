import 'server-only';
import * as v from 'valibot';
import { cachedClientIndex } from './clients';
import { clientRepoName, GithubError, sessionWriter } from './github/client';
import { commitChangedFiles, latestCommit, readBlobJson, readJsonConditional } from './github/files';
import { activeSessionOf, liveSessionOf, sessionFileOfCommit, withinLiveWindow } from './live-session';
import type { LiveClient, LiveResponse, LiveSession } from './live-text';
import { readClientDigest } from './notices-store';
import { mapLimit } from './progress-load';
import { isOwnProgramId, ownProgramPath } from './own-programs';
import { PROGRAM_PATH } from './programs';
import { ownProgramSchema } from './schemas/own-program';
import { programSchema, type Program } from './schemas/program';
import { SESSIONS_DIR } from './schemas/session';

/**
 * PT'nin canlı görünümü — GitHub'a bağlama; kararlar `live-session.ts`'te (saf, test edilir).
 *
 * Bir tazeleme (tasarım §4.6): `sessions/` klasörüne dokunan son commit, koşullu (ETag; değişmediyse 304,
 * birincil kotadan düşmez) → 3 saatten eskiyse kimse çalışmıyor, başka okuma yok → commit'in değiştirdiği
 * antrenman dosyası (commit kimliğiyle bellekte) → dosyanın blob'u (kimliğiyle bellekte) → etkinse günün planı
 * için `program.json`, koşullu. Değişiklik yokken her tazeleme tek bir 304'tür. Seans yazıcısının istemcisiyle
 * (`sessionWriter`): 5xx'te bir kez dener, sınırda Route Handler'ın içinde beklemez; tazeleme bir sonrakine kalır.
 */

/** Ayrıştırılmış programların günleri, dosyanın `sha`'sıyla (değişmez). */
const programs = new Map<string, Pick<Program, 'phases'> | null>();
const PROGRAM_CACHE = 100;

/** Antrenmanın programı: kendi programdan antrenmanda o dosya (`docs/design/kendi-program.md` §5.4), yoksa `program.json`. */
async function programOf(repo: string, programId: string | undefined): Promise<Pick<Program, 'phases'> | null> {
  const path = programId && isOwnProgramId(programId) ? ownProgramPath(programId) : PROGRAM_PATH;
  const file = await readJsonConditional<unknown>(repo, path, sessionWriter()).catch(() => null);
  if (!file) return null;
  const key = `${repo}@${file.sha}`;
  if (!programs.has(key)) {
    const parsed = programId ? v.safeParse(ownProgramSchema, file.content) : v.safeParse(programSchema, file.content);
    programs.set(key, parsed.success ? (parsed.output as Pick<Program, 'phases'>) : null);
    if (programs.size > PROGRAM_CACHE) programs.delete(programs.keys().next().value as string);
  }
  return programs.get(key) ?? null;
}

/** Danışanın açık antrenmanı; kimse çalışmıyorsa null. Ağ ve yetki hataları yukarı çıkar. */
export async function readLiveSession(clientId: string, now: Date = new Date()): Promise<LiveSession | null> {
  const repo = clientRepoName(clientId);
  const api = sessionWriter();
  const latest = await latestCommit(repo, SESSIONS_DIR, api);
  if (!latest || !withinLiveWindow(latest.date, now)) return null;
  const file = sessionFileOfCommit(await commitChangedFiles(repo, latest.sha, api));
  if (!file) return null;
  let raw: unknown = null;
  try {
    raw = await readBlobJson(repo, file.sha, api);
  } catch (error) {
    // Bozuk JSON canlı değil; ağ ve yetki hataları yukarı.
    if (!(error instanceof GithubError && error.status === 500)) throw error;
  }
  const doc = activeSessionOf(raw);
  if (!doc) return null;
  return liveSessionOf({ doc, program: await programOf(repo, doc.program?.programId), committedAt: latest.date, now });
}

/** Sayfanın ilk çizimi için (`GET /api/clients/[id]/live` ile aynı yanıt); okunamazsa null, tarayıcı kendisi sorar. */
export async function readLiveResponse(clientId: string): Promise<LiveResponse | null> {
  const now = new Date();
  try {
    return { live: await readLiveSession(clientId, now), checkedAt: now.toISOString() };
  } catch {
    return null;
  }
}

/** Aynı anda en çok bu kadar danışan okunur (GitHub'ın ikincil sınırı). */
const OVERVIEW_CONCURRENCY = 6;

/**
 * Genel bakış'ın "Şu an antrenmanda" listesi: aktif danışanların açık antrenmanları, son seti en yeni olan
 * önce. Ad bildirim özetinden (önbellekli). Okunamayan danışan listeyi durdurmaz, sayılır.
 */
export async function readLiveOverview(now: Date = new Date()): Promise<{ items: LiveClient[]; failed: number }> {
  const index = await cachedClientIndex();
  const results = await mapLimit(
    index.filter((entry) => entry.status === 'active'),
    OVERVIEW_CONCURRENCY,
    async (entry): Promise<LiveClient | null | 'failed'> => {
      try {
        const live = await readLiveSession(entry.id, now);
        if (!live) return null;
        const digest = await readClientDigest(entry.id).catch(() => null);
        return { ...live, clientId: entry.id, name: digest?.name ?? 'Danışan' };
      } catch {
        return 'failed';
      }
    },
  );
  const items = results.filter((item): item is LiveClient => item !== null && item !== 'failed');
  const last = (item: LiveClient) => Date.parse(item.lastSetAt ?? item.startedAt);
  items.sort((a, b) => last(b) - last(a) || a.name.localeCompare(b.name, 'tr'));
  return { items, failed: results.filter((item) => item === 'failed').length };
}
