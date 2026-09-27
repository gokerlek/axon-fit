'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { ArrowBendUpRight, ArrowDown, ArrowsLeftRight, ArrowUp, Bandaids, Check, Equals, NotePencil, Play, Plus, Sparkle, Wrench, X } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { rowCareText } from '@/lib/constraint-filter';
import { formatNumber } from '@/lib/format';
import { DURATION, EASE, tween, WORKOUT } from '@/lib/motion';
import { REASON_LABELS, type SuggestionReason } from '@/lib/progression';
import type { Why } from '@/lib/recommend';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { isStraight } from '@/lib/set-plan';
import { cn } from '@/lib/utils';
import type { GroupMemberStatus, GroupView } from '@/lib/workout-groups';
import type { WorkoutRow } from '@/lib/workout-plan';
import { previousText, setValueText, targetCell, type SetView, type WarmupView } from '@/lib/workout-session';

const UP = new Set<string>(['increase', 'range_increase']);
const DOWN = new Set<string>(['decrease', 'deload', 'calibrate', 'pain_reduce']);

/** Gerekçenin ikonu: öneri katmanının tonu (`why.tone`), yoksa gerekçeden. */
function ReasonIcon({ reason, tone }: { reason: string; tone: Why['tone'] | undefined }) {
  if (tone ? tone === 'new' : reason === 'first_time') return <Sparkle />;
  if (tone ? tone === 'up' : UP.has(reason)) return <ArrowUp />;
  if (tone ? tone === 'down' : DOWN.has(reason)) return <ArrowDown />;
  return <Equals />;
}

/** Tek satırlık çip: taşarsa kırpılır; dokununca tamamı altında açılır (tasarım §2.4). */
function Chip({
  open,
  onToggle,
  tone,
  icon,
  label,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  tone: 'up' | 'plain' | 'muted';
  icon: React.ReactNode;
  /** Metni görünmeyen çipin erişilebilir adı. */
  label?: string;
  className?: string;
  children?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-7 min-w-0 shrink items-center gap-1 rounded-full px-2.5 text-[0.8125rem] outline-none before:absolute before:-inset-x-0.5 before:-inset-y-2 before:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone === 'up' ? 'bg-primary/15 text-primary' : tone === 'muted' ? 'bg-muted text-muted-foreground' : 'bg-muted text-foreground',
        className,
      )}>
      {icon}
      {children ? <span className="truncate">{children}</span> : null}
    </button>
  );
}

const MEMBER_STATUS_TEXT: Record<GroupMemberStatus, string> = {
  done: 'bu turda yapıldı',
  current: 'şimdi',
  pending: 'sırada',
  finished: 'setleri bitti, bu turda yok',
  skipped: 'geçildi',
};

/** "Değiştir" (§2.6): başlığın sağında; set kaydedilmiş harekette yok ("Hareketi geç ›" var). */
function SwapButton({ title, onSwap, className }: { title: string; onSwap: () => void; className?: string }) {
  return (
    <Button variant="ghost" aria-label={`${title}: değiştir`} className={cn('h-11 shrink-0 gap-1.5 px-2.5 text-primary hover:text-primary', className)} onClick={onSwap}>
      <ArrowsLeftRight data-icon="inline-start" />
      Değiştir
    </Button>
  );
}

/** Grubun başı (tasarım §2.4 "Gruplar"): "Süperset · Tur 2/3" ve üyeler; şu anki üye vurgulu. */
function GroupHeader({ group, swap }: { group: GroupView; swap: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-2 pt-2.5 pb-1">
      <div className={cn('flex items-center gap-2 px-1 text-[0.8125rem] text-muted-foreground tabular-nums', swap ? '-my-2.5 min-h-11' : 'h-6')}>
        <Badge className="bg-primary/15 text-primary">{group.label}</Badge>
        <span className="flex-1">
          Tur {group.round + 1}/{group.rounds}
        </span>
        {swap}
      </div>
      <ul className="flex flex-col">
        {group.members.map((member) => (
          <li
            key={member.rowId}
            aria-current={member.status === 'current' ? 'step' : undefined}
            className={cn(
              'grid h-9 grid-cols-[1.5rem_minmax(0,1fr)_auto_1.25rem] items-center gap-2 rounded-md px-1 text-sm transition-colors duration-220',
              member.status === 'current' && 'bg-primary/10',
              (member.status === 'finished' || member.status === 'skipped') && 'text-muted-foreground',
            )}>
            <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-xs font-semibold text-primary" aria-hidden>
              {member.letter}
            </span>
            <span className={cn('truncate', member.status === 'current' && 'font-semibold')}>
              <span className="sr-only">{member.letter}: </span>
              {member.title}
            </span>
            <span className="text-[0.8125rem] whitespace-nowrap text-muted-foreground tabular-nums">{member.status === 'finished' ? '—' : member.text}</span>
            <span className="grid place-items-center text-primary [&_svg]:size-4">
              {member.status === 'done' ? <Check weight="bold" aria-hidden /> : member.status === 'current' ? <Play weight="fill" aria-hidden /> : member.status === 'skipped' ? <ArrowBendUpRight aria-hidden className="text-muted-foreground" /> : null}
              <span className="sr-only">{MEMBER_STATUS_TEXT[member.status]}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Isınma satırı (tasarım §2.4): "Isınma 20×10 · 40×5" ve her set için ✓ (dokununca yapıldı / geri al). */
function WarmupRow({ warmups, onToggle }: { warmups: readonly WarmupView[]; onToggle: (index: number, done: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center gap-1 border-t pr-1.5 pl-3 text-sm tabular-nums">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        Isınma {warmups.map((warmup) => `${formatNumber(warmup.kg)}×${warmup.reps}`).join(' · ')}
      </span>
      {warmups.map((warmup) => (
        <button
          key={warmup.index}
          type="button"
          aria-pressed={Boolean(warmup.logged)}
          aria-label={`Isınma ${warmup.index + 1}, ${formatNumber(warmup.kg)} kg × ${warmup.reps}`}
          onClick={() => onToggle(warmup.index, !warmup.logged)}
          className="grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span
            className={cn(
              'grid size-8 place-items-center rounded-full border transition-colors duration-160 [&_svg]:size-4',
              warmup.logged ? 'border-transparent bg-primary/20 text-primary' : 'border-dashed border-input text-muted-foreground',
            )}>
            {warmup.logged ? <Check weight="bold" /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Ayar notunu düzeltme: tek satır, Kaydet; boş bırakmak notu siler. */
function SetupNoteForm({ note, onSave }: { note: string | undefined; onSave: (text: string) => void }) {
  const [text, setText] = useState(note ?? '');
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(text);
      }}>
      <label htmlFor="setup-note" className="text-[0.8125rem] text-muted-foreground">
        Ayar notun: sehpa, koltuk, delik… Sonraki sefer de burada.
      </label>
      <div className="flex gap-2">
        <Input
          id="setup-note"
          value={text}
          maxLength={SESSION_LIMITS.setupNote}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ör. Sehpa 3. delik"
          autoComplete="off"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 text-base"
        />
        <Button type="submit" variant="secondary" className="h-11 px-4">
          Kaydet
        </Button>
      </div>
    </form>
  );
}

/**
 * Hareket kartı (tasarım §2.4): başlık ≤ 2 satır, altında tek satırlık çipler (planın gerekçesi, danışanın
 * ayar notu, PT'nin notu), gerekiyorsa ısınma satırı ve set tablosu. Tablo gerçek `<table>`: Set ·
 * Önceki · (setlerin hedefi farklıysa Hedef) · kg · Tekrar/Süre · durum. Planın değerleri bir kez
 * görünür: düz setlerde hedef paneldedir; AMRAP set "8+". Şu anki satır vurgulu (şerit sonraki sete
 * kayar); yapılan sete dokunmak "Seti düzelt"i açar. Yeni kaydın ✓'u satıra, panel değişmeden önce düşer
 * (iOS'ta titreşim yok; kaydedildiğini bu gösterir). Onaylanmış aşırı yük satırda ↑ ile görünür.
 *
 * Grupta (süperset, devre, kompleks) başlığın yerinde tur ve üyeler; altta şu anki üyenin çipleri ve
 * tablosu. Üye değişince bu kısım 12 px kayarak gelir (`WORKOUT.groupSlidePx`).
 *
 * "Değiştir" (§2.6) başlığın sağında (grupta tur satırında, şu anki üye için): yalnız hareketin çalışma
 * seti kaydedilmemişken.
 *
 * "+ Set ekle" (§2.4) tablonun altında: planın son setini tekrarlayan fazladan bir set (grupta "+ Tur ekle":
 * her üyeye bir set). Fazladan satırın "Önceki" hücresinde "fazladan" yazar; bekleyen fazladan set satırdaki
 * ✕ ile bırakılır.
 */
export function ExerciseCard({
  row,
  group,
  sets,
  warmups,
  setupNote,
  currentSetIndex,
  currentKg,
  freshSetId,
  onEditSet,
  onToggleWarmup,
  onSetupNote,
  onSwap,
  onAddSet,
  onDropExtra,
  ownProgram = false,
}: {
  row: WorkoutRow;
  group: GroupView | null;
  sets: readonly SetView[];
  warmups: readonly WarmupView[];
  setupNote: string | undefined;
  /** Şu anki set (satırdaki yeri); hareket bittiyse null. */
  currentSetIndex: number | null;
  /** Şu anki setin önceden dolu (ya da değiştirilmiş) ağırlığı. */
  currentKg: number | undefined;
  /** Az önce kaydedilen set: ✓'u belirerek gelir. */
  freshSetId: string | null;
  onEditSet: (setId: string) => void;
  onToggleWarmup: (index: number, done: boolean) => void;
  onSetupNote: (text: string) => void;
  /** "Değiştir" açıksa muadil sheet'ini açar; kapalıysa null. */
  onSwap: (() => void) | null;
  /** "+ Set ekle" (grupta tur); kapalıysa (kaydedilirken, sınırda) null. */
  onAddSet: (() => void) | null;
  /** Bekleyen fazladan seti bırakır. */
  onDropExtra: () => void;
  /** Kendi programda satır notu danışanın kendi notudur: etiket "Not:" (`docs/design/kendi-program.md` §2.9). */
  ownProgram?: boolean;
}) {
  const [open, setOpen] = useState<'reason' | 'note' | 'setup' | 'care' | null>(null);
  const [warmOpen, setWarmOpen] = useState(false);
  // Grupta üye değişince (ya da hareket muadille değişince) açık çip kapanır (her hareketin kendi notu var).
  const shownKey = `${row.rowId}:${row.exerciseId}`;
  const [shownRow, setShownRow] = useState(shownKey);
  if (shownRow !== shownKey) {
    setShownRow(shownKey);
    setOpen(null);
    setWarmOpen(false);
  }
  const reduced = useReducedMotion();
  // Hareket değişirken çıkan kart başlığın kimliğini bırakır: odak yeni kartın başlığına gider.
  const present = useIsPresent();
  const currentRef = useRef<HTMLTableRowElement>(null);
  const weighted = row.trackingType === 'weight_reps';
  const showTarget = !isStraight(sets.map((set) => set.target));
  const valueHead = row.trackingType === 'duration' ? 'Süre' : 'Tekrar';
  const reason = row.plan.reason as SuggestionReason;
  // Öneri katmanının gerekçesi (§5.7): kısa çip ve tamamı; eski anlık görüntüde gerekçenin genel metni.
  const reasonChip = row.why?.chip ?? REASON_LABELS[reason] ?? '';
  const reasonDetail = row.why?.detail ?? REASON_LABELS[reason] ?? '';
  const reasonUp = row.why ? row.why.tone === 'up' : UP.has(reason);
  const warmDone = warmups.length > 0 && warmups.every((warmup) => warmup.logged);
  const toggle = (chip: 'reason' | 'note' | 'setup' | 'care') => setOpen(open === chip ? null : chip);
  // Danışanın kısıtından not (tasarım `kisit-tarama.md` §3.5): tanı adı yok, bölge ve taraf var.
  const care = row.care ? rowCareText(row.care) : null;

  // Şu anki satır panelin üstünde görünür kalsın (4+ sette, grupta tablo kayar).
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [currentSetIndex, row.rowId, reduced]);

  const title = group ? `${group.members.find((member) => member.rowId === row.rowId)?.letter ?? ''}: ${row.title}` : row.title;

  return (
    <Card className="gap-0 py-0">
      {group ? <GroupHeader group={group} swap={onSwap ? <SwapButton title={row.title} onSwap={onSwap} className="-mr-1.5" /> : null} /> : null}
      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={shownKey}
            initial={{ opacity: 0, x: WORKOUT.groupSlidePx }}
            animate={{ opacity: 1, x: 0, transition: tween(DURATION.base) }}
            exit={{ opacity: 0, x: -WORKOUT.groupSlidePx, transition: tween(DURATION.fast, EASE.exit) }}>
            <div className={cn('flex flex-col gap-1.5 px-3 pb-2', group ? 'pt-1' : 'pt-3')}>
              <div className={cn(!group && onSwap && '-my-1 flex min-h-11 items-center gap-2')}>
                <h2
                  id={present ? 'exercise-title' : undefined}
                  tabIndex={-1}
                  className={cn(group ? 'sr-only' : 'line-clamp-2 min-w-0 flex-1 font-heading text-[1.1875rem] leading-tight font-semibold outline-none')}>
                  {title}
                </h2>
                {!group && onSwap ? <SwapButton title={row.title} onSwap={onSwap} className="-mr-2" /> : null}
              </div>
              {care ? (
                <Chip
                  open={open === 'care'}
                  onToggle={() => toggle('care')}
                  tone={row.care?.kind === 'avoid' ? 'up' : 'plain'}
                  icon={<Bandaids />}
                  label={`${care.title}. Aç`}
                  className="my-1.5 w-fit max-w-full">
                  {care.title}
                </Chip>
              ) : null}
              {open === 'care' && care ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[0.8125rem] text-muted-foreground">{care.text}</p>
                  {row.care?.kind === 'avoid' && onSwap ? (
                    <Button className="h-11 w-fit" onClick={onSwap}>
                      <ArrowsLeftRight data-icon="inline-start" />
                      Değiştir
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex min-h-8 items-center gap-1.5 overflow-hidden">
                <Chip open={open === 'reason'} onToggle={() => toggle('reason')} tone={reasonUp ? 'up' : 'plain'} icon={<ReasonIcon reason={reason} tone={row.why?.tone} />}>
                  {reasonChip}
                </Chip>
                {setupNote ? (
                  <Chip open={open === 'setup'} onToggle={() => toggle('setup')} tone="plain" icon={<Wrench />} label={`Ayar notun: ${setupNote}. Düzelt`} className="max-w-[45%]">
                    {setupNote}
                  </Chip>
                ) : null}
                {row.note ? (
                  <Chip open={open === 'note'} onToggle={() => toggle('note')} tone="plain" icon={<NotePencil />}>
                    {row.note}
                  </Chip>
                ) : null}
                {warmDone && !warmOpen ? (
                  <Chip open={false} onToggle={() => setWarmOpen(true)} tone="muted" icon={<Check weight="bold" />} className="shrink-0" label="Isınma yapıldı. Göster">
                    Isınma
                  </Chip>
                ) : null}
                {setupNote ? null : (
                  <Chip open={open === 'setup'} onToggle={() => toggle('setup')} tone="muted" icon={<Plus weight="bold" />} label="Ayar notu ekle" className="shrink-0 px-2" />
                )}
              </div>
              {open === 'reason' ? <p className="text-[0.8125rem] text-muted-foreground">{reasonDetail}</p> : null}
              {open === 'note' ? <p className="text-[0.8125rem] text-muted-foreground">{ownProgram ? 'Not' : 'Antrenörünün notu'}: {row.note ?? ''}</p> : null}
              {open === 'setup' ? (
                <SetupNoteForm
                  note={setupNote}
                  onSave={(text) => {
                    onSetupNote(text);
                    setOpen(null);
                  }}
                />
              ) : null}
            </div>

            {warmups.length > 0 && (!warmDone || warmOpen) ? <WarmupRow warmups={warmups} onToggle={onToggleWarmup} /> : null}

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
                  const amrap = Boolean(set.target.amrap);
                  return (
                    <TableRow
                      key={set.extra ? `extra-${set.setIndex}` : set.setIndex}
                      ref={current ? currentRef : undefined}
                      aria-current={current ? 'step' : undefined}
                      onClick={logged ? () => onEditSet(logged.id) : undefined}
                      className={cn('h-12 scroll-mb-3 hover:bg-transparent', current && 'bg-primary/10 hover:bg-primary/10', logged && 'cursor-pointer')}>
                      <TableCell className="relative pl-3 font-medium">
                        {current ? (
                          <motion.span layoutId="current-set-strip" transition={tween(DURATION.base)} className="absolute inset-y-0 left-0 w-[3px] bg-primary-strong" aria-hidden />
                        ) : null}
                        {set.position + 1}
                        {amrap ? <span className="sr-only">, AMRAP</span> : null}
                      </TableCell>
                      <TableCell className="truncate text-muted-foreground">{set.extra ? 'fazladan' : previousText(set.previous, row.trackingType)}</TableCell>
                      {showTarget ? <TableCell className="text-muted-foreground">{targetCell(set.target, row.trackingType)}</TableCell> : null}
                      {weighted ? (
                        <TableCell className={cn(logged ? 'font-semibold' : 'text-muted-foreground')}>
                          <span className="inline-flex items-center gap-0.5">
                            {kg !== undefined ? formatNumber(kg) : '—'}
                            {logged?.overload ? (
                              <>
                                <ArrowUp weight="bold" className="size-3.5 text-destructive-text" aria-hidden />
                                <span className="sr-only">, hedefin çok üzerinde</span>
                              </>
                            ) : null}
                          </span>
                        </TableCell>
                      ) : null}
                      <TableCell className={cn(logged ? 'font-semibold' : 'text-muted-foreground')}>
                        {value !== undefined
                          ? row.trackingType === 'duration'
                            ? `${value} sn`
                            : value
                          : amrap && !showTarget
                            ? targetCell(set.target, row.trackingType)
                            : '—'}
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
                        ) : set.extra ? (
                          <button
                            type="button"
                            aria-label={`${label}, fazladan: ${group ? 'turu' : 'seti'} kaldır`}
                            onClick={onDropExtra}
                            className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4">
                            <X weight="bold" />
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {onAddSet ? (
              <Button variant="ghost" className="h-11 w-full justify-start gap-2 rounded-none border-t px-3 text-primary hover:text-primary" onClick={onAddSet}>
                <Plus data-icon="inline-start" weight="bold" />
                {group ? 'Tur ekle' : 'Set ekle'}
              </Button>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}
