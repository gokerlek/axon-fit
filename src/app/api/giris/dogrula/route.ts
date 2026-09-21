import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { serverEnv } from '@/lib/env';
import { consumeOtp, createSession } from '@/lib/session';
import { dogrulaGovdeSchema } from '@/lib/schemas/auth';

const messages = {
  expired: 'Kodun süresi doldu. Yeni kod iste.',
  invalid: 'Kod hatalı.',
  too_many: 'Çok fazla deneme yapıldı. Yeni kod iste.',
} as const;

export async function POST(request: Request) {
  const parsed = v.safeParse(dogrulaGovdeSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: messages.invalid }, { status: 400 });
  }

  const { email, code } = parsed.output;
  const result = await consumeOtp(code, email);
  if (!result.ok) {
    return NextResponse.json({ error: messages[result.reason] }, { status: 400 });
  }

  // Kod doğru olsa bile yönetici adresi değilse oturum açılmaz.
  if (email !== serverEnv().ptEmail) {
    return NextResponse.json({ error: messages.invalid }, { status: 400 });
  }

  await createSession({ role: 'pt', via: 'email', subject: email });
  return NextResponse.json({ ok: true });
}
