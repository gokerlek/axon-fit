import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import * as v from 'valibot';
import { checkInvite, newClientId, newInvite, type InviteCheck } from './client-access';
import { INVITE_MAX_ATTEMPTS, inviteStatus } from './client-status';
import { serverEnv } from './env';
import { appRepo, clientRepoName, GithubError } from './github/client';
import { deleteFile, readJson, writeJson } from './github/files';
import { clientRepoExists, createClientRepo, deleteClientRepo } from './github/repos';
import { commitMessage } from './program-diff';
import type { ProgramState } from './program-plan';
import { writeProgramFile } from './programs';
import {
  clientIndexSchema,
  clientSchema,
  HEALTH_CONSENT_VERSION,
  inviteSchema,
  type Client,
  type ClientIndexEntry,
  type ClientInput,
  type ClientStatus,
  type HealthField,
  type Invite,
} from './schemas/client';

/**
 * Danışanlar (SPEC §3, §5).
 *
 * Her danışan kendi özel repo'sunda: `client.json` kaydın kendisi, `invite.json` davetin
 * özeti, `program.json` danışana özel program (`src/lib/programs.ts`). Uygulama
 * repo'sundaki `data/clients.json` yalnız kimlik ve durum tutar; liste
 * önce oradan, sonra her danışanın kendi repo'sundan okunur (30 danışan → 30 istek).
 */

export const CLIENT_INDEX_PATH = 'data/clients.json';
const CLIENT_PATH = 'client.json';
const INVITE_PATH = 'invite.json';

/* --- uygulama repo'sundaki kimlik listesi --- */

async function readIndex(): Promise<{ items: ClientIndexEntry[]; sha: string | null }> {
  const stored = await readJson<unknown>(appRepo(), CLIENT_INDEX_PATH);
  if (!stored) return { items: [], sha: null };
  const parsed = v.safeParse(clientIndexSchema, stored.content);
  if (!parsed.success) throw new GithubError(`${CLIENT_INDEX_PATH} beklenen biçimde değil.`, 500);
  return { items: parsed.output, sha: stored.sha };
}

/**
 * Listedeki kimlikler, önbellekli. Herkese açık giriş ucu bilinmeyen kimlikleri GitHub'a
 * gitmeden reddeder: rastgele kimlikle gelen istekler saatlik istek sınırını tüketemez.
 * Liste her yazıldığında önbellek düşer.
 */
const CLIENT_INDEX_TAG = 'client-index';
const knownIds = unstable_cache(async () => (await readIndex()).items.map((item) => item.id), ['client-index'], {
  tags: [CLIENT_INDEX_TAG],
  revalidate: 300,
});

export async function isKnownClient(id: string): Promise<boolean> {
  return (await knownIds()).includes(id);
}

/**
 * Listeyi günceller. Aynı dosyaya iki yazma çakışırsa (409) taze okuyup bir kez
 * yeniden dener: değişiklik kimlik bazında olduğu için yeniden uygulamak güvenli.
 */
async function updateIndex(change: (items: ClientIndexEntry[]) => ClientIndexEntry[], message: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const { items, sha } = await readIndex();
    try {
      await writeJson(appRepo(), CLIENT_INDEX_PATH, change(items), { sha: sha ?? undefined, message });
      revalidateTag(CLIENT_INDEX_TAG, { expire: 0 });
      return;
    } catch (error) {
      if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
      throw error;
    }
  }
}

/* --- danışanın kendi repo'su --- */

export async function readClient(id: string): Promise<{ client: Client; sha: string } | null> {
  const stored = await readJson<unknown>(clientRepoName(id), CLIENT_PATH);
  if (!stored) return null;
  const parsed = v.safeParse(clientSchema, stored.content);
  if (!parsed.success) throw new GithubError(`${id}: danışan kaydı beklenen biçimde değil.`, 500);
  return { client: parsed.output, sha: stored.sha };
}

async function writeClient(client: Client, sha: string | undefined, message: string): Promise<void> {
  await writeJson(clientRepoName(client.id), CLIENT_PATH, client, { sha, message });
}

/**
 * PT ekranları için: kayıt, ya da listede olup okunamayan danışanın sorunu (repo dışarıdan
 * silinmiş, kayıt bozuk). İkincisinde sayfa 404 vermez; PT kimliği yazarak listeden siler.
 * Listede de yoksa null (gerçekten yok).
 */
export async function loadClient(id: string): Promise<{ ok: true; client: Client } | { ok: false; problem: string } | null> {
  let problem = "Danışanın repo'su ya da kaydı bulunamadı.";
  try {
    const stored = await readClient(id);
    if (stored) return { ok: true, client: stored.client };
  } catch (error) {
    if (!(error instanceof GithubError && error.status === 500)) throw error;
    problem = error.message;
  }
  return (await isKnownClient(id)) ? { ok: false, problem } : null;
}

export async function readInvite(id: string): Promise<{ invite: Invite; sha: string } | null> {
  const stored = await readJson<unknown>(clientRepoName(id), INVITE_PATH);
  if (!stored) return null;
  const parsed = v.safeParse(inviteSchema, stored.content);
  // Bozuk davet açılmaz ama listeyi de düşürmez: PT yenisini üretir.
  return parsed.success ? { invite: parsed.output, sha: stored.sha } : null;
}

export type ClientSummary =
  | { id: string; status: ClientStatus; ok: true; client: Client }
  /** Kimlik listede ama repo'su okunamadı (silinmiş ya da bozuk). */
  | { id: string; status: ClientStatus; ok: false; problem: string };

export async function listClients(): Promise<ClientSummary[]> {
  const { items } = await readIndex();
  const summaries = await Promise.all(
    items.map(async (entry): Promise<ClientSummary> => {
      try {
        const stored = await readClient(entry.id);
        if (stored) return { ...entry, ok: true, client: stored.client };
        return { ...entry, ok: false, problem: 'Danışan kaydı bulunamadı.' };
      } catch (error) {
        return { ...entry, ok: false, problem: error instanceof GithubError ? error.message : 'Kayıt okunamadı.' };
      }
    }),
  );
  return summaries.sort((a, b) =>
    a.ok && b.ok ? a.client.name.localeCompare(b.client.name, 'tr') : Number(b.ok) - Number(a.ok),
  );
}

/* --- oluşturma, güncelleme, silme --- */

/** Kayda giren alanlar: başlangıç şablonu kayda değil, programa gider. */
type ClientFields = ClientInput;

function healthModule(input: ClientFields, previous: Client['modules']['health'] | null, now: string) {
  if (!input.healthEnabled) return { enabled: false, fields: [] };
  return {
    enabled: true,
    fields: [...new Set(input.healthFields)],
    enabledAt: previous?.enabled ? (previous.enabledAt ?? now) : now,
  };
}

/** Repo yeni açıldığında içerik ucu kısa bir süre 404/409 verebilir: birkaç kez dener. */
async function writeFreshRepo(client: Client): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeClient(client, undefined, 'Danışan kaydı oluşturuldu');
      return;
    } catch (error) {
      const retryable = error instanceof GithubError && (error.status === 404 || error.status === 409);
      if (!retryable || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
}

/**
 * Yeni danışan: özel repo açılır, kayıt yazılır; başlangıç şablonu seçildiyse program da
 * aynı adımda yazılır. Herhangi biri yazılamazsa repo silinir — ya hepsi ya hiçbiri.
 */
export async function createClient(input: ClientFields, options: { program?: ProgramState } = {}): Promise<string> {
  let id = newClientId();
  // 36⁸ uzayında çakışma pratikte olmaz; yine de var olan bir repo'nun üzerine gidilmez.
  if (await clientRepoExists(id)) id = newClientId();

  await createClientRepo(id);
  const now = new Date().toISOString();
  const client: Client = {
    id,
    name: input.name,
    ...(input.note ? { note: input.note } : {}),
    createdAt: now,
    status: 'active',
    modules: { health: healthModule(input, null, now) },
    consents: {},
    access: { version: 1 },
    visibleTo: [],
  };

  try {
    await writeFreshRepo(client);
    if (options.program) {
      await writeProgramFile(id, options.program, { message: commitMessage('create', options.program.log[0]?.changes ?? []) });
    }
    // Listeye YALNIZ kimlik ve durum girer (SPEC §3).
    await updateIndex((items) => [...items.filter((item) => item.id !== id), { id, status: 'active' }], 'Danışan eklendi');
  } catch (error) {
    // Yarım kalan kayıt öksüz repo bırakmasın: repo'da henüz yalnız bu kayıt (ve program) var.
    await deleteClientRepo(id).catch(() => undefined);
    throw error;
  }
  return id;
}

export async function updateClient(id: string, input: ClientFields): Promise<void> {
  const stored = await readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  const { client, sha } = stored;
  const now = new Date().toISOString();
  const { note: _note, ...rest } = client;
  const next: Client = {
    ...rest,
    name: input.name,
    ...(input.note ? { note: input.note } : {}),
    status: input.status,
    modules: { ...client.modules, health: healthModule(input, client.modules.health, now) },
  };
  await writeClient(next, sha, 'Danışan güncellendi');
  if (next.status !== client.status) {
    await updateIndex(
      (items) => items.map((item) => (item.id === id ? { ...item, status: next.status } : item)),
      'Danışan durumu değişti',
    );
  }
}

/**
 * Danışanı ve bütün verisini kalıcı siler: repo gider (GitHub 90 gün geri alınabilir tutar),
 * listeden kimlik satırı çıkar. Repo zaten yoksa yalnız satır temizlenir.
 */
export async function deleteClient(id: string): Promise<void> {
  try {
    await deleteClientRepo(id);
  } catch (error) {
    if (!(error instanceof GithubError && error.status === 404)) throw error;
  }
  await updateIndex((items) => items.filter((item) => item.id !== id), 'Danışan silindi');
}

/* --- davet ve erişim --- */

/** Yeni davet: eskisinin üzerine yazar, yani eski kod anında geçersiz olur. Kod yalnız bu yanıtta var. */
export async function issueInvite(id: string): Promise<{ code: string; expiresAt: string }> {
  const stored = await readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  if (stored.client.status === 'archived') throw new GithubError('Arşivdeki danışana davet üretilemez.', 409);

  const { invite, code } = newInvite(serverEnv().authSecret, id, new Date());
  const current = await readJson<unknown>(clientRepoName(id), INVITE_PATH);
  await writeJson(clientRepoName(id), INVITE_PATH, invite, { sha: current?.sha, message: 'Yeni davet kodu' });
  return { code, expiresAt: invite.expiresAt };
}

/**
 * Daveti kullanır. Deneme, kod karşılaştırılmadan ÖNCE `sha` kilidiyle sayılır: aynı anda
 * gelen tahminlerden yalnız sayacı yazabilen karşılaştırılır, yazamayan hiç denenmez (hata
 * yukarı çıkar, "biraz sonra tekrar dene"). GitHub istek sınırında da sayaç yazılamadığı
 * için tahmin bedava olmaz. Doğru kodda davet aynı kilitle `used: true` olur — aynı kod iki
 * cihazdan denense de yalnız biri oturum açar.
 */
export async function redeemInvite(
  id: string,
  code: string,
): Promise<{ ok: true; client: Client } | { ok: false; reason: Exclude<InviteCheck, { ok: true }>['reason'] | 'archived' }> {
  const repo = clientRepoName(id);
  const stored = await readInvite(id);
  const now = new Date();
  const status = inviteStatus(stored?.invite ?? null, now);
  if (!stored || status !== 'pending') return { ok: false, reason: stored && status !== 'pending' ? status : 'none' };

  const attempts = stored.invite.attempts + 1;
  const counted = { ...stored.invite, attempts };
  const reserved = await writeJson(repo, INVITE_PATH, counted, { sha: stored.sha, message: 'Davet kodu denendi' });

  const check = checkInvite(stored.invite, { secret: serverEnv().authSecret, clientId: id, code, now });
  if (!check.ok) return attempts >= INVITE_MAX_ATTEMPTS ? { ok: false, reason: 'locked' } : check;

  const record = await readClient(id);
  if (!record) return { ok: false, reason: 'none' };
  if (record.client.status === 'archived') return { ok: false, reason: 'archived' };

  try {
    await writeJson(repo, INVITE_PATH, { ...counted, used: true, usedAt: now.toISOString() }, {
      sha: reserved.sha,
      message: 'Davet kullanıldı',
    });
  } catch (error) {
    // Başka bir cihaz aynı anda kullandı.
    if (error instanceof GithubError && error.status === 409) return { ok: false, reason: 'used' };
    throw error;
  }

  // Katılım kayda yazılır: davet dosyası bir sonraki kodda ezilir. Yazılamazsa giriş yine
  // geçerli (oturum kuşağı değişmedi); yalnız PT ekranındaki tarih eksik kalır.
  const { revokedAt: _revoked, ...access } = record.client.access;
  const joined: Client = {
    ...record.client,
    access: { ...access, joinedAt: access.joinedAt ?? now.toISOString(), lastJoinAt: now.toISOString() },
  };
  await writeClient(joined, record.sha, 'Danışan giriş yaptı').catch(() => undefined);
  return { ok: true, client: joined };
}

/** Açık bütün oturumları düşürür ve bekleyen daveti iptal eder. */
export async function revokeAccess(id: string): Promise<void> {
  const stored = await readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  const { client, sha } = stored;
  await writeClient(
    { ...client, access: { ...client.access, version: client.access.version + 1, revokedAt: new Date().toISOString() } },
    sha,
    'Danışanın erişimi kapatıldı',
  );
  const invite = await readJson<unknown>(clientRepoName(id), INVITE_PATH);
  if (invite) await deleteFile(clientRepoName(id), INVITE_PATH, { sha: invite.sha, message: 'Davet iptal edildi' });
}

/**
 * Danışanın sağlık onayı ya da onayı geri çekmesi. Onay, danışanın EKRANDA GÖRDÜĞÜ
 * parçaları ve metin sürümünü taşır; PT bu arada listeyi değiştirdiyse onay reddedilir
 * (409) ve danışan güncel listeyi görüp yeniden karar verir. Görmediği bir parçaya
 * onay yazılmaz.
 */
export async function setHealthConsent(
  id: string,
  decision: { granted: boolean; fields: HealthField[]; version: string },
): Promise<Client> {
  const stored = await readClient(id);
  if (!stored) throw new GithubError('Danışan bulunamadı.', 404);
  const { client, sha } = stored;
  const module = client.modules.health;
  if (!module.enabled) throw new GithubError('Sağlık modülü kapalı.', 409);
  if (decision.granted) {
    const shown = new Set(decision.fields);
    const same = shown.size === module.fields.length && module.fields.every((field) => shown.has(field));
    if (!same || decision.version !== HEALTH_CONSENT_VERSION) {
      throw new GithubError('Antrenörün sorulan bilgileri değiştirdi. Sayfayı yenileyip yeniden bak.', 409);
    }
  }
  const next: Client = {
    ...client,
    consents: {
      ...client.consents,
      health: {
        granted: decision.granted,
        version: HEALTH_CONSENT_VERSION,
        fields: decision.granted ? module.fields : [],
        at: new Date().toISOString(),
      },
    },
  };
  await writeClient(next, sha, decision.granted ? 'Sağlık verisi onayı verildi' : 'Sağlık verisi onayı geri çekildi');
  return next;
}
