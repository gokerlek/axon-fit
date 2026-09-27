import 'server-only';
import Link from 'next/link';
import { Info } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { canRecordHealth } from '@/lib/client-status';
import { pendingReports } from '@/lib/constraints';
import { healthLockInfo, type HealthLock } from '@/lib/measurement-log';
import type { Client, HealthField } from '@/lib/schemas/client';
import type { HealthRecord } from '@/lib/schemas/health';
import { painHistory } from '@/lib/screening';
import { HealthTabs } from './health-tabs';

/** "Sağlık" sayfalarının ortak parçaları (yalnız sunucu): alt şerit ve kilit uyarısı. */

/**
 * Bekleyen işleri olan parçalar (şeritteki nokta): karar bekleyen danışan bildirimi, taramada açık ağrı (gözden
 * geçirilmemiş, sonra ağrısız test edilmemiş; `painHistory`). Yalnız o parçanın onayı sürdükçe ve kayıt zaten okunduysa.
 */
export function healthPending(client: Client, record: HealthRecord | null): HealthField[] {
  if (!record) return [];
  const pending: HealthField[] = [];
  if (canRecordHealth(client, 'conditions') && pendingReports(record).length > 0) pending.push('conditions');
  if (canRecordHealth(client, 'screening') && painHistory(record.screenings ?? []).open.length > 0) pending.push('screening');
  return pending;
}

export function HealthStrip({ client, record }: { client: Client; record: HealthRecord | null }) {
  const selected = client.modules.health.enabled ? client.modules.health.fields : [];
  return <HealthTabs clientId={client.id} selected={selected} pending={healthPending(client, record)} />;
}

/** Parça kilitliyse içeriğin yerine: neden ve ne yapılmalı (ölçümlerdeki uyarının parçalı hali). */
export function HealthLockAlert({ field, lock, clientId }: { field: HealthField; lock: HealthLock; clientId: string }) {
  const info = healthLockInfo(field, lock);
  const byPt = lock === 'off' || lock === 'not_selected';
  return (
    <Alert>
      <Info weight="fill" />
      <AlertTitle>{info.title}</AlertTitle>
      <AlertDescription>
        <p>{info.description}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          nativeButton={false}
          render={<Link href={byPt ? `/dashboard/clients/${clientId}/edit` : `/dashboard/clients/${clientId}`} />}>
          {byPt ? 'Danışanın düzenleme sayfasına git' : 'Danışanın sayfasına dön'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
