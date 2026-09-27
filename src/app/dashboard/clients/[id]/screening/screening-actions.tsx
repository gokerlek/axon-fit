'use client';

import { useRouter } from 'next/navigation';
import { Check, Plus, Trash } from '@phosphor-icons/react';
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
import type { ConstraintForm } from '@/lib/schemas/constraint';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/**
 * Taramadaki ağrının iki eylemi (tasarım `kisit-tarama.md` §4.4): "Gördüm" (değerlendirmeye yönlendirdim) ve "Kısıt
 * olarak ekle" (kısa onaydan sonra tanısız hareket kısıtı yazılır, ağrı gözden geçirilmiş olur, kısıtın düzenleme
 * sayfası açılır). Kısıt adreste taşınmaz: yalnız kimliği.
 */
export function PainActions({
  clientId,
  date,
  cellKey,
  title,
  constraint,
  suggestion,
}: {
  clientId: string;
  date: string;
  cellKey: string;
  title: string;
  /** Kısıtlar onaylı değilse yok. */
  constraint: ConstraintForm | null;
  /** "Sağ omuz · kaçın: kol baş üstünde". */
  suggestion: string | null;
}) {
  const router = useRouter();
  const review = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/screenings/${date}/review`, { method: 'POST', body: JSON.stringify({ key: cellKey }) }),
    notify: { success: 'Gözden geçirildi.' },
    onSuccess: () => router.refresh(),
  });
  const add = useServiceMutation({
    fn: () =>
      fetchJson<{ ok: true; id: string }>(`/api/clients/${clientId}/constraints`, {
        method: 'POST',
        body: JSON.stringify({ constraint, fromScreening: { date, key: cellKey } }),
      }),
    notify: { success: 'Kısıt eklendi.' },
    onSuccess: (data) => {
      router.push(`/dashboard/clients/${clientId}/constraints/${data.id}/edit`);
      router.refresh();
    },
  });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate()}>
        {review.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
        Gördüm
      </Button>
      {constraint ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
            <Plus data-icon="inline-start" />
            Kısıt olarak ekle
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}: kısıt eklensin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                {suggestion ?? 'Hareket kısıtı'} · tanısız, taramadan. Kaydedince kısıtın sayfası açılır; bölgeyi, tarafı ve kaçınmaları orada düzelt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction disabled={add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? <Spinner data-icon="inline-start" /> : null}
                Kısıt olarak ekle
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

/** Düzenleme sayfasının yıkıcı eylemi: o günün taramasını siler. */
export function ScreeningDelete({ clientId, date, dateLabel }: { clientId: string; date: string; dateLabel: string }) {
  const router = useRouter();
  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/screenings/${date}`, { method: 'DELETE' }),
    notify: { success: 'Tarama silindi.' },
    onSuccess: () => {
      router.push(`/dashboard/clients/${clientId}/screening`);
      router.refresh();
    },
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" className="text-destructive-text" />}>
        <Trash data-icon="inline-start" />
        Sil
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dateLabel} taraması silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            O günün bütün testleri kayıttan çıkar. Danışanın kaydının değişiklik geçmişinde bir kopyası kalır.
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
