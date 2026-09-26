import 'server-only';
import { cache } from 'react';
import { revalidateTag, unstable_cache } from 'next/cache';
import { newClientId } from './client-access';
import { readClient, writeClient } from './client-record';
import { nextHealthModule } from './client-status';
import * as core from './clients-core';
import { CLIENT_INDEX_PATH, type ClientStore } from './clients-core';
import { serverEnv } from './env';
import { appRepo, clientRepoName, GithubError } from './github/client';
import { writeToFreshRepo } from './github/errors';
import { deleteFile, readJson, writeJson } from './github/files';
import { clientRepoExists, createClientRepo, deleteClientRepo } from './github/repos';
import { dropNotices } from './notices-store';
import { commitMessage } from './program-diff';
import type { ProgramState } from './program-plan';
import { writeProgramFile } from './programs';
import { trainingOf, type Client, type ClientIndexEntry, type ClientInput, type ClientStatus, type HealthField, type Invite } from './schemas/client';

/**
 * Danışanlar (SPEC §3, §5) — GitHub'a ve Next'e bağlama. Akışlar (düzenleme, davet, erişim, onay)
 * `clients-core.ts`'te, orada test edilir.
 *
 * Her danışan kendi özel repo'sunda: `client.json` kaydın kendisi (`client-record.ts`), `invite.json`
 * davetin özeti, `auth.json` şifrenin özeti ve deneme sayacı (yalnız burada; uygulama repo'suna hiç
 * yazılmaz), `program.json` danışana özel program (`src/lib/programs.ts`). Uygulama
 * repo'sundaki `data/clients.json` yalnız kimlik ve durum tutar; liste
 * önce oradan, sonra her danışanın kendi repo'sundan okunur (30 danışan → 30 istek).
 */

export { CLIENT_INDEX_PATH, readClient };

const INVITE_PATH = 'invite.json';
const AUTH_PATH = 'auth.json';
const CLIENT_INDEX_TAG = 'client-index';

/** Danışanın şifreyle giriş özetinin önbellek etiketi: kaydı ya da `auth.json`'u her yazıldığında düşer. */
const loginTag = (id: string) => `auth-${id}`;
const dropLoginGate = (id: string) => revalidateTag(loginTag(id), { expire: 0 });

/**
 * Şifreyle girişin ön kararı için özet, Next'in veri önbelleğinde (sunucu örnekleri arasında ortak):
 * kilitli, kapalı, arşivde ya da şifresiz hesaba gelen istekler GitHub'a gitmez. Her yazmada düşer;
 * 60 sn üst sınır, dosya elle değiştirilirse diye. Özette şifrenin özeti yok (`loginGateOf`).
 */
function readLoginGate(id: string) {
  return unstable_cache(
    async () => {
      const [client, auth] = await Promise.all([readClient(id), readJson<unknown>(clientRepoName(id), AUTH_PATH)]);
      return core.loginGateOf(client?.client ?? null, auth);
    },
    ['client-login-gate', id],
    { tags: [loginTag(id)], revalidate: 60 },
  )();
}

function store(): ClientStore {
  return {
    secret: serverEnv().authSecret,
    now: () => new Date(),
    readClient,
    writeClient: async (client, sha, message) => {
      await writeClient(client, sha, message);
      dropLoginGate(client.id);
      // Bildirim özetinde ad ve okundu bilgisi var (Genel bakış).
      dropNotices(client.id);
    },
    readInvite: (id) => readJson<unknown>(clientRepoName(id), INVITE_PATH),
    writeInvite: (id, invite, sha, message) => writeJson(clientRepoName(id), INVITE_PATH, invite, { sha, message }),
    deleteInvite: (id, sha, message) => deleteFile(clientRepoName(id), INVITE_PATH, { sha, message }),
    readAuth: (id) => readJson<unknown>(clientRepoName(id), AUTH_PATH),
    writeAuth: async (id, auth, sha, message) => {
      const written = await writeJson(clientRepoName(id), AUTH_PATH, auth, { sha, message });
      dropLoginGate(id);
      return written;
    },
    deleteAuth: async (id, sha, message) => {
      await deleteFile(clientRepoName(id), AUTH_PATH, { sha, message });
      dropLoginGate(id);
    },
    readLoginGate,
    readIndex: () => readJson<unknown>(appRepo(), CLIENT_INDEX_PATH),
    writeIndex: async (items, sha, message) => {
      await writeJson(appRepo(), CLIENT_INDEX_PATH, items, { sha, message });
    },
    invalidateIndex: () => revalidateTag(CLIENT_INDEX_TAG, { expire: 0 }),
    deleteRepo: async (id) => {
      await deleteClientRepo(id);
      dropLoginGate(id);
    },
    log: (message) => console.error(message),
  };
}

/* --- uygulama repo'sundaki kimlik listesi --- */

/**
 * Listedeki kimlikler, önbellekli. Herkese açık giriş ucu bilinmeyen kimlikleri GitHub'a
 * gitmeden reddeder: rastgele kimlikle gelen istekler saatlik istek sınırını tüketemez.
 * Liste her yazıldığında önbellek düşer.
 */
const knownIds = unstable_cache(async () => (await core.readIndex(store())).items.map((item) => item.id), ['client-index'], {
  tags: [CLIENT_INDEX_TAG],
  revalidate: 300,
});

export async function isKnownClient(id: string): Promise<boolean> {
  return (await knownIds()).includes(id);
}

/** Listedeki kimlikler ve durumları, önbellekli (Genel bakış'ın bildirimleri; liste her yazıldığında düşer). */
export const cachedClientIndex: () => Promise<ClientIndexEntry[]> = unstable_cache(async () => (await core.readIndex(store())).items, ['client-index-items'], {
  tags: [CLIENT_INDEX_TAG],
  revalidate: 300,
});

/* --- danışanın kendi repo'su --- */

/**
 * PT ekranları için (istek başına bir kez okunur: danışan çatısı ve sayfa aynı kaydı paylaşır):
 * kayıt, ya da listede olup okunamayan danışanın sorunu (repo dışarıdan
 * silinmiş, kayıt bozuk). İkincisinde sayfa 404 vermez; PT kimliği yazarak listeden siler.
 * Listede de yoksa null (gerçekten yok).
 */
export const loadClient = cache(async function loadClient(
  id: string,
): Promise<{ ok: true; client: Client } | { ok: false; problem: string } | null> {
  let problem = "Danışanın repo'su ya da kaydı bulunamadı.";
  try {
    const stored = await readClient(id);
    if (stored) return { ok: true, client: stored.client };
  } catch (error) {
    if (!(error instanceof GithubError && error.status === 500)) throw error;
    problem = error.message;
  }
  return (await isKnownClient(id)) ? { ok: false, problem } : null;
});

export async function readInvite(id: string): Promise<{ invite: Invite; sha: string } | null> {
  return core.parseInvite(await readJson<unknown>(clientRepoName(id), INVITE_PATH));
}

export type ClientSummary =
  | { id: string; status: ClientStatus; ok: true; client: Client }
  /** Kimlik listede ama repo'su okunamadı (silinmiş ya da bozuk). */
  | { id: string; status: ClientStatus; ok: false; problem: string };

export async function listClients(): Promise<ClientSummary[]> {
  const { items } = await core.readIndex(store());
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

/**
 * Yeni danışan: özel repo açılır, kayıt yazılır; başlangıç şablonu seçildiyse program da
 * aynı adımda yazılır. Herhangi biri yazılamazsa repo silinir — ya hepsi ya hiçbiri.
 */
export async function createClient(input: ClientInput, options: { program?: ProgramState } = {}): Promise<string> {
  let id = newClientId();
  // 36⁸ uzayında çakışma pratikte olmaz; yine de var olan bir repo'nun üzerine gidilmez.
  if (await clientRepoExists(id)) id = newClientId();

  await createClientRepo(id);
  const now = new Date().toISOString();
  const client: Client = {
    id,
    name: input.name,
    ...(input.note ? { note: input.note } : {}),
    ...trainingOf(input),
    createdAt: now,
    status: 'active',
    modules: { health: nextHealthModule(null, { enabled: input.healthEnabled, fields: input.healthFields }, now) },
    consents: {},
    access: { version: 1 },
    visibleTo: [],
  };

  try {
    // Repo yeni açıldı: içerik ucu kısa bir süre 404/409 verebilir, ilk yazma birkaç kez denenir.
    await writeToFreshRepo(() => writeClient(client, undefined, 'Danışan kaydı oluşturuldu'));
    if (options.program) {
      await writeProgramFile(id, options.program, { message: commitMessage('create', options.program.log[0]?.changes ?? []) });
    }
    // Listeye YALNIZ kimlik ve durum girer (SPEC §3).
    await core.updateIndex(store(), (items) => [...items.filter((item) => item.id !== id), { id, status: 'active' }], 'Danışan eklendi');
  } catch (error) {
    // Yarım kalan kayıt öksüz repo bırakmasın: repo'da henüz yalnız bu kayıt (ve program) var.
    await deleteClientRepo(id).catch(() => undefined);
    throw error;
  }
  return id;
}

/** PT'nin düzenlemesi (ad, not, durum, sağlık modülü); bkz. `clients-core.ts`. */
export async function updateClient(id: string, input: ClientInput): Promise<void> {
  await core.updateClient(store(), id, input);
}

/** Danışanı ve bütün verisini kalıcı siler (repo dahil). */
export async function deleteClient(id: string): Promise<void> {
  await core.deleteClient(store(), id);
}

/* --- davet ve erişim --- */

/** Yeni davet kodu; eskisi anında geçersiz olur. Kod yalnız bu yanıtta var. */
export async function issueInvite(id: string): Promise<{ code: string; expiresAt: string }> {
  return core.issueInvite(store(), id);
}

/** Daveti kullanır (deneme sayılır, sonra karşılaştırılır); bkz. `clients-core.ts`. */
export async function redeemInvite(id: string, code: string): ReturnType<typeof core.redeemInvite> {
  return core.redeemInvite(store(), id, code);
}

/** Açık bütün oturumları düşürür, bekleyen daveti iptal eder, şifreyi geçersiz kılar. */
export async function revokeAccess(id: string): Promise<void> {
  await core.revokeAccess(store(), id);
}

/* --- şifre (ilk giriş kare kodla, sonrakiler şifreyle) --- */

/** Oturumdaki danışanın şifresini belirler; bkz. `clients-core.ts`. Şifre hiçbir yere düz yazılmaz. */
export async function setClientPassword(
  session: { clientId: string; accessVersion: number; joinedAt?: string | undefined },
  password: string,
): ReturnType<typeof core.setClientPassword> {
  return core.setClientPassword(store(), session, password);
}

/** Şifreyle giriş (deneme sayılır, sonra karşılaştırılır); bkz. `clients-core.ts`. */
export async function loginWithPassword(id: string, password: string): ReturnType<typeof core.loginWithPassword> {
  return core.loginWithPassword(store(), id, password);
}

/** PT bildirimleri okudu: `inbox.seenAt` (Genel bakış, "Tümünü okundu say"). Kayıt yoksa false. */
export async function markNoticesSeen(id: string, at: Date): Promise<boolean> {
  return core.markNoticesSeen(store(), id, at);
}

/** Danışanın sağlık onayı ya da onayı geri çekmesi. */
export async function setHealthConsent(
  id: string,
  decision: { granted: boolean; fields: HealthField[]; version: string },
): Promise<Client> {
  return core.setHealthConsent(store(), id, decision);
}
