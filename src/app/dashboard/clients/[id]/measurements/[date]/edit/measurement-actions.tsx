'use client';

import { useRouter } from 'next/navigation';
import { Trash } from '@phosphor-icons/react';
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

/** Düzenleme sayfasının yıkıcı eylemi (SPEC §6): o günün bütün ölçümlerini siler. */
export function MeasurementActions({ clientId, date, dateLabel }: { clientId: string; date: string; dateLabel: string }) {
  const router = useRouter();
  const base = `/dashboard/clients/${clientId}/measurements`;

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/measurements/${date}`, { method: 'DELETE' }),
    notify: { success: 'O günün ölçümleri silindi.' },
    onSuccess: () => {
      router.push(base);
      router.refresh();
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash data-icon="inline-start" />
        Sil
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dateLabel} ölçümleri silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            O günün bütün değerleri kayıttan ve grafiklerden çıkar. Danışanın repo&apos;sunun git geçmişinde kalır; tamamen
            gitmesi için danışanın kendisi silinmelidir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
            Sil
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
