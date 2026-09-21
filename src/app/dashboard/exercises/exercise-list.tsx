'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlass, Plus, YoutubeLogo } from '@phosphor-icons/react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, MUSCLES, MUSCLE_LABELS, type Exercise, type Muscle } from '@/lib/schemas/exercise';

type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/**
 * Egzersiz listesi: arama ve kas grubuna göre süzme. Her kart detay sayfasına gider;
 * ekleme ve düzenleme kendi sayfalarında (modal değil, SPEC §6).
 *
 * İlk veri sunucudan gelir (`initial`), sonrası React Query'de.
 */
export function ExerciseList({ initial }: { initial: ExerciseWithSource[] }) {
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);

  const { data } = useServiceQuery({
    key: ['exercises'],
    fn: ({ signal }) => fetchJson<{ exercises: ExerciseWithSource[] }>('/api/exercises', { signal }),
    initialData: { exercises: initial },
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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Egzersizler"
        description={
          <>
            <span className="tabular">{exercises.length}</span> egzersiz · <span className="tabular">{customCount}</span>{' '}
            tanesi senin
          </>
        }
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/exercises/new" />}>
            <Plus data-icon="inline-start" />
            Yeni egzersiz
          </Button>
        }
      />

      <InputGroup>
        <InputGroupAddon>
          <MagnifyingGlass />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Egzersiz ara"
          aria-label="Egzersiz ara"
        />
      </InputGroup>

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
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MagnifyingGlass />
            </EmptyMedia>
            <EmptyTitle>Aramana uyan egzersiz yok</EmptyTitle>
            <EmptyDescription>Başka bir ad dene ya da kas süzgecini kaldır.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/exercises/${item.id}`}
                className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle className="truncate">{item.title}</CardTitle>
                    <CardDescription className="flex items-center gap-1.5">
                      {MUSCLE_LABELS[item.targetMuscle]} · {EQUIPMENT_LABELS[item.equipment]}
                      {item.video ? <YoutubeLogo className="size-4 shrink-0" aria-label="videolu" /> : null}
                    </CardDescription>
                    {item.source === 'custom' ? (
                      <CardAction>
                        <Badge variant="secondary">senin</Badge>
                      </CardAction>
                    ) : null}
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
