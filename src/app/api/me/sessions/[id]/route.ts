import { NextResponse } from 'next/server';
import { sessionRouteDeps } from '@/lib/session-files';
import { deleteRoute, getRoute, patchRoute, putRoute, type SessionRouteResult } from '@/lib/session-routes';
import { origin } from '@/lib/urls';

/**
 * Bir antrenman (tasarım §4.3–§4.7). Kurallar `session-routes.ts` ve `session-files-core.ts`'te:
 * - GET: belge; silinmişse 410.
 * - PUT: telefonun anlık görüntüsü birleştirilir ve yazılır (idempotent, sıradan bağımsız); dosya yoksa
 *   oluşur. Silinmiş 410, başka cihazda bitirilmiş 409 (`reason: finished`, dosya değişmez).
 * - PATCH: geçmişte düzeltme (set ve hareket silme, seans zorluğu, su, set ekleme).
 * - DELETE: antrenmanın tamamı iz dosyasına döner; tek commit, genel mesaj ("Kayıt silindi").
 * Yalnız bu siteden; gövdeli istekler JSON'la. Kimlik yalnız oturumdan.
 */

type Context = { params: Promise<{ id: string }> };

function respond(result: SessionRouteResult) {
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  return respond(await getRoute(await sessionRouteDeps(), id));
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return respond(await putRoute(await sessionRouteDeps(), request.headers, origin(request), id, body));
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return respond(await patchRoute(await sessionRouteDeps(), request.headers, origin(request), id, body));
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  return respond(await deleteRoute(await sessionRouteDeps(), request.headers, origin(request), id));
}
