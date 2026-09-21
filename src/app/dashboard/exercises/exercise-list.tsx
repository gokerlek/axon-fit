'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlass, PencilSimple, Plus, Trash, YoutubeLogo } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation, useServiceQuery } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, MUSCLES, MUSCLE_LABELS, type Exercise, type Muscle } from '@/lib/schemas/exercise';
import { ExerciseForm } from './exercise-form';

type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/**
 * Egzersiz listesi: arama, kas grubuna göre süzme, ekleme/düzenleme (diyalog), silme (onaylı).
 *
 * İlk veri sunucudan gelir (`initial`), sonrası React Query'de. Yazma işlemleri
 * `invalidate` ile listeyi tazeler; elle yeniden çekme yok.
 */
export function ExerciseList({ initial }: { initial: ExerciseWithSource[] }) {
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [deleting, setDeleting] = useState<Exercise | null>(null);

  const { data } = useServiceQuery({
    key: ['exercises'],
    fn: ({ signal }) => fetchJson<{ exercises: ExerciseWithSource[] }>('/api/exercises', { signal }),
    initialData: { exercises: initial },
  });

  const remove = useServiceMutation({
    fn: (id: string) => fetchJson<{ ok: true }>(`/api/exercises/${id}`, { method: 'DELETE' }),
    invalidate: [['exercises']],
    notify: { success: 'Egzersiz silindi.' },
    onSuccess: () => setDeleting(null),
  });

  const exercises = data?.exercises ?? initial;
  const customCount = exercises.filter((item) => item.source === 'custom').length;

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr');
    return exercises.filter((item) => {
      if (muscle && item.targetMuscle !== muscle && !item.secondaryMuscles.includes(muscle)) return false;
      return !query || item.title.toLocaleLowerCase('tr').includes(query);
    });
  }, [exercises, search, muscle]);

  // Süzgeçte yalnız gerçekten kullanılan kas grupları görünsün.
  const usedMuscles = useMemo(
    () => MUSCLES.filter((item) => exercises.some((exercise) => exercise.targetMuscle === item)),
    [exercises],
  );

  const openForm = (exercise: Exercise | null) => {
    setEditing(exercise);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Egzersizler</h1>
          <p className="text-sm text-muted-foreground">
            <span className="tabular">{exercises.length}</span> egzersiz ·{' '}
            <span className="tabular">{customCount}</span> tanesi senin
          </p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus data-icon="inline-start" />
          Yeni egzersiz
        </Button>
      </header>

      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Egzersiz ara"
          aria-label="Egzersiz ara"
          className="pl-9"
        />
      </div>

      <ToggleGroup
        variant="outline"
        size="sm"
        className="flex-wrap justify-start"
        value={[muscle ?? 'all']}
        onValueChange={(value) => {
          const next = value[0];
          setMuscle(!next || next === 'all' ? null : (next as Muscle));
        }}>
        <ToggleGroupItem value="all">Hepsi</ToggleGroupItem>
        {usedMuscles.map((item) => (
          <ToggleGroupItem key={item} value={item}>
            {MUSCLE_LABELS[item]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Aramana uyan egzersiz yok.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <Card size="sm" className="h-full">
                <CardContent className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{item.title}</p>
                      {item.source === 'custom' ? <Badge variant="secondary">senin</Badge> : null}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      {MUSCLE_LABELS[item.targetMuscle]} · {EQUIPMENT_LABELS[item.equipment]}
                      {item.video ? <YoutubeLogo className="size-4 shrink-0" aria-label="videolu" /> : null}
                    </p>
                  </div>

                  {item.source === 'custom' ? (
                    <div className="flex shrink-0 gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label={`${item.title} egzersizini düzenle`} onClick={() => openForm(item)} />
                          }>
                          <PencilSimple />
                        </TooltipTrigger>
                        <TooltipContent>Düzenle</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label={`${item.title} egzersizini sil`} onClick={() => setDeleting(item)} />
                          }>
                          <Trash />
                        </TooltipTrigger>
                        <TooltipContent>Sil</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Egzersizi düzenle' : 'Yeni egzersiz'}</DialogTitle>
            <DialogDescription>
              Kendi egzersizlerin repo&apos;nda ayrı durur; hazır kütüphane güncellense de silinmez.
            </DialogDescription>
          </DialogHeader>
          {/* Her açılışta form sıfırdan kurulsun: key değişince bileşen yenilenir. */}
          <ExerciseForm key={editing?.id ?? 'yeni'} editing={editing} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>&ldquo;{deleting?.title}&rdquo; silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu egzersizi kullanan şablonlar varsa oradan da kaldırman gerekir. Git geçmişinde kaydı durur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}>
              {remove.isPending ? 'Siliniyor…' : 'Sil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
