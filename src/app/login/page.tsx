import { redirect } from 'next/navigation';
import { PulseLine } from '@/components/pulse-line';
import { readAppConfig } from '@/lib/config';
import { githubLoginEnabled } from '@/lib/github-oauth';
import { readSession } from '@/lib/session';
import { LoginForm } from './login-form';
import styles from './login.module.css';

const errors: Record<string, string> = {
  yetkisiz: 'Bu GitHub hesabı uygulamanın sahibi değil.',
  iptal: 'GitHub girişi yarıda kaldı.',
  oturum_suresi: 'Giriş isteğinin süresi doldu. Tekrar dene.',
  github_hatasi: 'GitHub ile bağlantı kurulamadı. Tekrar dene.',
  github_kapali: 'GitHub girişi bu kurulumda yapılandırılmamış.',
  kod_yok: 'GitHub yetki kodu gelmedi. Tekrar dene.',
};

export default async function GirisPage({ searchParams }: { searchParams: Promise<{ failure?: string }> }) {
  const session = await readSession();
  if (session?.role === 'pt') redirect('/dashboard');
  if (session?.role === 'client') redirect('/me');

  const config = await readAppConfig();
  const { failure } = await searchParams;
  const error = failure ? (errors[failure] ?? 'Giriş yapılamadı.') : null;
  const github = githubLoginEnabled();
  // Yedek yol yalnız PT açıkça istediyse görünür (SPEC §5).
  const emailFallback = Boolean(process.env.RESEND_API_KEY) || process.env.NODE_ENV !== 'production';

  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <div className={styles.brand}>
          <h1 className={styles.wordmark}>{config.appName}</h1>
          <PulseLine className={styles.pulse} />
          <p className={styles.tagline}>Güçlü antrenman. Akıllı koçluk.</p>
        </div>

        <div className={styles.card}>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}

          {github ? (
            <>
              <a className={styles.primary} href="/api/auth/github">
                GitHub ile devam et
              </a>
              <p className={styles.note}>Antrenör girişi. Uygulamanın sahibi olan hesapla açılır.</p>
            </>
          ) : (
            <p className={styles.note}>
              GitHub girişi için <code>GITHUB_CLIENT_ID</code> ve <code>GITHUB_CLIENT_SECRET</code> tanımlanmalı.
            </p>
          )}

          {emailFallback ? (
            <>
              <div className={styles.divider}>yedek yol</div>
              <LoginForm />
            </>
          ) : null}
        </div>
      </div>
      <p className={styles.note}>Danışansan antrenörünün verdiği kare kodu kullan.</p>
    </main>
  );
}
