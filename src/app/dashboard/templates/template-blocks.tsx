'use client';

import { createContext, useContext, useMemo } from 'react';
import { setInput, useField, useFieldArray, type FieldElementProps, type FormStore } from '@formisch/react';
import {
  ArrowDown,
  ArrowsClockwise,
  ArrowUp,
  CaretDown,
  Copy,
  DotsSixVertical,
  DotsThreeVertical,
  LinkBreak,
  LinkSimple,
  Trash,
} from '@phosphor-icons/react';
import { Reorder, useDragControls, type DragControls } from 'motion/react';
import { GroupedSelect, LabeledSelect } from '@/components/labeled-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { DEVICE_KIND_LABELS, DEVICE_KINDS, loadSpecFor } from '@/lib/device-loads';
import { familyOf, summarizeMuscles } from '@/lib/muscles';
import { describeRule, PROGRESSION_LABELS, RIR_LABELS, type ProgressionScheme } from '@/lib/progression';
import { EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import type { templateFormSchema } from '@/lib/schemas/template';
import {
  canJoin,
  deviceChoices,
  dissolveGroup,
  duplicateRow,
  idSource,
  joinBlocks,
  moveBlock,
  moveRowInGroup,
  removeRow,
  reorderRows,
  setRow,
  swapDevice,
  ungroupRow,
  changeKind,
  type EditorDevice,
  type PickerExercise,
} from '@/lib/template-edit';
import {
  BLOCK_KIND_HINTS,
  BLOCK_KIND_LABELS,
  TEMPLATE_LIMITS,
  countRows,
  kindOptions,
  ruleFor,
  type BlockKind,
  type TemplateBlock,
  type TemplateRow,
} from '@/lib/template-plan';
import { cn } from '@/lib/utils';

export type TemplateFormStore = FormStore<typeof templateFormSchema>;

/** Düzenleyicinin ortak durumu: form, bloklar ve yapısal işlemler (template-form.tsx sağlar). */
export type Editor = {
  form: TemplateFormStore;
  /** Ekrandaki bloklar (çizim için). İşlemler `update` ile olay anındaki güncel bloklara uygulanır. */
  blocks: TemplateBlock[];
  /** Blokları günceller ve forma tek seferde yazar; satır vurgusu ve ekran okuyucu duyurusu isteğe bağlı. */
  update: (change: (blocks: TemplateBlock[]) => TemplateBlock[], options?: { highlight?: string; announce?: string }) => void;
  /** Geri alınabilir güncelleme: önceki hâl saklanır, bildirimde "Geri al" çıkar. */
  updateWithUndo: (change: (blocks: TemplateBlock[]) => TemplateBlock[], message: string) => void;
  exercises: ReadonlyMap<string, PickerExercise>;
  exerciseList: readonly PickerExercise[];
  devices: ReadonlyMap<string, EditorDevice>;
  deviceList: readonly EditorDevice[];
  labels: ReadonlyMap<string, string>;
  expanded: ReadonlySet<string>;
  toggleExpanded: (rowId: string) => void;
  highlight: string | null;
  startReplace: (rowId: string) => void;
};

export const EditorContext = createContext<Editor | null>(null);

function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('Şablon düzenleyicinin içinde kullanılmalı.');
  return editor;
}

/** Satırın başlığı: egzersizin adı; kütüphanede yoksa "Silinmiş egzersiz". */
export function rowTitle(row: TemplateRow, exercises: ReadonlyMap<string, PickerExercise>): string {
  return exercises.get(row.exerciseId)?.title ?? 'Silinmiş egzersiz';
}

/** Taşıma sonrası: odak tutamağa geri döner (liste yeniden çizildikten sonra). */
function refocus(id: string) {
  requestAnimationFrame(() => document.getElementById(`handle-${id}`)?.focus());
}

/**
 * Sürükleme tutamağı: yalnız buradan sürüklenir (sayfanın geri kalanı normal kayar).
 * Klavyede yukarı/aşağı ok tuşları bir sıra taşır.
 */
function DragHandle({
  id,
  title,
  controls,
  onMove,
}: {
  id: string;
  title: string;
  controls: DragControls;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      id={`handle-${id}`}
      className="shrink-0 cursor-grab touch-none select-none text-muted-foreground active:cursor-grabbing"
      aria-label={`Sırayı değiştir: ${title}`}
      aria-describedby="sira-ipucu"
      onPointerDown={(event) => controls.start(event)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        onMove(event.key === 'ArrowUp' ? -1 : 1);
      }}>
      <DotsSixVertical weight="bold" />
    </Button>
  );
}

type NumberFieldStore = { input: unknown; errors: readonly string[] | null; props: FieldElementProps };

/** Sayı kutusu: boş bırakılınca değer yok (şema "Sayı gir." der), yoksa sayı. */
function NumberInput({
  id,
  field,
  onValue,
  min,
  max,
  step,
  disabled,
  className,
  label,
}: {
  id: string;
  field: NumberFieldStore;
  onValue: (value: number | undefined) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const value = typeof field.input === 'number' && !Number.isNaN(field.input) ? field.input : '';
  return (
    <Input
      {...field.props}
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step ?? 1}
      disabled={disabled}
      aria-label={label}
      aria-invalid={Boolean(field.errors) || undefined}
      className={cn('tabular-nums', className)}
      value={value}
      onChange={(event) => onValue(event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber)}
    />
  );
}

function SecondsInput(props: Parameters<typeof NumberInput>[0]) {
  return (
    <InputGroup>
      <InputGroupInput
        {...props.field.props}
        id={props.id}
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={props.disabled}
        aria-invalid={Boolean(props.field.errors) || undefined}
        className="tabular-nums"
        value={typeof props.field.input === 'number' && !Number.isNaN(props.field.input) ? props.field.input : ''}
        onChange={(event) => props.onValue(event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber)}
      />
      <InputGroupAddon align="inline-end">sn</InputGroupAddon>
    </InputGroup>
  );
}

/** Blok ayarı: tek harekette set/dinlenme, grupta tur/tur sonu dinlenme/istasyon geçişi. */
function BlockNumberField({
  blockIndex,
  blockId,
  name,
  label,
  min,
  max,
  step,
  seconds,
  disabled,
  className,
}: {
  blockIndex: number;
  blockId: string;
  name: 'sets' | 'restSeconds' | 'transitionSeconds';
  label: string;
  min: number;
  max: number;
  step?: number;
  seconds?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { form } = useEditor();
  const field = useField(form, { path: ['blocks', blockIndex, name] });
  const id = `${name}-${blockId}`;
  const onValue = (value: number | undefined) =>
    setInput(form, { path: ['blocks', blockIndex, name], input: value as number });
  const Control = seconds ? SecondsInput : NumberInput;
  return (
    <Field data-invalid={Boolean(field.errors) || undefined} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <Control id={id} field={field} onValue={onValue} min={min} max={max} step={step} disabled={disabled} />
      <FieldError>{field.errors?.[0]}</FieldError>
    </Field>
  );
}

/** Hedef: tekrar aralığı ya da (süreli harekette) saniye. */
function TargetField({
  blockIndex,
  rowIndex,
  row,
  exercise,
  className,
}: {
  blockIndex: number;
  rowIndex: number;
  row: TemplateRow;
  exercise: PickerExercise | undefined;
  className?: string;
}) {
  const { form } = useEditor();
  const minField = useField(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'target', 'min'] });
  const maxField = useField(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'target', 'max'] });
  const isDuration = exercise?.trackingType === 'duration';
  const max = isDuration ? TEMPLATE_LIMITS.secondsMax : TEMPLATE_LIMITS.repsMax;
  const step = isDuration ? 5 : 1;
  const errors = minField.errors ?? maxField.errors;
  return (
    <Field data-invalid={Boolean(errors) || undefined} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={`min-${row.id}`} className="text-xs text-muted-foreground">
        Hedef
      </FieldLabel>
      <div className="flex items-center gap-2">
        <NumberInput
          id={`min-${row.id}`}
          label="En az"
          field={minField}
          min={1}
          max={max}
          step={step}
          disabled={!exercise}
          className="w-16"
          onValue={(value) => setInput(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'target', 'min'], input: value as number })}
        />
        <span className="text-muted-foreground" aria-hidden>
          –
        </span>
        <NumberInput
          id={`max-${row.id}`}
          label="En çok"
          field={maxField}
          min={1}
          max={max}
          step={step}
          disabled={!exercise}
          className="w-16"
          onValue={(value) => setInput(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'target', 'max'], input: value as number })}
        />
        <span className="text-sm text-muted-foreground">{isDuration ? 'sn' : 'tekrar'}</span>
      </div>
      <FieldError>{errors?.[0]}</FieldError>
    </Field>
  );
}

const RIR_ITEMS: Record<string, string> = Object.fromEntries(Object.entries(RIR_LABELS).map(([rir, label]) => [rir, label]));

/** Satırın ayrıntıları: ilerleme kuralı, cihaz ve not. */
function RowDetails({ blockIndex, rowIndex, row, exercise }: { blockIndex: number; rowIndex: number; row: TemplateRow; exercise: PickerExercise }) {
  const editor = useEditor();
  const { form, devices, deviceList, exerciseList, exercises } = editor;
  const noteField = useField(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'note'] });
  const rule = ruleFor(row, exercise);
  const deviceId = row.deviceId ?? exercise.deviceId;
  const device = deviceId ? devices.get(deviceId) : undefined;
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
    setInput(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'rule'], input: next });

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
    <div className="grid gap-4 border-t p-3 sm:grid-cols-2">
      <Field className="gap-1.5">
        <FieldLabel htmlFor={`scheme-${row.id}`}>İlerleme</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <LabeledSelect
            id={`scheme-${row.id}`}
            value={rule.scheme}
            labels={PROGRESSION_LABELS}
            onChange={(scheme) => writeRule({ scheme, targetRir: rule.targetRir })}
          />
          <LabeledSelect
            id={`rir-${row.id}`}
            value={String(rule.targetRir)}
            labels={RIR_ITEMS}
            onChange={(rir) => writeRule({ scheme: rule.scheme, targetRir: Number(rir) })}
          />
        </div>
        <FieldDescription>{describeRule(rule, loadSpecFor(exercise, device))}</FieldDescription>
        {row.rule ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setInput(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'rule'], input: undefined })}>
            Egzersizin kuralına dön
          </Button>
        ) : null}
      </Field>

      <Field className="gap-1.5">
        <FieldLabel htmlFor={`device-${row.id}`}>Cihaz</FieldLabel>
        <GroupedSelect
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
          maxLength={TEMPLATE_LIMITS.note}
          placeholder="Dizleri içe kaçırma"
          value={typeof noteField.input === 'string' ? noteField.input : ''}
        />
        <FieldDescription>Danışan antrenmanda görür. Kişisel bilgi yazma.</FieldDescription>
        <FieldError>{noteField.errors?.[0]}</FieldError>
      </Field>
    </div>
  );
}

/** Satırın menüsü: değiştir, kopyala, taşı, grupla/gruptan çıkar, kaldır. */
function RowMenu({ block, blockIndex, row, rowIndex, title }: { block: TemplateBlock; blockIndex: number; row: TemplateRow; rowIndex: number; title: string }) {
  const editor = useEditor();
  const { blocks, exercises } = editor;
  // Kütüphanede olmayan egzersizde yalnız "Değiştir" ve "Kaldır" işler.
  const missing = !exercises.has(row.exerciseId);
  const inGroup = block.kind !== 'single';
  const blocksFull = blocks.length >= TEMPLATE_LIMITS.blocks;
  // Kopya gruba sığmazsa (tek hareket ya da 8'lik grup) yeni blok olur.
  const copyNeedsBlock = !inGroup || block.rows.length >= 8;
  const full = countRows(blocks) >= TEMPLATE_LIMITS.rows || (copyNeedsBlock && blocksFull);
  const canUp = !missing && (inGroup ? rowIndex > 0 : blockIndex > 0);
  const canDown = !missing && (inGroup ? rowIndex < block.rows.length - 1 : blockIndex < blocks.length - 1);
  const move = (delta: -1 | 1) =>
    editor.update((before) => (inGroup ? moveRowInGroup(before, row.id, delta) : moveBlock(before, block.id, delta)), {
      highlight: row.id,
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Satır işlemleri: ${title}`} />}>
        <DotsThreeVertical weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onClick={() => editor.startReplace(row.id)}>
          <ArrowsClockwise />
          Değiştir…
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={missing || full}
          onClick={() => editor.update((before) => duplicateRow(before, row.id, idSource(before)), { announce: `${title} kopyalandı` })}>
          <Copy />
          Kopyala
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canUp} onClick={() => move(-1)}>
          <ArrowUp />
          Yukarı taşı
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canDown} onClick={() => move(1)}>
          <ArrowDown />
          Aşağı taşı
        </DropdownMenuItem>
        {inGroup ? (
          <DropdownMenuItem
            disabled={missing || blocksFull}
            onClick={() =>
              editor.updateWithUndo((before) => ungroupRow(before, row.id, exercises, idSource(before)), `${title} gruptan çıkarıldı`)
            }>
            <LinkBreak />
            Gruptan çıkar
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem
              disabled={missing || !canJoin(blocks, block.id, 'previous')}
              onClick={() =>
                editor.update((before) => joinBlocks(before, block.id, 'previous'), {
                  highlight: row.id,
                  announce: `${title} öncekiyle gruplandı`,
                })
              }>
              <LinkSimple />
              Öncekiyle grupla
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={missing || !canJoin(blocks, block.id, 'next')}
              onClick={() =>
                editor.update((before) => joinBlocks(before, block.id, 'next'), { highlight: row.id, announce: `${title} sonrakiyle gruplandı` })
              }>
              <LinkSimple />
              Sonrakiyle grupla
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => editor.updateWithUndo((before) => removeRow(before, row.id, exercises), `${title} kaldırıldı`)}>
          <Trash />
          Kaldır
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Bir hareket satırı: başlık, alanlar (tek harekette set ve dinlenme da), ayrıntılar ve menü.
 * Kütüphanede olmayan egzersizde alanlar kapalı; yalnız "Değiştir" ve "Kaldır" işler.
 */
function RowEditor({
  block,
  blockIndex,
  row,
  rowIndex,
  handle,
}: {
  block: TemplateBlock;
  blockIndex: number;
  row: TemplateRow;
  rowIndex: number;
  handle: React.ReactNode;
}) {
  const editor = useEditor();
  const { form, exercises, devices, labels, expanded, highlight } = editor;
  const exerciseField = useField(form, { path: ['blocks', blockIndex, 'rows', rowIndex, 'exerciseId'] });
  const exercise = exercises.get(row.exerciseId);
  const title = rowTitle(row, exercises);
  const single = block.kind === 'single';
  const isOpen = expanded.has(row.id);
  const deviceId = row.deviceId ?? exercise?.deviceId;
  const deviceName = deviceId ? devices.get(deviceId)?.name : undefined;
  const subtitle = exercise
    ? [summarizeMuscles(exercise.primaryMuscles).join(', '), deviceName ?? EQUIPMENT_LABELS[exercise.equipment]]
        .filter(Boolean)
        .join(' · ')
    : null;
  const badges = [row.rule ? 'kural' : null, row.deviceId ? 'cihaz' : null, row.note?.trim() ? 'not' : null].filter(
    (badge): badge is string => badge !== null,
  );

  return (
    <div
      id={`row-${row.id}`}
      className={cn(
        'flex scroll-mt-24 flex-col rounded-[inherit] motion-safe:transition-shadow motion-safe:duration-500',
        highlight === row.id && 'ring-2 ring-primary/60',
      )}>
      <div className="flex items-start gap-2 p-3">
        {handle}
        <span className="w-6 shrink-0 pt-1.5 text-center text-sm tabular-nums text-muted-foreground">{labels.get(row.id)}</span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className={cn('truncate font-medium', !exercise && 'text-destructive')}>{title}</p>
          {exercise ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : (
            <p className="truncate font-mono text-xs text-muted-foreground">{row.exerciseId}</p>
          )}
          {badges.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {badges.map((badge) => (
                <Badge key={badge} variant="secondary">
                  {badge}
                </Badge>
              ))}
            </div>
          ) : null}
          <FieldError className="mt-1 text-xs">{exerciseField.errors?.[0]}</FieldError>
        </div>
        <RowMenu block={block} blockIndex={blockIndex} row={row} rowIndex={rowIndex} title={title} />
      </div>

      <div className={cn('grid grid-cols-2 gap-3 border-t p-3', single && 'sm:grid-cols-[5.5rem_7.5rem_minmax(0,1fr)]')}>
        {single ? (
          <>
            <BlockNumberField blockIndex={blockIndex} blockId={block.id} name="sets" label="Set" min={1} max={TEMPLATE_LIMITS.sets} disabled={!exercise} />
            <BlockNumberField
              blockIndex={blockIndex}
              blockId={block.id}
              name="restSeconds"
              label="Dinlenme"
              min={0}
              max={TEMPLATE_LIMITS.restSeconds}
              step={15}
              seconds
              disabled={!exercise}
            />
          </>
        ) : null}
        <TargetField
          blockIndex={blockIndex}
          rowIndex={rowIndex}
          row={row}
          exercise={exercise}
          className={single ? 'col-span-2 sm:col-span-1' : 'col-span-2'}
        />
      </div>

      {exercise && isOpen ? <RowDetails blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} /> : null}

      {exercise ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={isOpen}
          className="group/details w-full rounded-none rounded-b-[inherit] border-t text-muted-foreground"
          onClick={() => editor.toggleExpanded(row.id)}>
          {isOpen ? 'Ayrıntıları gizle' : 'Ayrıntılar'}
          <CaretDown data-icon="inline-end" className="transition-transform group-aria-expanded/details:rotate-180" />
        </Button>
      ) : null}
    </div>
  );
}

/** Gruptaki bir satır: kendi tutamağıyla grubun içinde sıralanır. */
function GroupRowItem({ block, blockIndex, row, rowIndex }: { block: TemplateBlock; blockIndex: number; row: TemplateRow; rowIndex: number }) {
  const editor = useEditor();
  const controls = useDragControls();
  const title = rowTitle(row, editor.exercises);
  const move = (delta: -1 | 1) => {
    editor.update((before) => moveRowInGroup(before, row.id, delta), { announce: `${title} ${rowIndex + delta + 1}. sıraya taşındı` });
    refocus(row.id);
  };
  return (
    <Reorder.Item
      value={row.id}
      as="li"
      dragListener={false}
      dragControls={controls}
      layout="position"
      whileDrag={{ scale: 1.01 }}
      className="relative rounded-lg border bg-card">
      <RowEditor
        block={block}
        blockIndex={blockIndex}
        row={row}
        rowIndex={rowIndex}
        handle={<DragHandle id={row.id} title={title} controls={controls} onMove={move} />}
      />
    </Reorder.Item>
  );
}

/** Grubun menüsü: taşı, komşuyla grupla, dağıt, kaldır. */
function GroupMenu({ block, blockIndex, title }: { block: TemplateBlock; blockIndex: number; title: string }) {
  const editor = useEditor();
  const { blocks, exercises } = editor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Grup işlemleri: ${title}`} />}>
        <DotsThreeVertical weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem disabled={blockIndex === 0} onClick={() => editor.update((before) => moveBlock(before, block.id, -1))}>
          <ArrowUp />
          Yukarı taşı
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={blockIndex === blocks.length - 1}
          onClick={() => editor.update((before) => moveBlock(before, block.id, 1))}>
          <ArrowDown />
          Aşağı taşı
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canJoin(blocks, block.id, 'previous')}
          onClick={() => editor.update((before) => joinBlocks(before, block.id, 'previous'), { announce: `${title} öncekiyle gruplandı` })}>
          <LinkSimple />
          Öncekiyle grupla
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canJoin(blocks, block.id, 'next')}
          onClick={() => editor.update((before) => joinBlocks(before, block.id, 'next'), { announce: `${title} sonrakiyle gruplandı` })}>
          <LinkSimple />
          Sonrakiyle grupla
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={blocks.length - 1 + block.rows.length > TEMPLATE_LIMITS.blocks}
          onClick={() =>
            editor.updateWithUndo((before) => dissolveGroup(before, block.id, exercises, idSource(before)), `${title} dağıtıldı`)
          }>
          <LinkBreak />
          Grubu dağıt
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => editor.updateWithUndo((before) => before.filter((item) => item.id !== block.id), `${title} kaldırıldı`)}>
          <Trash />
          Grubu kaldır
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Grubun başlığı ve satırları: tür, tur, tur sonu dinlenme, (devrede) istasyon geçişi. */
function GroupBlock({ block, blockIndex, handle, title }: { block: TemplateBlock; blockIndex: number; handle: React.ReactNode; title: string }) {
  const editor = useEditor();
  const rowsArray = useFieldArray(editor.form, { path: ['blocks', blockIndex, 'rows'] });
  const options = kindOptions(block.rows.length);
  const kindLabels = Object.fromEntries(options.map((kind) => [kind, BLOCK_KIND_LABELS[kind]])) as Record<BlockKind, string>;
  const kind = block.kind === 'single' ? 'superset' : block.kind;

  return (
    <div className="flex flex-col rounded-xl bg-primary/5">
      <div className="grid grid-cols-2 items-end gap-3 p-3 sm:flex sm:flex-wrap">
        <div className="col-span-2 flex items-center gap-2 sm:pb-0.5">
          {handle}
          <span className="w-6 text-center text-sm font-medium tabular-nums">{blockIndex + 1}</span>
          <div className="ml-auto sm:hidden">
            <GroupMenu block={block} blockIndex={blockIndex} title={title} />
          </div>
        </div>
        <Field className="col-span-2 gap-1.5 sm:w-36">
          <FieldLabel htmlFor={`kind-${block.id}`} className="text-xs text-muted-foreground">
            Grup
          </FieldLabel>
          <LabeledSelect
            id={`kind-${block.id}`}
            value={block.kind}
            labels={kindLabels}
            onChange={(next) => editor.update((before) => changeKind(before, block.id, next))}
          />
        </Field>
        <BlockNumberField blockIndex={blockIndex} blockId={block.id} name="sets" label="Tur" min={1} max={TEMPLATE_LIMITS.sets} className="sm:w-20" />
        <BlockNumberField
          blockIndex={blockIndex}
          blockId={block.id}
          name="restSeconds"
          label="Tur sonu dinlenme"
          min={0}
          max={TEMPLATE_LIMITS.restSeconds}
          step={15}
          seconds
          className="sm:w-32"
        />
        {block.kind === 'circuit' ? (
          <BlockNumberField
            blockIndex={blockIndex}
            blockId={block.id}
            name="transitionSeconds"
            label="İstasyon arası"
            min={0}
            max={TEMPLATE_LIMITS.transitionSeconds}
            step={5}
            seconds
            className="sm:w-28"
          />
        ) : null}
        <div className="hidden sm:ml-auto sm:block">
          <GroupMenu block={block} blockIndex={blockIndex} title={title} />
        </div>
      </div>
      <p className="px-3 text-xs text-muted-foreground">{BLOCK_KIND_HINTS[kind]}</p>
      <Reorder.Group
        as="ol"
        axis="y"
        values={block.rows.map((row) => row.id)}
        onReorder={(ids: string[]) => editor.update((before) => reorderRows(before, block.id, ids))}
        className="flex flex-col gap-2 p-3 pt-2"
        aria-label={`${title} hareketleri`}>
        {block.rows.map((row, rowIndex) => (
          <GroupRowItem key={row.id} block={block} blockIndex={blockIndex} row={row} rowIndex={rowIndex} />
        ))}
      </Reorder.Group>
      {rowsArray.errors ? <FieldError className="px-3 pb-3">{rowsArray.errors[0]}</FieldError> : null}
    </div>
  );
}

/** Şablonun bir bloğu: tek hareket ya da grup; tutamaktan sürüklenir. */
export function BlockItem({ block, blockIndex }: { block: TemplateBlock; blockIndex: number }) {
  const editor = useEditor();
  const controls = useDragControls();
  const single = block.kind === 'single';
  const firstRow = block.rows[0];
  const title = single && firstRow ? rowTitle(firstRow, editor.exercises) : `${BLOCK_KIND_LABELS[block.kind]} ${blockIndex + 1}`;
  const move = (delta: -1 | 1) => {
    editor.update((before) => moveBlock(before, block.id, delta), { announce: `${title} ${blockIndex + delta + 1}. sıraya taşındı` });
    refocus(block.id);
  };
  const handle = <DragHandle id={block.id} title={title} controls={controls} onMove={move} />;

  return (
    <Reorder.Item
      value={block.id}
      as="li"
      dragListener={false}
      dragControls={controls}
      layout="position"
      whileDrag={{ scale: 1.01 }}
      className={cn('relative bg-card', single ? 'rounded-lg border' : 'rounded-xl border border-primary/40')}>
      {single && firstRow ? (
        <RowEditor block={block} blockIndex={blockIndex} row={firstRow} rowIndex={0} handle={handle} />
      ) : (
        <GroupBlock block={block} blockIndex={blockIndex} handle={handle} title={title} />
      )}
    </Reorder.Item>
  );
}
