import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { isCalendarDate } from '@/lib/measurement-log';
import { clientIdSchema } from '@/lib/schemas/client';
import { screeningPutSchema } from '@/lib/schemas/constraint';
import { withoutScreening, withScreening } from '@/lib/screening';

type Context = { params: Promise<{ id: string; date: string }> };

async function target(context: Context): Promise<{ id: string; date: string } | null> {
  const { id, date } = await context.params;
  return v.is(clientIdSchema, id) && isCalendarDate(date) ? { id, date } : null;
}

/** Günün taramasını değiştirir (yoksa 404). */
export async function PUT(request: Request, context: Context) {
  if (!(await isPt())) return forbidden();
  const day = await target(context);
  if (!day) return notFound('Tarama bulunamadı.');
  const parsed = v.safeParse(screeningPutSchema, await readBody(request));
  if (!parsed.success) return invalid(parsed.issues);
  try {
    await updateHealth(day.id, 'screening', (record) => withScreening(record, { date: day.date, ...parsed.output }, { replace: true }), 'Tarama güncellendi');
    return NextResponse.json({ ok: true, date: day.date });
  } catch (error) {
    return failed(error, 'Tarama kaydedilemedi.');
  }
}

/** Günü siler (yoksa 404). Git geçmişinde danışanın repo'sunda kalır. */
export async function DELETE(_request: Request, context: Context) {
  if (!(await isPt())) return forbidden();
  const day = await target(context);
  if (!day) return notFound('Tarama bulunamadı.');
  try {
    await updateHealth(day.id, 'screening', (record) => withoutScreening(record, day.date), 'Tarama silindi');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Tarama silinemedi.');
  }
}
