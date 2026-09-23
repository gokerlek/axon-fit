import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { addMeasurementDay } from '@/lib/health';
import { clientIdSchema } from '@/lib/schemas/client';
import { measurementAddSchema } from '@/lib/schemas/measurement';
import { readSession } from '@/lib/session';
import { checkDay, failed, forbidden, invalid } from './respond';

/**
 * Bir güne ölçüm ekler (yalnız PT). Aynı gün aynı ölçüm varsa yenisi geçer, diğerleri kalır.
 * Modül ve danışan onayı veri katmanında, danışan kaydı taze okunarak denetlenir (SPEC §4).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await readSession())?.role !== 'pt') return forbidden();

  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: 'Danışan bulunamadı.' }, { status: 404 });

  const parsed = v.safeParse(measurementAddSchema, await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.issues);

  const { date, sex } = parsed.output;
  const checked = await checkDay(date, parsed.output.values);
  if ('response' in checked) return checked.response;

  try {
    await addMeasurementDay(id, { date, sex, values: checked.values });
    return NextResponse.json({ ok: true, date }, { status: 201 });
  } catch (error) {
    return failed(error, 'Ölçüm kaydedilemedi.');
  }
}
