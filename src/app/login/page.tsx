import { redirect } from 'next/navigation';
import { GithubLogo } from '@phosphor-icons/react/dist/ssr';
import { PulseLine } from '@/components/pulse-line';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { readAppConfig } from '@/lib/config';
import { githubLoginEnabled } from '@/lib/github-oauth';
import { readSession } from '@/lib/session';
import { LoginForm } from './login-form';

const errors: Record<string, string> = {
  yetkisiz: 'Bu GitHub hesabı uygulamanın sahibi değil.',
  iptal: 'GitHub girişi yarıda kaldı.',
  oturum_suresi: 'Giriş isteğinin süresi doldu. Tekrar dene.',
  github_hatasi: 'GitHub ile bağlantı kurulamadı. Tekrar dene.',
  github_kapali: 'GitHub girişi bu kurulumda yapılandırılmamış.',
  kod_yok: 'GitHub yetki kodu gelmedi. Tekrar dene.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await readSession();
  if (session?.role === 'pt') redirect('/dashboard');
  if (session?.role === 'client') redirect('/me');

  const config = await readAppConfig();
  const { error: code } = await searchParams;
  const error = code ? (errors[code] ?? 'Giriş yapılamadı.') : null;
  const github = githubLoginEnabled();
  // Yedek yol yalnız PT açıkça istediyse görünür (SPEC §5).
  const emailFallback = Boolean(process.env.RESEND_API_KEY) || process.env.NODE_ENV !== 'production';

  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto] px-4 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{config.appName}</h1>
          <PulseLine className="h-6 w-40" />
          <p className="text-muted-foreground">Güçlü antrenman. Akıllı koçluk.</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {github ? (
              <div className="flex flex-col gap-2">
                <Button size="lg" className="h-11 w-full" render={<a href="/api/auth/github" />}>
                  <GithubLogo data-icon="inline-start" weight="bold" />
                  GitHub ile devam et
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Antrenör girişi. Uygulamanın sahibi olan hesapla açılır.
                </p>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                GitHub girişi için <code>GITHUB_CLIENT_ID</code> ve <code>GITHUB_CLIENT_SECRET</code> tanımlanmalı.
              </p>
            )}

            {emailFallback ? (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Separator className="flex-1" />
                  yedek yol
                  <Separator className="flex-1" />
                </div>
                <LoginForm />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <p className="text-center text-sm text-muted-foreground">Danışansan antrenörünün verdiği kare kodu kullan.</p>
    </main>
  );
}
