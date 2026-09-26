import * as v from 'valibot';
import { isDemoSessionId, isDemoTapId, type DemoHistory, type DemoSummary } from './demo-history.ts';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { GithubError } from './github/errors.ts';
import type { Client } from './schemas/client.ts';
import { healthRecordSchema, type HealthRecord } from './schemas/health.ts';
import { parseSessionIndex, SESSIONS_INDEX_PATH, sessionIdOfPath, sessionPath, type SessionIndex } from './schemas/session.ts';
import { indexRowOf, repairIndex, upsertIndexRow } from './session-index.ts';
import type { SessionRepo, StoredJson } from './session-files-core.ts';
import { mergeWaterTaps, parseWaterFile, WATER_PATH, type WaterFile } from './water.ts';

/**
 * Deneme geçmişini danışanın repo'suna yazmak — YALNIZ geliştirme (SPEC §13); saf çekirdek, GitHub işleri
 * dışarıdan (`SessionRepo`: uçta `sessionRepo`, testte sahte depo). Geçmişin kendisi `demo-history.ts`'te.
 *
 * - Kapı (`demoSeedGate`): üretimde uç yok (404, `/api/dev/login` gibi), PT oturumu şart, ve yalnız adı
 *   "Test " ile başlayan danışan: gerçek bir danışanın repo'suna hiçbir koşulda deneme verisi yazılmaz.
 * - Tek commit (`commitFiles`, Git Data API): antrenman dosyaları + `sessions-index.json` + `water.json` +
 *   (hazır oluşluk ya da ağrı takibi onaylıysa) `health.json`; önceki tohumlamadan kalıp artık üretilmeyen
 *   deneme antrenmanları aynı commit'te silinir. Dal arada ilerlediyse bir kez baştan.
 * - Yeniden tohumlama yalnız deneme kayıtlarını değiştirir (seans `s_demo…`, su `wt_demo…`, yoklamanın
 *   `sessionId`'si `s_demo…`): danışanın kendi antrenmanları, suyu ve yoklamaları olduğu gibi kalır. Index
 *   deneme satırları çıkarılıp (silinmişler listesinden de) kalan dosyalarla onarılır, yenileri eklenir.
 *   Hiçbir dosya değişmiyorsa commit yok (aynı gün, aynı tohum).
 * - Bozuk `water.json` ya da `health.json` ezilmez: o dosya atlanır, sonuçta söylenir. Onay yoksa
 *   `health.json` okunmaz bile.
 * - Commit mesajı genel: değer, tarih ya da sağlık bilgisi taşımaz.
 */

export const HEALTH_PATH = 'health.json';
/** Kapının istediği ad öneki: gerçek danışan (ör. "Gizem gonca") bu önekle başlamaz. */
export const DEMO_CLIENT_PREFIX = 'Test ';

export function isDemoClientName(name: string): boolean {
  return name.startsWith(DEMO_CLIENT_PREFIX);
}

export type GateResult = { ok: true } | { ok: false; status: 403 | 404; error: string };

/**
 * Ucun kapısı: sıra önemli — üretimde (oturum ne olursa olsun) 404; oturum yoksa 403; danışan yoksa 404;
 * adı "Test " ile başlamıyorsa 403. `client` yalnız kayıt okunduktan sonra verilir (öncesinde `undefined`).
 */
export function demoSeedGate(input: {
  production: boolean;
  pt: boolean;
  client?: Pick<Client, 'name'> | null | undefined;
}): GateResult {
  if (input.production) return { ok: false, status: 404, error: 'Bulunamadı.' };
  if (!input.pt) return { ok: false, status: 403, error: 'Bu araç için PT oturumu gerekli (/api/dev/login).' };
  if (input.client === undefined) return { ok: true };
  if (input.client === null) return { ok: false, status: 404, error: 'Danışan bulunamadı.' };
  if (!isDemoClientName(input.client.name)) {
    return { ok: false, status: 403, error: `Deneme geçmişi yalnız adı "${DEMO_CLIENT_PREFIX}" ile başlayan danışana yazılır.` };
  }
  return { ok: true };
}

/** Onay kutusu ("on") ya da JSON'da `true`; başka her değer kapalı. */
const flag = v.pipe(
  v.unknown(),
  v.transform((value) => value === true || value === 'on' || value === 'true' || value === '1'),
  v.boolean(),
);

export const seedRequestSchema = v.object({
  clientId: v.pipe(v.string(), v.regex(/^c_[a-z0-9]{6,24}$/, 'Danışan kimliği geçersiz.')),
  weeks: v.optional(v.pipe(v.unknown(), v.transform(Number), v.number(), v.integer(), v.minValue(1), v.maxValue(52))),
  seed: v.optional(v.pipe(v.unknown(), v.transform(String), v.string(), v.maxLength(40))),
  /** Gerileme senaryosu (`demo-history.ts`); verilmezse kapalı. */
  declining: v.optional(flag),
});
export type SeedRequest = v.InferOutput<typeof seedRequestSchema>;

/** İstek gövdesi (JSON ya da form alanları): boş alanlar verilmemiş sayılır. */
export function parseSeedRequest(input: Record<string, unknown>): SeedRequest | null {
  const cleaned = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const parsed = v.safeParse(seedRequestSchema, cleaned);
  return parsed.success ? parsed.output : null;
}

/* --- plan --- */

export type SeedState = {
  /** Deneme satırları çıkarılmış, kalan dosyalarla onarılmış index. */
  index: SessionIndex;
  /** Depodaki `sessions-index.json`'un blob kimliği; yoksa null. */
  indexSha: string | null;
  /** `sessions/` ağacı. */
  sessionFiles: readonly { path: string; sha: string }[];
  water: { file: WaterFile; sha: string } | null | 'broken';
  /** `skipped`: onay yok, dosya okunmadı. */
  health: { record: HealthRecord; sha: string } | null | 'broken' | 'skipped';
};

export type SeedPlan = {
  files: { path: string; content: unknown }[];
  deletions: string[];
  changed: boolean;
  water: 'written' | 'unchanged' | 'broken';
  health: 'written' | 'unchanged' | 'broken' | 'no_consent';
};

const shaOf = (content: unknown) => gitBlobSha(jsonText(content));

/** Deneme kayıtlarını yenileriyle değiştiren dosyalar ve silinecek eski deneme antrenmanları. */
export function planDemoSeed(history: DemoHistory, state: SeedState): SeedPlan {
  const files: SeedPlan['files'] = [];
  const known = new Map(state.sessionFiles.map((file) => [file.path, file.sha]));
  const ids = new Set(history.sessions.map((doc) => doc.id));

  let index: SessionIndex = {
    version: 1,
    items: state.index.items.filter((row) => !isDemoSessionId(row.id)),
    deleted: state.index.deleted.filter((row) => !isDemoSessionId(row.id)),
  };
  for (const doc of history.sessions) {
    const sha = shaOf(doc);
    if (known.get(sessionPath(doc.id)) !== sha) files.push({ path: sessionPath(doc.id), content: doc });
    index = upsertIndexRow(index, indexRowOf(doc, sha));
  }
  const deletions = state.sessionFiles.flatMap((file) => {
    const id = sessionIdOfPath(file.path);
    return id && isDemoSessionId(id) && !ids.has(id) ? [file.path] : [];
  });
  if (shaOf(index) !== state.indexSha) files.push({ path: SESSIONS_INDEX_PATH, content: index });

  let water: SeedPlan['water'] = 'unchanged';
  if (state.water === 'broken') water = 'broken';
  else {
    const kept: WaterFile = { version: 1, taps: (state.water?.file.taps ?? []).filter((tap) => !isDemoTapId(tap.id)) };
    const next = mergeWaterTaps(kept, history.waterTaps).file;
    const empty = !state.water && next.taps.length === 0;
    if (!empty && shaOf(next) !== state.water?.sha) {
      files.push({ path: WATER_PATH, content: next });
      water = 'written';
    }
  }

  let health: SeedPlan['health'] = 'unchanged';
  if (state.health === 'skipped') health = 'no_consent';
  else if (state.health === 'broken') health = 'broken';
  else {
    const record = state.health?.record ?? { conditions: [], checkIns: [], measurements: [], movementScreens: [] };
    const next: HealthRecord = {
      ...record,
      checkIns: [...record.checkIns.filter((item) => !(item.sessionId && isDemoSessionId(item.sessionId))), ...history.checkIns],
    };
    const empty = !state.health && next.checkIns.length === 0;
    if (!empty && shaOf(next) !== state.health?.sha) {
      files.push({ path: HEALTH_PATH, content: next });
      health = 'written';
    }
  }

  return { files, deletions, changed: files.length > 0 || deletions.length > 0, water, health };
}

/* --- akış --- */

export type SeedResult = {
  status: 'seeded' | 'unchanged';
  commit: string | null;
  /** Yazılan (yeni ya da değişen) antrenman dosyası. */
  written: number;
  /** Silinen eski deneme antrenmanı. */
  removed: number;
  water: SeedPlan['water'];
  health: SeedPlan['health'];
  summary: DemoSummary;
};

function isConflict(error: unknown): boolean {
  return error instanceof GithubError && error.status === 409;
}

/** Dosya; yoksa null, bozuk JSON'sa 'broken' (ağ ve yetki hataları yukarı çıkar). */
async function readOrBroken(repo: SessionRepo, path: string, ref: string): Promise<StoredJson | null | 'broken'> {
  try {
    return await repo.read(path, ref);
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return 'broken';
    throw error;
  }
}

export const SEED_MESSAGE = 'Deneme geçmişi (yalnız geliştirme)';

/**
 * Dalın ucundaki durumu okur, planı kurar, tek commit'le yazar; arada dal ilerlediyse bir kez baştan.
 * `health`: hazır oluşluk ya da ağrı takibi onaylı mı (değilse `health.json` okunmaz, yazılmaz).
 */
export async function seedDemoHistory(repo: SessionRepo, history: DemoHistory, options: { health: boolean }): Promise<SeedResult> {
  for (let attempt = 0; ; attempt += 1) {
    const head = await repo.head();
    const [indexFile, sessionFiles, waterFile, healthFile] = await Promise.all([
      readOrBroken(repo, SESSIONS_INDEX_PATH, head.commit),
      repo.listSessions(head.tree),
      readOrBroken(repo, WATER_PATH, head.commit),
      options.health ? readOrBroken(repo, HEALTH_PATH, head.commit) : Promise.resolve('skipped' as const),
    ]);

    // Index türetilmiş: deneme satırları çıkar, kalanı danışanın kendi dosyalarıyla onarılır.
    const stored = parseSessionIndex(indexFile && indexFile !== 'broken' ? indexFile.content : null).index;
    const base: SessionIndex = {
      version: 1,
      items: stored.items.filter((row) => !isDemoSessionId(row.id)),
      deleted: stored.deleted.filter((row) => !isDemoSessionId(row.id)),
    };
    const own = sessionFiles.filter((file) => {
      const id = sessionIdOfPath(file.path);
      return !id || !isDemoSessionId(id);
    });
    const repaired = await repairIndex(base, own, (file) => repo.readBlob(file.sha));

    let health: SeedState['health'] = 'skipped';
    if (healthFile !== 'skipped') {
      if (healthFile === 'broken') health = 'broken';
      else if (healthFile) {
        const parsed = v.safeParse(healthRecordSchema, healthFile.content);
        health = parsed.success ? { record: parsed.output, sha: healthFile.sha } : 'broken';
      } else health = null;
    }
    const water: SeedState['water'] =
      waterFile === 'broken' ? 'broken' : waterFile ? { file: parseWaterFile(waterFile.content).file, sha: waterFile.sha } : null;

    const plan = planDemoSeed(history, {
      index: repaired.index,
      indexSha: indexFile && indexFile !== 'broken' ? indexFile.sha : null,
      sessionFiles,
      water,
      health,
    });
    const result = {
      written: plan.files.filter((file) => sessionIdOfPath(file.path)).length,
      removed: plan.deletions.length,
      water: plan.water,
      health: plan.health,
      summary: history.summary,
    };
    if (!plan.changed) return { status: 'unchanged', commit: null, ...result };
    try {
      const written = await repo.commit({ head, files: plan.files, deletions: plan.deletions, message: `${SEED_MESSAGE} · ${history.sessions.length} antrenman` });
      // Silinen antrenmanların önbellekteki özetleri de düşsün (`session:<id>`).
      for (const path of plan.deletions) {
        const id = sessionIdOfPath(path);
        if (id) repo.invalidate(id);
      }
      return { status: 'seeded', commit: written.commit, ...result };
    } catch (error) {
      if (attempt === 0 && isConflict(error)) continue;
      throw error;
    }
  }
}
