'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarCheck } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/**
 * Evre süresi doldu: sonraki evreye geçiş önerisi. PT onaylar, geçiş hemen yazılır ve
 * program geçmişine girer. Görünüm sayfasındaki tek yazma — SPEC §6'nın onaylı istisnası
 * (evre geçişini PT onaylar, SPEC §7.4).
 */
export function PhaseTransition({
  clientId,
  phaseName,
  description,
  next,
  revision,
  createdAt,
}: {
  clientId: string;
  phaseName: string;
  /** "2 hafta planlanmıştı; … tarihinde başladı. Sıradaki evre: '…'." (sunucuda biçimlenir). */
  description: string;
  next: { id: string; name: string };
  revision: number;
  /** Programın oluşturulma anı: silinip yeniden oluşturulan program (revision yine 1) da 412 verir. */
  createdAt: string;
}) {
  const router = useRouter();

  const advance = useServiceMutation({
    fn: () =>
      fetchJson<{ revision: number }>(`/api/clients/${clientId}/program/phase`, {
        method: 'POST',
        body: JSON.stringify({ phaseId: next.id, baseRevision: revision, baseCreatedAt: createdAt }),
      }),
    notify: { success: `'${next.name}' evresine geçildi.` },
    onSuccess: () => router.refresh(),
    onError: (error) => {
      // Program o arada değişti: güncel hâli yüklensin, öneri yeniden hesaplansın.
      if (error.status === 412) router.refresh();
    },
  });

  return (
    <Alert>
      <CalendarCheck weight="fill" />
      <AlertTitle>&apos;{phaseName}&apos; evresinin süresi doldu</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <div className="col-start-2 mt-2">
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" />}>
            <ArrowRight data-icon="inline-start" />
            Sonraki evreye geç
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>&apos;{next.name}&apos; evresine geçilsin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                Danışanın sıradaki antrenmanı bu evrenin ilk günü olur. Geçiş program geçmişine yazılır.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction disabled={advance.isPending} onClick={() => advance.mutate()}>
                {advance.isPending ? <Spinner data-icon="inline-start" /> : null}
                Geç
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Alert>
  );
}
