'use client';

import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise, Trash } from '@phosphor-icons/react';
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
 * Düzenleme sayfasının yıkıcı eylemleri (detayda değil, SPEC §6):
 * - hazır aparat → hiçbiri (kaydedince PT'ye özel sürüm oluşur)
 * - hazırın PT sürümü → "Varsayılana dön"
 * - PT'nin kendi aparatı → "Sil"
 */
export function AttachmentActions({
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
    fn: () => fetchJson<{ ok: true }>(`/api/attachments/${id}`, { method: 'DELETE' }),
    invalidate: [['attachments'], ['devices'], ['exercises']],
    notify: { success: overridesLibrary ? 'Varsayılan sürüme dönüldü.' : 'Aparat silindi.' },
    onSuccess: () => {
      // Varsayılana dönüldüyse aparat yerinde durur (hazır sürümüyle); silindiyse listeye dön.
      router.push(overridesLibrary ? `/dashboard/attachments/${id}` : '/dashboard/attachments');
      router.refresh();
    },
  });

  if (source !== 'custom') return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant={overridesLibrary ? 'outline' : 'destructive'} />}>
        {overridesLibrary ? <ArrowCounterClockwise data-icon="inline-start" /> : <Trash data-icon="inline-start" />}
        {overridesLibrary ? 'Varsayılana dön' : 'Sil'}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{overridesLibrary ? `"${title}" varsayılana dönsün mü?` : `"${title}" silinsin mi?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {overridesLibrary
              ? 'Adı ve fotoğrafı hazır havuzdaki haline döner.'
              : 'Fotoğrafı da silinir. Bu aparatı seçmiş cihazlardan ve egzersizlerden düşer; antrenman kaydı etkilenmez.'}
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
  );
}
