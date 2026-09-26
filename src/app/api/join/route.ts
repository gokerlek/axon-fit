import { NextResponse } from 'next/server';
import { joinRoute, postGuard } from '@/lib/client-auth-routes';
import { isKnownClient, redeemInvite } from '@/lib/clients';
import { createSession } from '@/lib/session';
import { origin } from '@/lib/urls';

/**
 * Kare kodla giriş, birinci adım (SPEC §5): davet kodunu kullanır ve imzalı, httpOnly oturum çerezi
 * yazar; oturum kodun kullanıldığı anı taşır (şifre adımı 60 dk). Kod kullanılınca eski şifre açmaz.
 * İkinci adım şifre belirlemek (`/api/me/password`): oturum burada açılır ki danışan şifre ekranını
 * kapatırsa kod boşa gitmesin. Kod GET ile değil POST ile kullanılır (bağlantı önizlemesi kodu
 * harcamasın); yalnız bu siteden ve JSON'la. Kurallar `client-auth-routes.ts`'te.
 */
export async function POST(request: Request) {
  const blocked = postGuard(request.headers, origin(request));
  if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
  const result = await joinRoute(
    { isKnownClient, redeem: redeemInvite, createSession, log: (message) => console.error(message) },
    await request.json().catch(() => null),
  );
  return NextResponse.json(result.body, { status: result.status });
}
