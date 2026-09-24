import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { ATTACHMENT_LIBRARY } from '@/data/attachment-library';
import { listAttachments, readCustomAttachments, writeCustomAttachments } from '@/lib/attachments';
import { slugify } from '@/lib/exercises';
import { GithubError } from '@/lib/github/client';
import { attachmentSaveSchema } from '@/lib/schemas/attachment';
import { readAnySession, readPtSession } from '@/lib/session';

function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

export async function GET() {
  if (!(await readAnySession())) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });
  try {
    return NextResponse.json({ attachments: await listAttachments() });
  } catch (error) {
    return failed(error, 'Aparatlar okunamadı.');
  }
}

/** Yeni aparat ya da (kimlikle) güncelleme. Hazır bir aparatı değiştirmek PT'nin sürümünü oluşturur. */
export async function POST(request: Request) {
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const parsed = v.safeParse(attachmentSaveSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 });
  }

  const { id: requestedId, name } = parsed.output;
  try {
    const { items, sha } = await readCustomAttachments();
    if (requestedId) {
      const index = items.findIndex((item) => item.id === requestedId);
      const stored = items[index] ?? ATTACHMENT_LIBRARY.find((item) => item.id === requestedId);
      if (!stored) return NextResponse.json({ error: 'Aparat bulunamadı.' }, { status: 404 });
      // Fotoğraf yalnız görsel ucundan yazılır; kayıtlı olan korunur.
      const entry = { id: requestedId, name, ...(stored.image ? { image: stored.image } : {}) };
      const next = index >= 0 ? items.map((item, i) => (i === index ? entry : item)) : [...items, entry];
      await writeCustomAttachments(next, `Aparat güncellendi: ${name}`, sha);
      return NextResponse.json({ id: requestedId });
    }
    const taken = new Set([...items.map((item) => item.id), ...ATTACHMENT_LIBRARY.map((item) => item.id)]);
    const id = slugify(name, taken);
    await writeCustomAttachments([...items, { id, name }], `Aparat eklendi: ${name}`, sha);
    return NextResponse.json({ id });
  } catch (error) {
    return failed(error, 'Aparat kaydedilemedi.');
  }
}
