import * as v from 'valibot';
import { BrokenJsonError, describeError, GithubError, writeToFreshRepo } from './github/errors.ts';
import { appConfigSchema, CONFIG_PATH, defaultConfig, type AppConfig } from './schemas/config.ts';
import type { SetupForm } from './schemas/setup.ts';

/**
 * Ayar okuma ve yazmanın kuralları (SPEC §2, §9.8, §10) — saf mantık, GitHub'a dokunmaz.
 * `src/lib/config.ts` ve logo ucu GitHub işlerini ve Next önbelleğini bağlar, burası sırayı,
 * tabanı ve hangi okumanın önbellekli olacağını belirler.
 *
 * 1. Yazmanın tabanı TAZE ve hata fırlatan okumadır; `sha` da aynı okumadan gelir. Görüntü
 *    için yazılmış "okunamazsa varsayılan" okuyucu (`readAppConfig`) ve önbellekli okuma taban
 *    olamaz: bir anlık GitHub hatasında ya da eski önbellekte PT'nin markası ezilirdi.
 * 2. Her yazmadan önce veri repo'su denetlenir: kurulum tamamlanmadıysa hazırlanır
 *    (`createAppRepo`: yoksa özel açılır), tamamlandıysa yalnız bakılır (`checkAppRepo`). Açık,
 *    fork ya da kodun fork'uyla aynı adda ise kayıt durur ve sebep PT'ye döner.
 * 3. Bozuk JSON şemaya uymayan dosya gibidir: varsayılan taban, sha korunur, sihirbaz onarır.
 */

/** Ayar dosyasının ham okuması: dosya (ya da repo) yoksa null. */
export type StoredConfig = { content: unknown; sha: string } | null;

export type ConfigBase = {
  config: AppConfig;
  /** Tabanın okunduğu aynı okumadan. Dosya yoksa null: yazma yeni dosya açar. */
  sha: string | null;
};

/** Ayar yazan uçların işleri: `configAccess` bağlar (config.ts), testler sahtesini de verebilir. */
export type ConfigStore = {
  /** Önbelleksiz okuma. Dosya yoksa null; bozuk JSON'da içerik null, sha korunur; okunamazsa FIRLATIR. */
  read(): Promise<StoredConfig>;
  /** `createAppRepo`: repo yoksa özel açar; açık ya da fork ise fırlatır. */
  createRepo(): Promise<{ created: boolean }>;
  /** `checkAppRepo`: oluşturmadan yalnız bakar; açık ya da fork ise fırlatır. */
  checkRepo(): Promise<unknown>;
  write(config: AppConfig, sha: string | null, message: string): Promise<void>;
  /** Sunucu günlüğü: yanıtta genel kalan sebepler. */
  log(message: string): void;
  /** Yeni repo'ya ilk yazmayı yeniden denerken bekleme (testte anında). */
  wait?: (ms: number) => Promise<void>;
};

/** Logo dosyasının GitHub işleri (logo ucu bağlar). */
export type LogoFiles = {
  sha(path: string): Promise<string | null>;
  write(path: string, bytes: Uint8Array, sha: string | null): Promise<void>;
  remove(path: string, sha: string, message: string): Promise<void>;
};

export const CONFIG_UNAVAILABLE = 'Ayarlar şu an okunamadı, tekrar dene.';

/** Ayar geçici olarak okunamadı (ağ, istek sınırı, izin). Hiçbir şey yazılmaz; uçlar 503 döner. */
export class ConfigUnavailableError extends Error {
  readonly status = 503;

  constructor(options?: ErrorOptions) {
    super(CONFIG_UNAVAILABLE, options);
    this.name = 'ConfigUnavailableError';
  }
}

/* --- okuma ve önbellek --- */

/** Ayarın ham GitHub işleri (config.ts bağlar). */
export type ConfigSource = {
  /** Önbelleksiz okuma: dosya ya da repo yoksa null; okunamazsa fırlatır (bozuk JSON: `BrokenJsonError`). */
  read(): Promise<StoredConfig>;
  write(config: AppConfig, sha: string | null, message: string): Promise<void>;
  createRepo(): Promise<{ created: boolean }>;
  checkRepo(): Promise<unknown>;
};

/**
 * Önbellek: Next'in veri önbelleği (sunucu örnekleri arasında paylaşılır). Bellek içi önbellek
 * burada YANLIŞ olurdu: Next sayfaları ve API uçlarını ayrı paketlerde çalıştırır, Vercel'de birden
 * fazla örnek vardır; bir yerde düşürülen önbellek diğerlerinde yaşamaya devam eder.
 */
export type ConfigCache = {
  /** Okumayı önbelleğe sarar. Fırlatılan hata saklanmaz. */
  wrap(read: () => Promise<StoredConfig>): () => Promise<StoredConfig>;
  /** Ayar yazıldıktan sonra: PT sonucu hemen görür. */
  invalidate(): void;
};

/**
 * Ayarın bütün okuma ve yazma yolları; config.ts yalnız GitHub'ı ve Next önbelleğini verir.
 * - `load`: kurulum kapısı ve ayar formları. Önbellekli; okunamazsa fırlatır, varsayılana düşmez.
 * - `display`: görüntü (giriş ekranı, sekme adı). Okunamazsa varsayılan (bu önbelleğe girmez).
 * - `store`: yazan uçlar. Taban TAZE okunur, önbellekten değil; yazınca önbellek düşer.
 */
export function configAccess(
  source: ConfigSource,
  cache: ConfigCache,
  runtime: { log(message: string): void; wait?: (ms: number) => Promise<void> },
) {
  const readFresh = async (): Promise<StoredConfig> => {
    try {
      return await source.read();
    } catch (error) {
      if (!(error instanceof BrokenJsonError)) throw error;
      runtime.log(`[ayar] ${error.message} Varsayılan değerlerle açılıyor; kurulum sihirbazı kaydedince onarılır.`);
      return { content: null, sha: error.sha };
    }
  };
  const readCached = cache.wrap(readFresh);
  const store: ConfigStore = {
    read: readFresh,
    createRepo: source.createRepo,
    checkRepo: source.checkRepo,
    write: async (config, sha, message) => {
      await source.write(config, sha, message);
      cache.invalidate();
    },
    log: runtime.log,
    ...(runtime.wait ? { wait: runtime.wait } : {}),
  };
  const load = async (): Promise<AppConfig> => (await readConfigBase({ read: readCached, log: runtime.log })).config;
  const display = async (): Promise<AppConfig> => {
    try {
      return await load();
    } catch {
      return defaultConfig;
    }
  };
  return { load, display, store };
}

/**
 * Ham okumayı ayara çevirir. Dosya yoksa varsayılan: kurulum yapılmamış. Şemaya uymuyorsa (ya da
 * JSON bozuksa, içerik null) da varsayılan, ama sha korunur: sihirbaz açılır ve kaydedince yerine yazar.
 */
export function toConfigBase(stored: StoredConfig): ConfigBase {
  if (!stored) return { config: defaultConfig, sha: null };
  const parsed = v.safeParse(appConfigSchema, stored.content);
  return { config: parsed.success ? parsed.output : defaultConfig, sha: stored.sha };
}

/**
 * "Dosya yok" ile "okunamadı" ayrı tutulur: dosya yoksa varsayılan döner, okuma hatası
 * varsayılana ÇEVRİLMEZ. Geçici hata (ağ, istek sınırı) `ConfigUnavailableError` (503, "tekrar dene")
 * olur; kalıcı hata (GitHub anahtarı geçersiz) açık mesajıyla yukarı çıkar. Sebep her durumda sunucu
 * günlüğüne yazılır. Yazmanın tabanı ve kurulum kapısı (panelden sihirbaza yönlendirme) bununla okur.
 */
export async function readConfigBase(store: Pick<ConfigStore, 'read' | 'log'>): Promise<ConfigBase> {
  let stored: StoredConfig;
  try {
    stored = await store.read();
  } catch (cause) {
    store.log(`[ayar] ${CONFIG_PATH} okunamadı: ${describeError(cause)}`);
    if (cause instanceof GithubError && cause.status === 401) throw cause;
    throw new ConfigUnavailableError({ cause });
  }
  return toConfigBase(stored);
}

/* --- yazma --- */

/**
 * Yazmadan önce veri repo'su (SPEC §9.8). Kurulum tamamlanmamışken hazırlanır (`createAppRepo`:
 * yoksa özel açılır). Tamamlandıktan sonra oluşturma yapılmaz ama yine bakılır (`checkAppRepo`):
 * eski bir sürümle açık/fork bir repo'ya kurulmuş ya da repo sonradan açığa çevrilmiş olabilir.
 * Sorunluysa hata fırlar ve kayıt durur. Panelin her açılışında değil, yalnız ayar yazarken çalışır.
 *
 * Kurulum koşulu "ayar dosyası yok" değil "kurulum tamamlanmadı" (dosya yoksa da tamamlanmamıştır):
 * kod repo'sunda şablon bir `pulsecoach.config.json` var (`setupCompleted: false`).
 * APP_REPO kodun fork'unu gösterirse dosya "var" görünür; denetim yine de çalışmalı.
 */
export async function ensureAppRepo(store: Pick<ConfigStore, 'createRepo' | 'checkRepo'>, base: ConfigBase): Promise<{ created: boolean }> {
  if (!base.config.setupCompleted) return store.createRepo();
  await store.checkRepo();
  return { created: false };
}

/** Repo bu kayıtta açıldıysa ilk yazma birkaç kez denenir (içerik ucu kısa bir süre 404/409 verebilir). */
function firstWrite(store: Pick<ConfigStore, 'wait'>, created: boolean, write: () => Promise<void>): Promise<void> {
  return created ? writeToFreshRepo(write, store.wait) : write();
}

/** Görünüm kaydı (sihirbaz ve Ayarlar → Görünüm). Formda olmayan alanlar (logo, saat dilimi) korunur. */
export async function saveAppearance(store: ConfigStore, values: SetupForm): Promise<void> {
  const base = await readConfigBase(store);
  const { created } = await ensureAppRepo(store, base);
  await firstWrite(store, created, () =>
    store.write(
      { ...base.config, ...values, setupCompleted: true },
      base.sha,
      base.config.setupCompleted ? 'Görünüm ayarları güncellendi' : 'Kurulum tamamlandı',
    ),
  );
}

/**
 * Logo yükleme: dosya yazılır, ayarda yalnız `logo` değişir. Taban okunamazsa hiçbir dosya yazılmaz.
 * Uzantı değiştiyse eski dosya artıkta kalmasın diye silinir — ama ancak ayar yeni logoyu gösterdikten
 * SONRA: ayar yazılamazsa eski logo yerinde kalır, kırık görsel olmaz. Silme düşerse ayar yine doğru;
 * yalnız repo'da artık kalır, sebep günlüğe yazılır.
 */
export async function replaceLogo(store: ConfigStore, files: LogoFiles, path: string, bytes: Uint8Array): Promise<void> {
  const base = await readConfigBase(store);
  const { created } = await ensureAppRepo(store, base);
  await firstWrite(store, created, async () => files.write(path, bytes, await files.sha(path)));
  await store.write({ ...base.config, logo: path }, base.sha, 'Logo ayarı güncellendi');

  const previous = base.config.logo;
  if (previous && previous !== path) {
    try {
      const previousSha = await files.sha(previous);
      if (previousSha) await files.remove(previous, previousSha, 'Eski logo kaldırıldı');
    } catch (error) {
      store.log(`[ayar] eski logo silinemedi (${previous}): ${describeError(error)}`);
    }
  }
}

/**
 * Logoyu kaldırır: dosya silinir, ayarda `logo` boşalır. Taban okunamazsa hata fırlar, "kaldırıldı"
 * denip hiçbir şey silinmeden geçilmez. Ayarda logo yoksa yapılacak iş yoktur.
 */
export async function removeLogo(store: ConfigStore, files: LogoFiles): Promise<void> {
  const base = await readConfigBase(store);
  const logo = base.config.logo;
  if (!logo) return;

  await ensureAppRepo(store, base);
  const sha = await files.sha(logo);
  if (sha) await files.remove(logo, sha, 'Logo kaldırıldı');
  await store.write({ ...base.config, logo: null }, base.sha, 'Logo ayarı temizlendi');
}
