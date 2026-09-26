'use client';

import { useRouter } from 'next/navigation';
import { setInput, useField } from '@formisch/react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { WeekdayToggle } from '@/components/weekday-toggle';
import { formatDate, formatNumber } from '@/lib/format';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { frequencyMismatch, normalizeWeekdays, weekdaysText } from '@/lib/training-days';
import { cn } from '@/lib/utils';
import type { ProgramFormStore } from './program-form';

/** Danışanın değiştirdiği günler (kayıttaki `clientSchedule`); yoksa null. */
export type ClientDays = { weekdays: number[]; at: string } | null;

/**
 * [PT'nin günlerine dön]: danışanın günleri silinir, PT'nin günleri geçerli olur; hemen yazılır, revision
 * artmaz (aynı sayfadaki açık düzenleme 412 almaz). Program geçmişine yazılır.
 */
export function ResetDaysButton({ clientId, className }: { clientId: string; className?: string }) {
  const router = useRouter();
  const reset = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/program/schedule`, { method: 'POST', body: JSON.stringify({ action: 'reset' }) }),
    notify: { success: 'Danışanın günleri kaldırıldı; senin günlerin geçerli.' },
    onSuccess: () => router.refresh(),
  });
  return (
    <Button type="button" variant="ghost" size="sm" className={cn('touch:h-11', className)} disabled={reset.isPending} onClick={() => reset.mutate()}>
      {reset.isPending ? <Spinner data-icon="inline-start" /> : <ArrowCounterClockwise data-icon="inline-start" />}
      PT&apos;nin günlerine dön
    </Button>
  );
}

/**
 * Antrenman günleri (tasarım §2.11, PT kararı 12): "Haftada kaç gün"ün altında haftanın 7 günü (çoklu,
 * 44 px). Program günlere çakılmaz: A → B → C sırası seçilen günlere dağılır. Seçilen gün sayısı haftalık
 * sıklıktan farklıysa küçük uyarı; engel değil. Danışan kendi günlerini seçtiyse "Danışan değiştirdi"
 * rozeti ve [PT'nin günlerine dön] (hemen yazılır, revision artmaz: açık düzenleme 412 almaz). Günleri
 * değiştirip kaydetmek de danışanın seçimini kaldırır (son söz PT'nin).
 */
export function WeekdayField({
  form,
  clientId,
  daysPerWeek,
  client,
  timeZone,
  className,
}: {
  form: ProgramFormStore;
  clientId: string;
  /** Şu anki evrenin sıklığı (uyarı için). */
  daysPerWeek: number | undefined;
  client: ClientDays;
  timeZone: string;
  className?: string;
}) {
  const field = useField(form, { path: ['weekdays'] });
  const weekdays = normalizeWeekdays(field.input ?? []);
  const mismatch = frequencyMismatch(weekdays, daysPerWeek);
  return (
    <Field data-invalid={Boolean(field.errors) || undefined} className={cn('gap-1.5', className)}>
      <FieldLabel id="program-weekdays-label">Antrenman günleri</FieldLabel>
      <WeekdayToggle
        id="program-weekdays-label"
        value={weekdays}
        invalid={Boolean(field.errors)}
        onChange={(next) => setInput(form, { path: ['weekdays'], input: next })}
        className="max-w-sm"
      />
      <FieldDescription>
        {mismatch
          ? `${formatNumber(weekdays.length)} gün seçili; haftalık sıklık ${formatNumber(daysPerWeek ?? 0)} gün.`
          : 'Danışan Bugün ekranında hangi günlerin antrenman günü olduğunu görür; günler sırayı değiştirmez.'}
      </FieldDescription>
      {client ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Danışan değiştirdi · {weekdaysText(client.weekdays)}</Badge>
          <span className="text-xs text-muted-foreground">{formatDate(client.at, timeZone)}</span>
          <ResetDaysButton clientId={clientId} />
        </div>
      ) : null}
      <FieldError>{field.errors?.[0]}</FieldError>
    </Field>
  );
}
