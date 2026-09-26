'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { CaretRight, Drop, Minus, Plus, Trash } from '@phosphor-icons/react';
import { SwipeGroup, SwipeRow, type SwipeAction } from '@/components/swipe/swipe-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/format';
import { SWIPE, tween } from '@/lib/motion';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { SESSION_ID_LENGTHS, type SessionDoc } from '@/lib/schemas/session';
import { DELETE_BODY, DELETE_DETAIL, deleteCopy, deletePatch, sessionDetail, type DeleteTarget, type DetailExercise, type DetailSet } from '@/lib/session-history';
import { randomId } from '@/lib/template-plan';
import { CHANGE_LABELS, type ChangeLine } from '@/lib/workout-summary';
import { DeleteDialog } from '../../../delete-dialog';
import { WORKOUT_KEY } from '../../../today-workout';
import { writerId } from '../../../workout-storage';

/**
 * Silinen satır (tasarım §3): yüz sola çıkar (`SWIPE.exitMs`), ardından satır kapanır (`SWIPE.collapseMs`),
 * alttakiler yukarı kayar. Hareket azaltmada kayma yok, satır kapanır.
 */
const EXIT = {
  x: '-100%',
  opacity: 0,
  height: 0,
  transition: {
    x: tween(SWIPE.exitMs, SWIPE.exitEase),
    opacity: tween(SWIPE.exitMs, SWIPE.exitEase),
    height: { ...tween(SWIPE.collapseMs, SWIPE.exitEase), delay: SWIPE.exitMs / 1000 },
  },
};

type PatchResponse = { doc: SessionDoc };

/**
 * Geçmişteki antrenmanın detayı ve düzenlemesi (tasarım §2.10, §4.5). Belge telefonda tutulur, her düzeltme
 * sunucunun birleştirdiği belgeyle yenilenir (`PATCH /api/me/sessions/[id]`; tek commit, index ve rekorlar
 * yeniden hesaplanır).
 *
 * - **Düzenle** kipi her set ve hareket satırına 44 px 🗑 koyar; sola kaydırma (`SwipeRow`) aynı işlemin
 *   kısayoludur (panel düğmesi görünür düğmenin kopyası). Her silme onaylıdır (`DeleteDialog`: üst üste
 *   düğmeler, Vazgeç en altta); editördeki onaysız silme ve "Geri al" burada yok. Onaydan sonra satır yüzü
 *   dışarı çıkarak kalkar; bildirim yok.
 * - Antrenmanın tamamı başlıktaki "Sil"le: iz dosyası, genel commit mesajı ("Kayıt silindi"); Geçmiş'e dönülür.
 * - Su ±1 yalnız Düzenle'de (dokunuş listesine bir +1 ya da −1). Geçmişte set düzeltme yok (açık soru 6).
 */
export function HistoryDetail({ initialDoc, changes, timeZone }: { initialDoc: SessionDoc; changes: ChangeLine[]; timeZone: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDoc);
  const [editing, setEditing] = useState(false);
  // Onayın konusu kapanış animasyonu boyunca kalır (`open` düşer, metin boşalmaz).
  const [dialog, setDialog] = useState<{ open: boolean; target: DeleteTarget; title: string; subject: string } | null>(null);
  const view = useMemo(() => sessionDetail(doc, timeZone), [doc, timeZone]);
  const close = () => setDialog((current) => (current ? { ...current, open: false } : null));

  const remove = useServiceMutation({
    fn: async (next: DeleteTarget) => {
      if (next.kind === 'session') {
        await fetchJson(`/api/me/sessions/${doc.id}`, { method: 'DELETE' });
        return null;
      }
      return fetchJson<PatchResponse>(`/api/me/sessions/${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ writer: writerId(), ...deletePatch(doc, next) }),
      });
    },
    invalidate: [WORKOUT_KEY],
    onError: (error) => {
      // Başka cihazda silinmiş: geçmişe dönülür (hata bildirimi merkezde).
      if (error.status === 410) {
        close();
        router.replace('/me/gecmis');
      }
    },
    onSuccess: (result) => {
      close();
      if (result === null) {
        toast.success('Antrenman silindi', { description: 'Rekorların ve "bu hafta" kalan kayıtlara göre yeniden hesaplandı.' });
        router.replace('/me/gecmis');
        return;
      }
      // Sunucunun birleştirdiği belge: sayfa yeniden okunmaz (Geçmiş listesi açılınca taze okunur).
      setDoc(result.doc);
    },
  });

  const water = useServiceMutation({
    fn: (d: 1 | -1) =>
      fetchJson<PatchResponse>(`/api/me/sessions/${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          writer: writerId(),
          waterTaps: [{ id: randomId('wt', SESSION_ID_LENGTHS.wt, new Set(doc.waterTaps.map((tap) => tap.id))), d, at: new Date().toISOString() }],
        }),
      }),
    invalidate: [WORKOUT_KEY],
    onSuccess: (result) => setDoc(result.doc),
  });

  const ask = (target: DeleteTarget) => {
    const copy = deleteCopy(view, target);
    if (copy && !remove.isPending) setDialog({ open: true, target, ...copy });
  };

  return (
    <>
      <div className="-mt-2 flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground tabular-nums">
          <span>{view.meta} ·</span>
          {editing ? (
            <span className="inline-flex items-center gap-0.5">
              <Button
                variant="secondary"
                size="icon"
                className="size-9"
                aria-label="Bir bardak su azalt"
                disabled={view.water === 0 || water.isPending}
                onClick={() => water.mutate(-1)}>
                <Minus weight="bold" />
              </Button>
              <span className="inline-flex min-w-14 items-center justify-center gap-1 px-1" aria-live="polite">
                {water.isPending ? <Spinner className="size-3.5" /> : <Drop className="size-3.5 text-primary-text" aria-hidden />}
                {formatNumber(view.water)} su
              </span>
              <Button variant="secondary" size="icon" className="size-9" aria-label="Bir bardak su ekle" disabled={water.isPending} onClick={() => water.mutate(1)}>
                <Plus weight="bold" />
              </Button>
            </span>
          ) : (
            <span>{formatNumber(view.water)} su</span>
          )}
        </p>
        {view.otherDay || view.unfinished || view.effort ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {view.otherDay ? <Badge variant="secondary">başka gün</Badge> : null}
            {view.unfinished ? <Badge variant="outline">yarım</Badge> : null}
            {view.effort ? <Badge variant="outline">{view.effort}</Badge> : null}
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          <Button variant="ghost" className="-ml-2 h-11 px-2 text-primary-text" nativeButton={false} render={<Link href={`/me/antrenman/ozet/${doc.id}?from=gecmis`} />}>
            Özeti aç
            <CaretRight data-icon="inline-end" weight="bold" />
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" className="h-11 px-3" aria-pressed={editing} onClick={() => setEditing(!editing)}>
            {editing ? 'Bitti' : 'Düzenle'}
          </Button>
          <Button variant="ghost" className="-mr-2 h-11 px-3 text-destructive-text" onClick={() => ask({ kind: 'session' })}>
            Sil
          </Button>
        </div>
      </div>

      <SwipeGroup>
        <ul className="flex flex-col gap-3 [--face-bg:var(--card)]">
          <AnimatePresence initial={false}>
            {view.exercises.map((exercise) => (
              <motion.li key={exercise.entryId} exit={EXIT} className="overflow-hidden">
                <ExerciseCard exercise={exercise} editing={editing} onDelete={ask} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </SwipeGroup>
      {view.exercises.length === 0 ? <p className="text-sm text-muted-foreground">Bu antrenmanda kayıtlı set kalmadı.</p> : null}

      {changes.length > 0 ? (
        <Card size="sm" className="px-3.5">
          <p className="text-sm font-medium">Program</p>
          <ul className="flex flex-col gap-2">
            {changes.map((change, position) => (
              <li key={`${change.text}-${position}`} className="flex flex-col text-sm">
                <span>{change.text}</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {CHANGE_LABELS[change.state]}
                  {change.note ? ` · “${change.note}”` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <DeleteDialog
        open={dialog?.open ?? false}
        title={dialog?.title ?? ''}
        subject={dialog?.subject ?? ''}
        body={DELETE_BODY}
        detail={DELETE_DETAIL}
        busy={remove.isPending}
        onCancel={close}
        onConfirm={() => (dialog?.open ? remove.mutate(dialog.target) : undefined)}
      />
    </>
  );
}

/** Kaydırmanın "Sil" paneli: görünür 🗑'ün kopyası (panel ekran okuyucudan gizli), onayı yine sorar. */
function trashAction(onPress: () => void): SwipeAction {
  return { key: 'sil', label: 'Sil', icon: <Trash weight="bold" />, onPress };
}

function ExerciseCard({ exercise, editing, onDelete }: { exercise: DetailExercise; editing: boolean; onDelete: (target: DeleteTarget) => void }) {
  const removeExercise = () => onDelete({ kind: 'entry', entryId: exercise.entryId });
  return (
    <Card size="sm" className="gap-0 py-0">
      <SwipeRow id={exercise.entryId} end={[trashAction(removeExercise)]}>
        <div className="flex min-h-12 items-center gap-2 py-2 pr-1 pl-3.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">
              {exercise.title} <span className="text-[0.8125rem] font-normal text-muted-foreground">{exercise.note}</span>
            </span>
            {exercise.setupNote ? <span className="text-[0.8125rem] text-muted-foreground">Ayar notun: {exercise.setupNote}</span> : null}
          </div>
          {editing ? (
            <Button variant="ghost" size="icon" className="size-11 text-destructive-text" aria-label={`${exercise.title} hareketini sil`} onClick={removeExercise}>
              <Trash />
            </Button>
          ) : null}
        </div>
      </SwipeRow>
      <ul>
        <AnimatePresence initial={false}>
          {exercise.sets.map((set) => (
            <motion.li key={set.id} exit={EXIT} className="overflow-hidden border-t">
              <SetRow set={set} title={exercise.title} editing={editing} onDelete={() => onDelete({ kind: 'set', entryId: exercise.entryId, setId: set.id })} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

function SetRow({ set, title, editing, onDelete }: { set: DetailSet; title: string; editing: boolean; onDelete: () => void }) {
  const label = set.warmup ? `${title} ısınma setini sil` : `${title} ${set.label}. seti sil`;
  return (
    <SwipeRow id={set.id} end={[trashAction(onDelete)]}>
      <div className="flex min-h-11 items-center gap-3 pr-1 pl-3.5 text-sm tabular-nums">
        <span className={set.warmup ? 'w-14 text-[0.8125rem] text-muted-foreground' : 'w-5 text-muted-foreground'}>{set.label}</span>
        <span className="min-w-0 flex-1 font-medium">
          {set.text}
          {set.extra ? <span className="ml-1.5 text-[0.8125rem] font-normal text-muted-foreground">fazladan</span> : null}
        </span>
        {set.effort ? <span className="text-[0.8125rem] text-muted-foreground">{set.effort}</span> : null}
        {editing ? (
          <Button variant="ghost" size="icon" className="size-11 text-destructive-text" aria-label={label} onClick={onDelete}>
            <Trash />
          </Button>
        ) : (
          <span className="w-2" />
        )}
      </div>
    </SwipeRow>
  );
}
