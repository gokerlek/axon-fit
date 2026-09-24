'use client';

import { useMemo } from 'react';
import { getDeepError, setInput, useField, useFieldArray, type FieldElementProps } from '@formisch/react';
import { ArrowsClockwise, CaretDown, Copy, DotsThreeVertical, LinkBreak, LinkSimple, Trash } from '@phosphor-icons/react';
import { ExerciseCard, ExerciseCardHeader, ExerciseCardSection } from '@/components/exercise-card';
import { GroupedSelect, LabeledSelect } from '@/components/labeled-select';
import { ReorderHandle } from '@/components/sortable/reorder-handle';
import { SortableItem, SortableList } from '@/components/sortable/sortable-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { describeRule, describeSetRules, PROGRESSION_LABELS, RIR_LABELS, type ProgressionScheme } from '@/lib/progression';
import { EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import { isStraight, setShape } from '@/lib/set-plan';
import {
  applySetPreset,
  canJoin,
  deviceChoices,
  dissolveGroup,
  duplicateRow,
  joinBlocks,
  removeRow,
  reorderRows,
  setRow,
  swapDevice,
  ungroupRow,
  changeKind,
  type PickerExercise,
} from '@/lib/template-edit';
import {
  BLOCK_KIND_HINTS,
  BLOCK_KIND_LABELS,
  TEMPLATE_LIMITS,
  countRows,
  groupSkipNote,
  kindOptions,
  roundsOf,
  rowRule,
  type BlockKind,
  type TemplateBlock,
  type TemplateRow,
} from '@/lib/template-plan';
import { cn } from '@/lib/utils';
import { MENU_TOUCH, blockField, rowTitle, useEditor } from './editor-context';
import { RoundsField, SetCountField, SetsSummary, SetTable, StraightTargetField } from './set-table';

export {
  EditorContext,
  blockField,
  rowTitle,
  useEditor,
  type BlocksFormStore,
  type BlocksPath,
  type Editor,
} from './editor-context';

/** Dokunmatikte ya da dar ekranda seçim kutusu ve öğeleri 44 px. */
const SELECT_TOUCH = {
  triggerClassName: 'touch:data-[size=default]:h-11',
  contentClassName: 'touch:**:data-[slot=select-item]:min-h-11',
} as const;

/** Satır ve grup menüsünün düğmesi: 32 px yer kaplar, dokunmatikte 44 px. */
const MENU_TRIGGER = 'size-8 touch:-mx-1.5 touch:size-11';

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
    <InputGroup className={props.className}>
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
        className="tabular-nums touch:h-11"
        value={typeof props.field.input === 'number' && !Number.isNaN(props.field.input) ? props.field.input : ''}
        onChange={(event) => props.onValue(event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber)}
      />
      <InputGroupAddon align="inline-end">sn</InputGroupAddon>
    </InputGroup>
  );
}

/** Blok ayarı: tek harekette dinlenme, grupta tur sonu dinlenme/istasyon geçişi (setler satırda). */
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
  name: 'restSeconds' | 'transitionSeconds';
  label: string;
  min: number;
  max: number;
  step?: number;
  seconds?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { form, path } = useEditor();
  const field = useField(form, { path: blockField(path, blockIndex, name) });
  const id = `${name}-${blockId}`;
  const onValue = (value: number | undefined) => setInput(form, { path: blockField(path, blockIndex, name), input: value as number });
  const Control = seconds ? SecondsInput : NumberInput;
  return (
    <Field data-invalid={Boolean(field.errors) || undefined} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <Control id={id} field={field} onValue={onValue} min={min} max={max} step={step} disabled={disabled} className="touch:h-11" />
      <FieldError>{field.errors?.[0]}</FieldError>
    </Field>
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
    <ExerciseCardSection className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </ExerciseCardSection>
  );
}

/** Satırın menüsü: değiştir, kopyala, AMRAP, grupla/gruptan çıkar, kaldır (sıralama sürükle-bırakla). */
function RowMenu({ block, row, title }: { block: TemplateBlock; row: TemplateRow; title: string }) {
  const editor = useEditor();
  const { blocks, exercises } = editor;
  // Kütüphanede olmayan egzersizde yalnız "Değiştir" ve "Kaldır" işler.
  const missing = !exercises.has(row.exerciseId);
  const inGroup = block.kind !== 'single';
  const blocksFull = blocks.length >= TEMPLATE_LIMITS.blocks;
  // Kopya gruba sığmazsa (tek hareket ya da 8'lik grup) yeni blok olur.
  const copyNeedsBlock = !inGroup || block.rows.length >= 8;
  const full = countRows(blocks) >= TEMPLATE_LIMITS.rows || (copyNeedsBlock && blocksFull);
  const lastAmrap = ['last', 'all'].includes(setShape(row.sets).amrap);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            id={`row-menu-${row.id}`}
            className={MENU_TRIGGER}
            aria-label={`Satır işlemleri: ${title}`}
          />
        }>
        <DotsThreeVertical weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('min-w-48', MENU_TOUCH)}>
        <DropdownMenuItem onClick={() => editor.startReplace(row.id)}>
          <ArrowsClockwise />
          Değiştir…
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={missing || full}
          onClick={() => editor.update((before) => duplicateRow(before, row.id, editor.newIds(before)), { announce: `${title} kopyalandı` })}>
          <Copy />
          Kopyala
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          disabled={missing}
          checked={lastAmrap}
          onCheckedChange={() =>
            editor.updateWithUndo((before) => applySetPreset(before, row.id, 'lastAmrap'), lastAmrap ? `${title}: AMRAP kaldırıldı` : `${title}: son set AMRAP`)
          }>
          Son set AMRAP
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {inGroup ? (
          <DropdownMenuItem
            disabled={missing || blocksFull}
            onClick={() =>
              editor.updateWithUndo((before) => ungroupRow(before, row.id, exercises, editor.newIds(before)), `${title} gruptan çıkarıldı`)
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
 * Bir hareket kartı: 1. satır [numara-tutamak][ad + kaslar · cihaz][menü]; altında tam
 * genişlikte alanlar (set sayısı, tek harekette dinlenme, düz setlerde hedef, değilse setlerin
 * özeti), set tablosu, ayrıntılar ve "Setler / Ayrıntılar" düğmeleri. Tutamak en yakın
 * sıralanan öğeyi taşır: tek harekette bloğu, grupta satırı (2a, 2b). Kütüphanede olmayan
 * egzersizde alanlar kapalı; yalnız "Değiştir" ve "Kaldır" işler.
 */
function RowEditor({ block, blockIndex, row, rowIndex }: { block: TemplateBlock; blockIndex: number; row: TemplateRow; rowIndex: number }) {
  const editor = useEditor();
  const { form, path, exercises, devices, labels, expanded, expandedSets, highlight } = editor;
  const exerciseField = useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'exerciseId') });
  // Formisch kancası: set hatası okuması bu satırın çizimine bağlansın.
  useFieldArray(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets') });
  const exercise = exercises.get(row.exerciseId);
  const title = rowTitle(row, exercises);
  const single = block.kind === 'single';
  const isOpen = expanded.has(row.id);
  const straight = isStraight(row.sets);
  // Düz olmayan setlerde hata varsa tablo açık kalır: hata görünür ve odaklanılır.
  const setError = Boolean(getDeepError(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets') }));
  const forcedOpen = !straight && setError;
  const setsOpen = expandedSets.has(row.id) || forcedOpen;
  const deviceId = row.deviceId ?? exercise?.deviceId;
  const deviceName = deviceId ? devices.get(deviceId)?.name : undefined;
  const subtitle = exercise
    ? [summarizeMuscles(exercise.primaryMuscles).join(', '), deviceName ?? EQUIPMENT_LABELS[exercise.equipment]].filter(Boolean).join(' · ')
    : null;
  const badges = [row.rule ? 'kural' : null, row.deviceId ? 'cihaz' : null, row.note?.trim() ? 'not' : null].filter(
    (badge): badge is string => badge !== null,
  );
  const exerciseError = exerciseField.errors?.[0];

  return (
    <ExerciseCard id={`row-${row.id}`} highlighted={highlight === row.id}>
      <ExerciseCardHeader
        handle={<ReorderHandle>{labels.get(row.id)}</ReorderHandle>}
        title={title}
        titleClassName={exercise ? undefined : 'text-destructive'}
        meta={exercise ? subtitle : <span className="font-mono">{row.exerciseId}</span>}
        action={<RowMenu block={block} row={row} title={title} />}
      />
      {badges.length > 0 || exerciseError ? (
        <div className="-mt-1 flex flex-wrap items-center gap-1 px-3 pb-3">
          {badges.map((badge) => (
            <Badge key={badge} variant="secondary">
              {badge}
            </Badge>
          ))}
          <FieldError className="basis-full text-xs">{exerciseError}</FieldError>
        </div>
      ) : null}

      <ExerciseCardSection
        className={cn('grid gap-3', single ? 'grid-cols-2 sm:grid-cols-[5.5rem_7.5rem_minmax(0,1fr)]' : 'grid-cols-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]')}>
        <SetCountField row={row} exercise={exercise} />
        {single ? (
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
        ) : null}
        {straight && !setsOpen ? (
          <StraightTargetField blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} className="col-span-2 sm:col-span-1" />
        ) : (
          <SetsSummary row={row} exercise={exercise} className="col-span-2 sm:col-span-1" />
        )}
      </ExerciseCardSection>

      {exercise && setsOpen ? <SetTable blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} title={title} /> : null}
      {exercise && isOpen ? <RowDetails blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} /> : null}

      {exercise ? (
        <div className="grid grid-cols-2 rounded-b-[inherit] border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={setsOpen}
            aria-controls={`sets-${row.id}`}
            disabled={forcedOpen}
            className="group/sets h-9 rounded-none rounded-bl-[inherit] border-r text-muted-foreground touch:h-11"
            onClick={() => editor.toggleSets(row.id)}>
            Setler
            <CaretDown
              data-icon="inline-end"
              className="transition-transform duration-160 group-aria-expanded/sets:rotate-180 motion-reduce:transition-none"
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={isOpen}
            className="group/details h-9 rounded-none rounded-br-[inherit] text-muted-foreground touch:h-11"
            onClick={() => editor.toggleExpanded(row.id)}>
            Ayrıntılar
            <CaretDown
              data-icon="inline-end"
              className="transition-transform duration-160 group-aria-expanded/details:rotate-180 motion-reduce:transition-none"
            />
          </Button>
        </div>
      ) : null}
    </ExerciseCard>
  );
}

/** Grubun menüsü: komşuyla grupla, dağıt, kaldır (sıralama sürükle-bırakla). */
function GroupMenu({ block, title }: { block: TemplateBlock; title: string }) {
  const editor = useEditor();
  const { blocks, exercises } = editor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon" className={MENU_TRIGGER} aria-label={`Grup işlemleri: ${title}`} />}>
        <DotsThreeVertical weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('min-w-48', MENU_TOUCH)}>
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
            editor.updateWithUndo((before) => dissolveGroup(before, block.id, exercises, editor.newIds(before)), `${title} dağıtıldı`)
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

/**
 * Grup kartı: vurgu tonlu rozet-tutamak bütün grubu taşır; altında tür, tur, tur sonu
 * dinlenme, (devrede) istasyon geçişi ve grubun kendi sıralanan satırları (2a, 2b). Satırlar
 * gruptan sürüklenerek çıkmaz; "Gruptan çıkar" satırın menüsündedir.
 */
function GroupBlock({ block, blockIndex, title }: { block: TemplateBlock; blockIndex: number; title: string }) {
  const editor = useEditor();
  const rowsArray = useFieldArray(editor.form, { path: blockField(editor.path, blockIndex, 'rows') });
  const options = kindOptions(block.rows.length);
  const kindLabels = Object.fromEntries(options.map((kind) => [kind, BLOCK_KIND_LABELS[kind]])) as Record<BlockKind, string>;
  const kind = block.kind === 'single' ? 'superset' : block.kind;
  const rounds = roundsOf(block);
  const skipNote = groupSkipNote(block, (row) => rowTitle(row, editor.exercises));

  return (
    <ExerciseCard tone="group">
      <ExerciseCardHeader
        handle={<ReorderHandle tone="accent">{blockIndex + 1}</ReorderHandle>}
        title={BLOCK_KIND_LABELS[kind]}
        meta={`${block.rows.length} hareket · ${rounds} tur`}
        action={<GroupMenu block={block} title={title} />}
      />
      <div className="grid grid-cols-2 gap-3 px-3 pb-3 sm:flex sm:flex-wrap sm:items-end">
        <Field className="col-span-2 gap-1.5 sm:w-40">
          <FieldLabel htmlFor={`kind-${block.id}`} className="text-xs text-muted-foreground">
            Grup
          </FieldLabel>
          <LabeledSelect
            {...SELECT_TOUCH}
            id={`kind-${block.id}`}
            value={block.kind}
            labels={kindLabels}
            onChange={(next) => editor.update((before) => changeKind(before, block.id, next))}
          />
        </Field>
        <RoundsField block={block} rounds={rounds} className="sm:w-20" />
        <BlockNumberField
          blockIndex={blockIndex}
          blockId={block.id}
          name="restSeconds"
          label="Tur sonu dinlenme"
          min={0}
          max={TEMPLATE_LIMITS.restSeconds}
          step={15}
          seconds
          className="sm:w-36"
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
            className="sm:w-32"
          />
        ) : null}
      </div>
      <p className="px-3 text-xs text-muted-foreground">{BLOCK_KIND_HINTS[kind]}</p>
      {skipNote ? <p className="px-3 pt-1 text-xs text-muted-foreground">{skipNote}</p> : null}
      <SortableList
        values={block.rows.map((row) => row.id)}
        onReorder={(ids) => editor.update((before) => reorderRows(before, block.id, ids))}
        getLabel={(id) => {
          const row = block.rows.find((item) => item.id === id);
          return row ? rowTitle(row, editor.exercises) : '';
        }}
        announce={(label, position) => `${label} grupta ${position}. sıraya taşındı`}
        aria-label={`${title} hareketleri`}
        className="flex flex-col gap-2 p-2 pt-3 sm:p-3">
        {block.rows.map((row, rowIndex) => (
          <SortableItem key={row.id} value={row.id}>
            <RowEditor block={block} blockIndex={blockIndex} row={row} rowIndex={rowIndex} />
          </SortableItem>
        ))}
      </SortableList>
      {rowsArray.errors ? <FieldError className="px-3 pb-3">{rowsArray.errors[0]}</FieldError> : null}
    </ExerciseCard>
  );
}

/** Listenin bir bloğu: tek hareket ya da grup; numara rozetinden sürüklenir. */
export function BlockItem({ block, blockIndex }: { block: TemplateBlock; blockIndex: number }) {
  const editor = useEditor();
  const single = block.kind === 'single';
  const firstRow = block.rows[0];
  const title = single && firstRow ? rowTitle(firstRow, editor.exercises) : `${BLOCK_KIND_LABELS[block.kind]} ${blockIndex + 1}`;

  return (
    <SortableItem value={block.id}>
      {single && firstRow ? (
        <RowEditor block={block} blockIndex={blockIndex} row={firstRow} rowIndex={0} />
      ) : (
        <GroupBlock block={block} blockIndex={blockIndex} title={title} />
      )}
    </SortableItem>
  );
}
