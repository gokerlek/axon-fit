'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Heartbeat, MagnifyingGlass, Plus, X, YoutubeLogo } from '@phosphor-icons/react';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { PageHeader } from '@/components/page-header';
import { TrainingTabs } from '../training-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { ConstraintPicker, formatConstraints, parseConstraints } from './constraint-picker';
import { conditionInfo } from '@/lib/conditions';
import { DECISION_LABELS, evaluateExercise, type Decision } from '@/lib/exercise-filter';
import { countByMuscle, isBodyMuscle, parseMuscles, summarizeMuscles, works } from '@/lib/muscles';
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
export function ExerciseList({
  initial,
  deviceNames,
}: {
  initial: ExerciseWithSource[];
  /** Cihaz kimliği → adı: kartta ekipman yerine cihaz yazar. */
  deviceNames: Record<string, string>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = useMemo(() => parseMuscles(searchParams.get('muscle')), [searchParams]);
  const constraints = useMemo(() => parseConstraints(searchParams.get('limit')), [searchParams]);
  const [search, setSearch] = useState('');
  const [hideBlocked, setHideBlocked] = useState(false);

  const { data } = useServiceQuery({
    key: ['exercises'],
    fn: ({ signal }) => fetchJson<{ exercises: ExerciseWithSource[] }>('/api/exercises', { signal }),
    initialData: { exercises: initial },
  });

  const exercises = data?.exercises ?? initial;
  const customCount = exercises.filter((item) => item.source === 'custom').length;
  const counts = useMemo(() => countByMuscle(exercises), [exercises]);

  // Sunucuya gitmeden adresi günceller; Next yönlendiricisi `useSearchParams`'ı eşitler.
  function setParams(next: { muscle?: Muscle[]; limit?: ReturnType<typeof parseConstraints> }) {
    const params = new URLSearchParams();
    const muscles = next.muscle ?? selected;
    const limits = next.limit ?? constraints;
    if (muscles.length > 0) params.set('muscle', muscles.join(','));
    if (limits.length > 0) params.set('limit', formatConstraints(limits));
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }

  const setSelected = (next: Muscle[]) => setParams({ muscle: next });

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
    const isTarget = (item: ExerciseWithSource) => selected.some((muscle) => item.primaryMuscles.includes(muscle));
    return [...matched.filter(isTarget), ...matched.filter((item) => !isTarget(item))];
  }, [exercises, search, selected]);

  // Kısıt seçiliyse her hareket süzgeçten geçer; sonuç kartta rozet olur.
  const decisions = useMemo(() => {
    if (constraints.length === 0) return new Map<string, { decision: Decision; message: string }>();
    const map = new Map<string, { decision: Decision; message: string }>();
    for (const item of exercises) {
      const result = evaluateExercise(item, constraints);
      const first = result.findings[0];
      if (result.decision && first) map.set(item.id, { decision: result.decision, message: first.message });
    }
    return map;
  }, [exercises, constraints]);

  const blockedCount = [...decisions.values()].filter((item) => item.decision === 'block').length;
  const untaggedCount = useMemo(
    () => (constraints.length === 0 ? 0 : exercises.filter((item) => evaluateExercise(item, constraints).untagged).length),
    [exercises, constraints],
  );

  const selectedBody = selected.filter(isBodyMuscle);
  // "Yasakları gizle" yalnız görünümü daraltır; sayım hep tam liste üstünden.
  const shown = hideBlocked ? visible.filter((item) => decisions.get(item.id)?.decision !== 'block') : visible;
  const filtering = selected.length > 0 || search.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <TrainingTabs />
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
          <Card>
            <CardHeader>
              <CardTitle>Kısıtlar</CardTitle>
              <CardDescription>
                Danışanın sakatlığını seç; uygun olmayan hareketler işaretlenir. Etiketlenmemiş hareket
                değerlendirilemez, listede sessizce kalır.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="max-w-sm">
                <ConstraintPicker value={constraints} onChange={(next) => setParams({ limit: next })} />
              </div>

              {constraints.length > 0 ? (
                <div className="flex flex-col gap-2 text-sm">
                  <p className="text-muted-foreground" aria-live="polite">
                    <span className="tabular-nums text-destructive">{blockedCount}</span> hareket yasak ·{' '}
                    <span className="tabular-nums">{decisions.size - blockedCount}</span> uyarı ·{' '}
                    <span className="tabular-nums">{untaggedCount}</span> etiketsiz
                  </p>
                  {constraints.some((item) => conditionInfo(item.id).redFlag) ? (
                    <p className="text-destructive">
                      Kırmızı bayrak: bu kısıtta program yazmadan önce tıbbi izin gerekir.
                    </p>
                  ) : null}
                  <Toggle
                    variant="outline"
                    size="sm"
                    className="self-start"
                    pressed={hideBlocked}
                    onPressedChange={setHideBlocked}
                    disabled={blockedCount === 0}>
                    Yasakları gizle
                  </Toggle>
                </div>
              ) : null}
            </CardContent>
          </Card>

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
              <span className="tabular-nums">{shown.length}</span> sonuç
            </p>
          ) : null}

          {shown.length === 0 ? (
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
                {shown.map((item) => {
                  const verdict = decisions.get(item.id);
                  const onlySecondary =
                    selected.length > 0 && !selected.some((muscle) => item.primaryMuscles.includes(muscle));
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
                        title={verdict?.message}
                        className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                        <Card
                          size="sm"
                          className={`h-full transition-colors hover:bg-muted/40 ${
                            verdict?.decision === 'block' ? 'border-destructive/50 bg-destructive/5' : ''
                          }`}>
                          <CardHeader>
                            <CardTitle className="truncate">{item.title}</CardTitle>
                            <CardDescription className="flex items-center gap-1.5">
                              <span className="truncate">
                                {summarizeMuscles(item.primaryMuscles).join(', ')} ·{' '}
                                {(item.deviceId && deviceNames[item.deviceId]) || EQUIPMENT_LABELS[item.equipment]}
                              </span>
                              {item.video ? <YoutubeLogo className="size-4 shrink-0" aria-label="videolu" /> : null}
                            </CardDescription>
                            {item.source === 'custom' || onlySecondary || verdict ? (
                              <CardAction className="flex gap-1">
                                {verdict ? (
                                  <Badge variant={verdict.decision === 'block' ? 'destructive' : 'outline'}>
                                    {DECISION_LABELS[verdict.decision].toLocaleLowerCase('tr')}
                                  </Badge>
                                ) : null}
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
