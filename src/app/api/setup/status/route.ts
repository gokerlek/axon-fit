import { NextResponse } from 'next/server';
import { readPtSession } from '@/lib/session';
import { appRepo, gh, GithubError, owner } from '@/lib/github/client';
import { listClientIds } from '@/lib/github/repos';

/**
 * Kurulum durumu: token geçerli mi, uygulama repo'su var mı, kaç danışan var.
 * Kurulum sihirbazı bununla açılır; aynı zamanda "bir şey mi bozuldu" kontrolüdür.
 * Yalnız okuma yapar.
 */
export async function GET() {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  try {
    const user = await gh().rest.users.getAuthenticated();
    const repo = appRepo();

    let appRepoExists = true;
    try {
      await gh().rest.repos.get({ owner: owner(), repo });
    } catch (error) {
      if (typeof error === 'object' && error && 'status' in error && error.status === 404) {
        appRepoExists = false;
      } else {
        throw error;
      }
    }

    const clientIds = appRepoExists ? await listClientIds() : [];

    return NextResponse.json({
      githubKullanicisi: user.data.login,
      sahibiyleeslesiyor: user.data.login.toLowerCase() === owner().toLowerCase(),
      uygulamaReposu: { ad: repo, var: appRepoExists },
      danisanSayisi: clientIds.length,
    });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'GitHub ile konuşulamadı. Token geçerli mi?' },
      { status: failure?.status ?? 502 },
    );
  }
}
