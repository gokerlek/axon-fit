import Link from 'next/link';
import { redirect } from 'next/navigation';
import { QrCode, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { PulseLine } from '@/components/pulse-line';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { readAppConfig } from '@/lib/config';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { readSession } from '@/lib/session';
import { JoinForm } from './join-form';

const errors: Record<string, string> = {
  erisim: 'Oturumun kapandı. Antrenöründen yeni bir kod iste.',
};

/**
 * Danışan girişi (SPEC §5). Kare kod bu adrese `?c=<kimlik>&k=<kod>` ile gelir; kod
 * burada KULLANILMAZ, danışan "Giriş yap"a dokununca kullanılır — mesajlaşma
 * uygulamalarının bağlantı önizlemesi kodu harcamasın.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; k?: string; error?: string }>;
}) {
  const { c, k, error: errorCode } = await searchParams;
  const session = await readSession();
  // Hata varsa yönlendirme yok: /me geçersiz oturumu buraya geri gönderir, döngü olmasın.
  if (!errorCode && !c) {
    if (session?.role === 'client') redirect('/me');
    if (session?.role === 'pt') redirect('/dashboard');
  }

  const config = await readAppConfig();
  const clientId = c && CLIENT_ID_PATTERN.test(c) ? c : null;
  const error = errorCode ? (errors[errorCode] ?? 'Giriş yapılamadı.') : c && !clientId ? 'Bağlantı bozuk. Kare kodu yeniden okut.' : null;
  const code = k && /^[\d\s-]{1,12}$/.test(k) ? k : '';

  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto] px-4 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{config.appName}</h1>
          <PulseLine className="h-6 w-40" />
          <p className="text-muted-foreground">Antrenmanına hoş geldin.</p>
        </div>

        <Card>
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
          </CardContent>
        </Card>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Antrenör müsün?{' '}
        <Link href="/login" className="underline underline-offset-4">
          Buradan gir
        </Link>
      </p>
    </main>
  );
}
