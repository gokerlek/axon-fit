import { NextResponse, type NextRequest } from 'next/server';
import { workoutRouteDeps } from '@/lib/session-files';
import { exercisesRoute } from '@/lib/workout-routes';

/**
 * "Hareket ekle" (tasarım §2.6): kütüphane; `?add=<egzersiz>` verilirse o hareketin bu antrenman için
 * planı (varsayılan setler, kendi geçmişi). Kurallar `workout-routes.ts`'te. Kimlik yalnız oturumdan.
 */
export async function GET(request: NextRequest) {
  const result = await exercisesRoute(await workoutRouteDeps(), request.nextUrl.searchParams.get('add'));
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
