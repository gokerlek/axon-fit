import { NextResponse } from 'next/server';
import { passwordLoginRoute, postGuard } from '@/lib/client-auth-routes';
import { isKnownClient, loginWithPassword } from '@/lib/clients';
import { createSession } from '@/lib/session';
import { origin } from '@/lib/urls';

/**
 * Danışanın şifreyle girişi (SPEC §5): ilk giriş kare kodla (`/api/join`), sonrakiler burada. Kurallar
 * `client-auth-routes.ts` (tek tip yanıt, oturum) ve `clients-core.ts` (sayaç, artan kilit, önbellekli
 * ön karar). Yalnız bu siteden ve JSON'la. Şifre ne yanıta ne günlüğe yazılır.
 */
export async function POST(request: Request) {
  const blocked = postGuard(request.headers, origin(request));
  if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
  const result = await passwordLoginRoute(
    { isKnownClient, login: loginWithPassword, createSession, log: (message) => console.error(message) },
    await request.json().catch(() => null),
  );
  return NextResponse.json(result.body, { status: result.status });
}
