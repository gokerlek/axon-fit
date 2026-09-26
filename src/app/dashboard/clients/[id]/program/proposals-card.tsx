'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Lightbulb, X } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { PROPOSAL_LIMITS } from '@/lib/proposals';
import { programDraftKey } from '@/lib/unsaved-changes';
import { cn } from '@/lib/utils';

/** Kartın satırı (sunucuda hazırlanır). */
export type ProposalView = {
  id: string;
  /** Önerinin sürümü: kararla gönderilir, o arada değiştiyse sunucu reddeder. */
  sessionId: string;
  text: string;
  why?: string;
  /** "Gün A · 26 Eylül 2026". */
  meta: string;
  kindLabel: string;
  /** 30 günden eski: soluk. */
  faded: boolean;
};

function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/** Düzenleyicide bu programın kaydedilmemiş taslağı var mı (bu tarayıcıda). */
function useDraftExists(clientId: string): boolean {
  return useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return window.localStorage.getItem(programDraftKey(clientId)) !== null;
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/**
 * "Danışandan öneriler (n)" (tasarım §6.4): danışanın Program sekmesinde en üstte. Set sayısı ve yapı
 * değişiklikleri (bitişteki "Programını güncelleyelim mi?"dan) PT'nin onayını bekler. [Uygula] öneriyi
 * programa yazar (kaydın yolu: fark, revision +1, geçmişe "Danışanın önerisi"); [Reddet] isteğe bağlı notla.
 * Önerinin dayandığı satır o arada değiştiyse uygulanmaz ("Program değişti; öneri uygulanamadı"). Düzenleyicide
 * kaydedilmemiş taslak varsa önce sorulur: uygulamak revision'ı artırır, taslak kaydederken çakışır.
 * 30 günden eski öneri soluk görünür, silinmez. Danışan kararı Bugün'de görür.
 */
export function ProposalsCard({ clientId, items }: { clientId: string; items: ProposalView[] }) {
  const router = useRouter();
  const draft = useDraftExists(clientId);
  const [confirm, setConfirm] = useState<ProposalView | null>(null);
  const [declining, setDeclining] = useState<ProposalView | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const approve = useServiceMutation({
    fn: (item: ProposalView) =>
      fetchJson<{ revision: number }>(`/api/clients/${clientId}/proposals/${item.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', sessionId: item.sessionId }),
      }),
    notify: { success: 'Öneri programa yazıldı.' },
    onMutate: (item) => setBusy(item.id),
    onSettled: () => {
      setBusy(null);
      setConfirm(null);
      // Uygulanamayan (stale) öneri de listeden düşer.
      router.refresh();
    },
  });

  const decline = useServiceMutation({
    fn: (input: { item: ProposalView; note: string }) =>
      fetchJson(`/api/clients/${clientId}/proposals/${input.item.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'decline', sessionId: input.item.sessionId, ...(input.note.trim() ? { note: input.note.trim() } : {}) }),
      }),
    notify: { success: 'Öneri reddedildi; danışan görecek.' },
    onMutate: (input) => setBusy(input.item.id),
    onSettled: () => {
      setBusy(null);
      setDeclining(null);
      setNote('');
      router.refresh();
    },
  });

  const onApprove = (item: ProposalView) => {
    if (draft) setConfirm(item);
    else approve.mutate(item);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb weight="fill" className="size-5 text-primary-text" aria-hidden />
          Danışandan öneriler ({items.length})
        </CardTitle>
        <CardDescription>Uygularsan programa yazılır ve geçmişe girer; reddedersen danışan görür.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className={cn('flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between', item.faded && 'opacity-60')}>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.text}</span>
                  <Badge variant="outline">{item.kindLabel}</Badge>
                  {item.faded ? <Badge variant="secondary">30 günden eski</Badge> : null}
                </div>
                {item.why ? <span className="text-sm text-muted-foreground">{item.why}</span> : null}
                <span className="text-xs text-muted-foreground tabular-nums">{item.meta}</span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" className="touch:h-11" disabled={busy !== null} onClick={() => onApprove(item)}>
                  {busy === item.id && approve.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                  Uygula
                </Button>
                <Button size="sm" variant="outline" className="touch:h-11" disabled={busy !== null} onClick={() => setDeclining(item)}>
                  <X data-icon="inline-start" />
                  Reddet
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => (open ? undefined : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Düzenleyicide kaydedilmemiş değişikliğin var</AlertDialogTitle>
            <AlertDialogDescription>
              Öneriyi şimdi uygularsan program yeni bir sürüme geçer; düzenleyicideki taslağını kaydederken &quot;başka bir yerde
              değişti&quot; uyarısı çıkar. Önce taslağını kaydedebilir ya da atabilirsin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/program/edit`} />}>
              Düzenleyiciyi aç
            </Button>
            <Button disabled={approve.isPending} onClick={() => confirm && approve.mutate(confirm)}>
              {approve.isPending ? <Spinner data-icon="inline-start" /> : null}
              Yine de uygula
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={declining !== null}
        onOpenChange={(open) => {
          if (open) return;
          setDeclining(null);
          setNote('');
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Öneri reddedilsin mi?</DialogTitle>
            <DialogDescription>{declining?.text}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="decline-note">Not (isteğe bağlı)</FieldLabel>
            <Textarea
              id="decline-note"
              value={note}
              maxLength={PROPOSAL_LIMITS.note}
              placeholder="Ör. Önce tekniği oturtalım, sonra set ekleriz."
              onChange={(event) => setNote(event.target.value)}
            />
            <FieldDescription>Danışan Bugün ekranında kararınla birlikte görür.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclining(null)}>
              Vazgeç
            </Button>
            <Button variant="destructive" disabled={decline.isPending} onClick={() => declining && decline.mutate({ item: declining, note })}>
              {decline.isPending ? <Spinner data-icon="inline-start" /> : null}
              Reddet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
