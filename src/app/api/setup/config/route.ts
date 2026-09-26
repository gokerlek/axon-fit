import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { readPtSession } from '@/lib/session';
import { GithubError } from '@/lib/github/client';
import { configStore } from '@/lib/config';
import { ConfigUnavailableError, saveAppearance } from '@/lib/config-update';
import { setupFormSchema } from '@/lib/schemas/setup';

/**
 * Marka ayarını kaydeder (kurulum sihirbazı ve Ayarlar → Görünüm).
 *
 * Kurulumun ilk kaydında veri repo'su önce hazırlanır, sonraki kayıtlarda yalnız denetlenir;
 * açık ya da fork ise kayıt durur ve sebep PT'ye döner (409). Ayar geçici olarak okunamazsa
 * hiçbir şey yazılmaz (503, "tekrar dene"); GitHub anahtarı geçersizse bu açıkça söylenir.
 * Sebep sunucu günlüğüne de yazılır. Kurallar ve sıra `config-update.ts`'te, orada test edilir.
 */
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
    await saveAppearance(configStore(), parsed.output);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError || error instanceof ConfigUnavailableError ? error : null;
    return NextResponse.json(
      { error: failure?.message ?? 'Ayar kaydedilemedi.' },
      { status: failure?.status ?? 502 },
    );
  }
}
