import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Info, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { loadClient } from '@/lib/clients';
import { MEASUREMENT_LOCK_INFO, type MeasurementLock } from '@/lib/measurement-log';
import type { Client } from '@/lib/schemas/client';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';

/** Ölçüm sayfalarının ortak parçaları (yalnız sunucu). */

/** Danışan kaydı; kimlik geçersiz ya da danışan yoksa 404. Kayıt okunamıyorsa sorunu. */
export async function measurementClient(id: string): Promise<{ ok: true; client: Client } | { ok: false; problem: string }> {
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  return loaded;
}

/** Modül kapalı ya da onay yoksa formun ve grafiklerin yerine: neden ve ne yapılmalı. */
export function MeasurementLockAlert({ lock, clientId }: { lock: MeasurementLock; clientId: string }) {
  const info = MEASUREMENT_LOCK_INFO[lock];
  // Modülü PT açar (düzenleme sayfası); onay danışanın elinde (danışan sayfasında durumu görünür).
  const byPt = lock === 'off' || lock === 'not_selected';
  return (
    <Alert>
      <Info weight="fill" />
      <AlertTitle>{info.title}</AlertTitle>
      <AlertDescription>
        <p>{info.description}</p>
        <p>
          <Link href={byPt ? `/dashboard/clients/${clientId}/edit` : `/dashboard/clients/${clientId}`}>
            {byPt ? 'Danışanın düzenleme sayfasına git' : 'Danışanın sayfasına dön'}
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function MeasurementProblemAlert({ title, problem }: { title: string; problem: string }) {
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{problem}</AlertDescription>
    </Alert>
  );
}
