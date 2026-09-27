import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { isCalendarDate } from '@/lib/measurement-log';
import { clientIdSchema } from '@/lib/schemas/client';
import { screeningReviewSchema } from '@/lib/schemas/constraint';
import { withPainReviewed } from '@/lib/screening';

/** "Gördüm" (tasarım §4.4): ağrılı hücre gözden geçirildi; Dikkat maddesi kalkar. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; date: string }> }) {
  if (!(await isPt())) return forbidden();
  const { id, date } = await params;
  if (!v.is(clientIdSchema, id) || !isCalendarDate(date)) return notFound('Tarama bulunamadı.');
  const parsed = v.safeParse(screeningReviewSchema, await readBody(request));
  if (!parsed.success) return invalid(parsed.issues);
  try {
    await updateHealth(id, 'screening', (record) => withPainReviewed(record, date, parsed.output.key, new Date().toISOString()), 'Tarama güncellendi');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Kaydedilemedi.');
  }
}
