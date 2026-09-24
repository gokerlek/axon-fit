import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { deleteMeasurementDay, replaceMeasurementDay } from '@/lib/health';
import { isCalendarDate } from '@/lib/measurement-log';
import { clientIdSchema } from '@/lib/schemas/client';
import { measurementDaySchema } from '@/lib/schemas/measurement';
import { readPtSession } from '@/lib/session';
import { checkDay, failed, forbidden, invalid } from '../respond';

type Context = { params: Promise<{ id: string; date: string }> };

async function target(context: Context): Promise<{ id: string; date: string } | null> {
  const { id, date } = await context.params;
  return v.is(clientIdSchema, id) && isCalendarDate(date) ? { id, date } : null;
}

/** Günün değerlerini verilenlerle değiştirir (yalnız PT); boşaltılan alan kayıttan çıkar. */
export async function PUT(request: Request, context: Context) {
  if ((await readPtSession())?.role !== 'pt') return forbidden();
  const day = await target(context);
  if (!day) return NextResponse.json({ error: 'Ölçüm bulunamadı.' }, { status: 404 });

  const parsed = v.safeParse(measurementDaySchema, await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.issues);

  const checked = await checkDay(day.date, parsed.output.values);
  if ('response' in checked) return checked.response;

  try {
    await replaceMeasurementDay(day.id, { date: day.date, sex: parsed.output.sex, values: checked.values });
    return NextResponse.json({ ok: true, date: day.date });
  } catch (error) {
    return failed(error, 'Ölçüm kaydedilemedi.');
  }
}

/** Günün bütün ölçümlerini siler (yalnız PT). Git geçmişinde danışanın repo'sunda kalır. */
export async function DELETE(_request: Request, context: Context) {
  if ((await readPtSession())?.role !== 'pt') return forbidden();
  const day = await target(context);
  if (!day) return NextResponse.json({ error: 'Ölçüm bulunamadı.' }, { status: 404 });

  try {
    await deleteMeasurementDay(day.id, day.date);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Ölçüm silinemedi.');
  }
}
