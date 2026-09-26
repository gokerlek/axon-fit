import { GithubError } from './github/errors.ts';
import type { Client } from './schemas/client.ts';
import {
  parseSessionIndex,
  parseStoredSession,
  SESSIONS_INDEX_PATH,
  sessionPath,
  type FinishBody,
  type PatchBody,
  type SessionDoc,
  type SessionIndex,
  type StoredSession,
} from './schemas/session.ts';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { allowedHealth, applyPatch, BROKEN_HEALTH, planFinish, planPut, type FinishPlan } from './session-finish.ts';
import { indexRowOf, isDeletedInIndex, removeIndexRow, repairIndex, upsertIndexRow, type RepairResult } from './session-index.ts';
import { tombstoneOf } from './session-merge.ts';
import { DELETE_MESSAGE } from './session-messages.ts';

/**
 * Antrenman dosyalarının okuma ve yazma akışları (tasarım §4.3–§4.7) — saf çekirdek. GitHub işleri
 * dışarıdan verilir (`SessionRepo`): `session-files.ts` bunları seans yazıcısına (`sessionWriter`) ve
 * Git Data API'ye bağlar, testler sahte bir depo verir (`testing/fake-session-repo.ts`). Hesaplar
 * `session-finish.ts`'te.
 *
 * - `PUT`: dosya yalnız kimlikten; yoksa (ve kimlik silinmişler arasında değilse) oluşur. İz dosyası
 *   410, bitmiş dosya 409 (değişmez). Birleştirir; sonuç kayıttakiyle aynıysa yazmaz. `sha`'yla yazar;
 *   çakışmada taze okuyup bir kez daha birleştirir.
 * - Bitiş, geçmişte düzeltme ve silme TEK commit'tir (seans + index [+ program + sağlık]): dalın ucu
 *   okunur, dosyalar o commit'ten okunur, yeni hâller hesaplanır, commit dal ileri sarılarak yazılır.
 *   Arada dal ilerlediyse bir kez baştan; ikincisi de olmazsa 409 (telefon üstel bekler).
 * - Index her okumada `sessions/` ağacıyla onarılır; onarım bir sonraki commit'e biner.
 * - Birleşik belge yazılmadan önce şemadan yeniden geçer: sınırı aşan ya da kimliği çoğaltan birleşim 422
 *   alır, dosya okunabilir kalır. Silme eski içeriğe bakmaz; şemaya uymayan dosya da iz dosyasına döner.
 */

export type StoredJson = { content: unknown; sha: string };
export type RepoHead = { branch: string; commit: string; tree: string };

export type SessionRepo = {
  /** Varsayılan dalın ucu. */
  head(): Promise<RepoHead>;
  /** JSON dosya; `ref` verilirse o commit'teki hâli. Yoksa null; bozuk JSON 500 fırlatır. */
  read(path: string, ref?: string): Promise<StoredJson | null>;
  /** Blob kimliğiyle JSON (değişmez; önbellekli olabilir). */
  readBlob(sha: string): Promise<unknown>;
  /** Kök ağaçtaki `sessions/` dosyaları (yol, blob `sha`); klasör yoksa boş. */
  listSessions(tree: string): Promise<{ path: string; sha: string }[]>;
  /** Tek dosya, `sha` kilidiyle (Contents API). */
  write(path: string, content: unknown, options: { sha?: string | undefined; message: string }): Promise<{ sha: string; remaining: number | null }>;
  /** Birden çok dosya, tek commit; dal ilerlediyse 409. */
  commit(input: { head: RepoHead; files: readonly { path: string; content: unknown }[]; message: string }): Promise<{ commit: string; remaining: number | null }>;
  /** Silinen antrenmanın önbelleğini düşürür (`session:<id>` etiketi). */
  invalidate(id: string): void;
  log(message: string): void;
};

export type SessionContext = { now: Date; timeZone: string };

function isConflict(error: unknown): boolean {
  return error instanceof GithubError && error.status === 409;
}

/** Dosya okunur ama şemaya uymuyorsa üzerine yazılmaz: 500, PT sorunu görsün. */
function parseFile(file: StoredJson | null, id: string): StoredSession | null {
  if (!file) return null;
  const parsed = parseStoredSession(file.content);
  if (!parsed || parsed.id !== id) throw new GithubError(`${sessionPath(id)} beklenen biçimde değil.`, 500);
  return parsed;
}

/** Birleşim şemayı bozuyorsa (sınır aşımı, iki harekette aynı set kimliği) yazılmaz: dosya okunamaz hâle gelmesin. */
function assertWritable(doc: SessionDoc): void {
  if (!parseStoredSession(doc)) throw new GithubError('Kayıt sınırları aşıyor; gönderilen değişiklik kabul edilmedi.', 422);
}

/** Bozuk JSON (500) okunamayan dosya sayılır: null. Ağ ve yetki hataları yukarı çıkar. */
async function readOrNull(repo: SessionRepo, path: string, ref: string | undefined): Promise<StoredJson | null> {
  try {
    return await repo.read(path, ref);
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) {
      repo.log(`[seans] ${path} okunamadı (bozuk JSON).`);
      return null;
    }
    throw error;
  }
}

/** Index türetilmiş: okunamıyorsa boş sayılır, satırlar dosyalardan kurulur. */
async function readIndexFile(repo: SessionRepo, ref?: string): Promise<{ index: SessionIndex; dropped: number }> {
  const file = await readOrNull(repo, SESSIONS_INDEX_PATH, ref);
  return parseSessionIndex(file?.content ?? null);
}

/** O commit'teki index, `sessions/` ağacıyla onarılmış. `known`: zaten okunmuş dosyalar (yeniden okunmaz). */
async function repairedIndexAt(repo: SessionRepo, head: RepoHead, known: ReadonlyMap<string, unknown> = new Map()): Promise<RepairResult> {
  const [{ index, dropped }, files] = await Promise.all([readIndexFile(repo, head.commit), repo.listSessions(head.tree)]);
  const result = await repairIndex(index, files, async (file) => (known.has(file.path) ? known.get(file.path) : repo.readBlob(file.sha)));
  if (dropped > 0 || result.unreadable.length > 0) {
    repo.log(`[seans] index: ${dropped} satır okunamadı, ${result.unreadable.length} dosya okunamadı.`);
  }
  return result;
}

/** Tek commit'li bir işi (bitiş, düzeltme, silme) çakışmada bir kez baştan dener. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isConflict(error)) throw error;
    try {
      return await run();
    } catch (second) {
      if (isConflict(second)) throw new GithubError('Kayıt şu an başka bir yazmayla çakıştı; biraz sonra tekrar denenecek.', 409, { retryAfter: 5 });
      throw second;
    }
  }
}

/* --- okuma --- */

export type ReadResult = { status: 'ok'; doc: SessionDoc } | { status: 'missing' } | { status: 'deleted' };

export async function readSession(repo: SessionRepo, id: string): Promise<ReadResult> {
  const stored = parseFile(await repo.read(sessionPath(id)), id);
  if (!stored) return { status: 'missing' };
  if (stored.status === 'deleted') return { status: 'deleted' };
  return { status: 'ok', doc: stored };
}

/** Geçmiş listesi: onarılmış index (yazılmaz; onarım sonraki commit'e biner). */
export async function readIndex(repo: SessionRepo): Promise<RepairResult> {
  return repairedIndexAt(repo, await repo.head());
}

/* --- PUT --- */

export type PutResult =
  | { status: 'created' | 'saved' | 'unchanged'; doc: SessionDoc; remaining: number | null }
  /** Başka bir cihazda bitirildi: dosya değişmedi; telefon gönderilmemiş setleri sorar (`PATCH addSets`). */
  | { status: 'finished'; doc: SessionDoc }
  /** Silinmiş: telefon yerel kopyayı siler. */
  | { status: 'deleted' };

export async function putSession(repo: SessionRepo, ctx: SessionContext, incoming: SessionDoc): Promise<PutResult> {
  const path = sessionPath(incoming.id);
  for (let attempt = 0; ; attempt += 1) {
    const file = await repo.read(path);
    const stored = parseFile(file, incoming.id);
    if (stored?.status === 'deleted') return { status: 'deleted' };
    if (stored?.status === 'finished') return { status: 'finished', doc: stored };
    if (!stored) {
      // İz dosyası kaybolmuş olsa da index'teki silinmişler listesi dosyayı diriltmez.
      const { index } = await readIndexFile(repo);
      if (isDeletedInIndex(index, incoming.id)) return { status: 'deleted' };
    }
    const plan = planPut(stored, incoming, ctx);
    if (!plan.changed) return { status: 'unchanged', doc: stored as SessionDoc, remaining: null };
    assertWritable(plan.doc);
    try {
      const written = await repo.write(path, plan.doc, { sha: file?.sha, message: plan.message });
      return { status: stored ? 'saved' : 'created', doc: plan.doc, remaining: written.remaining };
    } catch (error) {
      // Arada başka bir cihaz ya da keepalive yazdı: taze okuyup bir kez daha birleştir.
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
  }
}

/* --- bitiş --- */

export type FinishResult =
  | { status: 'finished'; doc: SessionDoc; plan: Pick<FinishPlan, 'rotation' | 'health'>; remaining: number | null }
  /** Zaten bitmiş: aynı commit'te öteki dosyalar da yazılmıştı (200, no-op). */
  | { status: 'already'; doc: SessionDoc }
  | { status: 'deleted' };

export async function finishSession(
  repo: SessionRepo,
  ctx: SessionContext & { client: Pick<Client, 'modules' | 'consents'> },
  body: FinishBody,
): Promise<FinishResult> {
  const id = body.doc.id;
  const path = sessionPath(id);
  return withRetry(async () => {
    const head = await repo.head();
    // Okunamayan program rotasyonu durdurur ama bitişi durdurmaz (seans yine kaydedilir).
    const [file, program] = await Promise.all([repo.read(path, head.commit), readOrNull(repo, 'program.json', head.commit)]);
    const stored = parseFile(file, id);
    if (stored?.status === 'deleted') return { status: 'deleted' };
    if (stored?.status === 'finished') return { status: 'already', doc: stored };
    const known = new Map(file ? [[path, file.content]] : []);
    const { index } = await repairedIndexAt(repo, head, known);
    if (!stored && isDeletedInIndex(index, id)) return { status: 'deleted' };

    // Sağlık dosyası yalnız yazılacak onaylı bir ayrıntı varken okunur. Yoksa boş kayıt; bozuksa hiç yazılmaz.
    let healthFile: unknown = null;
    if (allowedHealth(ctx.client, body.health)) {
      try {
        healthFile = (await repo.read('health.json', head.commit))?.content ?? null;
      } catch (error) {
        if (!(error instanceof GithubError && error.status === 500)) throw error;
        healthFile = BROKEN_HEALTH;
      }
    }
    const plan = planFinish({
      stored,
      incoming: body.doc,
      rotation: body.rotation,
      health: body.health,
      index,
      program: program?.content ?? null,
      healthFile,
      client: ctx.client,
      now: ctx.now,
      timeZone: ctx.timeZone,
    });
    if (plan.health === 'broken') repo.log(`[seans] ${id}: health.json okunamadı; sağlık ayrıntısı yazılmadı.`);
    assertWritable(plan.doc);
    const written = await repo.commit({ head, files: plan.files, message: plan.message });
    return { status: 'finished', doc: plan.doc, plan: { rotation: plan.rotation, health: plan.health }, remaining: written.remaining };
  });
}

/* --- geçmişte düzeltme --- */

export type PatchResult =
  | { status: 'saved' | 'unchanged'; doc: SessionDoc; remaining: number | null }
  | { status: 'missing' }
  | { status: 'deleted' };

/**
 * Etkin seansta düzeltme: tek dosya, `PUT` gibi (index bitişte). Dosya o arada bittiyse `finished`:
 * çağıran bitmiş seans yoluna geçer.
 */
async function patchActive(repo: SessionRepo, ctx: SessionContext, id: string, body: PatchBody): Promise<PatchResult | 'finished'> {
  const path = sessionPath(id);
  for (let attempt = 0; ; attempt += 1) {
    const file = await repo.read(path);
    const stored = parseFile(file, id);
    if (!stored) return { status: 'missing' };
    if (stored.status === 'deleted') return { status: 'deleted' };
    if (stored.status === 'finished') return 'finished';
    const next = applyPatch(stored, body, ctx.now);
    if (!next.changed) return { status: 'unchanged', doc: stored, remaining: null };
    assertWritable(next.doc);
    try {
      const written = await repo.write(path, next.doc, { sha: file?.sha, message: next.message });
      return { status: 'saved', doc: next.doc, remaining: written.remaining };
    } catch (error) {
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
  }
}

export async function patchSession(repo: SessionRepo, ctx: SessionContext, id: string, body: PatchBody): Promise<PatchResult> {
  const path = sessionPath(id);
  const active = await patchActive(repo, ctx, id, body);
  if (active !== 'finished') return active;

  // Bitmiş seans: dosya ve index satırı (sha dahil) tek commit'te.
  return withRetry(async (): Promise<PatchResult> => {
    const head = await repo.head();
    const file = await repo.read(path, head.commit);
    const stored = parseFile(file, id);
    if (!stored) return { status: 'missing' };
    if (stored.status === 'deleted') return { status: 'deleted' };
    const next = applyPatch(stored, body, ctx.now);
    if (!next.changed) return { status: 'unchanged', doc: stored, remaining: null };
    assertWritable(next.doc);
    const { index } = await repairedIndexAt(repo, head, new Map([[path, file?.content]]));
    const row = indexRowOf(next.doc, gitBlobSha(jsonText(next.doc)));
    const written = await repo.commit({
      head,
      files: [
        { path, content: next.doc },
        { path: SESSIONS_INDEX_PATH, content: upsertIndexRow(index, row) },
      ],
      message: next.message,
    });
    return { status: 'saved', doc: next.doc, remaining: written.remaining };
  });
}

/* --- silme --- */

export type DeleteResult = { status: 'deleted' | 'already' };

/**
 * Antrenmanın tamamı (§4.5): dosya değersiz bir iz dosyasına döner, index satırı çıkar, kimlik
 * `deleted`'a girer; tek commit, genel mesaj. Dosya hiç yazılmamış olsa da iz yazılır: yolda kalmış bir
 * `PUT` (keepalive, ikinci cihaz) onu sonradan açamasın.
 */
export async function deleteSession(repo: SessionRepo, ctx: SessionContext, id: string): Promise<DeleteResult> {
  const path = sessionPath(id);
  const result = await withRetry(async (): Promise<DeleteResult> => {
    const head = await repo.head();
    const file = await repo.read(path, head.commit);
    // İz eski içeriğe bakmaz: şemaya uymayan dosya da silinebilir (bozuk kayıt antrenmanı kilitlemesin).
    const stored = file ? parseStoredSession(file.content) : null;
    if (stored?.status === 'deleted') return { status: 'already' };
    const { index } = await repairedIndexAt(repo, head, new Map(file ? [[path, file.content]] : []));
    await repo.commit({
      head,
      files: [
        { path, content: tombstoneOf(id, ctx.now) },
        { path: SESSIONS_INDEX_PATH, content: removeIndexRow(index, id, ctx.now) },
      ],
      message: DELETE_MESSAGE,
    });
    return { status: 'deleted' };
  });
  repo.invalidate(id);
  return result;
}
