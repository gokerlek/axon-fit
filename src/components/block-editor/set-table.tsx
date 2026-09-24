'use client';

import { useRef, useState } from 'react';
import { getInput, setInput, useField, useFieldArray, type FieldElementProps } from '@formisch/react';
import { CaretDown, Copy, DotsThreeVertical, Plus, Trash } from '@phosphor-icons/react';
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
import { Toggle } from '@/components/ui/toggle';
import { loadSpecFor } from '@/lib/device-loads';
import { formatNumber } from '@/lib/format';
import { describeSetRules } from '@/lib/progression';
import {
  BACKOFF_PCT,
  PRESET_MIN_SETS,
  SET_LIMITS,
  formatSets,
  pyramidPreset,
  referenceSet,
  removeSetAt,
  resizeSets,
  setShape,
  targetToAll,
  type SetSpec,
} from '@/lib/set-plan';
import { applySetPreset, setRounds, setRowSetCount, updateRowSets, type PickerExercise, type SetPreset } from '@/lib/template-edit';
import { TEMPLATE_LIMITS, type TemplateBlock, type TemplateRow } from '@/lib/template-plan';
import { cn } from '@/lib/utils';
import { blockField, setInputId, useEditor, type SetColumn } from './editor-context';

/**
 * Satırın setleri (SPEC §7.4): set sayısı, grubun turu, setlerin özeti ve set tablosu
 * (her setin hedefi, yük yüzdesi, AMRAP; hazır düzenler). Düz setler (hepsi aynı)
 * satırda tek "Hedef" alanıyla bugünkü kadar hızlı düzenlenir; tablo gerektiğinde açılır.
 */

type RowProps = { blockIndex: number; rowIndex: number; row: TemplateRow; exercise: PickerExercise | undefined };

const COUNT_ERROR = `1–${SET_LIMITS.perRow} arası bir sayı gir.`;

/** Sayı kutusunun değeri: boş → yok, çözülemeyen giriş → NaN (şema "Sayı gir." der). */
function numberOf(input: HTMLInputElement): number | undefined {
  if (input.validity.badInput) return Number.NaN;
  return input.value === '' ? undefined : input.valueAsNumber;
}

function shown(value: unknown): number | '' {
  return typeof value === 'number' && !Number.isNaN(value) ? value : '';
}

/** Taslak metin 1–10 arası tam sayı mı. */
function parseCount(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= SET_LIMITS.perRow ? value : null;
}

function rangeText(set: Pick<SetSpec, 'min' | 'max'>): string {
  const format = (value: number) => (Number.isFinite(value) ? formatNumber(value) : '?');
  return set.min === set.max ? format(set.min) : `${format(set.min)}–${format(set.max)}`;
}

/**
 * Sayı taslağı: yazarken geçersiz değer kutuda kalır ve hata söylenir, geçerli değer hemen
 * uygulanır; odak çıkınca kutu gerçek değere döner. Uygulama odaklanıldığı andaki hâlden
 * yapılır: "1" yazıp "10"a giderken aradaki 1 set diğer setleri silmez.
 */
function useCountDraft<T>(snapshot: () => T, apply: (base: T, count: number) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const base = useRef<T | null>(null);
  return {
    draft,
    invalid: draft !== null && parseCount(draft) === null,
    onFocus: () => {
      base.current = snapshot();
    },
    onChange: (text: string) => {
      setDraft(text);
      const count = parseCount(text);
      if (count !== null) apply(base.current ?? snapshot(), count);
    },
    onBlur: () => {
      setDraft(null);
      base.current = null;
    },
  };
}

/** Satırın set sayısı (tek harekette "Set", grupta hareketin kendi seti). */
export function SetCountField({ row, exercise, className }: Pick<RowProps, 'row' | 'exercise'> & { className?: string }) {
  const editor = useEditor();
  const id = `setcount-${row.id}`;
  const count = useCountDraft(
    () => row.sets.map((set) => ({ ...set })),
    (base, value) => editor.update((before) => updateRowSets(before, row.id, () => resizeSets(base, value))),
  );
  return (
    <Field data-invalid={count.invalid || undefined} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        Set
      </FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={SET_LIMITS.perRow}
        step={1}
        disabled={!exercise}
        aria-invalid={count.invalid || undefined}
        className="tabular-nums"
        value={count.draft ?? String(row.sets.length)}
        onFocus={count.onFocus}
        onChange={(event) => count.onChange(event.currentTarget.value)}
        onBlur={count.onBlur}
      />
      {count.invalid ? <FieldError>{COUNT_ERROR}</FieldError> : null}
    </Field>
  );
}

/** Grubun turu: turu dolduran hareketler yeni tura geçer, daha az setliler kendi sayısında kalır. */
export function RoundsField({ block, rounds, className }: { block: TemplateBlock; rounds: number; className?: string }) {
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
  );
  return (
    <Field data-invalid={count.invalid || undefined} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        Tur
      </FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={TEMPLATE_LIMITS.sets}
        step={1}
        aria-invalid={count.invalid || undefined}
        className="tabular-nums"
        value={count.draft ?? String(rounds)}
        onFocus={count.onFocus}
        onChange={(event) => count.onChange(event.currentTarget.value)}
        onBlur={count.onBlur}
      />
      {count.invalid ? <FieldError>{COUNT_ERROR}</FieldError> : null}
    </Field>
  );
}

/** Düz olmayan setlerin özeti: dokununca set tablosu açılır. */
export function SetsSummary({ row, exercise, className }: Pick<RowProps, 'row' | 'exercise'> & { className?: string }) {
  const editor = useEditor();
  const text = formatSets(row.sets, exercise?.trackingType ?? 'weight_reps');
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs text-muted-foreground" aria-hidden>
        Hedef
      </span>
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-h-8 w-full min-w-0 justify-start px-2 py-1.5 text-left font-normal tabular-nums"
        disabled={!exercise}
        aria-label={`Setleri düzenle: ${text}`}
        onClick={() => {
          editor.openSets(row.id);
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

/** "Hazır düzen": her seçenek sonucunu gösterir (Düz · 3 × 8–12, Piramit · 12 / 10 / 8…). */
export function SetPresetMenu({ row, exercise }: Pick<RowProps, 'row' | 'exercise'>) {
  const editor = useEditor();
  const weighted = exercise?.trackingType === 'weight_reps';
  const duration = exercise?.trackingType === 'duration';
  const n = row.sets.length;
  const ref = referenceSet(row.sets);
  const lastAmrap = ['last', 'all'].includes(setShape(row.sets).amrap);
  const pyramid = pyramidPreset(row.sets, TEMPLATE_LIMITS.repsMax)
    .map((set) => rangeText(set))
    .join(' / ');
  const backoffCount = (n >= 2 ? n : PRESET_MIN_SETS) - 1;
  const apply = (preset: SetPreset, message: string) => editor.updateWithUndo((before) => applySetPreset(before, row.id, preset), message);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" disabled={!exercise} />}>
        Hazır düzen
        <CaretDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem onClick={() => apply('straight', PRESET_MESSAGES.straight)}>
          Düz · {formatNumber(n)} × {rangeText(ref)}
        </DropdownMenuItem>
        {weighted ? (
          <>
            <DropdownMenuItem onClick={() => apply('pyramid', PRESET_MESSAGES.pyramid)}>Piramit · {pyramid}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => apply('backoff', PRESET_MESSAGES.backoff)}>
              Back-off · {rangeText(ref)} + {formatNumber(backoffCount)} × %{BACKOFF_PCT}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={lastAmrap}
          onCheckedChange={() => apply('lastAmrap', lastAmrap ? 'AMRAP kaldırıldı' : 'Son set AMRAP')}>
          {duration ? 'Son set: yapabildiği kadar tut' : 'Son set AMRAP'}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type NumberField = { input: unknown; errors: readonly string[] | null; props: FieldElementProps };

/** Set tablosunun sayı kutusu: Enter sonraki setin aynı sütununa, Shift+Enter öncekine gider. */
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
  field: NumberField;
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
      className={cn('tabular-nums', column !== 'pct' && 'h-10 w-16')}
      value={shown(field.input)}
      onChange={(event) => onValue(numberOf(event.currentTarget))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        // Enter formu göndermesin: aynı sütunda sonraki (Shift ile önceki) sete geç.
        event.preventDefault();
        const target = event.shiftKey ? index - 1 : index + 1;
        if (target < 0) return;
        const next = target >= count ? document.getElementById(`set-add-${rowId}`) : document.getElementById(setInputId(rowId, target, column));
        next?.focus();
      }}
    />
  );
}

/** Tablonun bir seti: hedef aralığı, yük yüzdesi (ağırlıklı harekette), AMRAP, set menüsü. */
export function SetRowEditor({ blockIndex, rowIndex, row, exercise, index }: RowProps & { index: number }) {
  const editor = useEditor();
  const { form, path } = editor;
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-7 shrink-0 text-sm tabular-nums text-muted-foreground">{n}.</span>
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
        <span className="text-sm text-muted-foreground">{duration ? 'sn' : 'tekrar'}</span>
        <div className="flex basis-full items-center gap-2 pl-9 sm:basis-auto sm:pl-0">
          {weighted ? (
            <InputGroup className="h-10 w-24" data-disabled={disabled || undefined}>
              <InputGroupAddon align="inline-start">%</InputGroupAddon>
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
            className="h-10"
            disabled={disabled}
            pressed={Boolean(set?.amrap)}
            onPressedChange={(pressed) => setInput(form, { path: at('amrap'), input: pressed ? true : undefined })}
            aria-label={`Set ${n} AMRAP (yapabildiği kadar)`}>
            AMRAP
          </Toggle>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={disabled}
              render={<Button type="button" variant="ghost" size="icon" aria-label={`Set ${n} işlemleri`} />}>
              <DotsThreeVertical weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem
                onClick={() =>
                  editor.update((before) => updateRowSets(before, row.id, (sets) => targetToAll(sets, index)), {
                    announce: `Set ${n} hedefi bütün setlere uygulandı`,
                  })
                }>
                <Copy />
                Hedefi bütün setlere uygula
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={count <= 1}
                onClick={() => {
                  editor.update((before) => updateRowSets(before, row.id, (sets) => removeSetAt(sets, index)), { announce: `Set ${n} silindi` });
                  editor.focusSet(row.id, Math.max(0, index - 1), 'min');
                }}>
                <Trash />
                Seti sil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <FieldError className="pl-9">{errors?.[0]}</FieldError>
    </li>
  );
}

/** Set tablosu: her set bir satır; hazır düzenler, "Set ekle", setlerin kuralları. */
export function SetTable({ blockIndex, rowIndex, row, exercise, title }: RowProps & { title: string }) {
  const editor = useEditor();
  const setsArray = useFieldArray(editor.form, { path: blockField(editor.path, blockIndex, 'rows', rowIndex, 'sets') });
  const deviceId = row.deviceId ?? exercise?.deviceId;
  const device = deviceId ? editor.devices.get(deviceId) : undefined;
  const rules = exercise ? describeSetRules(row.sets, loadSpecFor(exercise, device)) : null;
  const count = row.sets.length;
  const add = () => {
    editor.update((before) => setRowSetCount(before, row.id, count + 1), { announce: `Set ${count + 1} eklendi` });
    editor.focusSet(row.id, count, 'min');
  };

  return (
    <div id={`sets-${row.id}`} className="flex flex-col gap-3 border-t p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Setler</span>
        <SetPresetMenu row={row} exercise={exercise} />
      </div>
      <ol className="flex flex-col gap-2" aria-label={`${title} setleri`}>
        {row.sets.map((_, index) => (
          <SetRowEditor key={index} blockIndex={blockIndex} rowIndex={rowIndex} row={row} exercise={exercise} index={index} />
        ))}
      </ol>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          id={`set-add-${row.id}`}
          disabled={!exercise || count >= SET_LIMITS.perRow}
          onClick={add}>
          <Plus data-icon="inline-start" />
          Set ekle
        </Button>
      </div>
      {setsArray.errors ? <FieldError>{setsArray.errors[0]}</FieldError> : null}
      {rules ? <FieldDescription>{rules}</FieldDescription> : null}
    </div>
  );
}

/**
 * Düz setlerin hedefi (tablo kapalıyken): iki kutu ilk sete bağlıdır (hata ve odak), yazılan
 * değer bütün setlere tek seferde gider.
 */
export function StraightTargetField({ blockIndex, rowIndex, row, exercise, className }: RowProps & { className?: string }) {
  const { form, path } = useEditor();
  const setsPath = blockField(path, blockIndex, 'rows', rowIndex, 'sets');
  const minField = useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets', 0, 'min') });
  const maxField = useField(form, { path: blockField(path, blockIndex, 'rows', rowIndex, 'sets', 0, 'max') });
  const isDuration = exercise?.trackingType === 'duration';
  const max = isDuration ? TEMPLATE_LIMITS.secondsMax : TEMPLATE_LIMITS.repsMax;
  const step = isDuration ? 5 : 1;
  const errors = minField.errors ?? maxField.errors;
  const amrap = setShape(row.sets).amrap;
  const amrapBadge =
    amrap === 'none'
      ? null
      : amrap === 'last'
        ? row.sets.length === 1
          ? 'AMRAP'
          : 'son set AMRAP'
        : amrap === 'all'
          ? 'hepsi AMRAP'
          : 'AMRAP';
  const writeAll = (name: 'min' | 'max', value: number | undefined) => {
    const sets = (getInput(form, { path: setsPath }) ?? []) as SetSpec[];
    setInput(form, { path: setsPath, input: sets.map((set) => ({ ...set, [name]: value })) as SetSpec[] });
  };

  return (
    <Field data-invalid={Boolean(errors) || undefined} className={cn('gap-1.5', className)}>
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
          className="w-16 tabular-nums"
          value={shown(minField.input)}
          onChange={(event) => writeAll('min', numberOf(event.currentTarget))}
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
          className="w-16 tabular-nums"
          value={shown(maxField.input)}
          onChange={(event) => writeAll('max', numberOf(event.currentTarget))}
        />
        <span className="text-sm text-muted-foreground">{isDuration ? 'sn' : 'tekrar'}</span>
        {amrapBadge ? <Badge variant="secondary">{amrapBadge}</Badge> : null}
      </div>
      <FieldError>{errors?.[0]}</FieldError>
    </Field>
  );
}
