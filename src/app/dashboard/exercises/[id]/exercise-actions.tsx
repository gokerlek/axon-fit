'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise, PencilSimple, Trash } from '@phosphor-icons/react';
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
 * Detay sayfası eylemleri. Üç durum:
 * - hazır egzersiz → yalnız "Düzenle" (kaydedince PT'ye özel sürüm oluşur)
 * - hazır egzersizin PT sürümü → "Düzenle" + "Varsayılana dön" (PT sürümü silinir, hazırı geri gelir)
 * - PT'nin kendi egzersizi → "Düzenle" + "Sil"
 */
export function ExerciseActions({
  id,
  title,
  source,
  overridesLibrary,
}: {
  id: string;
  title: string;
  source: 'library' | 'custom';
  overridesLibrary: boolean;
}) {
  const router = useRouter();

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/exercises/${id}`, { method: 'DELETE' }),
    invalidate: [['exercises']],
    notify: { success: overridesLibrary ? 'Varsayılan sürüme dönüldü.' : 'Egzersiz silindi.' },
    onSuccess: () => {
      // Varsayılana dönüldüyse egzersiz yerinde durur (hazır sürümüyle); silindiyse listeye dön.
      router.push(overridesLibrary ? `/dashboard/exercises/${id}` : '/dashboard/exercises');
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/exercises/${id}/edit`} />}>
        <PencilSimple data-icon="inline-start" />
        Düzenle
      </Button>

      {source === 'custom' ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant={overridesLibrary ? 'outline' : 'destructive'} />}>
            {overridesLibrary ? <ArrowCounterClockwise data-icon="inline-start" /> : <Trash data-icon="inline-start" />}
            {overridesLibrary ? 'Varsayılana dön' : 'Sil'}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {overridesLibrary ? `"${title}" varsayılana dönsün mü?` : `"${title}" silinsin mi?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {overridesLibrary
                  ? 'Yaptığın değişiklikler kalkar, hazır kütüphanedeki sürüm geri gelir.'
                  : 'Bu egzersizi kullanan şablonlar varsa oradan da kaldırman gerekir. Git geçmişinde kaydı durur.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                variant={overridesLibrary ? 'default' : 'destructive'}
                disabled={remove.isPending}
                onClick={() => remove.mutate()}>
                {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
                {overridesLibrary ? 'Varsayılana dön' : 'Sil'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
