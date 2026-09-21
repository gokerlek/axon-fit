import 'server-only';

/**
 * OAuth dönüş adresi. GitHub, yetki isteğindeki adresle dönüşteki adresin
 * birebir aynı olmasını ister; ikisi de buradan üretilir.
 */
export function callbackUrl(request: Request): string {
  return new URL('/api/giris/github/callback', origin(request)).toString();
}

/** Vercel'de istek proxy'den geldiği için origin `x-forwarded-*` başlıklarından kurulur. */
export function origin(request: Request): string {
  const headers = request.headers;
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  const proto = headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
