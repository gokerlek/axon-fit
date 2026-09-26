import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { readClient } from './client-record';
import { emailLoginEnabled, serverEnv } from './env';
import { appRepo, GithubError } from './github/client';
import { sleep } from './github/errors';
import { readJson, writeJson } from './github/files';
import { checkAppRepo, createAppRepo } from './github/repos';
import * as core from './session-core';
import type { AuthEnv, ClientSession, LoginCodeStore, OtpResult, PtSession, Session, SessionStore } from './session-core';

export type { ClientSession, OtpResult, PtSession, Session };

/**
 * Oturumlar ve yedek girişin kodu (SPEC §5) — Next'e ve GitHub'a bağlama. Kurallar ve akış
 * `session-core.ts`'te (orada test edilir); burası yalnız çerezi, ortamı, saati ve GitHub'ı verir.
 */

const LOGIN_CODE_PATH = 'data/login-code.json';
const LOGIN_CODE_TAG = 'login-code';

/**
 * Kodun durumu Next'in veri önbelleğinden (sunucu örnekleri arasında ortak; yalnız süreç belleği
 * Vercel'de yetmezdi). Her yazmada düşürülür; 60 sn üst sınır, düşürme bir yerde kaybolursa diye.
 * Kimliksiz istek bu yüzden GitHub'ın saatlik sınırını tüketemez. Repo adı anahtarda: APP_REPO
 * değişirse eski repo'nun durumu okunmaz.
 */
const readLoginCodeCached = unstable_cache(
  (repo: string) => readJson<unknown>(repo, LOGIN_CODE_PATH),
  ['login-code'],
  { tags: [LOGIN_CODE_TAG], revalidate: 60 },
);

/** Veri repo'su açık ya da fork ise sebebi; 5 dk önbellekte (yanlış kurulumda her istek repo'ya bakmasın). */
const appRepoProblem = unstable_cache(
  async (_repo: string): Promise<string | null> => {
    try {
      await checkAppRepo();
      return null;
    } catch (error) {
      if (error instanceof GithubError && error.status === 409) return error.message;
      throw error;
    }
  },
  ['app-repo-problem'],
  { revalidate: 300 },
);

const loginCode: LoginCodeStore = {
  readCached: () => readLoginCodeCached(appRepo()),
  readFresh: () => readJson<unknown>(appRepo(), LOGIN_CODE_PATH),
  write: (state, sha, message) => writeJson(appRepo(), LOGIN_CODE_PATH, state, { sha, message }),
  invalidate: () => revalidateTag(LOGIN_CODE_TAG, { expire: 0 }),
  repoProblem: () => appRepoProblem(appRepo()),
  ensureRepo: createAppRepo,
  wait: sleep,
};

function authEnv(): AuthEnv {
  const env = serverEnv();
  return {
    secret: env.authSecret,
    owner: env.owner,
    ptEmail: env.ptEmail,
    emailLogin: emailLoginEnabled(),
    secureCookies: process.env.NODE_ENV === 'production',
  };
}

async function readClientRecord(id: string) {
  return (await readClient(id))?.client ?? null;
}

async function requestStore(): Promise<SessionStore> {
  const jar = await cookies();
  return {
    cookies: {
      get: (name) => jar.get(name)?.value,
      set: (name, value, options) => {
        jar.set(name, value, options);
      },
      delete: (name) => {
        jar.delete(name);
      },
    },
    env: authEnv(),
    now: () => new Date(),
    readClient: readClientRecord,
    loginCode,
  };
}

/** Oturumu kendi rolünün çerezine yazar; diğer rolün oturumuna dokunmaz. */
export async function createSession(session: Session): Promise<void> {
  await core.createSession(await requestStore(), session);
}

/** PT oturumu (yalnız PT çerezinden). */
export async function readPtSession(): Promise<PtSession | null> {
  return core.readPtSession(await requestStore());
}

/** Danışan oturumu (yalnız danışan çerezinden; eski düzenin PT çerezindeki danışan yükü de). */
export async function readClientSession(): Promise<ClientSession | null> {
  return core.readClientSession(await requestStore());
}

/** Oturumun hâlâ geçerli olduğu danışan kaydı ya da null; GitHub'a ulaşılamazsa fırlatır. */
export async function sessionClient(session: ClientSession) {
  return core.sessionClient({ readClient: readClientRecord }, session);
}

/** İki role açık okuma uçları: PT ya da kayıtla doğrulanmış danışan. Kayıt okunamazsa fırlatır. */
export async function readAnySession(): Promise<Session | null> {
  return core.readAnySession(await requestStore());
}

/** Yalnız o rolün oturumunu kapatır. */
export async function endSession(role: Session['role']): Promise<void> {
  await core.endSession(await requestStore(), role);
}

/** Kod isteğinin yanıttan önceki kısmı: her adrese aynı çerez. */
export async function startOtpChallenge(email: string): Promise<void> {
  await core.startOtpChallenge(await requestStore(), email);
}

/**
 * Kod isteğinin yanıttan SONRAKİ kısmı (`after`): çereze dokunmaz. Kod üretildiyse döner (gönderimi
 * çağıran yapar); yönetici adresi değilse ya da oran sınırındaysa null; repo sorunluysa fırlatır.
 */
export async function issueLoginCode(email: string): Promise<string | null> {
  return core.issueLoginCode({ env: authEnv(), now: () => new Date(), loginCode }, email);
}

/** Kodu dener; doğruysa kod kullanılmış olur ve çerez silinir. GitHub'a ulaşılamazsa fırlatır. */
export async function consumeOtp(code: string, email: string): Promise<OtpResult> {
  return core.consumeOtp(await requestStore(), code, email);
}
