'use client';

import { useMemo } from 'react';
import { getDeepError, setInput, useField, useFieldArray } from '@formisch/react';
import { ArrowsSplit, Barbell, CaretDown, LinkBreak, NoteBlank, Plus, TrendUp, Trash, WarningCircle } from '@phosphor-icons/react';
import { ARMED, CardBadge, CardFace, CardGrabber, ExerciseCard, ExerciseCardSection, PLACEHOLDER } from '@/components/exercise-card';
import { GroupedSelect, LabeledSelect } from '@/components/labeled-select';
import { SwipeRow, type SwipeAction } from '@/components/swipe/swipe-row';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DEVICE_KIND_LABELS, DEVICE_KINDS, loadSpecFor } from '@/lib/device-loads';
import { familyOf } from '@/lib/muscles';
import { describeRule, describeSetRules, PROGRESSION_LABELS, RIR_LABELS, type ProgressionScheme } from '@/lib/progression';
import type { ReorderTarget } from '@/lib/reorder';
import { isStraight, setsText } from '@/lib/set-plan';
import { changeKind, deviceChoices, setRow, swapDevice, type PickerExercise } from '@/lib/template-edit';
import {
  BLOCK_KIND_HINTS,
  BLOCK_KIND_LABELS,
  TEMPLATE_LIMITS,
  groupSkipNote,
  kindOptions,
  roundsOf,
  rowRule,
  type BlockKind,
  type TemplateBlock,
  type TemplateRow,
} from '@/lib/template-plan';
import { cn } from '@/lib/utils';
import { DragGroup, DragItem, DropFace, DropLine, DropPill, Grabber } from './drag/drag-node';
import { useDragging } from './drag/drag-store';
import { blockField, bodyId, faceId, groupTitle, rowTitle, useEditor, type Editor } from './editor-context';
import { BlockSecondsField, RoundsField, SetCountField, SetsSection, SetsSummary, TargetField } from './set-table';

export { EditorContext, blockField, rowTitle, useEditor, type BlocksFormStore, type BlocksPath } from './editor-context';
export type { Editor };

/** Dokunmatikte ya da dar ekranda seçim kutusu ve öğeleri 44 px. */
const SELECT_TOUCH = {
  triggerClassName: 'touch:data-[size=default]:h-11',
  contentClassName: 'touch:**:data-[slot=select-item]:min-h-11',
} as const;

export const FULL_MESSAGE = 'Şablon dolu: en fazla 40 hareket, 30 blok';

const KEY_TARGETS: Partial<Record<string, ReorderTarget>> = { ArrowUp: 'up', ArrowDown: 'down', Home: 'top', End: 'end' };

const KEY_SHORTCUTS = 'Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End Alt+ArrowRight Alt+ArrowLeft Delete';

function seconds(value: number): string {
  return Number.isFinite(value) ? `${value} sn` : '? sn';
}

/** Yüzdeki klavye: Alt+↑/↓/Home/End taşır, Alt+→ öncekiyle gruplar, Alt+← ayırır, Delete siler, Esc kapatır. */
function useFaceKeys(itemId: string, isOpen: boolean): React.KeyboardEventHandler<HTMLButtonElement> {
  const editor = useEditor();
  return (event) => {
    if (event.key === 'Escape') {
      if (!isOpen) return;
      event.preventDefault();
      editor.toggleOpen(itemId);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.altKey) {
      const target = KEY_TARGETS[event.key];
      if (target) {
        event.preventDefault();
        editor.actions.step(itemId, target);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        editor.actions.groupWithPrevious(itemId);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        editor.actions.split(itemId);
      }
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      editor.actions.remove(itemId);
    }
  };
}

/** Açık gövdede Esc: kart kapanır, odak yüze döner (açılır listeler kendi Esc'lerini kullanır). */
function useBodyEscape(itemId: string): React.KeyboardEventHandler<HTMLDivElement> {
  const editor = useEditor();
  return (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // Portal'daki açılır listeler DOM'da gövdenin içinde değil: onların Esc'i kartı kapatmaz.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    editor.closeAndFocus(itemId);
  };
}

/**
 * Yüzün hemen arkasındaki sr-only şerit: klavyeyle odaklanınca görünür. Sürüklemenin
 * klavye ve ekran okuyucu yolu (kısayolları da var: Alt + ok).
 */
function MoveStrip({ itemId, kind, title }: { itemId: string; kind: 'single' | 'member' | 'group'; title: string }) {
  const editor = useEditor();
  const button = 'h-9 touch:h-11';
  return (
    <div role="group" aria-label={`${title}: taşı`} className="sr-only flex flex-wrap gap-1.5 px-3 pb-3 focus-within:not-sr-only">
      <Button type="button" variant="outline" size="sm" className={button} onClick={() => editor.actions.step(itemId, 'up')}>
        Yukarı taşı
      </Button>
      <Button type="button" variant="outline" size="sm" className={button} onClick={() => editor.actions.step(itemId, 'down')}>
        Aşağı taşı
      </Button>
      {kind === 'single' ? (
        <Button type="button" variant="outline" size="sm" className={button} onClick={() => editor.actions.groupWithPrevious(itemId)}>
          Öncekiyle grupla
        </Button>
      ) : kind === 'member' ? (
        <Button type="button" variant="outline" size="sm" className={button} onClick={() => editor.actions.ungroup(itemId)}>
          Gruptan çıkar
        </Button>
      ) : null}
    </div>
  );
}

/** Kütüphanede olmayan harekette yüzün sağında 🗑 "Sil". */
function FaceRemoveButton({ itemId }: { itemId: string }) {
  const editor = useEditor();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Sil: Silinmiş egzersiz"
      title="Sil"
      className="size-11 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:size-5"
      onClick={() => editor.actions.remove(itemId)}>
      <Trash aria-hidden />
    </Button>
  );
}

// Kaydırma panelleri (tasarım §3): sağda olumlu işlemler, solda sil ve dağıt. Hepsi kartın
// görünür düğmelerinin kopyası (açık gövdedeki Sil / Gruptan çıkar / Grubu dağıt).

function removeAction(editor: Editor, itemId: string): SwipeAction {
  return { key: 'remove', label: 'Sil', icon: <Trash />, tone: 'destructive', removes: true, onPress: () => editor.actions.remove(itemId) };
}

function Mark({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 [&_svg]:size-3.5">
      {children}
    </span>
  );
}

/** Meta satırı: setler (`setsText`) + dinlenme; sonunda kural, cihaz, not ve hata işaretleri. */
function RowMeta({ block, row, exercise, invalid }: { block: TemplateBlock; row: TemplateRow; exercise: PickerExercise | undefined; invalid: boolean }) {
  const { devices } = useEditor();
  const device = row.deviceId ? devices.get(row.deviceId) : undefined;
  const text = exercise
    ? `${setsText(row.sets, exercise.trackingType)}${block.kind === 'single' ? ` · ${seconds(block.restSeconds)}` : ''}`
    : null;
  return (
    <>
      {text ? <span className="truncate tabular-nums">{text}</span> : <span className="truncate font-mono">{row.exerciseId}</span>}
      {row.rule ? (
        <Mark label="Kendi ilerleme kuralı var">
          <TrendUp aria-hidden />
        </Mark>
      ) : null}
      {row.deviceId ? (
        <Mark label={`Cihaz: ${device?.name ?? row.deviceId}`}>
          <Barbell aria-hidden />
        </Mark>
      ) : null}
      {row.note?.trim() ? (
        <Mark label="Not var">
          <NoteBlank aria-hidden />
        </Mark>
      ) : null}
      {invalid ? (
        <Mark label="Düzeltilecek alan var">
          <WarningCircle aria-hidden className="text-destructive" />
        </Mark>
      ) : null}
    </>
  );
}

const RIR_ITEMS: Record<string, string> = Object.fromEntries(Object.entries(RIR_LABELS).map(([rir, label]) => [rir, label]));

/** Satırın ayrıntıları: ilerleme kuralı, cihaz ve not. */
function RowDetails({ blockIndex, rowIndex, row, exercise }: { blockIndex: number; rowIndex: number; row: TemplateRow; exercise: PickerExercise }) {
  const editor = useEditor();
  const { form, path, devices, deviceList, exerciseList, exercises } = editor;
  const noteField = useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'note') });
  const rule = rowRule(row, exercise);
  const deviceId = row.deviceId ?? exercise.deviceId;
  const device = deviceId ? devices.get(deviceId) : undefined;
  const spec = loadSpecFor(exercise, device);
  const setRules = describeSetRules(row.sets, spec);
  const ownDevice = exercise.deviceId ? devices.get(exercise.deviceId) : undefined;
  const swapContext = useMemo(() => ({ exercises: exerciseList, devices, familyOf }), [exerciseList, devices]);

  // Cihaz seçenekleri pahalı (her cihaz için muadil hesabı): yalnız hareket ya da cihaz değişince.
  const groups = useMemo(() => {
    const choices = deviceChoices(row, { ...swapContext, deviceList }).filter((choice) => choice.result.kind !== 'reset');
    return DEVICE_KINDS.map((kind) => ({
      label: DEVICE_KIND_LABELS[kind],
      options: choices
        .filter((choice) => devices.get(choice.deviceId)?.kind === kind)
        .map((choice) => ({ value: choice.deviceId, label: choice.label })),
    })).filter((group) => group.options.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- satırın yalnız egzersizi ve cihazı seçenekleri değiştirir
  }, [row.exerciseId, row.deviceId, swapContext, deviceList, devices]);

  const writeRule = (next: { scheme: ProgressionScheme; targetRir: number }) =>
    setInput(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'rule'), input: next });

  const changeDevice = (value: string) => {
    const result = swapDevice(row, value || null, swapContext);
    if (result.kind === 'unavailable') return;
    if (result.kind === 'swapped') {
      const from = exercises.get(result.from)?.title ?? result.from;
      const to = exercises.get(result.to)?.title ?? result.to;
      editor.updateWithUndo((before) => setRow(before, result.row), `Cihaz değişince hareket de değişti: ${from} → ${to}`);
      return;
    }
    editor.update((before) => setRow(before, result.row));
  };

  return (
    <div id={`details-${row.id}`} className="grid grid-cols-1 gap-4 px-3 pt-3 pb-3 sm:grid-cols-2">
      <Field className="gap-1.5">
        <FieldLabel htmlFor={`scheme-${row.id}`}>İlerleme</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <LabeledSelect
            {...SELECT_TOUCH}
            id={`scheme-${row.id}`}
            value={rule.scheme}
            labels={PROGRESSION_LABELS}
            onChange={(scheme) => writeRule({ scheme, targetRir: rule.targetRir })}
          />
          <LabeledSelect
            {...SELECT_TOUCH}
            id={`rir-${row.id}`}
            value={String(rule.targetRir)}
            labels={RIR_ITEMS}
            onChange={(rir) => writeRule({ scheme: rule.scheme, targetRir: Number(rir) })}
          />
        </div>
        <FieldDescription>{describeRule(rule, spec)}</FieldDescription>
        {setRules ? <FieldDescription>{setRules}</FieldDescription> : null}
        {row.rule ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start touch:h-11"
            onClick={() => setInput(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'rule'), input: undefined })}>
            Egzersizin kuralına dön
          </Button>
        ) : null}
      </Field>

      <Field className="gap-1.5">
        <FieldLabel htmlFor={`device-${row.id}`}>Cihaz</FieldLabel>
        <GroupedSelect
          {...SELECT_TOUCH}
          id={`device-${row.id}`}
          value={row.deviceId ?? ''}
          groups={groups}
          empty={ownDevice ? `Egzersizin cihazı: ${ownDevice.name}` : 'Cihazsız'}
          onChange={changeDevice}
        />
        <FieldDescription>
          Cihaz değişince hareket, o cihazdaki muadiline geçer; muadil yoksa aynı hareket bu cihazda yapılır.
        </FieldDescription>
      </Field>

      <Field data-invalid={Boolean(noteField.errors) || undefined} className="gap-1.5 sm:col-span-2">
        <FieldLabel htmlFor={`note-${row.id}`}>Not</FieldLabel>
        <Input
          {...noteField.props}
          id={`note-${row.id}`}
          className="touch:h-11"
          maxLength={TEMPLATE_LIMITS.note}
          placeholder="Dizleri içe kaçırma"
          value={typeof noteField.input === 'string' ? noteField.input : ''}
        />
        <FieldDescription>{editor.noteHint}</FieldDescription>
        <FieldError>{noteField.errors?.[0]}</FieldError>
      </Field>
    </div>
  );
}

/** Açılır bölümün 44 px başlığı ("Ayrıntılar · kural · not"). */
function DisclosureButton({ open, controls, onToggle, children }: { open: boolean; controls: string; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="group/disclosure flex h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
      <span>{children}</span>
      <CaretDown
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground group-aria-expanded/disclosure:rotate-180 motion-safe:transition-transform motion-safe:duration-160"
      />
    </button>
  );
}

/** Açık gövdenin alt satırı: [Gruptan çıkar] / [Grubu dağıt] ve [🗑 Sil]. */
function BottomRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 border-t px-3 pt-3 pb-4">{children}</div>;
}

function RemoveButton({ itemId, label = 'Sil' }: { itemId: string; label?: string }) {
  const editor = useEditor();
  return (
    <Button type="button" variant="destructive" className="h-9 touch:h-11" onClick={() => editor.actions.remove(itemId)}>
      <Trash data-icon="inline-start" />
      {label}
    </Button>
  );
}

/**
 * Açık kart (tek hareket ya da üye): Set ve Dinlenme stepper'ları (üyede dinlenme grupta),
 * Hedef ve çipler (düz olmayan setlerde özet), "Setleri ayrı düzenle", "Ayrıntılar · kural ·
 * not", alt satır.
 */
function RowBody({
  block,
  blockIndex,
  row,
  rowIndex,
  exercise,
  title,
}: {
  block: TemplateBlock;
  blockIndex: number;
  row: TemplateRow;
  rowIndex: number;
  exercise: PickerExercise | undefined;
  title: string;
}) {
  const editor = useEditor();
  const { form, path } = editor;
  const single = block.kind === 'single';
  // Formisch kancası: set hatası okuması bu gövdenin çizimine bağlansın.
  useFieldArray(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets') });
  const exerciseField = useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'exerciseId') });
  const straight = isStraight(row.sets);
  const setError = Boolean(getDeepError(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets') }));
  const setsOpen = setError || (editor.setsOpen.get(row.id) ?? !straight);
  const detailsOpen = editor.detailsOpen.has(row.id);
  const onKeyDown = useBodyEscape(row.id);

  return (
    <div id={bodyId(row.id)} onKeyDown={onKeyDown}>
      {exercise ? (
        <ExerciseCardSection className="flex flex-wrap items-start gap-x-3 gap-y-3">
          <SetCountField row={row} exercise={exercise} />
          {single ? (
            <BlockSecondsField
              blockIndex={blockIndex}
              blockId={block.id}
              name="restSeconds"
              label="Dinlenme"
              max={TEMPLATE_LIMITS.restSeconds}
              step={15}
            />
          ) : (
            <p className="self-end pb-2 text-xs text-muted-foreground touch:pb-3">Dinlenme grup ayarlarında.</p>
          )}
          {straight ? (
            <TargetField blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} />
          ) : (
            <SetsSummary row={row} exercise={exercise} />
          )}
        </ExerciseCardSection>
      ) : (
        <ExerciseCardSection className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">
            Bu hareket kütüphanede yok (<span className="font-mono">{row.exerciseId}</span>). Kartı sil, yerine kütüphaneden yenisini ekle.
          </p>
          <FieldError>{exerciseField.errors?.[0]}</FieldError>
        </ExerciseCardSection>
      )}

      {exercise ? (
        <SetsSection blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} title={title} open={setsOpen} forced={setError} />
      ) : null}

      {exercise ? (
        <div className="border-t">
          <DisclosureButton open={detailsOpen} controls={`details-${row.id}`} onToggle={() => editor.toggleDetails(row.id)}>
            Ayrıntılar <span className="text-muted-foreground">· kural · not</span>
          </DisclosureButton>
          {detailsOpen ? <RowDetails blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} /> : null}
        </div>
      ) : null}

      <BottomRow>
        {single ? null : (
          <Button type="button" variant="outline" className="h-9 touch:h-11" onClick={() => editor.actions.ungroup(row.id)}>
            <LinkBreak data-icon="inline-start" />
            Gruptan çıkar
          </Button>
        )}
        <RemoveButton itemId={row.id} />
      </BottomRow>
    </div>
  );
}

/**
 * Tek hareketin ya da grup üyesinin kartı: çizgi, yüz, açıkken gövde. Yüz kayar (tek: ← Sil;
 * üye: → [Çıkar], ← Sil). Kopyalama yok (PT kararı 14). Seçim modunda tek hareketin
 * kabına dokunmak seçer; üye tek başına seçilmez (grubu seçilir).
 */
function RowCard({ block, blockIndex, row, rowIndex }: { block: TemplateBlock; blockIndex: number; row: TemplateRow; rowIndex: number }) {
  const editor = useEditor();
  const { form, path, exercises, labels, open, highlight, selecting, selected } = editor;
  const dragging = useDragging();
  // Formisch kancası: satırın hata okuması bu kartın çizimine bağlansın.
  useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'exerciseId') });
  const exercise = exercises.get(row.exerciseId);
  const title = rowTitle(row, exercises);
  const single = block.kind === 'single';
  const last = rowIndex === block.rows.length - 1;
  const isOpen = open.has(row.id);
  const checked = single && selected.has(block.id);
  const invalid =
    Boolean(getDeepError(form, { path: blockField(path, blockIndex, 'rows', rowIndex) })) ||
    (single && Boolean(getDeepError(form, { path: blockField(path, blockIndex, 'restSeconds') })));
  const onKeyDown = useFaceKeys(row.id, isOpen);

  // Sağa kaydırma yalnız üyede: "Çıkar" (kopyalama yok; PT kararı 13, 14).
  const start: SwipeAction[] = single
    ? []
    : [
        {
          key: 'ungroup',
          label: 'Çıkar',
          icon: <LinkBreak />,
          tone: 'neutral' as const,
          disabled: editor.blocks.length >= TEMPLATE_LIMITS.blocks,
          onPress: () => editor.actions.ungroup(row.id),
        },
      ];

  const content = (
    <>
      <CardFace
        id={faceId(row.id)}
        badge={<CardBadge>{labels.get(row.id)}</CardBadge>}
        title={title}
        titleClassName={exercise ? undefined : 'text-destructive'}
        meta={<RowMeta block={block} row={row} exercise={exercise} invalid={invalid} />}
        label={selecting ? title : `${title}, ayrıntıları aç/kapat`}
        expanded={isOpen}
        controls={bodyId(row.id)}
        onToggle={() => editor.toggleOpen(row.id)}
        onKeyDown={selecting ? undefined : onKeyDown}
        keyShortcuts={KEY_SHORTCUTS}
        action={selecting || exercise ? undefined : <FaceRemoveButton itemId={row.id} />}
        status={<DropPill itemId={row.id} />}
        after={<MoveStrip itemId={row.id} kind={single ? 'single' : 'member'} title={title} />}
        invalid={invalid}
        selection={selecting && single ? { checked } : undefined}
        grabber={<Grabber onTap={() => editor.toggleOpen(row.id)} />}
        slide={
          selecting
            ? undefined
            : (face) => (
                <SwipeRow
                  id={row.id}
                  start={start}
                  end={[removeAction(editor, row.id)]}
                  // "Çıkar" tam kaydırmayla tetiklenmez: dokunarak seçilir.
                  fullStart={false}
                  disabled={dragging}
                  nudge={editor.nudgeId === row.id}
                  onNudged={editor.onNudged}
                  // Yüz kartın üst kenarından başlar (kapalıyken altına kadar iner): kayan yüz ve panel
                  // kartın yuvarlak köşelerinden taşmaz.
                  className={single ? (isOpen ? 'rounded-t-[calc(var(--radius)-1px)]' : 'rounded-[calc(var(--radius)-1px)]') : undefined}>
                  {face}
                </SwipeRow>
              )
        }
      />
      {isOpen ? <RowBody block={block} blockIndex={blockIndex} row={row} rowIndex={rowIndex} exercise={exercise} title={title} /> : null}
      {single ? null : <DropLine destination={{ at: 'group', blockId: block.id, index: rowIndex }} edge="before" />}
      {!single && last ? <DropLine destination={{ at: 'group', blockId: block.id, index: rowIndex + 1 }} edge="after" /> : null}
    </>
  );

  return (
    <DragItem
      itemId={row.id}
      domId={`row-${row.id}`}
      drop={{ kind: single ? 'single' : 'member', blockId: block.id }}
      disabled={selecting}
      render={(props) =>
        single ? (
          <ExerciseCard
            {...props}
            highlighted={highlight === row.id}
            selected={checked}
            // Seçim modunda kabın her yeri seçer (yüzün click'i de buraya çıkar); Shift+tık aralık.
            onClick={selecting ? (event) => editor.toggleSelect(block.id, event.shiftKey) : undefined}
            className={selecting ? 'cursor-pointer' : undefined}
          />
        ) : (
          <section
            {...props}
            aria-label={title}
            data-highlighted={highlight === row.id || undefined}
            // Kaydırarak silinince üye 220 ms'de kapanır.
            data-swipe-collapse
            className={cn(
              'relative flex min-w-0 scroll-mt-24 scroll-mb-(--editor-bar-clearance) flex-col border-t border-primary/25 text-sm motion-safe:transition-[box-shadow,background-color] motion-safe:duration-300',
              'data-armed:rounded-lg data-dragging:rounded-lg data-dragging:border data-highlighted:rounded-lg data-highlighted:ring-2 data-highlighted:ring-primary/60',
              PLACEHOLDER,
              ARMED,
            )}
          />
        )
      }>
      {content}
    </DragItem>
  );
}

/** Grubun açık yüzü: tür, tur, tur sonu dinlenme, (devrede) istasyon arası, açıklama, alt satır. */
function GroupSettings({ block, blockIndex }: { block: TemplateBlock; blockIndex: number }) {
  const editor = useEditor();
  const options = kindOptions(block.rows.length);
  const kind = block.kind === 'single' ? 'superset' : block.kind;
  const rounds = roundsOf(block);
  const skipNote = groupSkipNote(block, (row) => rowTitle(row, editor.exercises));
  const onKeyDown = useBodyEscape(block.id);
  const tooMany = editor.blocks.length - 1 + block.rows.length > TEMPLATE_LIMITS.blocks;

  return (
    <div id={bodyId(block.id)} onKeyDown={onKeyDown}>
      <div className="flex flex-col gap-3 border-t border-primary/25 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" id={`kind-${block.id}`}>
            Tür
          </span>
          <ToggleGroup
            variant="outline"
            spacing={0}
            aria-labelledby={`kind-${block.id}`}
            value={[block.kind]}
            onValueChange={(value) => {
              const next = value[0] as BlockKind | undefined;
              if (next && next !== block.kind) editor.update((before) => changeKind(before, block.id, next));
            }}>
            {options.map((option) => (
              <ToggleGroupItem key={option} value={option} className="h-8 px-3 touch:h-11">
                {BLOCK_KIND_LABELS[option]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <RoundsField block={block} rounds={rounds} />
          <BlockSecondsField
            blockIndex={blockIndex}
            blockId={block.id}
            name="restSeconds"
            label="Tur sonu dinlenme"
            max={TEMPLATE_LIMITS.restSeconds}
            step={15}
          />
          {block.kind === 'circuit' ? (
            <BlockSecondsField
              blockIndex={blockIndex}
              blockId={block.id}
              name="transitionSeconds"
              label="İstasyon arası"
              max={TEMPLATE_LIMITS.transitionSeconds}
              step={5}
            />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{BLOCK_KIND_HINTS[kind]}</p>
        {skipNote ? <p className="text-xs text-muted-foreground">{skipNote}</p> : null}
      </div>
      <BottomRow>
        <Button
          type="button"
          variant="outline"
          className="h-9 touch:h-11"
          aria-disabled={tooMany || undefined}
          title={tooMany ? FULL_MESSAGE : undefined}
          onClick={() => (tooMany ? editor.announce(FULL_MESSAGE) : editor.actions.dissolve(block.id))}>
          <LinkBreak data-icon="inline-start" />
          Grubu dağıt
        </Button>
        <RemoveButton itemId={block.id} />
      </BottomRow>
    </div>
  );
}

/**
 * Grup: tek kap (vurgu tonlu kenar, %4 zemin). Kabın çizgisi bütün grubu, üyenin çizgisi
 * yalnız o üyeyi taşır. Üyeler ince çizgiyle ayrılan bölümlerdir (kart içinde kart yok);
 * en altta "+ Gruba hareket ekle". Grup yüzü kayar (← [Dağıt][Sil]). Seçim
 * modunda grubun her yeri grubu seçer; üyeler soluk ve etkileşimsizdir.
 */
function GroupCard({ block, blockIndex }: { block: TemplateBlock; blockIndex: number }) {
  const editor = useEditor();
  const { form, path, open, highlight, selecting, selected } = editor;
  const dragging = useDragging();
  const rowsArray = useFieldArray(form, { path: blockField(path, blockIndex, 'rows') });
  const kind = block.kind === 'single' ? 'superset' : block.kind;
  const title = groupTitle(block, blockIndex);
  const rounds = roundsOf(block);
  const isOpen = open.has(block.id);
  const checked = selected.has(block.id);
  const invalid =
    Boolean(getDeepError(form, { path: blockField(path, blockIndex, 'restSeconds') })) ||
    Boolean(getDeepError(form, { path: blockField(path, blockIndex, 'transitionSeconds') }));
  const onKeyDown = useFaceKeys(block.id, isOpen);
  const tooMany = editor.blocks.length - 1 + block.rows.length > TEMPLATE_LIMITS.blocks;
  const meta = [
    `${block.rows.length} hareket`,
    `${rounds} tur`,
    `${seconds(block.restSeconds)} tur sonu`,
    block.kind === 'circuit' && block.transitionSeconds !== undefined ? `istasyon ${seconds(block.transitionSeconds)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const end: SwipeAction[] = [
    {
      key: 'dissolve',
      label: 'Dağıt',
      icon: <ArrowsSplit />,
      tone: 'neutral',
      disabled: tooMany,
      onPress: () => (tooMany ? editor.announce(FULL_MESSAGE) : editor.actions.dissolve(block.id)),
    },
    removeAction(editor, block.id),
  ];

  const head = (
    <>
      <CardFace
        id={faceId(block.id)}
        badge={<CardBadge tone="group">{blockIndex + 1}</CardBadge>}
        title={BLOCK_KIND_LABELS[kind]}
        meta={
          <>
            <span className="truncate tabular-nums">{meta}</span>
            {invalid ? (
              <Mark label="Düzeltilecek alan var">
                <WarningCircle aria-hidden className="text-destructive" />
              </Mark>
            ) : null}
          </>
        }
        label={selecting ? title : `${title}, ayarları aç/kapat`}
        expanded={isOpen}
        controls={bodyId(block.id)}
        onToggle={() => editor.toggleOpen(block.id)}
        onKeyDown={selecting ? undefined : onKeyDown}
        keyShortcuts={KEY_SHORTCUTS}
        status={<DropPill itemId={block.id} />}
        after={<MoveStrip itemId={block.id} kind="group" title={title} />}
        invalid={invalid}
        selection={selecting ? { checked } : undefined}
        grabber={<Grabber tone="group" onTap={() => editor.toggleOpen(block.id)} />}
        slide={
          selecting
            ? undefined
            : (face) => (
                <SwipeRow
                  id={block.id}
                  end={end}
                  disabled={dragging}
                  nudge={editor.nudgeId === block.id}
                  onNudged={editor.onNudged}
                  // Grup yüzü kabın üst kenarından başlar: kayan yüz yuvarlak köşeden taşmaz.
                  className="rounded-t-[calc(var(--radius-xl)-1px)]">
                  {face}
                </SwipeRow>
              )
        }
      />
      {isOpen ? <GroupSettings block={block} blockIndex={blockIndex} /> : null}
    </>
  );

  return (
    <DragGroup
      itemId={block.id}
      domId={`group-${block.id}`}
      disabled={selecting}
      render={(props) => (
        <ExerciseCard
          {...props}
          tone="group"
          highlighted={highlight === block.id}
          selected={checked}
          aria-label={title}
          role="group"
          // Seçim modunda grubun her yeri grubu seçer (üyeler etkileşimsiz; dokunuş kaba düşer).
          onClick={selecting ? (event) => editor.toggleSelect(block.id, event.shiftKey) : undefined}
          className={selecting ? 'cursor-pointer' : undefined}
        />
      )}>
      <DropFace
        itemId={block.id}
        disabled={selecting}
        render={(props) => <div {...props} className={cn('relative rounded-t-[inherit] data-armed:rounded-xl', ARMED)} />}>
        {head}
      </DropFace>
      <div inert={selecting} className={cn('flex flex-col', selecting && 'opacity-60')}>
        {block.rows.map((row, rowIndex) => (
          <RowCard key={row.id} block={block} blockIndex={blockIndex} row={row} rowIndex={rowIndex} />
        ))}
      </div>
      {rowsArray.errors ? <FieldError className="px-3 pb-3">{rowsArray.errors[0]}</FieldError> : null}
      {selecting ? null : (
        <Button
          type="button"
          variant="ghost"
          aria-haspopup="dialog"
          aria-label={`Gruba hareket ekle: ${title}`}
          className="h-11 w-full rounded-none rounded-b-[inherit] border-t border-primary/25 text-primary hover:bg-primary/8 hover:text-primary"
          onClick={(event) => editor.openAddToGroup(block.id, event)}>
          <Plus data-icon="inline-start" />
          Gruba hareket ekle
        </Button>
      )}
    </DragGroup>
  );
}

/** Listenin bir bloğu (tek hareket ya da grup) ve üst düzey ekleme çizgileri. */
export function BlockItem({ block, blockIndex, count }: { block: TemplateBlock; blockIndex: number; count: number }) {
  const first = block.rows[0];
  return (
    // Kaydırarak silinince satır (ve liste aralığı) 220 ms'de kapanır.
    <li className="relative" data-swipe-collapse>
      <DropLine destination={{ at: 'top', index: blockIndex }} edge="before" />
      {block.kind === 'single' && first ? (
        <RowCard block={block} blockIndex={blockIndex} row={first} rowIndex={0} />
      ) : (
        <GroupCard block={block} blockIndex={blockIndex} />
      )}
      {blockIndex === count - 1 ? <DropLine destination={{ at: 'top', index: count }} edge="after" /> : null}
    </li>
  );
}

/** Sürüklenen overlay: kartın yüzü ve çizgisi (açık gövde yok), hafif büyümüş ve halkalı. */
export function ItemPreview({ itemId }: { itemId: string }) {
  const { blocks, exercises, labels } = useEditor();
  const blockIndex = blocks.findIndex((block) => block.id === itemId || block.rows.some((row) => row.id === itemId));
  const block = blocks[blockIndex];
  if (!block) return null;
  const group = block.id === itemId && block.kind !== 'single';
  const row = block.rows.find((item) => item.id === itemId);
  const exercise = row ? exercises.get(row.exerciseId) : undefined;
  return (
    <div
      className={cn(
        'origin-top rounded-lg border bg-card text-sm shadow-lg ring-2 ring-primary/40 motion-safe:scale-[1.02]',
        group && 'rounded-xl border-primary/40 bg-[color-mix(in_oklab,var(--primary)_4%,var(--card))]',
      )}>
      {group || !row ? (
        <CardFace
          static
          grabber={<CardGrabber tone="group" dragging />}
          badge={<CardBadge tone="group">{blockIndex + 1}</CardBadge>}
          title={BLOCK_KIND_LABELS[block.kind]}
          meta={<span className="truncate">{`${block.rows.length} hareket · ${roundsOf(block)} tur`}</span>}
        />
      ) : (
        <CardFace
          static
          grabber={<CardGrabber dragging />}
          badge={<CardBadge>{labels.get(row.id)}</CardBadge>}
          title={rowTitle(row, exercises)}
          titleClassName={exercise ? undefined : 'text-destructive'}
          meta={<RowMeta block={block} row={row} exercise={exercise} invalid={false} />}
        />
      )}
    </div>
  );
}
