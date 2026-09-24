'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Check, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Toggle } from '@/components/ui/toggle';
import { searchExercises } from '@/lib/exercise-search';
import { exerciseAlternatives, familyOf, summarizeMuscles, works } from '@/lib/muscles';
import { EQUIPMENT_LABELS, MUSCLE_GROUPS, MUSCLE_LABELS, type Muscle } from '@/lib/schemas/exercise';
import type { EditorDevice, PickerExercise } from '@/lib/template-edit';
import { cn } from '@/lib/utils';

/** Ekranda en çok bu kadar sonuç; gerisi için arama daraltılır. */
const RESULT_LIMIT = 50;

const GROUP_OF = new Map<string, string>(MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, group.label] as const)));

/** Aramada bir kasın adları: kendi adı, ailesi ("Kanat"), bölgesi ("Sırt"). */
function muscleNames(muscle: string): string[] {
  // Ailesi olmayan kasta `familyOf` kimliğin kendisini verir; o aranmaz.
  const family = familyOf(muscle);
  const names = [MUSCLE_LABELS[muscle as Muscle] ?? muscle, family === muscle ? '' : family, GROUP_OF.get(muscle) ?? ''];
  return [...new Set(names.filter(Boolean))];
}

export type ReplaceTarget = { rowId: string; label: string; title: string; exerciseId: string };

/**
 * Kütüphane (sheet'in içinde): ada ya da kasa göre arama, bölge süzgeci ve sonuçlar.
 * Ekleme kipinde dokununca listenin sonuna eklenir; değiştirme kipinde seçilen hareket
 * satırın yerine geçer ve önce muadiller önerilir. Arama ve süzgeç üstte sabit, sonuçlar kayar.
 */
export function ExercisePicker({
  exercises,
  devices,
  usage,
  mode,
  suggestFor,
  disabled,
  justAdded,
  searchRef,
  onPick,
  className,
}: {
  exercises: readonly PickerExercise[];
  devices: ReadonlyMap<string, EditorDevice>;
  /** Egzersiz → listede kaç kez geçtiği. */
  usage: ReadonlyMap<string, number>;
  mode: 'add' | 'replace';
  /** Değiştirme kipinde yerine seçilen egzersiz: muadilleri önce önerilir. */
  suggestFor: string | null;
  /** Liste dolu (40 hareket ya da 30 blok): ekleme kapalı, değiştirme açık. */
  disabled: boolean;
  /** Az önce eklenen egzersiz: kısa süre "Eklendi" görünür. */
  justAdded: string | null;
  searchRef?: React.Ref<HTMLInputElement>;
  onPick: (exercise: PickerExercise) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const replacing = mode === 'replace';

  const results = useMemo(() => {
    const muscles = MUSCLE_GROUPS.find((item) => item.id === group)?.muscles ?? null;
    const pool = muscles ? exercises.filter((exercise) => muscles.some((muscle) => works(exercise, muscle))) : exercises;
    return searchExercises(pool, deferredQuery, muscleNames);
  }, [exercises, deferredQuery, group]);

  const suggestions = useMemo(() => {
    if (!replacing || !suggestFor) return [];
    const source = exercises.find((exercise) => exercise.id === suggestFor);
    return source ? exerciseAlternatives(source, exercises, 6).map((item) => item.exercise) : [];
  }, [replacing, suggestFor, exercises]);

  const locked = disabled && !replacing;
  const shown = results.slice(0, RESULT_LIMIT);

  const renderItem = (exercise: PickerExercise) => {
    const count = usage.get(exercise.id) ?? 0;
    const device = exercise.deviceId ? devices.get(exercise.deviceId)?.name : undefined;
    const verb = replacing ? 'seç' : 'ekle';
    return (
      <Item
        key={exercise.id}
        variant="outline"
        size="sm"
        className="flex-nowrap text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        render={<button type="button" disabled={locked} aria-label={`${exercise.title} ${verb}`} onClick={() => onPick(exercise)} />}>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full truncate">{exercise.title}</ItemTitle>
          <ItemDescription className="truncate text-xs">
            {summarizeMuscles(exercise.primaryMuscles).join(', ')} · {device ?? EQUIPMENT_LABELS[exercise.equipment]}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {count > 0 ? <Badge variant="secondary">şablonda ×{count}</Badge> : null}
          {replacing ? (
            <span className="text-xs font-medium text-primary">Seç</span>
          ) : justAdded === exercise.id ? (
            <span className="flex items-center gap-1 text-xs font-medium text-primary animate-in duration-160 fade-in-0" aria-hidden>
              <Check className="size-3.5" />
              Eklendi
            </span>
          ) : (
            <Plus className="size-4 text-muted-foreground" />
          )}
        </ItemActions>
      </Item>
    );
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-col gap-3 border-b px-4 py-3">
        <InputGroup className="touch:h-11">
          <InputGroupAddon>
            <MagnifyingGlass />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            className="touch:h-11"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            // Sheet formun dışında (portal) olsa da Enter hiçbir şey göndermesin.
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
            }}
            placeholder="Egzersiz ya da kas ara"
            aria-label="Egzersiz ya da kas ara"
            autoComplete="off"
          />
        </InputGroup>

        {/* Telefonda tek satır, yatay kayar (sayfa taşmaz); geniş sheet'te sarılır. */}
        <div
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="group"
          aria-label="Bölgeye göre süz">
          {MUSCLE_GROUPS.map((item) => (
            <Toggle
              key={item.id}
              variant="outline"
              size="sm"
              className="shrink-0 touch:h-11"
              pressed={group === item.id}
              onPressedChange={(pressed) => setGroup(pressed ? item.id : null)}>
              {item.label}
            </Toggle>
          ))}
        </div>

        {locked ? <p className="text-sm text-muted-foreground">Şablon dolu: en fazla 40 hareket ve 30 blok olur.</p> : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
        {suggestions.length > 0 ? (
          <section className="flex flex-col gap-2" aria-label="Önerilen muadiller">
            <h3 className="text-xs font-medium text-muted-foreground">Önerilen muadiller</h3>
            <ItemGroup className="gap-2">{suggestions.map(renderItem)}</ItemGroup>
          </section>
        ) : null}

        {shown.length > 0 ? (
          <section className="flex flex-col gap-2" aria-label="Kütüphane">
            {suggestions.length > 0 ? <h3 className="text-xs font-medium text-muted-foreground">Bütün kütüphane</h3> : null}
            <ItemGroup className="gap-2">{shown.map(renderItem)}</ItemGroup>
            {results.length > shown.length ? (
              <p className="text-xs text-muted-foreground">
                <span className="tabular-nums">{results.length}</span> sonuçtan {RESULT_LIMIT}&apos;si gösteriliyor; aramayı daralt.
              </p>
            ) : null}
          </section>
        ) : (
          <Empty className="border p-4">
            <EmptyHeader>
              <EmptyTitle>Uyan egzersiz yok</EmptyTitle>
              <EmptyDescription>Başka bir ad ya da kas dene.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
