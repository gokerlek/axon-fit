import { NextResponse } from 'next/server';
import { readPtSession } from '@/lib/session';
import { appRepo, gh, GithubError, owner } from '@/lib/github/client';
import { checkAppRepo, listClientIds } from '@/lib/github/repos';

/**
 * Kurulum durumu: token geçerli mi, uygulama repo'su var mı, özel mi, kaç danışan var.
 * Kurulum sihirbazı bununla açılır; aynı zamanda "bir şey mi bozuldu" kontrolüdür.
 * Yalnız okuma yapar. Repo'nun görünürlüğü kurulum tamamlanmış olsa da denetlenir: açık ya da
 * fork ise `uygulamaReposu.sorun` açıklamayı taşır (SPEC §9.8).
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
    let problem: string | null = null;
    try {
      appRepoExists = (await checkAppRepo()).exists;
    } catch (error) {
      if (!(error instanceof GithubError && error.status === 409)) throw error;
      problem = error.message;
    }

    const clientIds = appRepoExists ? await listClientIds() : [];

    return NextResponse.json({
      githubKullanicisi: user.data.login,
      sahibiyleeslesiyor: user.data.login.toLowerCase() === owner().toLowerCase(),
      uygulamaReposu: { ad: repo, var: appRepoExists, ...(problem ? { sorun: problem } : {}) },
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
