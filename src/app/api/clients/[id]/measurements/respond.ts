import 'server-only';
import { NextResponse } from 'next/server';
import type * as v from 'valibot';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { GithubError } from '@/lib/github/client';
import { checkValues, type MeasurementValue } from '@/lib/measurement-log';

/**
 * Ölçüm uçlarının ortak yanıtları. Hata mesajları değer taşımaz: sağlık verisi yanıta ya da
 * günlüğe sızmasın (yalnız alanın adı ve kural).
 */

export function forbidden() {
  return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });
}

export function failed(error: unknown, fallback: string) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: failure?.message ?? fallback }, { status: failure?.status ?? 502 });
}

/** Şema hataları: üst düzey alanlar (tarih, cinsiyet) formda alanın altında görünür. */
export function invalid(issues: readonly v.BaseIssue<unknown>[]) {
  const fields: Record<string, string> = {};
  let message = 'Bilgileri kontrol et.';
  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (key === 'values') {
      // Değer listesi form alanlarıyla birebir değil; genel mesaj olarak döner.
      if (issue.path?.length === 1) message = issue.message;
      continue;
    }
    if (typeof key === 'string' && !fields[key]) fields[key] = issue.message;
  }
  return NextResponse.json({ error: message, fields }, { status: 400 });
}

/**
 * Değerleri ve günü denetler: taraf kuralı, aralık, tekrar ve gelecek gün. Sorun varsa
 * gönderilecek yanıt, yoksa temizlenmiş değerler.
 */
export async function checkDay(
  date: string,
  values: readonly MeasurementValue[],
): Promise<{ response: NextResponse } | { values: MeasurementValue[] }> {
  const checked = checkValues(values);
  const fields: Record<string, string> = Object.fromEntries(
    Object.entries(checked.errors).map(([key, message]) => [`values.${key}`, message]),
  );
  const { timeZone } = await readAppConfig();
  if (date > todayIn(timeZone)) fields.date = 'Gelecek bir güne ölçüm girilemez.';
  if (Object.keys(fields).length > 0) {
    return { response: NextResponse.json({ error: 'Bilgileri kontrol et.', fields }, { status: 400 }) };
  }
  return { values: checked.values };
}
