import { NextResponse } from 'next/server';
import * as v from 'valibot';
import {
  ackClientChange,
  clearConstraint,
  confirmAsIs,
  CONSTRAINT_ID_PATTERN,
  declineReport,
  editConstraint,
  referConstraint,
  removeConstraint,
  reopenConstraint,
  resolveConstraint,
} from '@/lib/constraints';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { clientIdSchema } from '@/lib/schemas/client';
import { constraintPatchSchema, type ConstraintPatch } from '@/lib/schemas/constraint';
import type { HealthRecord } from '@/lib/schemas/health';

type Context = { params: Promise<{ id: string; kid: string }> };

async function target(context: Context): Promise<{ id: string; kid: string } | null> {
  const { id, kid } = await context.params;
  return v.is(clientIdSchema, id) && CONSTRAINT_ID_PATTERN.test(kid) ? { id, kid } : null;
}

/** Eylem → kaydın yeni hali (saf eylemler `constraints.ts`'te). */
function apply(record: HealthRecord, kid: string, patch: ConstraintPatch, now: string): HealthRecord {
  const base = { now, baseUpdatedAt: patch.baseUpdatedAt };
  switch (patch.action) {
    case 'edit':
      return editConstraint(record, kid, patch.constraint, base);
    case 'confirm_as_is':
      return confirmAsIs(record, kid, base);
    case 'decline':
      return declineReport(record, kid, { ...base, note: patch.note });
    case 'resolve':
      return resolveConstraint(record, kid, base);
    case 'reopen':
      return reopenConstraint(record, kid, base);
    case 'ack_change':
      return ackClientChange(record, kid, { ...base, close: patch.close });
    case 'refer':
      return referConstraint(record, kid, { ...base, date: patch.date });
    case 'clear':
      return clearConstraint(record, kid, { ...base, date: patch.date, basis: patch.basis, scope: patch.scope });
  }
}

/**
 * Kısıtın eylemleri (tasarım §5.5): düzenle, olduğu gibi onayla, kaydetmeden kapat, kapat, yeniden aç, danışanın
 * güncellemesini gördü, yönlendirme, görüş. Kısıt o arada değiştiyse (`baseUpdatedAt`) 412.
 */
export async function PATCH(request: Request, context: Context) {
  if (!(await isPt())) return forbidden();
  const found = await target(context);
  if (!found) return notFound('Kısıt bulunamadı.');
  const parsed = v.safeParse(constraintPatchSchema, await readBody(request));
  if (!parsed.success) return invalid(parsed.issues);

  try {
    await updateHealth(found.id, 'conditions', (record) => apply(record, found.kid, parsed.output, new Date().toISOString()), 'Kısıt güncellendi');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Kısıt kaydedilemedi.');
  }
}

/** Yanlış kaydı çıkarır (kayıtta "silindi"; izinleri de). Git geçmişinde danışanın repo'sunda kalır. */
export async function DELETE(_request: Request, context: Context) {
  if (!(await isPt())) return forbidden();
  const found = await target(context);
  if (!found) return notFound('Kısıt bulunamadı.');
  try {
    await updateHealth(found.id, 'conditions', (record) => removeConstraint(record, found.kid, { now: new Date().toISOString() }), 'Kısıt silindi');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, 'Kısıt silinemedi.');
  }
}
