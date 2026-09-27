'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { CaretDown, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { discardDraft } from '@/components/block-editor/editor-draft';
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { fetchJson } from '@/lib/query/errors';
import { ownProgramDraftKey } from '@/lib/unsaved-changes';
import { clearLocalWorkout, clearWorkoutCache } from '../../workout-storage';

/**
 * Programlar sekmesinin eylemleri (`docs/design/kendi-program.md` §2.3, §2.7, §2.8) — istemcide: Bugün'ün programı
 * yap (kalıcı seçim), antrenörle paylaş (sheet'le onay; kapatma yerelde, "Geri al" süresi bitince gider), onaylı
 * silme (yarım antrenman bu programdansa satır içi [Yarım antrenmanı sil]) ve "Antrenörün düzenledi" rozetinin
 * görüldü bilgisi (telefonda).
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const BOTTOM = 'gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]';
/** Kapatmanın "Geri al" süresi (§2.7). */
const UNSHARE_DELAY_MS = 8000;
const TOAST_BUTTONS = { actionButton: 'touch:min-h-11 touch:px-3! touch:text-sm!' };

/** "Bugün'ün programı yap" (kalıcı seçim): PT'ye bildirilir; `programId` null PT'nin programı. */
export function MakeActiveButton({ programId, name, className }: { programId: string | null; name: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const select = async () => {
    setBusy(true);
    try {
      await fetchJson('/api/me/programs/active', { method: 'POST', body: JSON.stringify({ programId }) });
      toast.success(programId ? `Bugün ${name} ile açılır` : 'Bugün antrenörünün programıyla açılır');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Seçilemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" className={className ?? 'h-11'} disabled={busy} onClick={() => void select()}>
      {busy ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
      Bugün&apos;ün programı yap
    </Button>
  );
}

/**
 * "Antrenörünle paylaş" (§2.7): açmak sheet'le onaylanır ve hemen yazılır; kapatmak Switch'i yerelde kapatır,
 * istek "Geri al" süresi dolunca, sayfa gizlenince ya da sayfadan çıkınca `keepalive`'la gider ("Geri al" bedava).
 * Gönderilemezse Switch açığa döner ve söylenir: kapattığını sanan danışanın programı açık kalmasın.
 */
export function ShareSwitch({ programId, name, shared: initial }: { programId: string; name: string; shared: boolean }) {
  const router = useRouter();
  const [shared, setShared] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ timer: number; toast: string | number } | null>(null);

  const post = useCallback(
    (value: boolean, keepalive = false) =>
      fetch(`/api/me/programs/${programId}/share`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ shared: value }), keepalive }),
    [programId],
  );

  /** Bekleyen kapatmayı gönderir (bir kez). */
  const flush = useCallback(
    (keepalive: boolean) => {
      const current = pending.current;
      if (!current) return;
      pending.current = null;
      window.clearTimeout(current.timer);
      toast.dismiss(current.toast);
      const failed = () => {
        setShared(true);
        toast.error('Paylaşım kapatılamadı; yeniden dene.');
      };
      post(false, keepalive).then((response) => {
        if (!response.ok) failed();
        else if (!keepalive) router.refresh();
      }, failed);
    },
    [post, router],
  );

  useEffect(() => {
    const onHide = () => flush(true);
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', hidden);
      // Sayfadan çıkış (uygulama içi gezinme): bekleyen kapatma hemen gider.
      flush(true);
    };
  }, [flush]);

  const unshare = () => {
    setShared(false);
    const id = toast('Paylaşım kapatılıyor', {
      description: `${name} antrenörünün listesinden kalkar.`,
      duration: UNSHARE_DELAY_MS,
      classNames: TOAST_BUTTONS,
      action: {
        label: 'Geri al',
        onClick: () => {
          const current = pending.current;
          if (!current) return;
          pending.current = null;
          window.clearTimeout(current.timer);
          setShared(true);
        },
      },
    });
    pending.current = { timer: window.setTimeout(() => flush(false), UNSHARE_DELAY_MS), toast: id };
  };

  const share = async () => {
    setBusy(true);
    try {
      const response = await post(true);
      if (!response.ok) throw new Error();
      setShared(true);
      setAsking(false);
      toast.success('Antrenörünle paylaşıldı');
      router.refresh();
    } catch {
      toast.error('Paylaşılamadı; yeniden dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Antrenörünle paylaş</span>
          <span className="text-sm text-muted-foreground">{shared ? 'Antrenörün görür ve düzenleyebilir.' : 'Antrenörün programı görmez.'}</span>
        </span>
        {/* Anahtar küçük: dokunma alanı satırın tamamı (44 px). */}
        <Switch checked={shared} disabled={busy} onCheckedChange={(checked) => (checked ? setAsking(true) : unshare())} aria-label="Antrenörünle paylaş" />
      </label>
      <Sheet open={asking} onOpenChange={(open) => (busy ? undefined : setAsking(open))}>
        <SheetContent side="bottom" showCloseButton={false} className={BOTTOM}>
          <SheetHeader className="gap-1.5 pt-5">
            <SheetTitle className="text-lg font-semibold">{name} antrenörünle paylaşılsın mı?</SheetTitle>
            <SheetDescription render={<div />} className="flex flex-col gap-3">
              <ul className="flex list-disc flex-col gap-1 pl-5">
                <li>Antrenörün programı görür ve düzenleyebilir.</li>
                <li>Her değişiklik programın geçmişine kimin yaptığıyla yazılır; öteki taraf haberdar olur.</li>
                <li>Paylaşımı istediğin an kapatırsın.</li>
              </ul>
              <span>Paylaşmasan da yaptığın antrenmanları antrenörün görür. Programların antrenörünün veri deposunda durur.</span>
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="pt-4">
            <Button size="lg" className="h-11 w-full" disabled={busy} onClick={() => void share()}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Paylaş
            </Button>
            <Button variant="outline" size="lg" className="h-11 w-full" autoFocus disabled={busy} onClick={() => setAsking(false)}>
              Vazgeç
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

type DeleteState = { kind: 'confirm' } | { kind: 'session'; sessionId: string } | { kind: 'sessionConfirm'; sessionId: string };

/**
 * "Programı sil" (§2.8): onaylı; "uygulamadan kalkar, deponun geçmişinde kalır", "Ayrıntı" neyin silinmediğini
 * söyler. Bugün'ün programıysa ve paylaşılmışsa ek satırlar. Yarım antrenman bu programdansa sunucu 409 döner:
 * diyalog [Yarım antrenmanı sil]'i sunar (onaylı), sonra silme yeniden denenir. Başarıda Programlar'a dönülür.
 */
export function DeleteOwnProgram({
  clientId,
  programId,
  name,
  active,
  shared,
}: {
  clientId: string;
  programId: string;
  name: string;
  active: boolean;
  shared: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<DeleteState>({ kind: 'confirm' });
  const [note, setNote] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  const remove = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/me/programs/${programId}`, { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as { error?: string; reason?: string; sessionId?: string } | null;
      if (response.status === 409 && body?.reason === 'active_session' && body.sessionId) {
        setState({ kind: 'session', sessionId: body.sessionId });
        return;
      }
      if (!response.ok && response.status !== 404) throw new Error(body?.error ?? 'Program silinemedi.');
      discardDraft(ownProgramDraftKey(clientId, programId));
      setOpen(false);
      toast.success('Program silindi');
      router.replace('/me/programlar');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Program silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  const removeSession = async (sessionId: string) => {
    setBusy(true);
    try {
      await fetchJson(`/api/me/sessions/${sessionId}`, { method: 'DELETE' });
      // Telefondaki kopya ve saklanan plan da düşer (antrenman ekranı açılmasın).
      clearLocalWorkout(clientId);
      clearWorkoutCache(clientId);
      setNote('Yarım antrenman silindi. Programı şimdi silebilirsin.');
      setState({ kind: 'confirm' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Yarım antrenman silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" className="h-11 self-start px-2 text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        Programı sil
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => (next || busy ? undefined : setOpen(false))}
        onOpenChangeComplete={(next) => {
          if (next) return;
          setExpanded(false);
          setState({ kind: 'confirm' });
          setNote(null);
        }}>
        <AlertDialogContent initialFocus={cancel}>
          {state.kind === 'sessionConfirm' ? (
            <AlertDialogHeader>
              <AlertDialogTitle>Yarım antrenman silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription>Kaydettiğin setler uygulamadan kalkar, geri getirilemez. Antrenörünün veri deposunun geçmişinde kalır.</AlertDialogDescription>
            </AlertDialogHeader>
          ) : (
            <AlertDialogHeader>
              <AlertDialogTitle>{name} silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription className="flex flex-col gap-2 text-left">
                <span>Program uygulamadan kalkar, geri getirilemez. Antrenörünün veri deposunun geçmişinde kalır.</span>
                {active ? <span>Bugün yeniden antrenörünün programıyla açılır.</span> : null}
                {shared ? <span>Antrenörüne bildirilir.</span> : null}
              </AlertDialogDescription>
              <div className="w-full text-left">
                <Button variant="ghost" className="-ml-2 h-11 px-2 text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                  Ayrıntı
                  <CaretDown data-icon="inline-end" className={expanded ? 'rotate-180' : undefined} />
                </Button>
                {expanded ? (
                  <p className="text-sm text-muted-foreground">
                    Yaptığın antrenmanlar silinmez; Geçmiş ve İlerleme&apos;de program adıyla kalır. Deponun eski sürümleri ve kayıt notları da
                    silinmez.
                  </p>
                ) : null}
              </div>
              {state.kind === 'session' ? (
                <p className="rounded-lg bg-muted p-3 text-left text-sm" role="status">
                  Yarım antrenmanın bu programdan; önce bitir ya da sil.
                </p>
              ) : null}
              {note ? (
                <p className="text-left text-sm text-muted-foreground" role="status">
                  {note}
                </p>
              ) : null}
            </AlertDialogHeader>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancel} className="h-11" disabled={busy}>
              Vazgeç
            </AlertDialogCancel>
            {state.kind === 'session' ? (
              <Button variant="destructive" className="h-11" disabled={busy} onClick={() => setState({ kind: 'sessionConfirm', sessionId: state.sessionId })}>
                Yarım antrenmanı sil
              </Button>
            ) : state.kind === 'sessionConfirm' ? (
              <Button variant="destructive" className="h-11" disabled={busy} onClick={() => void removeSession(state.sessionId)}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Yarım antrenmanı sil
              </Button>
            ) : (
              <Button variant="destructive" className="h-11" disabled={busy} onClick={() => void remove()}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Programı sil
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* --- "Antrenörün düzenledi": görüldü bilgisi telefonda (§7.2) --- */

const SEEN_EVENT = 'pulsecoach:own-seen';

function seenKey(clientId: string, programId: string): string {
  return `pulsecoach.own-seen.${clientId}.${programId}`;
}

function readSeen(clientId: string, programId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(clientId, programId));
  } catch {
    return null;
  }
}

function subscribeSeen(callback: () => void): () => void {
  window.addEventListener(SEEN_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(SEEN_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** PT'nin düzenlemesi görülmedi mi (bu telefonda): görüldü anı düzenlemeden eskiyse ya da yoksa. */
export function useUnseenPtEdit(clientId: string, programId: string, editedAt: string | undefined): boolean {
  const seen = useSyncExternalStore(
    subscribeSeen,
    () => readSeen(clientId, programId),
    () => null,
  );
  if (!editedAt) return false;
  return !seen || Date.parse(seen) < Date.parse(editedAt);
}

/** Programın sayfası açılınca: PT'nin düzenlemesi görüldü (rozet ve Bugün'deki satır düşer). */
export function MarkPtEditSeen({ clientId, programId, editedAt }: { clientId: string; programId: string; editedAt: string | undefined }) {
  useEffect(() => {
    if (!editedAt) return;
    try {
      window.localStorage.setItem(seenKey(clientId, programId), editedAt);
      window.dispatchEvent(new Event(SEEN_EVENT));
    } catch {
      // Depo kapalı: rozet yeniden görünebilir; kabul (§7.2).
    }
  }, [clientId, programId, editedAt]);
  return null;
}

/** Programlar'daki "Antrenörün düzenledi" rozeti: görülmediyse. */
export function PtEditBadge({ clientId, programId, editedAt }: { clientId: string; programId: string; editedAt: string | undefined }) {
  const unseen = useUnseenPtEdit(clientId, programId, editedAt);
  return unseen ? <Badge>Antrenörün düzenledi</Badge> : null;
}
