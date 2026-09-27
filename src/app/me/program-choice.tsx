'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CaretDown } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { formatDayShort } from '@/lib/format';
import { PT_PROGRAM_NAME } from '@/lib/own-programs';
import { fetchJson } from '@/lib/query/errors';
import { useUnseenPtEdit } from './(sekmeler)/programlar/program-actions';
import { WORKOUT_KEY } from './today-workout';
import { clearWorkoutCache } from './workout-storage';

/**
 * Bugün'ün program seçimi (`docs/design/kendi-program.md` §2.6) — istemcide:
 * - program çipi ve sheet'i: [Yalnız bugün] (birincil; `/me?program=…`, hiçbir şey yazılmaz) ve [Bundan sonra hep bu]
 *   (ikincil; kalıcı seçim yazılır, antrenörüne bildirilir). Seçilen zaten kalıcı seçimse ikincisi görünmez.
 * - "Antrenörün yeni bir program hazırladı" satırı: [Onunla çalış] kalıcı seçimi PT'nin programına alır, [Sonra]
 *   bu sürüm için telefonda gizler.
 * - "Antrenörün Evde programını düzenledi" satırı: telefonda görülmediyse, [Gör] programı açar (görüldü olur).
 */

const BOTTOM = 'gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))]';

export type ProgramChoice = { id: string | null; name: string; lastDate?: string };

/** Kalıcı seçimi yazar; Bugün'ün yanıtları ve telefondaki plan eskir. */
function useSelectActive(clientId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async (programId: string | null, name: string) => {
    await fetchJson('/api/me/programs/active', { method: 'POST', body: JSON.stringify({ programId }) });
    clearWorkoutCache(clientId);
    void queryClient.invalidateQueries({ queryKey: WORKOUT_KEY });
    toast.success(programId ? `Bugün ${name} ile açılır` : 'Bugün antrenörünün programıyla açılır');
    router.replace('/me');
    router.refresh();
  };
}

/** Program çipi (44 px) ve "Hangi programla çalışacaksın?" sheet'i. */
export function ProgramChip({
  clientId,
  choices,
  active,
  shown,
  oneOff,
}: {
  clientId: string;
  choices: ProgramChoice[];
  active: string | null;
  shown: string | null;
  oneOff: boolean;
}) {
  const router = useRouter();
  const select = useSelectActive(clientId);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const current = choices.find((choice) => choice.id === shown);
  const name = current?.name ?? PT_PROGRAM_NAME;
  const value = picked === undefined ? shown : picked;
  const pickedChoice = choices.find((choice) => choice.id === value);

  const onlyToday = () => {
    setOpen(false);
    router.push(value === active ? '/me' : `/me?program=${encodeURIComponent(value ?? 'pt')}`);
  };
  const always = async () => {
    setBusy(true);
    try {
      await select(value ?? null, pickedChoice?.name ?? PT_PROGRAM_NAME);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Seçilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="h-11 max-w-full justify-start self-start px-3" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="truncate">{oneOff ? `Bugün: ${name}` : name}</span>
        <CaretDown data-icon="inline-end" />
      </Button>
      <Sheet open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))} onOpenChangeComplete={(isOpen) => (isOpen ? undefined : setPicked(undefined))}>
        <SheetContent side="bottom" showCloseButton={false} className={BOTTOM}>
          <SheetHeader className="gap-1.5 pt-5">
            <SheetTitle id="program-choice-title" className="text-lg font-semibold">
              Hangi programla çalışacaksın?
            </SheetTitle>
            <SheetDescription>Sıra ve günler her programda ayrı sürer.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
            <RadioGroup aria-labelledby="program-choice-title" value={value ?? 'pt'} onValueChange={(next) => setPicked(next === 'pt' ? null : String(next))}>
              {choices.map((choice) => {
                const id = `program-choice-${choice.id ?? 'pt'}`;
                return (
                  <FieldLabel key={id} htmlFor={id}>
                    <Field orientation="horizontal" className="min-h-14">
                      <FieldContent>
                        <FieldTitle className="break-words">{choice.name}</FieldTitle>
                        <FieldDescription>{choice.lastDate ? `son antrenman: ${formatDayShort(choice.lastDate)}` : 'henüz antrenman yok'}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={choice.id ?? 'pt'} id={id} />
                    </Field>
                  </FieldLabel>
                );
              })}
            </RadioGroup>
          </div>
          <SheetFooter className="pt-4">
            <Button size="lg" className="h-11 w-full" disabled={busy} onClick={onlyToday}>
              Yalnız bugün
            </Button>
            {value !== active ? (
              <Button variant="outline" size="lg" className="h-11 w-full" disabled={busy} onClick={() => void always()}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Bundan sonra hep bu
              </Button>
            ) : null}
            <Button variant="ghost" className="h-11 w-full text-muted-foreground" disabled={busy} onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* --- "Antrenörün yeni bir program hazırladı": [Sonra] bu sürüm için telefonda --- */

const LATER_EVENT = 'pulsecoach:pt-program-later';

function laterKey(clientId: string): string {
  return `pulsecoach.pt-program-later.${clientId}`;
}

function subscribeLater(callback: () => void): () => void {
  window.addEventListener(LATER_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(LATER_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readLater(clientId: string): string | null {
  try {
    return window.localStorage.getItem(laterKey(clientId));
  } catch {
    return null;
  }
}

/** Kalıcı seçim kendi programken PT'nin programı o arada oluşturulduysa ya da kaydedildiyse (§2.6). */
export function NewPtProgramBanner({ clientId, version }: { clientId: string; version: string }) {
  const select = useSelectActive(clientId);
  const [busy, setBusy] = useState(false);
  // Sunucu çiziminde gösterilmez: [Sonra] telefonda (hidrasyondan sonra okunur).
  const later = useSyncExternalStore(
    subscribeLater,
    () => readLater(clientId),
    () => version,
  );
  if (later === version) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(laterKey(clientId), version);
      window.dispatchEvent(new Event(LATER_EVENT));
    } catch {
      // Depo kapalı: satır bir sonraki açılışta yine görünür.
    }
  };
  const work = async () => {
    setBusy(true);
    try {
      await select(null, PT_PROGRAM_NAME);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Seçilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Alert>
      <AlertTitle>Antrenörün yeni bir program hazırladı</AlertTitle>
      <AlertDescription className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="ghost" className="h-11" disabled={busy} onClick={dismiss}>
          Sonra
        </Button>
        <Button className="h-11" disabled={busy} onClick={() => void work()}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Onunla çalış
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** "Antrenörün Evde programını düzenledi · 26 Eyl" [Gör]: telefonda görülmediyse. */
export function PtEditLine({ clientId, programId, name, editedAt, dateText }: { clientId: string; programId: string; name: string; editedAt: string; dateText: string }) {
  const unseen = useUnseenPtEdit(clientId, programId, editedAt);
  if (!unseen) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-sm" role="status">
      <span className="min-w-0 break-words text-muted-foreground">
        Antrenörün {name} programını düzenledi · {dateText}
      </span>
      <Button variant="outline" className="h-11 shrink-0" nativeButton={false} render={<Link href={`/me/programlar/${programId}`} />}>
        Gör
      </Button>
    </div>
  );
}
