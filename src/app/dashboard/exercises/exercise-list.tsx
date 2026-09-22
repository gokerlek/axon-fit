'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Heartbeat, MagnifyingGlass, Plus, X, YoutubeLogo } from '@phosphor-icons/react';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { countByMuscle, isBodyMuscle, parseMuscles, works } from '@/lib/muscles';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, type Exercise, type Muscle } from '@/lib/schemas/exercise';

type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/**
 * Egzersiz listesi: arama ve kas haritasıyla süzme. Her kart detay sayfasına gider;
 * ekleme ve düzenleme kendi sayfalarında (modal değil, SPEC §6).
 *
 * Kas seçimi adres satırında (`?muscle=chest,back`): detaydan geri dönünce ve
 * paylaşılan bağlantıda süzgeç korunur. İlk veri sunucudan gelir, sonrası React Query'de.
 */
export function ExerciseList({ initial }: { initial: ExerciseWithSource[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = useMemo(() => parseMuscles(searchParams.get('muscle')), [searchParams]);
  const [search, setSearch] = useState('');

  const { data } = useServiceQuery({
    key: ['exercises'],
    fn: ({ signal }) => fetchJson<{ exercises: ExerciseWithSource[] }>('/api/exercises', { signal }),
    initialData: { exercises: initial },
  });

  const exercises = data?.exercises ?? initial;
  const customCount = exercises.filter((item) => item.source === 'custom').length;
  const counts = useMemo(() => countByMuscle(exercises), [exercises]);

  // Sunucuya gitmeden adresi günceller; Next yönlendiricisi `useSearchParams`'ı eşitler.
  function setSelected(next: Muscle[]) {
    window.history.replaceState(null, '', next.length > 0 ? `${pathname}?muscle=${next.join(',')}` : pathname);
  }

  function toggle(muscle: Muscle) {
    setSelected(selected.includes(muscle) ? selected.filter((item) => item !== muscle) : [...selected, muscle]);
  }

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr');
    const matched = exercises.filter(
      (item) =>
        (!query || item.title.toLocaleLowerCase('tr').includes(query)) &&
        (selected.length === 0 || selected.some((muscle) => works(item, muscle))),
    );
    if (selected.length === 0) return matched;
    // Seçili kası hedef alanlar önce, yalnız yardımcı olarak çalıştıranlar sonra.
    const isTarget = (item: ExerciseWithSource) => selected.includes(item.targetMuscle);
    return [...matched.filter(isTarget), ...matched.filter((item) => !isTarget(item))];
  }, [exercises, search, selected]);

  const selectedBody = selected.filter(isBodyMuscle);
  const filtering = selected.length > 0 || search.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Egzersizler"
        description={
          <>
            <span className="tabular-nums">{exercises.length}</span> egzersiz · <span className="tabular-nums">{customCount}</span>{' '}
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

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Kas haritası</CardTitle>
            <CardDescription>Kaslara dokunarak süz.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Telefonda harita ekran genişliğinde büyük: parmakla seçilebilsin. */}
            <MuscleMap
              layout="flip"
              selected={selectedBody}
              onToggle={toggle}
              counts={counts}
              hint="Bir kasa dokun"
              bodyClassName="h-[min(34rem,68svh)] lg:h-96"
              label="Kas süzgeci"
            />

            <div className="flex flex-col gap-3">
              <Toggle
                variant="outline"
                size="lg"
                className="justify-start"
                pressed={selected.includes('cardio')}
                onPressedChange={() => toggle('cardio')}
                disabled={counts.cardio === 0}>
                <Heartbeat data-icon="inline-start" />
                Kardiyo
                <span className="ml-auto tabular-nums text-muted-foreground">{counts.cardio}</span>
              </Toggle>

              {selectedBody.length > 0 ? (
                <div className="flex flex-wrap gap-1.5" aria-label="Seçili kaslar">
                  {selectedBody.map((muscle) => (
                    <Button
                      key={muscle}
                      variant="secondary"
                      size="xs"
                      onClick={() => toggle(muscle)}
                      aria-label={`${MUSCLE_LABELS[muscle]} süzgecini kaldır`}>
                      {MUSCLE_LABELS[muscle]}
                      <X data-icon="inline-end" />
                    </Button>
                  ))}
                </div>
              ) : null}

              {selected.length > 0 ? (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setSelected([])}>
                  Seçimi temizle
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
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

          {filtering ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              <span className="tabular-nums">{visible.length}</span> sonuç
            </p>
          ) : null}

          {visible.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MagnifyingGlass />
                </EmptyMedia>
                <EmptyTitle>Uyan egzersiz yok</EmptyTitle>
                <EmptyDescription>Başka bir ad dene ya da kas seçimini değiştir.</EmptyDescription>
              </EmptyHeader>
              {selected.length > 0 ? (
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                    Seçimi temizle
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            // `popLayout`: çıkan kart mutlak konuma alınır; konum listeye göre hesaplansın diye `relative`.
            <ul className="relative grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false} mode="popLayout">
                {visible.map((item) => {
                  const onlySecondary = selected.length > 0 && !selected.includes(item.targetMuscle);
                  return (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}>
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
                            {item.source === 'custom' || onlySecondary ? (
                              <CardAction className="flex gap-1">
                                {onlySecondary ? <Badge variant="outline">yardımcı</Badge> : null}
                                {item.source === 'custom' ? <Badge variant="secondary">senin</Badge> : null}
                              </CardAction>
                            ) : null}
                          </CardHeader>
                        </Card>
                      </Link>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
