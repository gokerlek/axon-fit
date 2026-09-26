'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle,
  CircleDashed,
  Heartbeat,
  Lightbulb,
  MagnifyingGlass,
  Plus,
  Prohibit,
  Question,
  Warning,
  WarningCircle,
  X,
  YoutubeLogo,
  type Icon,
} from '@phosphor-icons/react';
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
import { TOUCH_TARGETS } from './touch-targets';
import { conditionLabel } from '@/lib/conditions';
import {
  CONTEXT_LABELS,
  DECISION_LABELS,
  FILTER_GROUP_LABELS,
  FILTER_GROUPS,
  inFilterView,
  requiresClearance,
  summarizeFilter,
  type Decision,
  type FilterGroup,
  type FilterView,
} from '@/lib/exercise-filter';
import { countByMuscle, isBodyMuscle, parseMuscles, summarizeMuscles, works } from '@/lib/muscles';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, type Exercise, type Muscle } from '@/lib/schemas/exercise';

type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/** Özet çiplerinin ve kart rozetlerinin ikonları: renk tek başına anlam taşımaz. */
const GROUP_ICONS: Record<FilterGroup, Icon> = {
  blocked: Prohibit,
  warned: Warning,
  clear: CheckCircle,
  untagged: CircleDashed,
  unassessed: Question,
};
const DECISION_ICONS: Record<Decision, Icon> = { block: Prohibit, warn: Warning, cue: Lightbulb };
const UNTAGGED_HINT = 'Bu hareketin medikal etiketi yok; kısıtlara göre kontrol edilemedi.';

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
  notice,
}: {
  initial: ExerciseWithSource[];
  /** Cihaz kimliği → adı: kartta ekipman yerine cihaz yazar. */
  deviceNames: Record<string, string>;
  /** Başlığın altındaki uyarı (ör. okunamayan PT kayıtları); sunucuda hazırlanır. */
  notice?: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = useMemo(() => parseMuscles(searchParams.get('muscle')), [searchParams]);
  const constraints = useMemo(() => parseConstraints(searchParams.get('limit')), [searchParams]);
  const [search, setSearch] = useState('');
  // Kısıt süzgecinin görünümü: hepsi, yasak dışı ya da tek küme (çip, "Yalnız uygunları göster").
  const [view, setView] = useState<FilterView>('all');

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

  // Kısıt seçiliyse her hareket süzgeçten geçer ve tek kümeye girer (yasak, uyarı, uygun, kontrol
  // edilmedi, eksik bilgi); karar, eksik bilgi ve "kontrol edilmedi" kartta rozet, sayılar özet çiplerinde.
  // Yalnız danışan bağlamı (ameliyat haftası…) eksikse özet satırında bir kez söylenir.
  const summary = useMemo(
    () => summarizeFilter(constraints.length === 0 ? [] : exercises, constraints),
    [exercises, constraints],
  );
  const clearance = requiresClearance(constraints);

  const selectedBody = selected.filter(isBodyMuscle);
  // Görünüm yalnız listeyi daraltır; sayım hep tam liste üstünden. Kısıt yoksa süzgeç yok.
  const activeView: FilterView = constraints.length === 0 ? 'all' : view;
  const shown = activeView === 'all' ? visible : visible.filter((item) => inFilterView(summary.groups.get(item.id), activeView));
  const filtering = selected.length > 0 || search.trim().length > 0 || activeView !== 'all';
  const showOnly = (next: FilterView) => (pressed: boolean) => setView(pressed ? next : 'all');

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
          <Button className="touch:min-h-11" nativeButton={false} render={<Link href="/dashboard/exercises/new" />}>
            <Plus data-icon="inline-start" />
            Yeni egzersiz
          </Button>
        }
      />
      {notice}

      <div className={`grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start ${TOUCH_TARGETS}`}>
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
                Danışanın kısıtlarını seç; uygun olmayan hareketler işaretlenir, etiketi olmayanlar “kontrol
                edilmedi” diye görünür. “Eksik bilgi”: hareketin etiketi ya da kısıtın şiddeti gibi bir bilgi
                eksik, bazı kurallar değerlendirilemedi.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="max-w-sm">
                <ConstraintPicker value={constraints} onChange={(next) => setParams({ limit: next })} />
              </div>

              {constraints.length > 0 ? (
                <div className="flex flex-col gap-3 text-sm">
                  {/* Her hareket tek kümede; çipe dokununca liste o kümeye süzülür, yeniden dokununca hepsi. */}
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kısıt özeti: dokununca liste o kümeye süzülür">
                    {FILTER_GROUPS.map((group) => {
                      const GroupIcon = GROUP_ICONS[group];
                      return (
                        <Toggle
                          key={group}
                          variant="outline"
                          size="sm"
                          className={group === 'blocked' ? 'text-destructive' : undefined}
                          pressed={activeView === group}
                          onPressedChange={showOnly(group)}
                          disabled={summary.counts[group] === 0 && activeView !== group}>
                          <GroupIcon data-icon="inline-start" aria-hidden />
                          <span className="tabular-nums">{summary.counts[group]}</span> {FILTER_GROUP_LABELS[group]}
                        </Toggle>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-1 text-muted-foreground" aria-live="polite">
                    {/* Kısıt değişince sayılar duyurulsun (çipler düğme; canlı bölgede değiller). */}
                    <p className="sr-only">
                      {FILTER_GROUPS.map((group) => `${summary.counts[group]} ${FILTER_GROUP_LABELS[group]}`).join(', ')}
                    </p>
                    {summary.warnedUnassessed > 0 ? (
                      <p>
                        Uyarılı <span className="tabular-nums">{summary.warnedUnassessed}</span> harekette bazı kurallar
                        eksik bilgi yüzünden değerlendirilemedi.
                      </p>
                    ) : null}
                    {summary.pending.rules > 0 ? (
                      <p>
                        Danışan bağlamı olmadan <span className="tabular-nums">{summary.pending.rules}</span> kural
                        değerlendirilemedi (eksik: {summary.pending.needs.map((need) => CONTEXT_LABELS[need]).join(', ')});
                        “uygun” sayılanlar bu kurallara göre kontrol edilmedi.
                      </p>
                    ) : null}
                  </div>
                  {clearance.length > 0 ? (
                    <p className="flex items-start gap-1.5 text-destructive">
                      <WarningCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span>
                        Kırmızı bayrak: {clearance.map((condition) => conditionLabel(condition)).join(', ')} için program
                        yazmadan önce tıbbi izin gerekir.
                      </span>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={activeView === 'notBlocked'}
                      onPressedChange={showOnly('notBlocked')}
                      disabled={summary.counts.blocked === 0 && activeView !== 'notBlocked'}>
                      Yasakları gizle
                    </Toggle>
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={activeView === 'clear'}
                      onPressedChange={showOnly('clear')}
                      disabled={summary.counts.clear === 0 && activeView !== 'clear'}>
                      Yalnız uygunları göster
                    </Toggle>
                  </div>
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
                <EmptyDescription>
                  {activeView === 'all'
                    ? 'Başka bir ad dene ya da kas seçimini değiştir.'
                    : 'Bu kısıt kümesinde, aramaya ve kas seçimine uyan hareket yok.'}
                </EmptyDescription>
              </EmptyHeader>
              {selected.length > 0 || activeView !== 'all' ? (
                <EmptyContent className="flex-row flex-wrap justify-center">
                  {activeView !== 'all' ? (
                    <Button variant="outline" size="sm" onClick={() => setView('all')}>
                      Bütün hareketleri göster
                    </Button>
                  ) : null}
                  {selected.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                      Seçimi temizle
                    </Button>
                  ) : null}
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            // `popLayout`: çıkan kart mutlak konuma alınır; konum listeye göre hesaplansın diye `relative`.
            <ul className="relative grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((item) => {
                  const verdict = summary.cards.get(item.id);
                  const unassessed = verdict?.unassessed ?? 0;
                  const unchecked = summary.groups.get(item.id) === 'untagged';
                  const DecisionIcon = verdict?.decision ? DECISION_ICONS[verdict.decision] : null;
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
                        title={verdict?.message ?? (unchecked ? UNTAGGED_HINT : undefined)}
                        className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                        <Card
                          size="sm"
                          className={`h-full transition-colors hover:bg-muted/40 ${
                            verdict?.decision === 'block' ? 'border-destructive/50 bg-destructive/5' : ''
                          }`}>
                          <CardHeader>
                            <CardTitle className="truncate">{item.title}</CardTitle>
                            {/* `min-w-0`: uzun kas/ekipman satırı kısalır, rozetler kartın dışına taşmaz. */}
                            <CardDescription className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">
                                {summarizeMuscles(item.primaryMuscles).join(', ')} ·{' '}
                                {(item.deviceId && deviceNames[item.deviceId]) || EQUIPMENT_LABELS[item.equipment]}
                              </span>
                              {item.video ? <YoutubeLogo className="size-4 shrink-0" aria-label="videolu" /> : null}
                            </CardDescription>
                            {item.source === 'custom' || onlySecondary || verdict || unchecked ? (
                              // Rozetler en çok 9 rem: dar kartta alt satıra geçer, başlığa en az ~120 px kalır.
                              <CardAction className="flex max-w-36 flex-wrap justify-end gap-1">
                                {verdict?.decision && DecisionIcon ? (
                                  <Badge variant={verdict.decision === 'block' ? 'destructive' : 'outline'}>
                                    <DecisionIcon data-icon="inline-start" aria-hidden />
                                    {DECISION_LABELS[verdict.decision].toLocaleLowerCase('tr')}
                                  </Badge>
                                ) : null}
                                {unassessed > 0 ? (
                                  <Badge
                                    variant="outline"
                                    title={`${unassessed} kural değerlendirilemedi: hareketin etiketi ya da kısıtın bir bilgisi (şiddet, greft tipi…) eksik.`}>
                                    <Question data-icon="inline-start" aria-hidden />
                                    <span aria-hidden>eksik bilgi</span>
                                    <span className="sr-only">{unassessed} kural değerlendirilemedi</span>
                                  </Badge>
                                ) : null}
                                {unchecked ? (
                                  <Badge variant="outline" className="text-muted-foreground" title={UNTAGGED_HINT}>
                                    <CircleDashed data-icon="inline-start" aria-hidden />
                                    kontrol edilmedi
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
