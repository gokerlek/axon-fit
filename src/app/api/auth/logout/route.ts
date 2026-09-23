import { NextResponse } from 'next/server';
import { endSession, readSession } from '@/lib/session';

/**
 * Oturumu kapatır. POST: bir bağlantıya tıklanarak ya da önizlemeyle yanlışlıkla tetiklenmesin.
 * Danışan kendi giriş sayfasına, PT kendisininkine döner.
 */
export async function POST(request: Request) {
  const session = await readSession();
  await endSession();
  const target = session?.role === 'client' ? '/join' : '/login';
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
