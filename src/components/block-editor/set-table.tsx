'use client';

import { useRef, useState } from 'react';
import { getInput, setInput, useField, useFieldArray, type FieldElementProps } from '@formisch/react';
import { CaretDown } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Stepper, type StepperSource } from '@/components/ui/stepper';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { loadSpecFor } from '@/lib/device-loads';
import { formatNumber } from '@/lib/format';
import { describeSetRules } from '@/lib/progression';
import { SET_LIMITS, isStraight, resizeSets, setShape, type SetSpec } from '@/lib/set-plan';
import { applySetPreset, setRounds, setRowSetCount, updateRowSets, type PickerExercise, type SetPreset } from '@/lib/template-edit';
import { TEMPLATE_LIMITS, type TemplateBlock, type TemplateRow } from '@/lib/template-plan';
import { cn } from '@/lib/utils';
import { blockField, setInputId, useEditor, type SetColumn } from './editor-context';

/**
 * Satırın setleri (SPEC §7.4): set sayısı ve dinlenme stepper'ı, düz setlerde tek "Hedef"
 * (min–max) ve tekrar çipleri; düz olmayan setlerde özet düğmesi. "Setleri ayrı düzenle"
 * her seti açar (hedef, yük yüzdesi, AMRAP) ve düzeni seçtirir (Düz / Piramit / Back-off).
 * Vakaların çoğu düz set: çip bir dokunuşta bütün setlere yazar.
 */

type RowProps = { blockIndex: number; rowIndex: number; row: TemplateRow; exercise: PickerExercise | undefined };

const COUNT_ERROR = `1–${SET_LIMITS.perRow} arası bir sayı gir.`;

/** Setler düzken çipler (v1): tekrar ve süre. Çip bütün setlere yazar. */
const REP_CHIPS: readonly (readonly [number, number])[] = [
  [5, 5],
  [8, 8],
  [10, 10],
  [12, 12],
  [6, 8],
  [8, 12],
  [12, 15],
];
const TIME_CHIPS: readonly (readonly [number, number])[] = [
  [20, 20],
  [30, 30],
  [45, 45],
  [60, 60],
];

/** Sayı kutusunun değeri: boş → yok, çözülemeyen giriş → NaN (şema "Sayı gir." der). */
function numberOf(input: HTMLInputElement): number | undefined {
  if (input.validity.badInput) return Number.NaN;
  return input.value === '' ? undefined : input.valueAsNumber;
}

function shown(value: unknown): number | '' {
  return typeof value === 'number' && !Number.isNaN(value) ? value : '';
}

function rangeText(set: Pick<SetSpec, 'min' | 'max'>): string {
  const format = (value: number) => (Number.isFinite(value) ? formatNumber(value) : '?');
  return set.min === set.max ? format(set.min) : `${format(set.min)}–${format(set.max)}`;
}

/**
 * Sayı taslağı (set sayısı, tur): yazılan geçerli değer hemen uygulanır, geçersizi kutuda
 * kalır ve hata söylenir. Yazarken uygulama odaklanıldığı andaki hâlden yapılır: "1" yazıp
 * "10"a giderken aradaki 1 set diğer setleri silmez. Düğme ve ↑/↓ o anki hâle uygulanır.
 */
function useCountDraft<T>(snapshot: () => T, applyFrom: (base: T, count: number) => void, applyNow: (count: number) => void, max: number) {
  const [invalid, setInvalid] = useState(false);
  const base = useRef<T | null>(null);
  return {
    invalid,
    onFocus: () => {
      base.current = snapshot();
    },
    // Base UI boş kutuyu bırakırken de bildirir (`null`); hata ondan sonra silinir, kutu değere döner.
    onBlur: () => window.setTimeout(() => setInvalid(false), 0),
    change: (value: number | null, source: StepperSource) => {
      const count = value !== null && Number.isInteger(value) && value >= 1 && value <= max ? value : null;
      if (source === 'step') {
        setInvalid(false);
        base.current = null;
        if (count !== null) applyNow(count);
        return;
      }
      setInvalid(count === null);
      if (count === null) return;
      base.current ??= snapshot();
      applyFrom(base.current, count);
    },
  };
}

/** Satırın set sayısı: "−" son seti siler, "+" son seti kopyalar. */
export function SetCountField({ row, exercise }: Pick<RowProps, 'row' | 'exercise'>) {
  const editor = useEditor();
  const id = `setcount-${row.id}`;
  const count = useCountDraft(
    () => row.sets.map((set) => ({ ...set })),
    (base, value) => editor.update((before) => updateRowSets(before, row.id, () => resizeSets(base, value))),
    (value) => editor.update((before) => setRowSetCount(before, row.id, value)),
    SET_LIMITS.perRow,
  );
  return (
    <Field data-invalid={count.invalid || undefined} className="w-auto gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        Set
      </FieldLabel>
      <Stepper
        id={id}
        size="auto"
        value={row.sets.length}
        min={1}
        max={SET_LIMITS.perRow}
        disabled={!exercise}
        invalid={count.invalid}
        decrementLabel="Son seti sil"
        incrementLabel="Son seti kopyala"
        onFocus={count.onFocus}
        onBlur={count.onBlur}
        onValueChange={count.change}
      />
      {count.invalid ? <FieldError>{COUNT_ERROR}</FieldError> : null}
    </Field>
  );
}

/** Grubun turu: turu dolduran hareketler yeni tura geçer, daha az setliler kendi sayısında kalır. */
export function RoundsField({ block, rounds }: { block: TemplateBlock; rounds: number }) {
  const editor = useEditor();
  const id = `rounds-${block.id}`;
  const count = useCountDraft(
    () => block,
    (base, value) =>
      editor.update((before) =>
        setRounds(
          before.map((item) => (item.id === base.id ? base : item)),
          block.id,
          value,
        ),
      ),
    (value) => editor.update((before) => setRounds(before, block.id, value)),
    TEMPLATE_LIMITS.sets,
  );
  return (
    <Field data-invalid={count.invalid || undefined} className="w-auto gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        Tur
      </FieldLabel>
      <Stepper
        id={id}
        size="auto"
        value={rounds}
        min={1}
        max={TEMPLATE_LIMITS.sets}
        invalid={count.invalid}
        decrementLabel="Bir tur eksilt"
        incrementLabel="Bir tur ekle"
        onFocus={count.onFocus}
        onBlur={count.onBlur}
        onValueChange={count.change}
      />
      {count.invalid ? <FieldError>{COUNT_ERROR}</FieldError> : null}
    </Field>
  );
}

/** Blok ayarı (saniye): tek harekette dinlenme, grupta tur sonu dinlenme ve istasyon arası. */
export function BlockSecondsField({
  blockIndex,
  blockId,
  name,
  label,
  max,
  step,
  disabled,
}: {
  blockIndex: number;
  blockId: string;
  name: 'restSeconds' | 'transitionSeconds';
  label: string;
  max: number;
  step: number;
  disabled?: boolean;
}) {
  const { form, path } = useEditor();
  const field = useField(form, { path: blockField(path, blockIndex, name) });
  const id = `${name}-${blockId}`;
  const value = typeof field.input === 'number' && !Number.isNaN(field.input) ? field.input : null;
  return (
    <Field data-invalid={Boolean(field.errors) || undefined} className="w-auto gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <Stepper
        id={id}
        size="auto"
        unit="sn"
        value={value}
        min={0}
        max={max}
        step={step}
        disabled={disabled}
        invalid={Boolean(field.errors)}
        decrementLabel={`${label}: ${step} sn azalt`}
        incrementLabel={`${label}: ${step} sn artır`}
        inputRef={field.props.ref}
        onFocus={field.props.onFocus}
        onBlur={field.props.onBlur}
        onValueChange={(next) => setInput(form, { path: blockField(path, blockIndex, name), input: (next ?? undefined) as number })}
      />
      <FieldError>{field.errors?.[0]}</FieldError>
    </Field>
  );
}

/**
 * Düz setlerin hedefi: iki kutu ilk sete bağlıdır (hata ve odak), yazılan değer bütün setlere
 * tek seferde gider. Altında çipler (tekrar ya da süre); basılı çip şu anki hedeftir.
 */
export function TargetField({ blockIndex, rowIndex, row, exercise }: RowProps) {
  const editor = useEditor();
  const { form, path } = editor;
  const setsPath = blockField(path, blockIndex, 'rows', rowIndex, 'sets');
  const minField = useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets', 0, 'min') });
  const maxField = useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets', 0, 'max') });
  const isDuration = exercise?.trackingType === 'duration';
  const max = isDuration ? TEMPLATE_LIMITS.secondsMax : TEMPLATE_LIMITS.repsMax;
  const step = isDuration ? 5 : 1;
  const errors = minField.errors ?? maxField.errors;
  const amrap = setShape(row.sets).amrap;
  const amrapBadge = amrap === 'none' ? null : amrap === 'last' ? (row.sets.length === 1 ? 'AMRAP' : 'son set AMRAP') : amrap === 'all' ? 'hepsi AMRAP' : 'AMRAP';
  const first = row.sets[0];
  const chips = isDuration ? TIME_CHIPS : REP_CHIPS;
  const unit = isDuration ? 'sn' : 'tekrar';

  const writeAll = (patch: Partial<Pick<SetSpec, 'min' | 'max'>>) => {
    const sets = (getInput(form, { path: setsPath }) ?? []) as SetSpec[];
    setInput(form, { path: setsPath, input: sets.map((set) => ({ ...set, ...patch })) as SetSpec[] });
  };

  return (
    <Field data-invalid={Boolean(errors) || undefined} className="min-w-0 basis-full gap-1.5 sm:w-auto sm:basis-auto">
      <FieldLabel htmlFor={`min-${row.id}`} className="text-xs text-muted-foreground">
        Hedef
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          {...minField.props}
          id={`min-${row.id}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          step={step}
          disabled={!exercise}
          aria-label="En az"
          aria-invalid={Boolean(minField.errors) || undefined}
          className="h-8 w-14 text-center tabular-nums touch:h-11"
          value={shown(minField.input)}
          onChange={(event) => writeAll({ min: numberOf(event.currentTarget) as number })}
        />
        <span className="text-muted-foreground" aria-hidden>
          –
        </span>
        <Input
          {...maxField.props}
          id={`max-${row.id}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          step={step}
          disabled={!exercise}
          aria-label="En çok"
          aria-invalid={Boolean(maxField.errors) || undefined}
          className="h-8 w-14 text-center tabular-nums touch:h-11"
          value={shown(maxField.input)}
          onChange={(event) => writeAll({ max: numberOf(event.currentTarget) as number })}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
        {amrapBadge ? <Badge variant="secondary">{amrapBadge}</Badge> : null}
      </div>
      <FieldError>{errors?.[0]}</FieldError>
      {exercise ? (
        <div
          role="group"
          aria-label="Hazır hedefler"
          className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pt-1 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {chips.map(([min, max]) => {
            const pressed = first?.min === min && first?.max === max;
            const label = min === max ? formatNumber(min) : `${formatNumber(min)}–${formatNumber(max)}`;
            return (
              <Toggle
                key={label}
                variant="outline"
                size="sm"
                pressed={pressed}
                onPressedChange={() => writeAll({ min, max })}
                aria-label={`${label} ${unit}`}
                className="h-8 min-w-11 shrink-0 rounded-full px-3 tabular-nums touch:h-10 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground">
                {isDuration ? `${label} sn` : label}
              </Toggle>
            );
          })}
        </div>
      ) : null}
    </Field>
  );
}

/** Düz olmayan setlerin özeti ("12 / 10 / 8 · piramit"): dokununca "Setleri ayrı düzenle" açılır. */
export function SetsSummary({ row, exercise }: Pick<RowProps, 'row' | 'exercise'>) {
  const editor = useEditor();
  const shape = setShape(row.sets).kind;
  const steps = row.sets.map((set) => `${rangeText(set)}${set.amrap ? '+' : ''}`).join(' / ');
  const unit = exercise?.trackingType === 'duration' ? ' sn' : '';
  const suffix = shape === 'pyramid' ? ' · piramit' : shape === 'backoff' ? ' · back-off' : '';
  const text = `${steps}${unit}${suffix}`;
  return (
    <div className="flex min-w-0 basis-full flex-col gap-1.5 sm:basis-auto">
      <span className="text-xs text-muted-foreground" aria-hidden>
        Hedef
      </span>
      <Button
        type="button"
        variant="outline"
        className="h-8 w-full min-w-0 justify-start px-2.5 font-normal tabular-nums touch:h-11 sm:w-auto"
        disabled={!exercise}
        aria-label={`Setleri ayrı düzenle: ${text}`}
        onClick={() => {
          editor.setSetsOpen(row.id, true);
          editor.focusSet(row.id, 0, 'min');
        }}>
        <span className="truncate">{text}</span>
      </Button>
    </div>
  );
}

const PRESET_MESSAGES: Record<Exclude<SetPreset, 'lastAmrap'>, string> = {
  straight: 'Düz setler uygulandı',
  pyramid: 'Piramit uygulandı',
  backoff: 'Back-off uygulandı',
};

const PRESET_LABELS: Record<Exclude<SetPreset, 'lastAmrap'>, string> = {
  straight: 'Düz',
  pyramid: 'Piramit',
  backoff: 'Back-off',
};

type NumberFieldStore = { input: unknown; errors: readonly string[] | null; props: FieldElementProps };

/** Set satırının sayı kutusu: Enter aynı sütunda sonraki, Shift+Enter önceki sete gider. */
function SetNumberInput({
  rowId,
  index,
  count,
  column,
  field,
  label,
  max,
  step,
  disabled,
  onValue,
}: {
  rowId: string;
  index: number;
  count: number;
  column: SetColumn;
  field: NumberFieldStore;
  label: string;
  max: number;
  step: number;
  disabled: boolean;
  onValue: (value: number | undefined) => void;
}) {
  const last = index === count - 1;
  const Control = column === 'pct' ? InputGroupInput : Input;
  return (
    <Control
      {...field.props}
      id={setInputId(rowId, index, column)}
      type="number"
      inputMode="numeric"
      enterKeyHint={last ? 'done' : 'next'}
      min={column === 'pct' ? SET_LIMITS.loadPctMin : 1}
      max={max}
      step={step}
      placeholder={column === 'pct' ? '100' : undefined}
      disabled={disabled}
      aria-label={label}
      aria-invalid={Boolean(field.errors) || undefined}
      className={cn('text-center tabular-nums', column === 'pct' ? 'touch:h-11' : 'h-10 w-14 px-1.5 touch:h-11')}
      value={shown(field.input)}
      onChange={(event) => onValue(numberOf(event.currentTarget))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        // Enter formu göndermesin: aynı sütunda sonraki (Shift ile önceki) sete geç.
        event.preventDefault();
        const target = event.shiftKey ? index - 1 : index + 1;
        if (target < 0 || target >= count) return;
        document.getElementById(setInputId(rowId, target, column))?.focus();
      }}
    />
  );
}

/** Bir set: n · min–max · % (ağırlıklı harekette) · AMRAP. 360 px'in altında % ve AMRAP alt satıra iner. */
function SetRow({ blockIndex, rowIndex, row, exercise, index }: RowProps & { index: number }) {
  const { form, path } = useEditor();
  const at = (name: 'min' | 'max' | 'loadPct' | 'amrap') => blockField(path, blockIndex, 'rows', rowIndex, 'sets', index, name);
  const minField = useField(form, { path: at('min') });
  const maxField = useField(form, { path: at('max') });
  const pctField = useField(form, { path: at('loadPct') });
  const set = row.sets[index];
  const n = index + 1;
  const count = row.sets.length;
  const duration = exercise?.trackingType === 'duration';
  const weighted = exercise?.trackingType === 'weight_reps';
  const max = duration ? TEMPLATE_LIMITS.secondsMax : TEMPLATE_LIMITS.repsMax;
  const step = duration ? 5 : 1;
  const disabled = !exercise;
  const errors = minField.errors ?? maxField.errors ?? pctField.errors;
  const write = (name: 'min' | 'max' | 'loadPct', value: number | undefined) => setInput(form, { path: at(name), input: value as number });

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground">{n}</span>
        <SetNumberInput
          rowId={row.id}
          index={index}
          count={count}
          column="min"
          field={minField}
          label={`Set ${n} en az`}
          max={max}
          step={step}
          disabled={disabled}
          onValue={(value) => write('min', value)}
        />
        <span className="text-muted-foreground" aria-hidden>
          –
        </span>
        <SetNumberInput
          rowId={row.id}
          index={index}
          count={count}
          column="max"
          field={maxField}
          label={`Set ${n} en çok`}
          max={max}
          step={step}
          disabled={disabled}
          onValue={(value) => write('max', value)}
        />
        <div className="flex basis-full items-center gap-2 pl-7 min-[360px]:basis-auto min-[360px]:pl-0">
          {weighted ? (
            <InputGroup className="h-10 w-16 touch:h-11" data-disabled={disabled || undefined}>
              <InputGroupAddon align="inline-start" className="pr-0">
                %
              </InputGroupAddon>
              <SetNumberInput
                rowId={row.id}
                index={index}
                count={count}
                column="pct"
                field={pctField}
                label={`Set ${n} yükü, tam yükün yüzdesi (boş: tam yük)`}
                max={100}
                step={5}
                disabled={disabled}
                onValue={(value) => write('loadPct', value)}
              />
            </InputGroup>
          ) : null}
          <Toggle
            variant="outline"
            className="h-10 w-18 aria-pressed:border-primary aria-pressed:bg-primary/10 touch:h-11"
            disabled={disabled}
            pressed={Boolean(set?.amrap)}
            onPressedChange={(pressed) => setInput(form, { path: at('amrap'), input: pressed ? true : undefined })}
            aria-label={`Set ${n} AMRAP (yapabildiği kadar)`}>
            AMRAP
          </Toggle>
        </div>
      </div>
      <FieldError className="pl-7">{errors?.[0]}</FieldError>
    </li>
  );
}

/**
 * "Setleri ayrı düzenle": açılır bölüm (44 px başlık). Ağırlıklı harekette düzen seçimi
 * [Düz][Piramit][Back-off] (hiçbiri değilse "Özel düzen"); her set bir satır. Setler düz
 * değilse ya da bir sette hata varsa kendiliğinden açıktır (hatada kapanmaz).
 */
export function SetsSection({ blockIndex, rowIndex, row, exercise, title, open, forced }: RowProps & { title: string; open: boolean; forced: boolean }) {
  const editor = useEditor();
  const setsArray = useFieldArray(editor.form, { path: blockField(editor.path, blockIndex, 'rows', rowIndex, 'sets') });
  const weighted = exercise?.trackingType === 'weight_reps';
  const shape = setShape(row.sets).kind;
  const deviceId = row.deviceId ?? exercise?.deviceId;
  const device = deviceId ? editor.devices.get(deviceId) : undefined;
  const rules = exercise ? describeSetRules(row.sets, loadSpecFor(exercise, device)) : null;
  const contentId = `sets-${row.id}`;

  const apply = (preset: Exclude<SetPreset, 'lastAmrap'>) => {
    editor.setSetsOpen(row.id, true);
    editor.updateWithUndo((before) => applySetPreset(before, row.id, preset), PRESET_MESSAGES[preset]);
  };

  return (
    <div className="border-t">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        disabled={forced}
        onClick={() => editor.setSetsOpen(row.id, !open)}
        className="group/sets flex h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:cursor-default disabled:hover:bg-transparent">
        <span>
          Setleri ayrı düzenle <span className="text-muted-foreground">· {weighted ? '%, AMRAP' : 'AMRAP'}</span>
        </span>
        <CaretDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground group-aria-expanded/sets:rotate-180 motion-safe:transition-transform motion-safe:duration-160"
        />
      </button>
      {open ? (
        <div id={contentId} className="flex flex-col gap-3 px-3 pt-1 pb-3">
          {weighted ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground" id={`layout-${row.id}`}>
                Düzen
              </span>
              <ToggleGroup
                variant="outline"
                spacing={0}
                aria-labelledby={`layout-${row.id}`}
                value={shape === 'custom' ? [] : [shape]}
                onValueChange={(value) => {
                  const next = value[0] as Exclude<SetPreset, 'lastAmrap'> | undefined;
                  if (next && next !== shape) apply(next);
                }}>
                {(['straight', 'pyramid', 'backoff'] as const).map((preset) => (
                  <ToggleGroupItem key={preset} value={preset} className="h-8 px-3 touch:h-11">
                    {PRESET_LABELS[preset]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {shape === 'custom' ? <span className="text-xs text-muted-foreground">Özel düzen</span> : null}
            </div>
          ) : !isStraight(row.sets) ? (
            <div>
              <Button type="button" variant="outline" size="sm" className="touch:h-11" onClick={() => apply('straight')}>
                Setleri eşitle
              </Button>
            </div>
          ) : null}
          <ol className="flex flex-col gap-2" aria-label={`${title} setleri`}>
            {row.sets.map((_, index) => (
              <SetRow key={index} blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} index={index} />
            ))}
          </ol>
          {setsArray.errors ? <FieldError>{setsArray.errors[0]}</FieldError> : null}
          {rules ? <FieldDescription>{rules}</FieldDescription> : null}
        </div>
      ) : null}
    </div>
  );
}
