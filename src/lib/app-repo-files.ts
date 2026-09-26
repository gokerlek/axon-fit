import 'server-only';
import { appRepo } from './github/client';
import { deleteFile, getFileSha, readJson, writeBinary, writeJson } from './github/files';
import type { RepoFiles } from './repo-files';

/**
 * Uygulama repo'sunun dosyaları: `RepoFiles`'ın GitHub'a bağlı hâli. Repo adı her işte okunur;
 * ortam eksikse hata çekirdeğin içinde (kendi mesajıyla) yakalanır.
 */
export function appRepoFiles(): RepoFiles {
  return {
    readJson: (path) => readJson<unknown>(appRepo(), path),
    writeJson: (path, content, options) => writeJson(appRepo(), path, content, options),
    getFileSha: (path) => getFileSha(appRepo(), path),
    writeBinary: (path, bytes, options) => writeBinary(appRepo(), path, bytes, options),
    deleteFile: (path, options) => deleteFile(appRepo(), path, options),
  };
}
