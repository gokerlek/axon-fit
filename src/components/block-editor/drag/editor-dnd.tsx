'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AutoScrollActivator,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
  type DroppableContainer,
} from '@dnd-kit/core';
import { dropAction, hitTest, isJoining, resolveHit, type DropBlock, type DropHit, type DropLayout, type DropResolution } from '@/lib/drop-target';
import { combineMessage, moveMessage } from '@/lib/edit-messages';
import { DRAG } from '@/lib/motion';
import { combineInto, moveItem } from '@/lib/template-edit';
import type { TemplateBlock } from '@/lib/template-plan';
import { useEditor } from '../editor-context';
import type { DropData } from './drag-node';
import { DragStoreContext, IDLE, createDragStore } from './drag-store';

/**
 * Düzenleyicinin sürükle-bırak motoru (@dnd-kit/core; sortable yok).
 *
 * - Sürükleme yalnız kartın üstündeki çizgiden başlar: tek `PointerSensor`, 4 px (basılı
 *   tutma yok; kalem de bununla çalışır). Kart sürüklenen düğümdür, yerinde kesik çizgili
 *   yer tutucu kalır; parmağın altında şerit + yüzden oluşan overlay durur.
 * - Kardeşler kaymaz. Çarpışma algılaması kartları üç banda ayırır (`drop-target.ts`):
 *   üst/alt %25 ekleme çizgisi, orta %50 "üstüne bırak". Ortada 250 ms beklenince hedef
 *   devreye girer (halka, titreşim, sonuç hapı); o zamana kadar en yakın çizgi görünür.
 * - Bırakınca forma tek yazım: `moveItem` (geri al yok; geri sürüklemek yeter) ya da
 *   `combineInto` ("Geri al"). Kart kapalı oturur ve 1,2 sn vurgulanır. Esc, pointercancel
 *   ya da listenin dışına bırakmak iptal eder.
 * - Ekranın üst ve alt 80 px'i otomatik kaydırır. Sürerken `html[data-reordering]` dock'u ve
 *   kullanıcı menüsünü çeker.
 */

type Session = {
  activeId: string;
  /** Sürüklenen bir grup: yalnız üst düzey boşluklar. */
  wholeGroup: boolean;
  /** Sürükleme başında ölçülen liste (sayfa koordinatı); kartlar sürüklerken yerinde durur. */
  layout: DropLayout | null;
  resolution: DropResolution;
  /** Orta bandında 250 ms beklenmiş hedef. */
  armedId: string | null;
  dwell: { targetId: string; timer: number } | null;
  /** Son duyurulan ret nedeni (aynısı tekrar duyurulmasın). */
  refusal: DropResolution['refusal'];
};

const NOTHING: DropResolution = { line: null, candidate: null, refusal: null };

/** dnd-kit'in kendi duyuruları kapalı: tutamak ekran okuyucuya kapalı, düzenleyicinin canlı bölgesi var. */
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

const REFUSALS: Record<'limit' | 'full', string> = {
  limit: 'Şablon dolu: en fazla 40 hareket, 30 blok',
  full: 'Grup dolu (8)',
};

function vibrate() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
}

function pageSpan(element: Element) {
  const rect = element.getBoundingClientRect();
  return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY };
}

/** Listeyi ölçer: blokların sırası formdan, kutular dnd-kit'in bırakma hedeflerinden. */
function measure(blocks: readonly TemplateBlock[], containers: readonly DroppableContainer[], list: HTMLElement | null): DropLayout | null {
  if (!list) return null;
  const nodes = new Map(containers.map((container) => [String(container.id), container.node.current]));
  const measured: DropBlock[] = [];
  for (const block of blocks) {
    const first = block.rows[0];
    if (block.kind === 'single') {
      const node = first ? nodes.get(first.id) : null;
      if (!first || !node) return null;
      measured.push({ id: first.id, span: pageSpan(node) });
      continue;
    }
    const face = nodes.get(block.id);
    const shell = face?.closest('[data-slot=exercise-group]');
    if (!face || !shell) return null;
    const members: { id: string; span: { top: number; bottom: number } }[] = [];
    for (const row of block.rows) {
      const node = nodes.get(row.id);
      if (!node) return null;
      members.push({ id: row.id, span: pageSpan(node) });
    }
    measured.push({ id: block.id, span: pageSpan(shell), face: pageSpan(face), members });
  }
  const rect = list.getBoundingClientRect();
  return {
    list: { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left + window.scrollX, right: rect.right + window.scrollX },
    blocks: measured,
  };
}

function hitOf(event: DragMoveEvent): DropHit {
  const data = event.collisions?.[0]?.data as { hit?: DropHit } | undefined;
  return data?.hit ?? { type: 'outside' };
}

export function EditorDnd({
  listRef,
  preview,
  children,
}: {
  /** Listenin öğesi: dışına bırakılan sürükleme iptal olur. */
  listRef: React.RefObject<HTMLElement | null>;
  /** Overlay: sürüklenen kartın şeridi ve yüzü. */
  preview: (itemId: string) => React.ReactNode;
  children: React.ReactNode;
}) {
  const editor = useEditor();
  const id = useId();
  const [store] = useState(createDragStore);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG.activationDistance } }));
  const session = useRef<Session | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [edge, setEdge] = useState(0.1);

  const latest = useRef(editor);
  useEffect(() => {
    latest.current = editor;
  });

  const collisionDetection = useCallback<CollisionDetection>(
    ({ droppableContainers, pointerCoordinates }) => {
      const current = session.current;
      if (!current || !pointerCoordinates) return [];
      // Kartlar sürüklerken yerinde durur: bir kez ölçülür, kaydırma işaretçinin sayfadaki yerine eklenir.
      current.layout ??= measure(latest.current.current(), droppableContainers, listRef.current);
      if (!current.layout) return [];
      const point = { x: pointerCoordinates.x + window.scrollX, y: pointerCoordinates.y + window.scrollY };
      const hit = hitTest(current.layout, point, current.wholeGroup);
      const target = hit.type === 'middle' ? hit.targetId : 'list';
      return [{ id: target, data: { hit } }];
    },
    [listRef],
  );

  /** Görünen hâl: çizgi (bırakınca taşınacak boşluk) ve beklenmiş hedef (hap, halka). */
  const publish = useCallback(() => {
    const current = session.current;
    if (!current) return;
    const { resolution, armedId } = current;
    const action = dropAction(resolution, armedId);
    const armed = resolution.candidate && resolution.candidate.targetId === armedId ? resolution.candidate : null;
    store.set({ activeId: current.activeId, line: action?.type === 'move' ? action.destination : null, armed });
  }, [store]);

  const clearDwell = (current: Session) => {
    if (current.dwell) window.clearTimeout(current.dwell.timer);
    current.dwell = null;
    current.armedId = null;
  };

  const finish = useCallback(() => {
    const current = session.current;
    if (current) clearDwell(current);
    session.current = null;
    delete document.documentElement.dataset.reordering;
    setActiveId(null);
    store.set(IDLE);
  }, [store]);

  useEffect(() => finish, [finish]);

  const onDragStart = ({ active }: DragStartEvent) => {
    const itemId = String(active.id);
    const blocks = latest.current.current();
    session.current = {
      activeId: itemId,
      wholeGroup: blocks.some((block) => block.id === itemId && block.kind !== 'single'),
      layout: null,
      resolution: NOTHING,
      armedId: null,
      dwell: null,
      refusal: null,
    };
    document.documentElement.dataset.reordering = '';
    setEdge(Math.min(0.45, DRAG.autoScrollEdge / Math.max(1, window.innerHeight)));
    setActiveId(itemId);
    store.set({ activeId: itemId, line: null, armed: null });
  };

  const onDragMove = (event: DragMoveEvent) => {
    const current = session.current;
    if (!current) return;
    const resolution = resolveHit(latest.current.current(), current.activeId, hitOf(event));
    current.resolution = resolution;

    // Orta bant: hedef değişince süre baştan; 250 ms dolunca devreye girer.
    const candidate = resolution.candidate;
    if (!candidate) clearDwell(current);
    else if (current.dwell?.targetId !== candidate.targetId) {
      clearDwell(current);
      const targetId = candidate.targetId;
      current.dwell = {
        targetId,
        timer: window.setTimeout(() => {
          const now = session.current;
          if (!now || now.dwell?.targetId !== targetId) return;
          now.armedId = targetId;
          const outcome = now.resolution.candidate?.outcome;
          if (outcome && isJoining(outcome)) vibrate();
          publish();
        }, DRAG.combineHoldMs),
      };
    }

    if (resolution.refusal !== current.refusal) {
      current.refusal = resolution.refusal;
      if (resolution.refusal) latest.current.announce(REFUSALS[resolution.refusal]);
    }
    publish();
  };

  const onDragEnd = () => {
    const current = session.current;
    const action = current ? dropAction(current.resolution, current.armedId) : null;
    finish();
    if (!current || !action) return;
    const { activeId: itemId } = current;
    const ed = latest.current;
    const titleOf = (exerciseId: string) => ed.exercises.get(exerciseId)?.title ?? 'Silinmiş egzersiz';
    const before = ed.current();
    if (action.type === 'move') {
      const next = moveItem(before, itemId, action.destination, ed.exercises, ed.newIds(before));
      if (next === before) return;
      ed.update(() => next, { highlight: itemId, announce: moveMessage(before, next, itemId, titleOf) });
    } else {
      const next = combineInto(before, itemId, action.targetId, ed.exercises);
      if (next === before) return;
      ed.updateWithUndo(() => next, combineMessage(before, itemId, action.targetId, action.outcome, titleOf), { highlight: itemId });
    }
    ed.close(itemId);
  };

  return (
    <DragStoreContext.Provider value={store}>
      <DndContext
        id={id}
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
        autoScroll={{ threshold: { x: 0, y: edge }, activator: AutoScrollActivator.Pointer }}
        accessibility={{ announcements: SILENT, restoreFocus: false, screenReaderInstructions: { draggable: '' } }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={finish}>
        {children}
        <DragOverlay dropAnimation={null} zIndex={60} style={{ height: 'auto' }}>
          {activeId ? preview(activeId) : null}
        </DragOverlay>
      </DndContext>
    </DragStoreContext.Provider>
  );
}

export type { DropData };
