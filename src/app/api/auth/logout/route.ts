import { NextResponse } from 'next/server';
import { endSession } from '@/lib/session';

/**
 * Oturumu kapatır — yalnız istenen rolün: PT'nin çıkışı danışan oturumunu (aynı tarayıcıda
 * başka sekmede) kapatmaz, danışanınki de PT'ninkini. Danışan formu `rol=danisan` gönderir;
 * rol yoksa PT. POST: bir bağlantıya tıklanarak ya da önizlemeyle yanlışlıkla tetiklenmesin.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const role = form?.get('rol') === 'danisan' ? 'client' : 'pt';
  await endSession(role);
  return NextResponse.redirect(new URL(role === 'client' ? '/join' : '/login', request.url), { status: 303 });
}
