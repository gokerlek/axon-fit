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
 * - hazır cihaz → yalnız "Düzenle" (kaydedince PT'ye özel sürüm oluşur)
 * - hazır cihazın PT sürümü → "Düzenle" + "Varsayılana dön" (PT sürümü silinir, hazırı geri gelir)
 * - PT'nin kendi cihazı → "Düzenle" + "Sil" (bağlı egzersizler cihazsız kalır)
 */
export function DeviceActions({
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
    fn: () => fetchJson<{ ok: true }>(`/api/devices/${id}`, { method: 'DELETE' }),
    invalidate: [['devices'], ['exercises']],
    notify: { success: overridesLibrary ? 'Varsayılan sürüme dönüldü.' : 'Cihaz silindi.' },
    onSuccess: () => {
      // Varsayılana dönüldüyse cihaz yerinde durur (hazır sürümüyle); silindiyse listeye dön.
      router.push(overridesLibrary ? `/dashboard/devices/${id}` : '/dashboard/devices');
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/devices/${id}/edit`} />}>
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
                  ? 'Yaptığın değişiklikler kalkar, hazır katalogdaki ayarlar geri gelir.'
                  : 'Bu cihaza bağlı egzersizler cihazsız kalır ve kendi ağırlık adımlarıyla devam eder. Git geçmişinde kaydı durur.'}
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
