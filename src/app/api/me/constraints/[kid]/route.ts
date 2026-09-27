import { NextResponse } from 'next/server';
import { reportDeleteRoute, reportPatchRoute } from '@/lib/me-constraint-routes';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';

type Context = { params: Promise<{ kid: string }> };

/** Kendi bekleyen bildirimini düzeltir; onaylıda "Kötüleşti" ya da "Düzeldi" (tasarım §2.4). */
export async function PATCH(request: Request, context: Context) {
  const { kid } = await context.params;
  const body = await request.json().catch(() => null);
  const result = await reportPatchRoute(await sessionRouteDeps(), request.headers, origin(request), kid, body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

/** Yalnız kendi bekleyen bildirimini geri çeker. */
export async function DELETE(request: Request, context: Context) {
  const { kid } = await context.params;
  const result = await reportDeleteRoute(await sessionRouteDeps(), request.headers, origin(request), kid);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
