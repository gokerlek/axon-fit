/**
 * Uygulama repo'sundaki dosya işleri: saf çekirdeklerin (`catalog-actions.ts`) GitHub'a açılan kapısı.
 *
 * Sunucuda `appRepoFiles()` (`app-repo-files.ts`) bunu `github/files.ts`'e bağlar; testler bellek içi
 * sahtesini verir (`testing/fake-repo.ts`). Sözleşme `github/files.ts` ile aynı:
 * - okuma: dosya yoksa `null`; okunamazsa `GithubError` fırlatır (bozuk JSON 500);
 * - yazma: `sha` okunan dosyanınki (dosya yoksa verilmez); dosya o arada değiştiyse 409 (`GithubError`).
 */

export type WriteOptions = { sha?: string | undefined; message: string };

export type RepoFiles = {
  readJson(path: string): Promise<{ content: unknown; sha: string } | null>;
  writeJson(path: string, content: unknown, options: WriteOptions): Promise<unknown>;
  /** Dosyanın yalnız `sha`'sı (ikili dosyanın üzerine yazmak ve silmek için); yoksa `null`. */
  getFileSha(path: string): Promise<string | null>;
  writeBinary(path: string, bytes: Uint8Array, options: WriteOptions): Promise<unknown>;
  deleteFile(path: string, options: { sha: string; message: string }): Promise<void>;
};
