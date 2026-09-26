import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { QrCode, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { PulseLine } from '@/components/pulse-line';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { canSetPassword } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { readClientSession, sessionClient } from '@/lib/session';
import { JoinForm } from './join-form';
import { JoinPasswordStep } from './password-step';
import { PasswordLoginLink } from './password-login-link';

export const metadata: Metadata = { title: 'Katıl' };

const errors: Record<string, string> = {
  erisim: 'Oturumun kapandı. Antrenöründen yeni bir kare kod iste.',
};

/**
 * Kare kodla giriş (SPEC §5), iki adım: (1) kod, (2) şifre belirle → `/me`. Kare kod bu adrese
 * `?c=<kimlik>&k=<kod>` ile gelir; kod burada KULLANILMAZ, danışan "Devam"a dokununca kullanılır —
 * mesajlaşma uygulamalarının bağlantı önizlemesi kodu harcamasın. Kod kullanılınca oturum açılır ve
 * sayfa `?c=<kimlik>` ile yeniden çizilir: açık oturumu olan ve şifre belirleyebilen danışan (yeni
 * katılan, PT'nin sıfırladığı ya da eski akışla katılmış) ikinci adımı görür; yenilense de adım kaybolmaz.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; k?: string; error?: string }>;
}) {
  const { c, k, error: errorCode } = await searchParams;
  const clientId = c && CLIENT_ID_PATTERN.test(c) ? c : null;
  const code = k && /^[\d\s-]{1,12}$/.test(k) ? k : '';
  let error = errorCode ? (errors[errorCode] ?? 'Giriş yapılamadı.') : c && !clientId ? 'Bağlantı bozuk. Kare kodu yeniden okut.' : null;

  // Adreste kod yoksa açık oturuma bakılır. Hata varsa bakılmaz: /me geçersiz oturumu buraya
  // gönderir, döngü olmasın. PT oturumu engel değil (ayrı çerez). Kodla gelen her zaman birinci
  // adımı görür: PT'nin yeni kare kodu (şifre sıfırlama) açık oturumda da kullanılabilsin.
  let passwordStep = false;
  if (!errorCode && !code) {
    const session = await readClientSession();
    if (session && (!clientId || clientId === session.clientId)) {
      // GitHub'a ulaşılamazsa /me hatayı kendi gösterir.
      const client = await sessionClient(session).catch(() => undefined);
      if (client === undefined) redirect('/me');
      if (client && !canSetPassword(client.access, session, new Date())) redirect('/me');
      if (client) passwordStep = true;
      else error = errors.erisim ?? null;
    }
  }

  const config = await readAppConfig();

  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto] gap-6 px-4 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{config.appName}</h1>
          <PulseLine className="h-6 w-40" />
          <p className="text-muted-foreground">Antrenmanına hoş geldin.</p>
        </div>

        {passwordStep ? (
          <Card>
            <CardHeader>
              <CardDescription>Adım 2 / 2</CardDescription>
              <CardTitle className="text-xl">Şifreni belirle</CardTitle>
              <CardDescription>Bir dahaki sefere bu telefonda ya da başka bir telefonda şifrenle girersin.</CardDescription>
            </CardHeader>
            <CardContent>
              <JoinPasswordStep />
            </CardContent>
          </Card>
        ) : (
          <Card>
            {clientId ? (
              <CardHeader>
                <CardDescription>Adım 1 / 2</CardDescription>
                <CardTitle className="text-xl">Kodunu onayla</CardTitle>
                <CardDescription>Kare koddan geldiysen kod hazır. Sonra şifreni belirleyeceksin.</CardDescription>
              </CardHeader>
            ) : null}
            <CardContent className="flex flex-col gap-4">
              {error ? (
                <Alert variant="destructive">
                  <WarningCircle weight="fill" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {clientId ? (
                <JoinForm clientId={clientId} initialCode={code} />
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <QrCode weight="fill" />
                    </EmptyMedia>
                    <EmptyTitle>Kare kodu okut</EmptyTitle>
                    <EmptyDescription>
                      Antrenörünün gösterdiği kare kodu telefonunun kamerasıyla okut ya da gönderdiği bağlantıyı aç.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              <PasswordLoginLink clientId={clientId} />
            </CardContent>
          </Card>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Antrenör müsün?{' '}
        <Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Buradan gir
        </Link>
      </p>
    </main>
  );
}
