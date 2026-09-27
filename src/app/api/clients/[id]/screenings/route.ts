import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { clientIdSchema } from '@/lib/schemas/client';
import { screeningPostSchema } from '@/lib/schemas/constraint';
import { withScreening } from '@/lib/screening';

/**
 * Hareket taraması günü (tasarım `kisit-tarama.md` §4.5, §5.5) → 201; aynı gün varsa günceller. Yalnız doldurulan
 * testler kaydedilir; gelecek gün girilemez. Onay veri katmanında denetlenir.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPt())) return forbidden();
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return notFound('Danışan bulunamadı.');
  const parsed = v.safeParse(screeningPostSchema, await readBody(request));
  if (!parsed.success) return invalid(parsed.issues);
  const { timeZone } = await readAppConfig();
  if (parsed.output.date > todayIn(timeZone)) {
    return NextResponse.json({ error: 'Bilgileri kontrol et.', fields: { date: 'Gelecek bir güne tarama girilemez.' } }, { status: 400 });
  }
  try {
    await updateHealth(id, 'screening', (record) => withScreening(record, parsed.output), 'Tarama kaydedildi');
    return NextResponse.json({ ok: true, date: parsed.output.date }, { status: 201 });
  } catch (error) {
    return failed(error, 'Tarama kaydedilemedi.');
  }
}
