import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PulseLine } from '@/components/pulse-line';
import { Card, CardContent } from '@/components/ui/card';
import { readAppConfig } from '@/lib/config';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { readClientSession } from '@/lib/session';
import { ClientLoginForm } from './login-form';

export const metadata: Metadata = { title: 'Giriş' };

/**
 * Danışanın şifreyle girişi (SPEC §5). İlk giriş kare kodla (`/join`), sonrakiler burada. Kimlik
 * adresten (`?c=`) ya da telefonda saklanandan gelir; danışan kimlik yazmaz. İkisi de yoksa
 * sayfa bağlantıyı açmasını ya da yeni kare kod istemesini söyler. Yalnız telefon: tek sütun.
 */
export default async function ClientLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; cikis?: string; sifre?: string }>;
}) {
  const { c, cikis, sifre } = await searchParams;
  const loggedOut = cikis === '1';
  // Açık oturum doğrudan programa; geçersizse /me onu nedeniyle /join'e gönderir (döngü yok).
  if (!loggedOut && (await readClientSession())) redirect('/me');

  const config = await readAppConfig();
  const clientId = c && CLIENT_ID_PATTERN.test(c) ? c : null;

  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto] gap-6 px-4 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{config.appName}</h1>
          <PulseLine className="h-6 w-40" />
          <p className="text-muted-foreground">Tekrar hoş geldin.</p>
        </div>
        <Card>
          <CardContent>
            <ClientLoginForm clientId={clientId} loggedOut={loggedOut} passwordless={sifre === '0'} />
          </CardContent>
        </Card>
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
