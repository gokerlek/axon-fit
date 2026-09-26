'use client';

import { useRouter } from 'next/navigation';
import { Trash } from '@phosphor-icons/react';
import { discardDraft } from '@/components/block-editor/editor-draft';
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
import { templateDraftKey } from '@/lib/unsaved-changes';

/** Düzenleme sayfasının yıkıcı eylemi (detayda değil, SPEC §6): şablon dosyasını siler. */
export function TemplateActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/templates/${id}`, { method: 'DELETE' }),
    invalidate: [['templates']],
    notify: { success: 'Şablon silindi.' },
    onSuccess: () => {
      discardDraft(templateDraftKey(id));
      router.push('/dashboard/templates');
      router.refresh();
    },
  });

  return (
    <AlertDialog>
      {/* Başlıktaki tek renkli düğme yıkıcı olmasın: ikincil görünüm, yalnız metni kırmızı. */}
      <AlertDialogTrigger
        render={<Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" />}>
        <Trash data-icon="inline-start" />
        Sil
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>&quot;{name}&quot; silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>Şablon dosyası uygulama repo&apos;ndan silinir; git geçmişinde kaydı durur.</AlertDialogDescription>
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
