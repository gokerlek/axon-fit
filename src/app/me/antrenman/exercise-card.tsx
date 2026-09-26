'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, Check, Equals, NotePencil, Sparkle } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { DURATION, tween } from '@/lib/motion';
import { REASON_LABELS, type SuggestionReason } from '@/lib/progression';
import { isStraight } from '@/lib/set-plan';
import { cn } from '@/lib/utils';
import type { WorkoutRow } from '@/lib/workout-plan';
import { previousText, setValueText, targetCell, type SetView } from '@/lib/workout-session';

const UP = new Set<string>(['increase', 'range_increase']);
const DOWN = new Set<string>(['decrease', 'deload', 'pain_reduce']);

function ReasonIcon({ reason }: { reason: string }) {
  if (reason === 'first_time') return <Sparkle />;
  if (UP.has(reason)) return <ArrowUp />;
  if (DOWN.has(reason)) return <ArrowDown />;
  return <Equals />;
}

/** Tek satırlık çip: taşarsa kırpılır; dokununca tamamı altında açılır (tasarım §2.4). */
function Chip({ open, onToggle, tone, icon, children }: { open: boolean; onToggle: () => void; tone: 'up' | 'plain'; icon: React.ReactNode; children: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-7 min-w-0 shrink items-center gap-1 rounded-full px-2.5 text-[0.8125rem] outline-none before:absolute before:-inset-x-0.5 before:-inset-y-2 before:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone === 'up' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground',
      )}>
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * Hareket kartı (tasarım §2.4): başlık ≤ 2 satır, altında tek satırlık çipler (planın gerekçesi, PT'nin
 * notu), set tablosu. Tablo gerçek `<table>`: Set · Önceki · (setlerin hedefi farklıysa Hedef) · kg ·
 * Tekrar/Süre · durum. Planın değerleri bir kez görünür: düz setlerde hedef paneldedir. Şu anki satır
 * vurgulu (şerit sonraki sete kayar); yapılan sete dokunmak "Seti düzelt"i açar. Yeni kaydın ✓'u
 * satıra, panel değişmeden önce düşer (iOS'ta titreşim yok; kaydedildiğini bu gösterir).
 */
export function ExerciseCard({
  row,
  sets,
  currentSetIndex,
  currentKg,
  freshSetId,
  onEditSet,
}: {
  row: WorkoutRow;
  sets: readonly SetView[];
  /** Şu anki set (satırdaki yeri); hareket bittiyse null. */
  currentSetIndex: number | null;
  /** Şu anki setin önceden dolu (ya da değiştirilmiş) ağırlığı. */
  currentKg: number | undefined;
  /** Az önce kaydedilen set: ✓'u belirerek gelir. */
  freshSetId: string | null;
  onEditSet: (setId: string) => void;
}) {
  const [open, setOpen] = useState<'reason' | 'note' | null>(null);
  const reduced = useReducedMotion();
  // Hareket değişirken çıkan kart başlığın kimliğini bırakır: odak yeni kartın başlığına gider.
  const present = useIsPresent();
  const currentRef = useRef<HTMLTableRowElement>(null);
  const weighted = row.trackingType === 'weight_reps';
  const showTarget = !isStraight(sets.map((set) => set.target));
  const valueHead = row.trackingType === 'duration' ? 'Süre' : 'Tekrar';
  const reason = row.plan.reason as SuggestionReason;

  // Şu anki satır panelin üstünde görünür kalsın (4+ sette tablo kayar).
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [currentSetIndex, reduced]);

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-1.5 px-3 pt-3 pb-2">
        <h2 id={present ? 'exercise-title' : undefined} tabIndex={-1} className="line-clamp-2 font-heading text-[1.1875rem] leading-tight font-semibold outline-none">
          {row.title}
        </h2>
        <div className="flex min-h-8 items-center gap-1.5 overflow-hidden">
          <Chip open={open === 'reason'} onToggle={() => setOpen(open === 'reason' ? null : 'reason')} tone={UP.has(reason) ? 'up' : 'plain'} icon={<ReasonIcon reason={reason} />}>
            {REASON_LABELS[reason] ?? ''}
          </Chip>
          {row.note ? (
            <Chip open={open === 'note'} onToggle={() => setOpen(open === 'note' ? null : 'note')} tone="plain" icon={<NotePencil />}>
              {row.note}
            </Chip>
          ) : null}
        </div>
        {open ? (
          <p className="text-[0.8125rem] text-muted-foreground">{open === 'reason' ? REASON_LABELS[reason] : `Antrenörünün notu: ${row.note ?? ''}`}</p>
        ) : null}
      </div>

      <Table aria-label={`${row.title} setleri`} className="table-fixed tabular-nums">
        {/* 375 px'te: 40 + Önceki + (48) + 56 + 56 + 44; "Önceki" en az ~100 px kalır. */}
        <colgroup>
          <col className="w-10" />
          <col />
          {showTarget ? <col className="w-12" /> : null}
          {weighted ? <col className="w-14" /> : null}
          <col className="w-14" />
          <col className="w-11" />
        </colgroup>
        <TableHeader>
          <TableRow className="border-t hover:bg-transparent">
            <TableHead className="h-6 pl-3 text-xs font-medium text-muted-foreground">Set</TableHead>
            <TableHead className="h-6 text-xs font-medium text-muted-foreground">Önceki</TableHead>
            {showTarget ? <TableHead className="h-6 text-xs font-medium text-muted-foreground">Hedef</TableHead> : null}
            {weighted ? <TableHead className="h-6 text-xs font-medium text-muted-foreground">kg</TableHead> : null}
            <TableHead className="h-6 text-xs font-medium text-muted-foreground">{valueHead}</TableHead>
            <TableHead className="h-6">
              <span className="sr-only">Durum</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sets.map((set) => {
            const current = set.setIndex === currentSetIndex;
            const logged = set.logged;
            const kg = logged ? logged.kg : current ? currentKg : set.plannedKg;
            const value = logged ? (logged.reps ?? logged.seconds) : undefined;
            const label = `Set ${set.position + 1}`;
            return (
              <TableRow
                key={set.setIndex}
                ref={current ? currentRef : undefined}
                aria-current={current ? 'step' : undefined}
                onClick={logged ? () => onEditSet(logged.id) : undefined}
                className={cn('h-12 hover:bg-transparent', current && 'bg-primary/10 hover:bg-primary/10', logged && 'cursor-pointer')}>
                <TableCell className="relative pl-3 font-medium">
                  {current ? (
                    <motion.span layoutId="current-set-strip" transition={tween(DURATION.base)} className="absolute inset-y-0 left-0 w-[3px] bg-primary-strong" aria-hidden />
                  ) : null}
                  {set.position + 1}
                </TableCell>
                <TableCell className="truncate text-muted-foreground">{previousText(set.previous, row.trackingType)}</TableCell>
                {showTarget ? <TableCell className="text-muted-foreground">{targetCell(set.target, row.trackingType)}</TableCell> : null}
                {weighted ? (
                  <TableCell className={cn(logged ? 'font-semibold' : 'text-muted-foreground')}>{kg !== undefined ? formatNumber(kg) : '—'}</TableCell>
                ) : null}
                <TableCell className={cn(logged ? 'font-semibold' : 'text-muted-foreground')}>
                  {value !== undefined ? (row.trackingType === 'duration' ? `${value} sn` : value) : '—'}
                </TableCell>
                <TableCell className="p-0 text-center">
                  {logged ? (
                    <button
                      type="button"
                      aria-label={`${label}, ${setValueText(logged)}, yapıldı. Düzelt`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditSet(logged.id);
                      }}
                      className="inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <motion.span
                        initial={logged.id === freshSetId ? { scale: 0.6, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={tween(DURATION.fast)}
                        className="inline-flex size-7 items-center justify-center rounded-full bg-primary/20 text-primary [&_svg]:size-4">
                        <Check weight="bold" />
                      </motion.span>
                    </button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
