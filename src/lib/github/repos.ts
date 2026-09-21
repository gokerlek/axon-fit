import 'server-only';
import { clientRepoName, gh, GithubError, isClientRepo, owner, toGithubError } from './client';
import { CLIENT_REPO_PREFIX } from '../env';

/**
 * Danışan repoları (SPEC §3).
 *
 * Her danışan ayrı ÖZEL repo: silme istendiğinde repo silinir, başka hiçbir verinin
 * geçmişi yeniden yazılmaz. Repo adında isim geçmez, yalnız kimlik: repo adları
 * silindikten sonra da denetim kayıtlarında kalabiliyor.
 */

export async function createClientRepo(clientId: string): Promise<{ repo: string }> {
  const repo = clientRepoName(clientId);
  try {
    await gh().rest.repos.createForAuthenticatedUser({
      name: repo,
      // ÖZEL olmak zorunda: içinde danışan adı ve antrenman kayıtları var.
      private: true,
      auto_init: true,
      description: 'PulseCoach danışan verisi',
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    });
    return { repo };
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 422) {
      throw new GithubError('Bu kimlikle bir repo zaten var.', 409);
    }
    throw toGithubError(error, repo);
  }
}

/**
 * Danışan repo'sunu kalıcı siler.
 *
 * `isClientRepo` kontrolü burada ayrıca yapılır: `assertRepoAllowed` uygulama repo'suna da
 * izin verir, ama silme YALNIZ danışan repolarında olabilir. Uygulama kendi reposunu silemez.
 */
export async function deleteClientRepo(clientId: string): Promise<void> {
  const repo = clientRepoName(clientId);
  if (!isClientRepo(repo)) {
    throw new GithubError('Yalnız danışan repoları silinebilir.', 403);
  }
  try {
    await gh().rest.repos.delete({ owner: owner(), repo });
  } catch (error) {
    throw toGithubError(error, repo);
  }
}

export async function clientRepoExists(clientId: string): Promise<boolean> {
  const repo = clientRepoName(clientId);
  try {
    await gh().rest.repos.get({ owner: owner(), repo });
    return true;
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return false;
    throw toGithubError(error, repo);
  }
}

/** Hesaptaki danışan repolarının kimlikleri. Uygulama repo'su ve diğer projeler elenir. */
export async function listClientIds(): Promise<string[]> {
  try {
    const repos = await gh().paginate(gh().rest.repos.listForAuthenticatedUser, {
      per_page: 100,
      affiliation: 'owner',
      sort: 'created',
    });
    return repos
      .map((repo) => repo.name)
      .filter(isClientRepo)
      .map((name) => name.slice(CLIENT_REPO_PREFIX.length));
  } catch (error) {
    throw toGithubError(error, 'repo listesi');
  }
}
