import 'server-only';

/**
 * Sunucu ortam değişkenleri — TEK okuma noktası.
 *
 * `server-only` bilerek en üstte: bu modül bir istemci bileşeninden import edilirse
 * derleme hata verir, yani GITHUB_TOKEN yanlışlıkla tarayıcı paketine giremez.
 * Hiçbir değişken NEXT_PUBLIC_ ile başlamaz.
 */

class EnvError extends Error {}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new EnvError(
      `${name} tanımlı değil. Vercel → Settings → Environment Variables altına ekle (şablon: .env.example).`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export type ServerEnv = {
  /** GitHub kullanıcı adı: uygulama ve danışan repolarının sahibi. */
  owner: string;
  /** Uygulama repo'sunun adı (kişisel veri içermez). */
  appRepo: string;
  /** Repo oluşturma/silme yetkili token. Yalnız sunucuda; asla log'lanmaz. */
  githubToken: string;
  /** Yalnız yedek e-posta kodu yolu için; GitHub girişinde kullanılmaz. */
  ptEmail: string;
  /** Oturum çerezlerini imzalayan sır. */
  authSecret: string;
  /** GitHub ile giriş (PT'nin tek giriş yöntemi). */
  github?: { clientId: string; clientSecret: string };
  /** Yalnız yedek e-posta kodu yolu için; yoksa o yol kapalıdır. */
  resendApiKey?: string;
};

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const githubClientId = optional('GITHUB_CLIENT_ID');
  const githubClientSecret = optional('GITHUB_CLIENT_SECRET');
  const resendApiKey = optional('RESEND_API_KEY');

  // Üretimde en az bir giriş yöntemi zorunlu. Yerel geliştirmede ikisi de yoksa giriş kodu
  // e-posta yerine sunucu günlüğüne yazılır (src/lib/mail.ts).
  if (process.env.NODE_ENV === 'production' && !githubClientId && !resendApiKey) {
    throw new EnvError(
      'Giriş yöntemi tanımlı değil: GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET (önerilen) ya da yedek olarak RESEND_API_KEY.',
    );
  }
  if (Boolean(githubClientId) !== Boolean(githubClientSecret)) {
    throw new EnvError('GITHUB_CLIENT_ID ve GITHUB_CLIENT_SECRET birlikte tanımlanmalı.');
  }

  cached = {
    owner: required('GITHUB_OWNER'),
    appRepo: required('APP_REPO'),
    githubToken: required('GITHUB_TOKEN'),
    ptEmail: (optional('PT_EMAIL') ?? '').trim().toLowerCase(),
    authSecret: required('AUTH_SECRET'),
    ...(githubClientId && githubClientSecret
      ? { github: { clientId: githubClientId, clientSecret: githubClientSecret } }
      : {}),
    ...(resendApiKey ? { resendApiKey } : {}),
  };
  return cached;
}

/** Danışan repolarının adı hep bu önekle başlar (koruma kuralı, SPEC §9.2). */
export const CLIENT_REPO_PREFIX = 'client-';
