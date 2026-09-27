import { NextResponse } from 'next/server';
import { deleteOwnRoute, saveOwnRoute } from '@/lib/own-program-routes';
import { ownRouteDeps } from '@/lib/own-programs-store';
import { sessionRouteDeps } from '@/lib/session-files';
import type { SessionRouteResult } from '@/lib/session-routes';
import { origin } from '@/lib/urls';

/**
 * Danışanın kendi programı (`docs/design/kendi-program.md` §6). Kurallar `own-program-routes.ts` ve
 * `own-program-files.ts`'te:
 * - PUT: oluştur (`baseRevision: null`, 201; aynı gövde yeniden 200 `unchanged`, farklı gövde ya da 5 program 409)
 *   ya da kaydet (412 eski sürüm, 404 silinmiş, 400 alan hataları). Program ve index tek commit.
 * - DELETE: sil (+ index, tek commit); yarım antrenman bu programdansa 409 ve seansın kimliği.
 * `pid` kalıba uymuyorsa 404 (dosya yolu yalnız kimlikten). Yalnız bu siteden; gövdeli istek JSON'la. Kimlik
 * yalnız oturumdan.
 */

type Context = { params: Promise<{ pid: string }> };

function respond(result: SessionRouteResult) {
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function PUT(request: Request, { params }: Context) {
  const { pid } = await params;
  const body = await request.json().catch(() => null);
  return respond(await saveOwnRoute(await ownRouteDeps(), request.headers, origin(request), pid, body));
}

export async function DELETE(request: Request, { params }: Context) {
  const { pid } = await params;
  return respond(await deleteOwnRoute(await sessionRouteDeps(), request.headers, origin(request), pid));
}
