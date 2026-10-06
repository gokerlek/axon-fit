'use client';

import { useDeferredValue, useMemo, useRef, useState } from 'react';
import {DndContext,PointerSensor,KeyboardSensor,useSensor,useSensors,useDraggable,useDroppable,closestCenter} from '@dnd-kit/core';
import {CSS} from '@dnd-kit/utilities';
import type {ReactNode} from 'react';
import { motion } from 'motion/react';
import { ArrowBendUpRight, ArrowClockwise, CaretRight, DotsSixVertical, Check, Circle, MagnifyingGlass, Play, Plus, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { searchExercises } from '@/lib/exercise-search';
import { DURATION, tween } from '@/lib/motion';
import { familyOf, summarizeMuscles } from '@/lib/muscles';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, MUSCLE_GROUPS, MUSCLE_LABELS, type Equipment, type Muscle } from '@/lib/schemas/exercise';
import { cn } from '@/lib/utils';
import { optionText, type FlowItem, type FlowView } from '@/lib/workout-flow';
import type { AlternativesResponse, LibraryItem, LibraryResponse, SwapOption } from '@/lib/workout-routes';

/** Telefonda alttan açılan, en çok ekran boyu sheet: başlık ve alt düğme sabit, arası kayar. */
const TALL = 'max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]';

/** Kütüphanede en çok bu kadar sonuç; gerisi için arama daraltılır. */
const RESULT_LIMIT = 50;

function StateIcon({ state }: { state: FlowItem['state'] }) {
  const icon =
    state === 'done' ? (
      <Check weight="bold" />
    ) : state === 'current' ? (
      <Play weight="fill" />
    ) : state === 'moved' ? (
      <ArrowClockwise />
    ) : state === 'skipped' ? (
      <ArrowBendUpRight />
    ) : (
      <Circle weight="bold" />
    );
  // "Sona alındı" satırın notunda yazılı; ekran okuyucuya iki kez okunmasın.
  const text = { done: 'yapıldı', current: 'şimdi', moved: null, pending: 'sırada', skipped: 'geçildi' }[state];
  return (
    <span className={cn('grid w-5 shrink-0 place-items-center [&_svg]:size-4.5', state === 'done' || state === 'current' ? 'text-primary' : 'text-muted-foreground')}>
      {icon}
      {text ? <span className="sr-only">{text}</span> : null}
    </span>
  );
}

/** Satırın adları: tek harekette "1  Bench Press", grupta alt alta "3a", "3b"; not küçük satırda. */
function Names({ item }: { item: FlowItem }) {
  const note = item.state === 'moved' ? 'sona alındı' : item.added ? 'eklendi' : item.kindLabel;
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-1.5">
      {item.members.map((member, index) => (
        <span key={member.rowId} className="flex min-w-0 items-baseline gap-2.5">
          <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">{member.number}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{member.title}</span>
            {index === 0 && note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
          </span>
        </span>
      ))}
    </span>
  );
}

function titleOf(item: FlowItem): string {
  return item.members.map((member) => member.title).join(' + ');
}

/** Satırın gövdesi: durum ikonu, numara ve adlar, set sayısı; şu anki satırda "şimdi". */
function RowBody({ item }: { item: FlowItem }) {
  return (
    <>
      <StateIcon state={item.state} />
      <Names item={item} />
      <span className="shrink-0 text-[0.8125rem] text-muted-foreground tabular-nums">
        {item.done}/{item.planned}
      </span>
      {item.state === 'current' ? (
        <span className="shrink-0 pr-1 text-xs font-semibold text-primary-text" aria-hidden>
          şimdi
        </span>
      ) : null}
    </>
  );
}

const ROW = 'flex min-h-13 min-w-0 flex-1 items-center gap-2.5 rounded-md pl-1.5 text-left';

/**
 * ☰ Antrenman akışı (tasarım §2.6): yapılış sırasında hareketler ve durumları; satıra dokunmak "Şimdi
 * yap", [Geç] tek dokunuşla sona alır (sona alınmışsa Geçilenler'e). Geçilenler'de [Geri al]. En altta
 * "Hareket ekle" (yalnız bu antrenmana). Sıra değişince satır yerine kayar (`layout`) ve bir an vurgulu
 * kalır (`highlight`, `DRAG.highlightMs`).
 */
function DragFlowRow({item,children,className,onReorder,previous,next}:{item:FlowItem;children:ReactNode;className:string;onReorder:(from:string,to:string)=>void;previous?:string;next?:string}){
 const drag=useDraggable({id:item.key});const drop=useDroppable({id:item.key});
 return <li ref={node=>{drag.setNodeRef(node);drop.setNodeRef(node);}} aria-current={item.state==='current'?'step':undefined} className={className} style={{transform:CSS.Translate.toString(drag.transform),position:'relative',zIndex:drag.isDragging?10:undefined}}>
  <button type="button" {...drag.attributes} {...drag.listeners} aria-label={`${titleOf(item)}: sırayı değiştir`} title="Sürükle veya Alt + yukarı/aşağı ok" onKeyDown={event=>{if(event.altKey && (event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();const target=event.key==='ArrowUp'?previous:next;if(target)onReorder(item.key,target);}else drag.listeners?.onKeyDown?.(event);}} className="grid size-11 shrink-0 touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><DotsSixVertical className="size-5"/></button>
  {children}
 </li>;
}

export function FlowSheet({
  open,
  onOpenChange,
  view,
  highlight,
  onJump,
  onSkip,
  onRestore,
  onAdd,
  onReorder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: FlowView;
  /** Az önce yeri değişen birim. */
  highlight: string | null;
  onJump: (key: string) => void;
  onSkip: (key: string) => void;
  onRestore: (key: string) => void;
  onAdd: () => void;
  onReorder:(from:string,to:string)=>void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(KeyboardSensor));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className={TALL} initialFocus={title}>
        <SheetHeader className="gap-1 pt-5 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <SheetTitle ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">
              Antrenman akışı
            </SheetTitle>
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {view.doneSets}/{view.plannedSets} set
            </span>
          </div>
          <SheetDescription>Tutamacı sürükleyerek sırayı değiştir. Klavyede Alt + yukarı/aşağı ok kullan. Alet doluysa Geç; harekete dokunarak hemen başlayabilirsin.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active,over})=>{if(over)onReorder(String(active.id),String(over.id));}}>
          <ul className="flex flex-col">
            {view.active.map((item,index) => {
              const jumpable = item.state !== 'done' && item.state !== 'current';
              return (
                <DragFlowRow
                  key={item.key} item={item} onReorder={onReorder} previous={view.active[index-1]?.key} next={view.active[index+1]?.key}
                  className={cn(
                    'flex items-center gap-2 rounded-md border-t transition-colors duration-300 first:border-t-0',
                    (item.state === 'current' || item.key === highlight) && 'border-transparent bg-primary/10 [&+li]:border-t-transparent',
                  )}>
                  {jumpable ? (
                    <button
                      type="button"
                      aria-label={`${titleOf(item)}: şimdi yap`}
                      onClick={() => onJump(item.key)}
                      className={cn(ROW, 'outline-none focus-visible:ring-3 focus-visible:ring-ring/50')}>
                      <RowBody item={item} />
                    </button>
                  ) : (
                    <div className={ROW}>
                      <RowBody item={item} />
                    </div>
                  )}
                  {item.state !== 'done' ? (
                    <Button variant="outline" className="h-11 shrink-0 px-3.5" aria-label={`${titleOf(item)}: geç`} onClick={() => onSkip(item.key)}>
                      Geç
                    </Button>
                  ) : null}
                </DragFlowRow>
              );
            })}
          </ul>
          </DndContext>
          {view.skipped.length > 0 ? (
            <>
              <p className="pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Geçilenler</p>
              <ul className="flex flex-col">
                {view.skipped.map((item) => (
                  <motion.li
                    key={item.key}
                    layout="position"
                    transition={tween(DURATION.slow)}
                    className={cn('flex min-h-13 items-center gap-2.5 rounded-md border-t pl-1.5 transition-colors duration-300 first:border-t-0', item.key === highlight && 'border-transparent bg-primary/10')}>
                    <StateIcon state="skipped" />
                    <Names item={item} />
                    <Button variant="outline" className="h-11 shrink-0 px-3.5" aria-label={`${titleOf(item)}: geri al`} onClick={() => onRestore(item.key)}>
                      Geri al
                    </Button>
                  </motion.li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <SheetFooter className="pt-3">
          <Button variant="outline" size="lg" className="h-12 w-full" onClick={onAdd}>
            <Plus data-icon="inline-start" weight="bold" />
            Hareket ekle
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export type SwapTarget = {
  dayId: string;
  /** Planın programı (`op_…` ya da `pt`): muadiller o programın geçmişiyle planlanır. */
  program: string;
  rowId: string;
  /** Şu anki hareket (muadil seçildiyse muadil). */
  title: string;
  /** Muadil seçildiyse asıl hareketin adı: listenin başında "Asıl hareket". */
  original: string | null;
};

function OptionButton({ title, text, care, busy, onPick }: { title: string; text: string; care?: string | undefined; busy?: boolean; onPick: () => void }) {
  return (
    <Item
      size="sm"
      className="min-h-14 flex-nowrap rounded-none border-0 border-t border-border px-0 text-left first:border-t-0 hover:bg-muted"
      render={<button type="button" aria-label={`${title} yap${care ? ` · ${care}` : ''}`} onClick={onPick} disabled={busy} />}>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate text-[0.9375rem]">{title}</ItemTitle>
        {text ? <ItemDescription className="truncate text-[0.8125rem] tabular-nums">{text}</ItemDescription> : null}
        {/* Danışanın kısıtında dikkat (tasarım `kisit-tarama.md` §3.4): "Sol diz için dikkatli". */}
        {care ? <ItemDescription className="truncate text-[0.8125rem] text-primary-text">{care}</ItemDescription> : null}
      </ItemContent>
      <ItemActions className="text-muted-foreground">{busy ? <Spinner /> : <CaretRight weight="bold" className="size-4" />}</ItemActions>
    </Item>
  );
}

/**
 * "Değiştir" (tasarım §2.6): "<Hareket> yerine" muadiller, ekipmana göre gruplu (vücut ağırlığı önce);
 * her biri kendi geçmişiyle planlı ("30 kg ile başla"). Muadil seçildiyse en üstte asıl hareket. Liste
 * sunucudan gelir (bağlantı yoksa söylenir, "Tekrar dene").
 */
export function SwapSheet({
  target,
  onClose,
  onPick,
}: {
  target: SwapTarget | null;
  onClose: () => void;
  /** `null`: asıl harekete dön. */
  onPick: (option: SwapOption | null) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const query = useServiceQuery<AlternativesResponse>({
    key: ['me', 'workout', 'alternatives', target?.program, target?.dayId, target?.rowId],
    fn: ({ signal }) =>
      fetchJson(
        `/api/me/workout/alternatives?day=${encodeURIComponent(target?.dayId ?? '')}&row=${encodeURIComponent(target?.rowId ?? '')}&program=${encodeURIComponent(target?.program ?? 'pt')}`,
        { signal },
      ),
    enabled: target !== null,
    notify: 'none',
    staleTime: 5 * 60_000,
  });
  const groups = query.data?.groups ?? [];
  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="bottom" showCloseButton={false} className={TALL} initialFocus={title}>
        <SheetHeader className="gap-1 pt-5 pb-2">
          <SheetTitle ref={title} tabIndex={-1} className="truncate text-lg font-semibold outline-none">
            {target?.title} yerine
          </SheetTitle>
          <SheetDescription>
            Aynı kaslar, ekipmana göre. {query.data?.careNote ?? 'Geçmişin yoksa rahat bir ağırlıkla başlarsın.'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {target?.original ? (
            <section aria-label="Asıl hareket">
              <p className="pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Asıl hareket</p>
              <OptionButton title={target.original} text="Programındaki hareket" onPick={() => onPick(null)} />
            </section>
          ) : null}
          {query.isPending && target ? (
            <div className="flex flex-col gap-3 pt-3" aria-busy="true">
              <span role="status" className="sr-only">
                Muadiller yükleniyor…
              </span>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 pt-3 text-sm">
              <p className="flex items-center gap-2 text-destructive-text">
                <WarningCircle weight="fill" className="size-4.5 shrink-0" />
                {query.error.status === 0 ? 'Bağlantı yok; muadiller açılamadı.' : query.error.message}
              </p>
              <Button variant="outline" className="h-11" onClick={() => void query.refetch()}>
                Tekrar dene
              </Button>
            </div>
          ) : groups.length === 0 && query.data ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyTitle>Muadil bulunamadı</EmptyTitle>
                <EmptyDescription>Alet doluysa hareketi geçebilirsin; sona alınır.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            groups.map((group) => (
              <section key={group.equipment} aria-label={group.label}>
                <p className="pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</p>
                {group.options.map((option) => (
                  <OptionButton key={option.exerciseId} title={option.title} text={optionText(option.extra)} care={option.care} onPick={() => onPick(option)} />
                ))}
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const GROUP_OF = new Map<string, string>(MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, group.label] as const)));

/** Aramada bir kasın adları: kendi adı, ailesi ("Kanat"), bölgesi ("Sırt"). */
function muscleNames(muscle: string): string[] {
  const family = familyOf(muscle);
  const names = [MUSCLE_LABELS[muscle as Muscle] ?? muscle, family === muscle ? '' : family, GROUP_OF.get(muscle) ?? ''];
  return [...new Set(names.filter(Boolean))];
}

/**
 * "Hareket ekle" (tasarım §2.6): kütüphaneden ada ya da kasa göre arama; seçilen hareket yalnız bu
 * antrenmana eklenir (bitişte antrenörüne öneri olabilir). Bugün zaten yapılanlar listede "bugün var"
 * der. Seçince planı sunucudan gelir (kendi geçmişiyle); o sırada satırda bekleme işareti.
 */
export function AddExerciseSheet({
  open,
  onOpenChange,
  todayIds,
  busyId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bugünün hareketleri. */
  todayIds: ReadonlySet<string>;
  /** Planı yüklenen hareket. */
  busyId: string | null;
  onPick: (item: LibraryItem) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const query = useServiceQuery<LibraryResponse>({
    key: ['me', 'workout', 'library'],
    fn: ({ signal }) => fetchJson('/api/me/workout/exercises', { signal }),
    enabled: open,
    notify: 'none',
    staleTime: 10 * 60_000,
  });
  const results = useMemo(() => searchExercises(query.data?.exercises ?? [], deferred, muscleNames).slice(0, RESULT_LIMIT), [query.data, deferred]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(next) => (next ? undefined : setSearch(''))}>
      <SheetContent side="bottom" showCloseButton={false} className={cn(TALL, 'h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))]')} initialFocus={title}>
        <SheetHeader className="gap-1 pt-5 pb-3">
          <SheetTitle ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">
            Hareket ekle
          </SheetTitle>
          <SheetDescription>Yalnız bu antrenmana eklenir; bitişte antrenörüne önerebilirsin.</SheetDescription>
          <InputGroup className="mt-2 h-11">
            <InputGroupAddon>
              <MagnifyingGlass />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              className="h-11 text-base"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
              }}
              placeholder="Hareket ya da kas ara"
              aria-label="Hareket ya da kas ara"
              autoComplete="off"
              enterKeyHint="search"
            />
          </InputGroup>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {query.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <span role="status" className="sr-only">
                Kütüphane yükleniyor…
              </span>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm">
              <p className="flex items-center gap-2 text-destructive-text">
                <WarningCircle weight="fill" className="size-4.5 shrink-0" />
                {query.error.status === 0 ? 'Bağlantı yok; kütüphane açılamadı.' : query.error.message}
              </p>
              <Button variant="outline" className="h-11" onClick={() => void query.refetch()}>
                Tekrar dene
              </Button>
            </div>
          ) : results.length === 0 ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyTitle>Sonuç yok</EmptyTitle>
                <EmptyDescription>Başka bir ad ya da kas dene.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div role="list" aria-label="Hareketler">
              {results.map((item) => {
                const muscles = summarizeMuscles(item.primaryMuscles as Muscle[]).join(', ');
                const equipment = EQUIPMENT_LABELS[item.equipment as Equipment] ?? item.equipment;
                return (
                  <div role="listitem" key={item.id}>
                    <Item
                      size="sm"
                      className="min-h-14 flex-nowrap rounded-none border-0 border-t border-border px-0 text-left hover:bg-muted"
                      render={<button type="button" aria-label={`${item.title} ekle${item.care ? ` · ${item.care}` : ''}`} disabled={busyId !== null} onClick={() => onPick(item)} />}>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate text-[0.9375rem]">{item.title}</ItemTitle>
                        <ItemDescription className="truncate text-[0.8125rem]">
                          {muscles} · {equipment}
                          {todayIds.has(item.id) ? ' · bugün var' : ''}
                        </ItemDescription>
                        {/* Kısıtta dikkat ("Değiştir"deki gibi); yasaklılar listede yok. */}
                        {item.care ? <ItemDescription className="truncate text-[0.8125rem] text-primary-text">{item.care}</ItemDescription> : null}
                      </ItemContent>
                      <ItemActions className="text-muted-foreground">{busyId === item.id ? <Spinner /> : <Plus weight="bold" className="size-4" />}</ItemActions>
                    </Item>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
