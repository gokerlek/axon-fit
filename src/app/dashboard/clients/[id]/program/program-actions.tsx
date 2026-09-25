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
import { programDraftKey } from '@/lib/unsaved-changes';

/** Düzenleme sayfasının yıkıcı eylemi (detayda değil, SPEC §6): danışanın programını siler. */
export function ProgramActions({ clientId }: { clientId: string }) {
  const router = useRouter();

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/program`, { method: 'DELETE' }),
    notify: { success: 'Program silindi.' },
    onSuccess: () => {
      // Silinen programın taslağı "Program oluştur"da sunulmasın.
      discardDraft(programDraftKey(clientId));
      router.push(`/dashboard/clients/${clientId}`);
      router.refresh();
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash data-icon="inline-start" />
        Programı sil
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Program silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            program.json danışanın repo&apos;sundan silinir; danışanın ekranında program görünmez. Geçmişi git&apos;te durur,
            geçmiş antrenman kayıtları etkilenmez.
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
