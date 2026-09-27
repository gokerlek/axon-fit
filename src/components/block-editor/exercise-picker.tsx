'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Check, MagnifyingGlass, Plus, WarningCircle } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { EditorCare } from '@/lib/constraint-filter';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
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
  care = null,
  onAllowed,
}: {
  exercises: readonly PickerExercise[];
  devices: ReadonlyMap<string, EditorDevice>;
  /** Egzersiz → listede kaç kez geçtiği. */
  usage: ReadonlyMap<string, number>;
  mode: 'add' | 'replace';
  /** Değiştirme kipinde yerine seçilen egzersiz: muadilleri önce önerilir. */
  suggestFor: string | null;
  /** Eklenemiyor (şablon ya da grup dolu, grup yok; nedeni sheet'in durum satırında): ekleme kapalı, değiştirme açık. */
  disabled: boolean;
  /** Az önce eklenen egzersiz: kısa süre "Eklendi" görünür. */
  justAdded: string | null;
  searchRef?: React.Ref<HTMLInputElement>;
  onPick: (exercise: PickerExercise) => void;
  className?: string;
  /** Programda danışanın kısıtları: dikkat gerekçesi satırda, yasaklar katlanmış grupta (`kisit-tarama.md` §3.2). */
  care?: EditorCare | null;
  /** "Yine de ekle" izni kaydedildi. */
  onAllowed?: (exerciseId: string) => void;
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
  // Kısıt varken yaptırma alanlar listenin sonunda katlanmış grupta (kaybolmaz; arama onları da bulur).
  const flagOf = (exercise: PickerExercise) => (care && !replacing ? care.map[exercise.id] : undefined);
  const open = care && !replacing ? results.filter((exercise) => flagOf(exercise)?.group !== 'blocked') : results;
  const hidden = care && !replacing ? results.filter((exercise) => flagOf(exercise)?.group === 'blocked') : [];
  const shown = open.slice(0, RESULT_LIMIT);

  const renderItem = (exercise: PickerExercise) => {
    const count = usage.get(exercise.id) ?? 0;
    const device = exercise.deviceId ? devices.get(exercise.deviceId)?.name : undefined;
    const verb = replacing ? 'seç' : 'ekle';
    const flag = flagOf(exercise);
    const reason = flag?.decision ? flag.messages.join(' · ') : null;
    return (
      <Item
        key={exercise.id}
        variant="outline"
        size="sm"
        className="flex-nowrap text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        render={<button type="button" disabled={locked} aria-label={`${exercise.title} ${verb}${reason ? ` · ${reason}` : ''}`} onClick={() => onPick(exercise)} />}>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full truncate">{exercise.title}</ItemTitle>
          <ItemDescription className="truncate text-xs">
            {summarizeMuscles(exercise.primaryMuscles).join(', ')} · {device ?? EQUIPMENT_LABELS[exercise.equipment]}
          </ItemDescription>
          {reason ? (
            <p title={reason} className="line-clamp-2 flex items-start gap-1 text-xs text-primary-text">
              <WarningCircle weight="fill" aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>
                {flag?.decision === 'cue' ? 'İpucu' : 'Dikkat'} · {reason}
              </span>
            </p>
          ) : null}
        </ItemContent>
        <ItemActions>
          {exercise.caution ? <Badge variant="outline">Kısıtına uymayabilir</Badge> : null}
          {flag?.group === 'untagged' ? <Badge variant="outline">kontrol edilmedi</Badge> : null}
          {flag?.group === 'unassessed' ? <Badge variant="outline">eksik bilgi</Badge> : null}
          {count > 0 ? <Badge variant="secondary">şablonda ×{count}</Badge> : null}
          {replacing ? (
            <span className="text-xs font-medium text-primary-text">Seç</span>
          ) : justAdded === exercise.id ? (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-text animate-in duration-160 fade-in-0" aria-hidden>
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
              className="shrink-0 touch:h-11 touch:min-w-11"
              pressed={group === item.id}
              onPressedChange={(pressed) => setGroup(pressed ? item.id : null)}>
              {item.label}
            </Toggle>
          ))}
        </div>
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
            {open.length > shown.length ? (
              <p className="text-xs text-muted-foreground">
                <span className="tabular-nums">{open.length}</span> sonuçtan {RESULT_LIMIT}&apos;si gösteriliyor; aramayı daralt.
              </p>
            ) : null}
          </section>
        ) : null}
        {hidden.length > 0 && care ? (
          <details className="group rounded-lg border">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Bu danışana önerilmeyenler ({hidden.length})</summary>
            <ul className="flex flex-col divide-y border-t">
              {hidden.slice(0, RESULT_LIMIT).map((exercise) => {
                const flag = care.map[exercise.id];
                return (
                  <li key={exercise.id} className="flex flex-col gap-1.5 px-3 py-2 text-sm">
                    <span className="font-medium">{exercise.title}</span>
                    <span className="text-xs text-muted-foreground">{flag?.messages.join(' · ')}</span>
                    {flag && flag.overridable.length > 0 && !flag.locked ? (
                      <AllowButton
                        care={care}
                        exercise={exercise}
                        messages={flag.messages}
                        sources={flag.overridable.map((item) => item.id)}
                        disabled={locked}
                        onAllowed={(picked) => {
                          onAllowed?.(picked.id);
                          onPick(picked);
                        }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Sağlık profesyonelinin görüşü kaydedilene kadar izin verilemez.</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
        {shown.length === 0 && hidden.length === 0 ? (
          <Empty className="border p-4">
            <EmptyHeader>
              <EmptyTitle>Uyan egzersiz yok</EmptyTitle>
              <EmptyDescription>Başka bir ad ya da kas dene.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Yine de ekle" (tasarım `kisit-tarama.md` §3.2): kısa onay, isteğe bağlı not; izin bu danışan ve bu hareket için
 * hemen yazılır (programı kaydetmeden çıkılsa da kalır, Kısıtlar'dan kaldırılabilir), sonra satır eklenir.
 */
function AllowButton({
  care,
  exercise,
  messages,
  sources,
  disabled,
  onAllowed,
}: {
  care: EditorCare;
  exercise: PickerExercise;
  messages: string[];
  sources: string[];
  disabled: boolean;
  onAllowed: (exercise: PickerExercise) => void;
}) {
  const [note, setNote] = useState('');
  const allow = useServiceMutation({
    fn: async () => {
      for (const source of sources) {
        await fetchJson<{ ok: true }>(`/api/clients/${care.clientId}/constraints/overrides`, {
          method: 'POST',
          body: JSON.stringify({ exerciseId: exercise.id, source, note }),
        });
      }
    },
    notify: { success: 'İzin kaydedildi.' },
    onSuccess: () => onAllowed(exercise),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" className="w-fit touch:h-11" disabled={disabled} />}>Yine de ekle</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{exercise.title} bu danışana önerilmiyor</AlertDialogTitle>
          <AlertDialogDescription>{messages.join(' · ')}</AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={`allow-${exercise.id}`}>Not (isteğe bağlı)</FieldLabel>
          <Input id={`allow-${exercise.id}`} maxLength={140} value={note} onChange={(event) => setNote(event.currentTarget.value)} />
        </Field>
        <p className="text-sm text-muted-foreground">İzin bu danışan ve bu hareket için kaydedilir; Kısıtlar’dan kaldırılabilir.</p>
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction disabled={allow.isPending} onClick={() => allow.mutate()}>
            {allow.isPending ? <Spinner data-icon="inline-start" /> : null}
            Yine de ekle
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
