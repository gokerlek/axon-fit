import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { readPtSession } from '@/lib/session';
import { GithubError } from '@/lib/github/client';
import { readAppConfig, writeAppConfig } from '@/lib/config';
import { setupFormSchema } from '@/lib/schemas/setup';

/** Marka ayarını kaydeder (kurulum sihirbazı ve Ayarlar → Görünüm). */
export async function POST(request: Request) {
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
  }

  const parsed = v.safeParse(setupFormSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    // Alan bazlı hatalar forma basılır (applyFieldErrors).
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }

  try {
    const current = await readAppConfig();
    await writeAppConfig(
      { ...current, ...parsed.output, setupCompleted: true },
      current.setupCompleted ? 'Görünüm ayarları güncellendi' : 'Kurulum tamamlandı',
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Ayar kaydedilemedi.' },
      { status: failure?.status ?? 502 },
    );
  }
}
