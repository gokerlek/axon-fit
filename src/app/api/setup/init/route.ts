import { NextResponse } from 'next/server';
import { readPtSession } from '@/lib/session';
import { appRepo, GithubError } from '@/lib/github/client';
import { createAppRepo } from '@/lib/github/repos';
import { readJson, writeJson } from '@/lib/github/files';
import { defaultConfig, type AppConfig } from '@/lib/schemas/config';

/**
 * Kurulumun ilk adımı: uygulama repo'sunu hazırlar.
 *
 * Yapılanlar (hepsi "zaten varsa dokunma" mantığıyla):
 *   1. repo yoksa oluştur (özel)
 *   2. pulsecoach.config.json yoksa varsayılanla yaz
 *   3. data/clients.json yoksa boş listeyle yaz
 *
 * Aynı istek iki kez gelirse ikincisi hiçbir şeyi bozmaz.
 */
export async function POST() {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  const repo = appRepo();

  try {
    const { created } = await createAppRepo();

    const config = await readJson<AppConfig>(repo, 'pulsecoach.config.json');
    if (!config) {
      await writeJson(repo, 'pulsecoach.config.json', defaultConfig, {
        message: 'Kurulum: uygulama ayarları oluşturuldu',
      });
    }

    const clients = await readJson<unknown[]>(repo, 'data/clients.json');
    if (!clients) {
      await writeJson(repo, 'data/clients.json', [], {
        message: 'Kurulum: danışan listesi oluşturuldu',
      });
    }

    return NextResponse.json({
      repo,
      repoCreated: created,
      configCreated: !config,
      clientsCreated: !clients,
    });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Kurulum tamamlanamadı.' },
      { status: failure?.status ?? 502 },
    );
  }
}
