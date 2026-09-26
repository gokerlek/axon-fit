'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/format';
import { DURATION, tween } from '@/lib/motion';
import { feedbackSummary, type FeedbackItem } from '@/lib/program-feedback';
import { cn } from '@/lib/utils';

const BOTTOM = 'gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]';

/** Sheet'in alt metni: neyin hemen değiştiği, neyin antrenöre gittiği. */
function explainer(items: readonly FeedbackItem[]): string {
  const direct = items.some((item) => item.mode === 'direct');
  const proposal = items.some((item) => item.mode === 'proposal');
  if (direct && proposal) return 'Kilo ve tekrar hedefin hemen değişir; set sayısını ve hareket değişikliğini antrenörün onaylar.';
  if (direct) return 'Kilo ve tekrar hedefin hemen değişir; antrenörüne bildirilir.';
  return 'Önerilerin antrenörüne gider; onaylayınca programına yazılır.';
}

/** "Tek tek seç"te maddenin alt metni: işaretliyken ne olur, işaretsizken ne olur. */
function itemDescription(item: FeedbackItem, checked: boolean): string {
  if (item.mode === 'proposal') return item.hint;
  return checked ? 'Programa yazılır' : item.hint;
}

export type ProgramAnswer = { answer: 'yes' | 'no' | 'pick'; picked?: ReadonlySet<string> };

/**
 * "Programını güncelleyelim mi?" (tasarım §2.7 c, §6): bitiş sorusundan sonra, özetten önce; yalnız plandan
 * sapma ya da öneri varsa. Tek soru, seçimler hazır: en çok 3 özet satırı (önce doğrudan olanlar), kalanı
 * "+n"; [Evet, güncelle] (56 px) seçilileri uygular, [Hayır, aynı kalsın] hiçbirini. "Tek tek seç" bugünkü
 * maddeleri açar: her biri tam genişlik tek satır ve tek onay kutusu ("Programa yazılır" ya da "Antrenörüne
 * öner"), altta [Kaydet]. Hiçbir madde seçili gelmiyorsa doğrudan tek tek seçim açılır. Sheet kararsız
 * kapanırsa (`onDismiss`) cevapsız sayılır: yukarı ağırlık yazılır, aşağısı bu seferlik, öneri gitmez.
 */
export function ProgramUpdateSheet({
  items,
  busy,
  onAnswer,
  onDismiss,
}: {
  /** Maddeler; null iken sheet kapalı. */
  items: readonly FeedbackItem[] | null;
  busy: boolean;
  onAnswer: (answer: ProgramAnswer) => void;
  onDismiss: () => void;
}) {
  return (
    <Sheet
      open={items !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onDismiss();
      }}>
      <SheetContent side="bottom" showCloseButton={false} className={cn(BOTTOM, 'max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))]')}>
        {items ? <UpdateBody key={items.map((item) => item.key).join('|')} items={items} busy={busy} onAnswer={onAnswer} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function UpdateBody({ items, busy, onAnswer }: { items: readonly FeedbackItem[]; busy: boolean; onAnswer: (answer: ProgramAnswer) => void }) {
  const initial = new Set(items.filter((item) => item.checked).map((item) => item.key));
  const [mode, setMode] = useState<'summary' | 'pick'>(initial.size > 0 ? 'summary' : 'pick');
  const [picked, setPicked] = useState<ReadonlySet<string>>(initial);
  const [pending, setPending] = useState<'yes' | 'no' | 'pick' | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const summary = feedbackSummary(items, initial);
  const answer = (value: ProgramAnswer) => {
    setPending(value.answer);
    onAnswer(value);
  };
  const toggle = (key: string, checked: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={mode}
        className="flex min-h-0 flex-1 flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: tween(DURATION.fast) }}
        exit={{ opacity: 0, transition: tween(DURATION.instant) }}
        onAnimationComplete={() => title.current?.focus({ preventScroll: true })}>
        {mode === 'summary' ? (
          <>
            <SheetHeader className="gap-1.5 pt-5">
              <SheetTitle ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">
                Programını güncelleyelim mi?
              </SheetTitle>
              <SheetDescription>{explainer(items)}</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4">
              <ul className="flex flex-col gap-1.5 text-sm">
                {summary.lines.map((item) => (
                  <li key={item.key} className="flex gap-2">
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                    <span className="min-w-0">
                      {item.text}
                      {item.mode === 'proposal' ? <span className="text-muted-foreground"> (antrenörüne)</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {summary.more > 0 ? <p className="text-sm text-muted-foreground tabular-nums">+{formatNumber(summary.more)} değişiklik</p> : null}
              {summary.unchecked > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {formatNumber(summary.unchecked)} öneri seçili değil; &quot;Tek tek seç&quot;ten ekleyebilirsin.
                </p>
              ) : null}
            </div>
            <SheetFooter className="pt-3">
              <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => answer({ answer: 'yes' })}>
                {busy && pending === 'yes' ? <Spinner data-icon="inline-start" /> : null}
                Evet, güncelle
              </Button>
              <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={() => answer({ answer: 'no' })}>
                {busy && pending === 'no' ? <Spinner data-icon="inline-start" /> : null}
                Hayır, aynı kalsın
              </Button>
              <Button variant="link" className="h-11 self-center" disabled={busy} onClick={() => setMode('pick')}>
                Tek tek seç
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetHeader className="gap-1.5 pt-5">
              <SheetTitle ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">
                Tek tek seç
              </SheetTitle>
              <SheetDescription>{explainer(items)}</SheetDescription>
            </SheetHeader>
            <div role="group" aria-label="Program değişiklikleri" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4">
              {items.map((item) => {
                const checked = picked.has(item.key);
                const id = `update-${item.key.replace(/[^a-z0-9_-]/gi, '-')}`;
                return (
                  <FieldLabel key={item.key} htmlFor={id}>
                    <Field orientation="horizontal" className="min-h-11 items-center">
                      <Checkbox id={id} checked={checked} disabled={busy} onCheckedChange={(next) => toggle(item.key, next === true)} className="size-5" />
                      <FieldContent>
                        <FieldTitle className="w-full">{item.text}</FieldTitle>
                        <FieldDescription className="text-[0.8125rem]">{itemDescription(item, checked)}</FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                );
              })}
            </div>
            <SheetFooter className="pt-3">
              <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => answer({ answer: 'pick', picked })}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Kaydet
              </Button>
            </SheetFooter>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
