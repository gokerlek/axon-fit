'use client';

import { useRef, useState } from 'react';
import { CaretDown, CheckCircle } from '@phosphor-icons/react';
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Stepper } from '@/components/ui/stepper';
import { formatKg, formatNumber } from '@/lib/format';
import { EFFORT_LABELS, gridOf, type Effort, type LoadSpec, type TrackingType } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { cn } from '@/lib/utils';
import { FINISH_REASON_LABELS, FINISH_REASONS, type FinishReason } from '@/lib/workout-flow';
import { EFFORT_CHOICES, type EffortChoice, type WorkoutSummary } from '@/lib/workout-session';
import { AmrapReps, EffortPrompt, type EffortPromptView } from './rest-panel';

const BOTTOM = 'gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]';

/** "Neden? (isteğe bağlı)": kapalı gelir; tek seçim, yeniden dokunmak kaldırır. "Ağrı" yalnız sağlık onayı varken. */
function ReasonPicker({ pain, value, onChange }: { pain: boolean; value: FinishReason | null; onChange: (reason: FinishReason | null) => void }) {
  const [open, setOpen] = useState(value !== null);
  const reasons = FINISH_REASONS.filter((reason) => reason !== 'pain' || pain);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" className="-mx-2 h-11 justify-between px-2 font-normal text-muted-foreground" aria-expanded={open} aria-controls="finish-reasons" onClick={() => setOpen(!open)}>
        Neden? (isteğe bağlı)
        <CaretDown data-icon="inline-end" className={cn('transition-transform duration-160', open && 'rotate-180')} />
      </Button>
      {open ? (
        <div id="finish-reasons" role="group" aria-label="Neden" className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <Button
                key={reason}
                variant={value === reason ? 'default' : 'secondary'}
                aria-pressed={value === reason}
                className="h-11 px-4"
                onClick={() => onChange(value === reason ? null : reason)}>
                {FINISH_REASON_LABELS[reason]}
              </Button>
            ))}
          </div>
          {value === 'pain' ? <p className="text-[0.8125rem] text-muted-foreground">Ağrı yalnız sağlık kaydına yazılır; antrenman kaydında &quot;diğer&quot; görünür.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Basit bitiş (tasarım §2.7 a/b; rotasyon satırı ve program soruları Faz 6'da):
 * - hepsi bitti: "Antrenman tamamlandı, bitirelim mi?" ve özet satırı; son hareketin dinlenmesi
 *   olmadığı için onun "nasıldı?" sorusu (ve AMRAP'la bittiyse "Kaç tekrar yaptın?") burada. Geçilen
 *   hareket kaldıysa "1 hareket geçildi: Plank" [Geçileni yap];
 * - erken: "Antrenmanı bitir?", yapılan/planlanan set ve yapılmayanlar (geçilenler "geçildi");
 * - yapılmayan varsa kapalı "Neden? (isteğe bağlı)": neden antrenman ortasında sorulmaz, yalnız burada;
 * - hiç set yok: dosya ilk sette oluştuğu için silinecek bir şey de yok; "Antrenmanı iptal et".
 * Yıkıcı işlem yorgun başparmağın düştüğü yerde durmaz: silme bu sheet'te yok.
 */
export function FinishSheet({
  open,
  onOpenChange,
  summary,
  busy,
  effort,
  amrap,
  pain,
  onEffort,
  onAmrap,
  onDoSkipped,
  onFinish,
  onCancelWorkout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: WorkoutSummary;
  busy: boolean;
  /** Son hareketin zorluğu (hepsi bittiyse). */
  effort: EffortPromptView | null;
  /** Son set AMRAP'sa yaptığı tekrar. */
  amrap: { reps: number } | null;
  /** Sağlık onayı: "Ağrı" nedeni. */
  pain: boolean;
  onEffort: (entryId: string, effort: EffortChoice) => void;
  onAmrap: (reps: number) => void;
  /** "Geçileni yap": ilk geçilen hareket şimdi. */
  onDoSkipped: () => void;
  onFinish: (reason: FinishReason | null) => void;
  onCancelWorkout: () => void;
}) {
  const none = summary.sets === 0;
  const all = !none && summary.allDone;
  const skipped = summary.remaining.filter((item) => item.skipped);
  const [reason, setReason] = useState<FinishReason | null>(null);
  // Odak birincil eylemde (zorluk düğmeleri önce gelse de).
  const primary = useRef<HTMLButtonElement>(null);
  const asks = !none && summary.remaining.length > 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(next) => (next ? undefined : setReason(null))}>
      <SheetContent side="bottom" showCloseButton={false} className={cn(BOTTOM, 'max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))]')} initialFocus={primary}>
        <SheetHeader className="gap-1.5 pt-5">
          {all ? <CheckCircle className="mb-1 size-10 text-primary" /> : null}
          <SheetTitle className="text-lg font-semibold">
            {none ? 'Henüz set yok' : all ? 'Antrenman tamamlandı, bitirelim mi?' : 'Antrenmanı bitir?'}
          </SheetTitle>
          <SheetDescription className="tabular-nums">
            {none
              ? 'Kaydedilmiş set olmadığı için silinecek bir şey de yok.'
              : all
                ? `${summary.exercises} hareket · ${summary.sets} set · ${formatKg(Math.round(summary.volumeKg))} · ${summary.minutes} dk`
                : `${summary.doneSets}/${summary.plannedSets} set yapıldı. Yapılmayanlar:`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4">
          {!none && !all ? (
            <ul className="flex flex-col gap-1 text-sm tabular-nums">
              {summary.remaining.map((item) => (
                <li key={item.rowId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{item.title}</span>
                  <span className="shrink-0 text-muted-foreground">{item.skipped ? 'geçildi' : `${item.done}/${item.planned} set`}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {all && skipped.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                {skipped.length} hareket geçildi: <span className="font-medium">{skipped.map((item) => item.title).join(', ')}</span>
              </p>
              <Button variant="outline" className="h-11 w-full" onClick={onDoSkipped}>
                Geçileni yap
              </Button>
            </div>
          ) : null}
          {asks ? <ReasonPicker pain={pain} value={reason} onChange={setReason} /> : null}
          {all && (amrap || effort) ? (
            <div className="flex flex-col gap-1 border-t pt-2">
              {amrap ? <AmrapReps reps={amrap.reps} onChange={onAmrap} /> : null}
              {effort ? <EffortPrompt view={effort} onAnswer={onEffort} /> : null}
            </div>
          ) : null}
        </div>
        <SheetFooter className="pt-3">
          {none ? (
            <>
              <Button ref={primary} size="lg" className="h-14 w-full text-base" onClick={() => onOpenChange(false)}>
                Kalanlara dön
              </Button>
              <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={onCancelWorkout}>
                Antrenmanı iptal et
              </Button>
            </>
          ) : (
            <>
              <Button ref={primary} size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => onFinish(asks ? reason : null)}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Bitir
              </Button>
              <Button variant="outline" className="h-11 w-full" onClick={() => onOpenChange(false)}>
                {all ? 'Devam et (set ya da hareket ekle)' : 'Kalanlara dön'}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export type EditTarget = {
  setId: string;
  title: string;
  position: number;
  trackingType: TrackingType;
  spec: LoadSpec;
  kg: number | undefined;
  value: number;
  /** Zorluk (AMRAP setinde sorulmaz: `null`). */
  effort: Effort | undefined | null;
  /** Sunucuya ulaştı mı: silme metni buna göre ("deponun geçmişinde kalır"). */
  sent: boolean;
};

export type EditValues = { kg?: number | undefined; value: number; effort?: Effort | undefined };

/**
 * "Seti düzelt" (tasarım §2.4): en üstte, stepper'lardan ve Kaydet'ten uzakta, metin olarak "Seti sil"
 * (yıkıcı renk, onaylı); altında ağırlık, tekrar ve zorluk (set başına ayrım burada; AMRAP'ta yok); en
 * altta Kaydet.
 */
export function EditSetSheet({
  target,
  onClose,
  onSave,
  onDelete,
}: {
  target: EditTarget | null;
  onClose: () => void;
  onSave: (values: EditValues) => void;
  onDelete: () => void;
}) {
  // Odak Kaydet'te: ilk odaklanabilir öğe "Seti sil" olurdu (Enter yıkıcı işleme gitmesin).
  const save = useRef<HTMLButtonElement>(null);
  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="bottom" showCloseButton={false} className={BOTTOM} initialFocus={save}>
        {target ? <EditSetBody key={target.setId} target={target} saveRef={save} onSave={onSave} onDelete={onDelete} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function EditSetBody({
  target,
  saveRef,
  onSave,
  onDelete,
}: {
  target: EditTarget;
  saveRef: React.RefObject<HTMLButtonElement | null>;
  onSave: (values: EditValues) => void;
  onDelete: () => void;
}) {
  const [kg, setKg] = useState(target.kg);
  const [value, setValue] = useState(target.value);
  const [effort, setEffort] = useState(target.effort ?? undefined);
  const weighted = target.trackingType === 'weight_reps' && target.kg !== undefined;
  const duration = target.trackingType === 'duration';
  const grid = weighted ? gridOf(target.spec) : null;
  return (
    <>
      <SheetHeader className="flex-row items-start justify-between gap-3 pt-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <SheetTitle className="text-lg font-semibold">Seti düzelt</SheetTitle>
          <SheetDescription className="truncate">
            {target.title} · Set {target.position + 1}
          </SheetDescription>
        </div>
        <Button variant="ghost" className="-mt-1 -mr-2 h-11 px-3 text-destructive hover:text-destructive" onClick={onDelete}>
          Seti sil
        </Button>
      </SheetHeader>
      <div className="flex flex-col gap-2 px-4">
        {weighted ? (
          <Stepper
            size="xl"
            value={kg ?? null}
            onValueChange={(changed) => {
              if (changed !== null && Number.isFinite(changed)) setKg(Math.min(SESSION_LIMITS.kg, Math.max(0, changed)));
            }}
            min={0}
            max={SESSION_LIMITS.kg}
            step={grid ? 0.5 : 1}
            stepFn={grid ? (current, direction) => (direction === 1 ? grid.up(current ?? grid.min, 1) : grid.below(current ?? grid.min, current ?? grid.min)) : undefined}
            inputMode="decimal"
            unit="kg"
            aria-label="Ağırlık"
            decrementLabel="Ağırlığı azalt"
            incrementLabel="Ağırlığı artır"
          />
        ) : null}
        <Stepper
          size="xl"
          value={value}
          onValueChange={(changed) => {
            if (changed !== null && Number.isFinite(changed)) setValue(Math.min(duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps, Math.max(0, Math.round(changed))));
          }}
          min={0}
          max={duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps}
          step={duration ? 5 : 1}
          unit={duration ? 'sn' : 'tekrar'}
          aria-label={duration ? 'Süre' : 'Tekrar'}
          decrementLabel={duration ? 'Süreyi azalt' : 'Tekrarı azalt'}
          incrementLabel={duration ? 'Süreyi artır' : 'Tekrarı artır'}
        />
        {target.effort !== null ? (
          <div role="group" aria-labelledby="edit-effort" className="flex flex-col gap-1.5 pt-1">
            <p id="edit-effort" className="text-sm font-medium">
              Zorluk
            </p>
            <div className="grid grid-cols-3 gap-2">
              {EFFORT_CHOICES.map((choice) => (
                <Button
                  key={choice}
                  variant={effort === choice ? 'default' : 'secondary'}
                  aria-pressed={effort === choice}
                  className="h-11"
                  onClick={() => setEffort(effort === choice ? undefined : choice)}>
                  {EFFORT_LABELS[choice]}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <SheetFooter className="pt-4">
        <Button
          ref={saveRef}
          size="lg"
          className="h-14 w-full text-base"
          onClick={() => onSave({ ...(weighted ? { kg } : {}), value, ...(target.effort !== null ? { effort } : {}) })}>
          Kaydet
        </Button>
      </SheetFooter>
    </>
  );
}

/**
 * Set silme onayı (tasarım §2.10): telefonda düğmeler üst üste, Vazgeç en altta ve odak onda. Metin
 * çelişmez: set uygulamadan kalkar, sunucuya ulaştıysa deponun geçmişinde kalır ("kalabilir" değil).
 */
export function DeleteSetDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: (EditTarget & { text: string }) | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState(false);
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => (open ? undefined : onCancel())} onOpenChangeComplete={(open) => (open ? undefined : setDetail(false))}>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>Bu set silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-2 text-left">
            <span className="font-medium text-foreground tabular-nums">{target?.text}</span>
            <span>
              {target?.sent
                ? 'Uygulamadan kalkar, geri getirilemez. Antrenörünün veri deposunun geçmişinde kalır.'
                : 'Uygulamadan kalkar, geri getirilemez. Henüz gönderilmediği için depoya da yazılmaz.'}
            </span>
          </AlertDialogDescription>
          {target?.sent ? (
            <div className="w-full text-left">
              <Button variant="ghost" className="-ml-2 h-11 px-2 text-muted-foreground" aria-expanded={detail} onClick={() => setDetail(!detail)}>
                Ayrıntı
                <CaretDown data-icon="inline-end" className={detail ? 'rotate-180' : undefined} />
              </Button>
              {detail ? (
                <p className="text-sm text-muted-foreground">
                  Deponun eski sürümlerinde ve kayıt notlarında kalır. Rekorların ve önerilerin kalan kayıtlara göre yeniden
                  hesaplanır. Tamamen silinmesi için antrenörüne yaz.
                </p>
              ) : null}
            </div>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} className="h-11">
            Vazgeç
          </AlertDialogCancel>
          <Button variant="destructive" className="h-11" onClick={onConfirm}>
            Sil
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Başka cihazda bitirilen antrenman (409 `finished`): telefondaki setler eklensin mi? */
export function FinishedElsewhereDialog({
  count,
  busy,
  onAdd,
  onSkip,
}: {
  count: number | null;
  busy: boolean;
  onAdd: () => void;
  onSkip: () => void;
}) {
  return (
    <AlertDialog open={count !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bu antrenman başka bir cihazda bitirildi</AlertDialogTitle>
          <AlertDialogDescription>Bu telefondaki {formatNumber(count ?? 0)} set eklensin mi?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" className="h-11" disabled={busy} onClick={onSkip}>
            Ekleme
          </Button>
          <Button className="h-11" disabled={busy} onClick={onAdd}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Ekle
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
