import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_UNAVAILABLE,
  configAccess,
  ConfigUnavailableError,
  readConfigBase,
  removeLogo,
  replaceLogo,
  saveAppearance,
  toConfigBase,
  type ConfigCache,
  type ConfigSource,
  type ConfigStore,
  type LogoFiles,
  type StoredConfig,
} from './config-update.ts';
import { BrokenJsonError, GithubError } from './github/errors.ts';
import { defaultConfig, type AppConfig } from './schemas/config.ts';
import type { SetupForm } from './schemas/setup.ts';

const BRAND: AppConfig = {
  appName: 'Ece Kaya Training',
  logo: 'media/brand/logo.png',
  accent: '#38BDF8',
  theme: 'light',
  radius: 'soft',
  timeZone: 'Europe/Istanbul',
  setupCompleted: true,
};
const FORM: SetupForm = { appName: 'Ece Kaya Training', accent: '#38BDF8', theme: 'light', radius: 'soft' };
const REPO_IS_FORK = `"pulsecoach-data" bir fork. Veri repo'su kodun fork'undan ayrı ve özel olmalı.`;
const NEW_LOGO = 'media/brand/logo.webp';
const BYTES = new Uint8Array([1, 2, 3]);

/**
 * Sahte GitHub: yapılan her iş sırasıyla `log`'a düşer, yazılan ayarlar `writes`'a, günlük `logs`'a.
 * `readFails` okumanın hatasını (varsayılan bir anlık 502), `repoProblem` açık/fork repo'yu
 * (createAppRepo ve checkAppRepo'nun 409'u) taklit eder. `created`: repo bu kayıtta mı açıldı.
 */
function fakeGithub(options: {
  stored?: StoredConfig;
  readFails?: boolean | number;
  repoProblem?: string;
  created?: boolean;
  files?: Record<string, string>;
  failWrites?: number[];
  failLogoWrites?: number[];
  failRemove?: number;
} = {}) {
  const log: string[] = [];
  const logs: string[] = [];
  const waits: number[] = [];
  const writes: { config: AppConfig; sha: string | null; message: string }[] = [];
  const files = new Map(Object.entries(options.files ?? {}));
  const failWrites = [...(options.failWrites ?? [])];
  const failLogoWrites = [...(options.failLogoWrites ?? [])];
  const repoFailure = () => {
    if (options.repoProblem) throw new GithubError(options.repoProblem, 409);
  };

  const store: ConfigStore = {
    read: async () => {
      log.push('read');
      if (options.readFails) {
        const status = options.readFails === true ? 502 : options.readFails;
        throw new GithubError(`pulsecoach.config.json: GitHub hatası.`, status);
      }
      return options.stored ?? null;
    },
    createRepo: async () => {
      log.push('createRepo');
      repoFailure();
      return { created: options.created ?? !options.stored };
    },
    checkRepo: async () => {
      log.push('checkRepo');
      repoFailure();
      return { exists: true };
    },
    write: async (config, sha, message) => {
      log.push('writeConfig');
      const status = failWrites.shift();
      if (status) throw new GithubError('pulsecoach.config.json: sahte hata.', status);
      writes.push({ config, sha, message });
    },
    log: (message) => {
      logs.push(message);
    },
    wait: async (ms) => {
      waits.push(ms);
    },
  };
  const logo: LogoFiles = {
    sha: async (path) => files.get(path) ?? null,
    write: async (path, _bytes, sha) => {
      log.push(`writeLogo ${path} sha=${sha}`);
      const status = failLogoWrites.shift();
      if (status) throw new GithubError(`${path}: sahte hata.`, status);
      files.set(path, 'yeni');
    },
    remove: async (path, sha) => {
      log.push(`removeLogo ${path} sha=${sha}`);
      if (options.failRemove) throw new GithubError(`${path}: sahte hata.`, options.failRemove);
      files.delete(path);
    },
  };
  return { store, logo, log, logs, waits, writes, files };
}

describe('kurulum: yazmadan önce veri repo\'su (SPEC §2, §9.8)', () => {
  test('taze kurulum: ayar dosyası yokken önce repo hazırlanır, sonra ayar yazılır', async () => {
    const gh = fakeGithub();
    await saveAppearance(gh.store, FORM);
    assert.deepEqual(gh.log, ['read', 'createRepo', 'writeConfig']);
    assert.deepEqual(gh.writes, [
      { config: { ...defaultConfig, ...FORM, setupCompleted: true }, sha: null, message: 'Kurulum tamamlandı' },
    ]);
  });

  test('repo açık ya da fork ise kayıt durur: hiçbir şey yazılmaz, sebep PT\'ye döner', async () => {
    const gh = fakeGithub({ repoProblem: REPO_IS_FORK });
    await assert.rejects(saveAppearance(gh.store, FORM), { message: REPO_IS_FORK, status: 409 });
    assert.deepEqual(gh.log, ['read', 'createRepo']);
    assert.equal(gh.writes.length, 0);
  });

  test('APP_REPO kodun fork\'unu gösterirse (şablon ayar dosyası var ama kurulum bitmemiş) yine durur', async () => {
    // Kod repo'sundaki pulsecoach.config.json: "$schema" alanı var, radius yok, setupCompleted false.
    const template = { $schema: './docs/config.schema.json', ...defaultConfig, radius: undefined };
    const gh = fakeGithub({ stored: { content: template, sha: 'kod-fork' }, repoProblem: REPO_IS_FORK });
    await assert.rejects(saveAppearance(gh.store, FORM), { message: REPO_IS_FORK });
    assert.equal(gh.writes.length, 0);
  });

  test('kurulum tamamlandıktan sonra repo oluşturulmaz ama her ayar yazımında denetlenir', async () => {
    const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' }, files: { [BRAND.logo!]: 'eski' } });
    await saveAppearance(gh.store, FORM);
    await replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES);
    await removeLogo(gh.store, gh.logo);
    assert.ok(!gh.log.includes('createRepo'), gh.log.join(', '));
    assert.equal(gh.log.filter((item) => item === 'checkRepo').length, 3);
  });

  test('kurulum tamamlanmış ama APP_REPO açık ya da fork (eski sürüm ya da sonradan açığa çevrildi): kayıt durur', async () => {
    const runs: [string, (gh: ReturnType<typeof fakeGithub>) => Promise<void>][] = [
      ['görünüm kaydı', (gh) => saveAppearance(gh.store, FORM)],
      ['logo yükleme', (gh) => replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES)],
      ['logo kaldırma', (gh) => removeLogo(gh.store, gh.logo)],
    ];
    for (const [name, run] of runs) {
      const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' }, repoProblem: REPO_IS_FORK, files: { [BRAND.logo!]: 'eski' } });
      await assert.rejects(run(gh), { message: REPO_IS_FORK, status: 409 }, name);
      assert.deepEqual(gh.log, ['read', 'checkRepo'], name);
      assert.equal(gh.writes.length, 0, name);
      assert.deepEqual([...gh.files.keys()], [BRAND.logo], name);
    }
  });

  test('taze kurulumda önce logo seçilirse repo logodan önce hazırlanır', async () => {
    const gh = fakeGithub();
    await replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES);
    assert.deepEqual(gh.log, ['read', 'createRepo', `writeLogo ${NEW_LOGO} sha=null`, 'writeConfig']);
    // Kurulum bitmedi: sihirbaz açık kalır, "Kurulumu tamamla" bitirir.
    assert.deepEqual(gh.writes[0]?.config, { ...defaultConfig, logo: NEW_LOGO });
  });

  test('repo sorunluysa logo dosyası da yazılmaz', async () => {
    const gh = fakeGithub({ repoProblem: REPO_IS_FORK });
    await assert.rejects(replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES), { message: REPO_IS_FORK });
    assert.deepEqual(gh.log, ['read', 'createRepo']);
    assert.equal(gh.files.size, 0);
  });

  test('repo bu kayıtta açıldıysa ilk yazma 404/409\'da yeniden denenir', async () => {
    const gh = fakeGithub({ failWrites: [404, 409] });
    await saveAppearance(gh.store, FORM);
    assert.deepEqual(gh.log, ['read', 'createRepo', 'writeConfig', 'writeConfig', 'writeConfig']);
    assert.deepEqual(gh.waits, [600, 1200]);
    assert.equal(gh.writes.length, 1);

    const logo = fakeGithub({ failLogoWrites: [404] });
    await replaceLogo(logo.store, logo.logo, NEW_LOGO, BYTES);
    assert.deepEqual(logo.log, ['read', 'createRepo', `writeLogo ${NEW_LOGO} sha=null`, `writeLogo ${NEW_LOGO} sha=null`, 'writeConfig']);
  });

  test('repo zaten varsa yeniden denenmez: hata PT\'ye döner', async () => {
    const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' }, failWrites: [404] });
    await assert.rejects(saveAppearance(gh.store, FORM), { status: 404 });
    assert.deepEqual(gh.waits, []);
  });
});

describe('ayar yazmanın tabanı: taze okuma, aynı sha (SPEC §10)', () => {
  test('ayar geçici olarak okunamazsa hiçbir uç yazmaz: 503, Türkçe mesaj; sebep günlükte', async () => {
    const runs: [string, (gh: ReturnType<typeof fakeGithub>) => Promise<void>][] = [
      ['görünüm kaydı', (gh) => saveAppearance(gh.store, FORM)],
      ['logo yükleme', (gh) => replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES)],
      ['logo kaldırma', (gh) => removeLogo(gh.store, gh.logo)],
    ];
    for (const status of [502, 403]) {
      for (const [name, run] of runs) {
        const gh = fakeGithub({ readFails: status, files: { [BRAND.logo!]: 'eski' } });
        await assert.rejects(run(gh), (error) => {
          assert.ok(error instanceof ConfigUnavailableError, name);
          assert.equal(error.status, 503);
          assert.equal(error.message, CONFIG_UNAVAILABLE);
          return true;
        });
        assert.deepEqual(gh.log, ['read'], name);
        assert.equal(gh.writes.length, 0, name);
        assert.deepEqual([...gh.files.keys()], [BRAND.logo], name);
        assert.match(gh.logs[0] ?? '', new RegExp(`okunamadı: .*\\(${status}\\)`), name);
      }
    }
  });

  test('kalıcı hata "tekrar dene" diye gizlenmez: geçersiz anahtar açık mesajıyla döner', async () => {
    const gh = fakeGithub({ readFails: 401 });
    await assert.rejects(saveAppearance(gh.store, FORM), (error) => {
      assert.ok(error instanceof GithubError);
      assert.equal(error.status, 401);
      return true;
    });
    assert.equal(gh.writes.length, 0);
    assert.match(gh.logs[0] ?? '', /\(401\)/);
  });

  test('görünüm kaydı formda olmayan alanları korur; sha aynı okumadan gelir', async () => {
    const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' } });
    await saveAppearance(gh.store, { ...FORM, appName: 'Ece Kaya Studio', theme: 'dark' });
    assert.deepEqual(gh.writes, [
      {
        config: { ...BRAND, appName: 'Ece Kaya Studio', theme: 'dark' },
        sha: 'sha-1',
        message: 'Görünüm ayarları güncellendi',
      },
    ]);
  });

  test('logo yükleme markayı korur, yalnız logo değişir; eski dosya ancak ayar yazıldıktan SONRA silinir', async () => {
    const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' }, files: { [BRAND.logo!]: 'eski' } });
    await replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES);
    assert.deepEqual(gh.log, [
      'read',
      'checkRepo',
      `writeLogo ${NEW_LOGO} sha=null`,
      'writeConfig',
      `removeLogo ${BRAND.logo} sha=eski`,
    ]);
    assert.deepEqual(gh.writes, [{ config: { ...BRAND, logo: NEW_LOGO }, sha: 'sha-1', message: 'Logo ayarı güncellendi' }]);
  });

  test('logo değişiminde ayar yazılamazsa eski logo yerinde kalır (kırık görsel yok)', async () => {
    const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' }, files: { [BRAND.logo!]: 'eski' }, failWrites: [502] });
    await assert.rejects(replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES), { status: 502 });
    assert.equal(gh.files.has(BRAND.logo!), true);
    assert.ok(!gh.log.some((item) => item.startsWith('removeLogo')), gh.log.join(', '));
  });

  test('eski logo silinemezse yükleme yine başarılı: ayar yeni logoyu gösterir, sebep günlükte', async () => {
    const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' }, files: { [BRAND.logo!]: 'eski' }, failRemove: 409 });
    await replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES);
    assert.equal(gh.writes[0]?.config.logo, NEW_LOGO);
    assert.match(gh.logs[0] ?? '', /eski logo silinemedi \(media\/brand\/logo\.png\).*409/);
  });

  test('aynı uzantıda logo dosyanın sha\'sıyla üzerine yazılır, silinecek eski dosya yok', async () => {
    const gh = fakeGithub({ stored: { content: { ...BRAND, logo: NEW_LOGO }, sha: 'sha-1' }, files: { [NEW_LOGO]: 'eski' } });
    await replaceLogo(gh.store, gh.logo, NEW_LOGO, BYTES);
    assert.deepEqual(gh.log, ['read', 'checkRepo', `writeLogo ${NEW_LOGO} sha=eski`, 'writeConfig']);
  });

  test('logo kaldırma dosyayı siler ve ayarı boşaltır', async () => {
    const gh = fakeGithub({ stored: { content: BRAND, sha: 'sha-1' }, files: { [BRAND.logo!]: 'eski' } });
    await removeLogo(gh.store, gh.logo);
    assert.deepEqual(gh.log, ['read', 'checkRepo', `removeLogo ${BRAND.logo} sha=eski`, 'writeConfig']);
    assert.deepEqual(gh.writes, [{ config: { ...BRAND, logo: null }, sha: 'sha-1', message: 'Logo ayarı temizlendi' }]);
    assert.equal(gh.files.size, 0);
  });

  test('ayarda logo yoksa kaldırma hiçbir şey yazmaz', async () => {
    const gh = fakeGithub({ stored: { content: { ...BRAND, logo: null }, sha: 'sha-1' } });
    await removeLogo(gh.store, gh.logo);
    assert.deepEqual(gh.log, ['read']);
  });
});

describe('kurulum kapısı: "dosya yok" ile "okunamadı" ayrı (SPEC §10)', () => {
  const quiet = { log: () => undefined };

  test('dosya yoksa kurulum yapılmamış sayılır: sihirbaz', async () => {
    const base = await readConfigBase({ ...quiet, read: async () => null });
    assert.deepEqual(base, { config: defaultConfig, sha: null });
    assert.equal(base.config.setupCompleted, false);
  });

  test('okunamazsa varsayılana düşülmez: hata fırlar, sebep saklanır', async () => {
    const cause = new GithubError('GitHub 403', 403);
    await assert.rejects(
      readConfigBase({
        ...quiet,
        read: async () => {
          throw cause;
        },
      }),
      (error) => error instanceof ConfigUnavailableError && error.cause === cause,
    );
  });

  test('dosya varsa kayıtlı değerler gelir', async () => {
    const base = await readConfigBase({ ...quiet, read: async () => ({ content: BRAND, sha: 'sha-1' }) });
    assert.deepEqual(base, { config: BRAND, sha: 'sha-1' });
  });

  test('şemaya uymayan ayar: varsayılan taban ama sha korunur (sihirbaz kaydedince onarır)', () => {
    assert.deepEqual(toConfigBase({ content: { appName: '' }, sha: 'bozuk' }), { config: defaultConfig, sha: 'bozuk' });
  });
});

/**
 * config.ts'in bağladığı hali: GitHub (`ConfigSource`) + Next veri önbelleği (`ConfigCache`). Sahte
 * önbellek gerçek gibi ilk okumayı saklar, `invalidate`'e kadar kaynağa gitmez.
 */
function wiredConfig(initial: { content: unknown; sha: string } | null | Error) {
  let file: { content: unknown; sha: string } | null | Error = initial;
  const reads: string[] = [];
  const logs: string[] = [];
  const writes: { config: AppConfig; sha: string | null }[] = [];
  const source: ConfigSource = {
    read: async () => {
      reads.push('read');
      if (file instanceof Error) throw file;
      return file;
    },
    write: async (config, sha) => {
      const current = file instanceof Error ? null : file;
      // Gerçek API gibi: dosya varken yanlış sha 409 (bozuk dosyanın da sha'sı vardır).
      const currentSha = file instanceof BrokenJsonError ? file.sha : (current?.sha ?? null);
      if (currentSha !== sha) throw new GithubError('pulsecoach.config.json: kayıt sen çalışırken değişti.', 409);
      writes.push({ config, sha });
      file = { content: config, sha: `sha-${writes.length + 1}` };
    },
    createRepo: async () => ({ created: false }),
    checkRepo: async () => ({ exists: true }),
  };
  let cached: { value: StoredConfig } | null = null;
  let invalidations = 0;
  const cache: ConfigCache = {
    wrap: (read) => async () => {
      cached ??= { value: await read() };
      return structuredClone(cached.value);
    },
    invalidate: () => {
      cached = null;
      invalidations += 1;
    },
  };
  const access = configAccess(source, cache, { log: (message) => logs.push(message), wait: async () => undefined });
  return {
    access,
    reads,
    logs,
    writes,
    invalidations: () => invalidations,
    /** Başka bir sunucu örneği ya da elle düzenleme: dosya değişir, bu örneğin önbelleği bilmez. */
    changeElsewhere(content: unknown, sha: string) {
      file = { content, sha };
    },
  };
}

describe('config.ts bağlantısı: hangi okuma önbellekli (SPEC §10)', () => {
  test('yazan uçların tabanı önbellekten değil taze okunur: başka yerde değişen ayar ezilmez', async () => {
    const w = wiredConfig({ content: BRAND, sha: 'sha-1' });
    assert.equal((await w.access.load()).appName, BRAND.appName);
    w.changeElsewhere({ ...BRAND, accent: '#FF0000', logo: NEW_LOGO }, 'sha-9');

    await saveAppearance(w.access.store, { ...FORM, appName: 'Ece Kaya Studio' });
    assert.deepEqual(w.writes, [{ config: { ...BRAND, accent: FORM.accent, logo: NEW_LOGO, appName: 'Ece Kaya Studio' }, sha: 'sha-9' }]);
  });

  test('kurulum kapısı ve görüntü önbellekten okur; yazınca önbellek düşer', async () => {
    const w = wiredConfig({ content: BRAND, sha: 'sha-1' });
    await w.access.load();
    await w.access.display();
    await w.access.load();
    assert.deepEqual(w.reads, ['read']);
    await saveAppearance(w.access.store, { ...FORM, appName: 'Ece Kaya Studio' });
    assert.equal(w.invalidations(), 1);
    assert.equal((await w.access.display()).appName, 'Ece Kaya Studio');
  });

  test('dosya yoksa kapı sihirbaza yollar; okunamazsa kapı fırlatır, görüntü varsayılanla açılır', async () => {
    assert.equal((await wiredConfig(null).access.load()).setupCompleted, false);
    const failing = wiredConfig(new GithubError('pulsecoach.config.json: GitHub\'a ulaşılamadı.', 502));
    await assert.rejects(failing.access.load(), ConfigUnavailableError);
    assert.deepEqual(await failing.access.display(), defaultConfig);
    assert.match(failing.logs[0] ?? '', /okunamadı: .*\(502\)/);
  });

  test('bozuk JSON kalıcı kilit olmaz: şemaya uymayan dosya gibi sihirbaza açılır ve kayıt onarır', async () => {
    const w = wiredConfig(new BrokenJsonError('pulsecoach.config.json', 'bozuk-sha'));
    const gate = await w.access.load();
    assert.deepEqual(gate, defaultConfig);
    assert.equal(gate.setupCompleted, false);
    assert.match(w.logs[0] ?? '', /bozuk JSON/);

    await saveAppearance(w.access.store, FORM);
    assert.deepEqual(w.writes, [{ config: { ...defaultConfig, ...FORM, setupCompleted: true }, sha: 'bozuk-sha' }]);
    assert.equal((await w.access.load()).setupCompleted, true);
  });
});
