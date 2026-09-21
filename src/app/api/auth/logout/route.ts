import { NextResponse } from 'next/server';
import { endSession } from '@/lib/session';

/** Oturumu kapatır. POST: bir bağlantıya tıklanarak ya da önizlemeyle yanlışlıkla tetiklenmesin. */
export async function POST(request: Request) {
  await endSession();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
