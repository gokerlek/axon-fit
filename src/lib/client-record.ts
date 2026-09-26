import 'server-only';
import * as v from 'valibot';
import { clientRepoName, GithubError } from './github/client';
import { readJson, writeJson } from './github/files';
import { clientSchema, type Client } from './schemas/client';

/**
 * Danışanın kaydı: `client-<id>` repo'sundaki `client.json` (SPEC §3, §4).
 *
 * Bilerek küçük ve program katmanından bağımsız: oturum (`session.ts`) her danışan isteğinde kaydı
 * okur; giriş uçları programların, şablonların ya da ilerleme hesabının yüklenmesine bağlı kalmasın.
 */

export const CLIENT_PATH = 'client.json';

/** Kayıt ve `sha`. Repo ya da dosya yoksa null; şemaya uymuyorsa 500 fırlatır (PT sorunu görsün). */
export async function readClient(id: string): Promise<{ client: Client; sha: string } | null> {
  const stored = await readJson<unknown>(clientRepoName(id), CLIENT_PATH);
  if (!stored) return null;
  const parsed = v.safeParse(clientSchema, stored.content);
  if (!parsed.success) throw new GithubError(`${id}: danışan kaydı beklenen biçimde değil.`, 500);
  return { client: parsed.output, sha: stored.sha };
}

export async function writeClient(client: Client, sha: string | undefined, message: string): Promise<void> {
  await writeJson(clientRepoName(client.id), CLIENT_PATH, client, { sha, message });
}
