import 'server-only';
import { NextResponse } from 'next/server';
import type * as v from 'valibot';
import { ConstraintError } from './constraints';
import { GithubError } from './github/client';
import { readPtSession } from './session';

/**
 * Kısıt ve tarama uçlarının ortak yanıtları (ölçüm uçlarının `respond.ts`'iyle aynı desen). Hata mesajları değer
 * taşımaz: sağlık verisi yanıta ya da günlüğe sızmasın (yalnız alanın adı ve kural).
 */

export async function isPt(): Promise<boolean> {
  return (await readPtSession())?.role === 'pt';
}

export function forbidden() {
  return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
}

export function notFound(message = 'Bulunamadı.') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function failed(error: unknown, fallback: string) {
  if (error instanceof ConstraintError) return NextResponse.json({ error: error.message }, { status: error.status });
  const failure = error instanceof GithubError ? error : null;
  if (!failure) console.error(`[sağlık] ${fallback}`, error instanceof Error ? error.name : 'bilinmeyen hata');
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

/** Şema hataları alan yoluyla ("constraint.side"); form alanın altında gösterir. */
export function invalid(issues: readonly v.BaseIssue<unknown>[]) {
  const fields: Record<string, string> = {};
  let message = 'Bilgileri kontrol et.';
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? '';
    if (!key) message = issue.message;
    else if (!fields[key]) fields[key] = issue.message;
  }
  return NextResponse.json({ error: message, fields }, { status: 400 });
}

export async function readBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
