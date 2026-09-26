'use client';

import { useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Geri alınamaz silmenin onayı (tasarım §2.10): başlık, silinecek şeyin satırı (tabular), aynı iki cümle
 * ("Uygulamadan kalkar, geri getirilemez. … geçmişinde kalır.") ve isteğe bağlı kapalı "Ayrıntı". Telefonda
 * düğmeler üst üste ve tam genişlikte: [Sil] yıkıcı, [Vazgeç] en altta (başparmağın düştüğü yer güvenli) ve
 * odak onda. Silme sürerken dialog açık kalır, Sil'de dönen gösterge (ikinci dokunuş ikinci istek atmaz).
 */
export function DeleteDialog({
  open,
  title,
  subject,
  body,
  detail,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subject: string;
  body: string;
  detail?: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => (next || busy ? undefined : onCancel())}
      onOpenChangeComplete={(next) => (next ? undefined : setExpanded(false))}>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-2 text-left">
            <span className="font-medium text-foreground tabular-nums">{subject}</span>
            <span>{body}</span>
          </AlertDialogDescription>
          {detail ? (
            <div className="w-full text-left">
              <Button variant="ghost" className="-ml-2 h-11 px-2 text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                Ayrıntı
                <CaretDown data-icon="inline-end" className={expanded ? 'rotate-180' : undefined} />
              </Button>
              {expanded ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
            </div>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} className="h-11" disabled={busy}>
            Vazgeç
          </AlertDialogCancel>
          <Button variant="destructive" className="h-11" disabled={busy} onClick={onConfirm}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Sil
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
