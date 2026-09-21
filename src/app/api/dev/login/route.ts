import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createSession } from '@/lib/session';

/**
 * YALNIZ GELİŞTİRME: GitHub'a gitmeden oturum açar.
 *
 * Üretimde bu uç YOKTUR — `NODE_ENV === 'production'` iken 404 döner, yani
 * Vercel'e çıkan sürümde çağrılamaz. Amacı ekranları elle tıklamadan test edebilmek.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  const role = new URL(request.url).searchParams.get('role') ?? 'pt';

  if (role === 'client') {
    const clientId = new URL(request.url).searchParams.get('client') ?? 'c_deneme';
    await createSession({ role: 'client', clientId });
    return NextResponse.redirect(new URL('/me', request.url));
  }

  await createSession({ role: 'pt', via: 'github', subject: serverEnv().owner });
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
