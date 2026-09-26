'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowDown, ArrowUp, CaretLeft, CaretRight, Equals, Sparkle, Trophy } from '@phosphor-icons/react';
import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { formatNumber } from '@/lib/format';
import { DURATION, EASE, tween, WORKOUT } from '@/lib/motion';
import type { Trend } from '@/lib/session-records';
import { cn } from '@/lib/utils';
import { CHANGE_LABELS, type SessionSummary } from '@/lib/workout-summary';
import { vibrate } from '../../workout-feedback';

const CARDS = ['Antrenman tamamlandı', 'Rekorlar ve gelişim', 'Çalışan kaslar', 'Hareketler'] as const;

/**
 * Sayı 0'dan değerine sayarak gelir (`WORKOUT.countUpMs`); hareket azaltmada son değerle başlar. Sunucu
 * çiziminde de son değer yazılır: sayfa sayı olmadan görünmez. Ekran okuyucu yalnız son değeri okur.
 */
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const count = useMotionValue(value);
  const text = useTransform(count, (current) => formatNumber(current === value ? value : Math.round(current)));
  useLayoutEffect(() => {
    if (reduced) return;
    count.set(0);
    const controls = animate(count, value, { duration: WORKOUT.countUpMs / 1000, ease: EASE.enter });
    return () => controls.stop();
  }, [count, value, reduced]);
  return (
    <>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="sr-only">{formatNumber(value)}</span>
    </>
  );
}

function Tile({ value, unit, label }: { value: number; unit?: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
      <span className="font-heading text-[1.875rem] leading-tight font-semibold whitespace-nowrap tabular-nums">
        <CountUp value={value} />
        {unit ? <span className="ml-1 text-[0.9375rem] font-medium text-muted-foreground">{unit}</span> : null}
      </span>
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-muted-foreground">{children}</p>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>;
}

const TRENDS: Record<Trend, { icon: React.ReactNode; label: string; className: string }> = {
  up: { icon: <ArrowUp weight="bold" />, label: 'arttı', className: 'bg-primary/15 text-primary-text' },
  down: { icon: <ArrowDown weight="bold" />, label: 'azaldı', className: 'bg-destructive/15 text-destructive-text' },
  same: { icon: <Equals weight="bold" />, label: 'aynı', className: 'bg-muted text-muted-foreground' },
  first: { icon: <Sparkle weight="fill" />, label: 'ilk kez', className: 'bg-muted text-muted-foreground' },
};

/** Liste satırı: ad solda (kırpılır), değer sağda. */
function Line({ lead, name, value, muted }: { lead?: React.ReactNode; name: string; value: string; muted?: boolean }) {
  return (
    <li className="flex min-h-10 items-center gap-2.5 border-t py-1.5 text-sm first:border-t-0">
      {lead}
      <span className={cn('min-w-0 flex-1 truncate', muted && 'text-muted-foreground')}>{name}</span>
      <span className="shrink-0 text-right text-muted-foreground tabular-nums">{value}</span>
    </li>
  );
}

/**
 * Özet karuseli (tasarım §2.8, rev. 2): 4 kart, kaydırılabilir (shadcn `Carousel`, Embla; açık soru 8),
 * kendiliğinden ilerlemez. Üstte "2/4" sayacı, altta küçük noktalar (dokunulmaz). Birincil düğme 1–3. kartta
 * "Sonraki ›" (tek elle ilerler; rekorlar görülmeden çıkılmaz), altında "Bugün'e dön"; son kartta birincil
 * düğme "Bugün'e dön". Geçmişten açıldıysa ("Özeti aç") dönüş geçmiş detayına. Tam ekran, dock yok.
 *
 * Erişilebilirlik: `role="region"` + `aria-roledescription="carousel"`, kartlar "2 / 4, Rekorlar ve gelişim";
 * ←/→ tuşları; görünmeyen kartlar ekran okuyucudan gizli. Hareket azaltmada geçiş anında, sayılar son değerle.
 */
export function SummaryCarousel({ summary, firstName, from }: { summary: SessionSummary; firstName: string; from: 'finish' | 'history' }) {
  const reduced = useReducedMotion() ?? false;
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const footer = useRef<HTMLDivElement>(null);
  const home = from === 'history' ? { href: `/me/gecmis/${summary.id}`, label: 'Geçmişe dön' } : { href: '/me', label: "Bugün'e dön" };
  const last = index === CARDS.length - 1;

  // "Sonraki ›" son kartta "Bugün'e dön"e döner: emin olmak için ikinci kez basmak sayfadan çıkarmasın.
  const guardUntil = useRef(0);
  const swallow = (event: React.MouseEvent) => {
    if (performance.now() < guardUntil.current) event.preventDefault();
  };

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setIndex(api.selectedScrollSnap());
      guardUntil.current = performance.now() + WORKOUT.tapGuardMs;
    };
    onSelect();
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  // Rekor rozeti (bitişten hemen sonra): Android'de kısa titreşim; iOS'ta yok, rozet görünür.
  useEffect(() => {
    if (from === 'finish' && summary.prs > 0 && !reduced) vibrate([20, 40, 20]);
  }, [from, summary.prs, reduced]);

  // Bildirimler alttaki düğmelerin üstünde çıksın (telefonda bildirimler altta, `ui/sonner.tsx`).
  useEffect(() => {
    const element = footer.current;
    if (!element) return;
    const style = document.documentElement.style;
    const observer = new ResizeObserver(() => style.setProperty('--dock-clearance', `${element.offsetHeight + 8}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      style.removeProperty('--dock-clearance');
    };
  }, []);

  const cards: React.ReactNode[] = [
    <FirstCard key="first" summary={summary} firstName={firstName} celebrate={from === 'finish'} />,
    <RecordsCard key="records" summary={summary} />,
    <MusclesCard key="muscles" summary={summary} />,
    <ExercisesCard key="exercises" summary={summary} />,
  ];
  // Kartın okunan adı görünen başlıkla aynı: yarım bırakılan antrenmanın ilk kartı "kaydedildi" der.
  const titles = CARDS.map((card, position) => (position === 0 && summary.unfinished ? 'Antrenman kaydedildi' : card));

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background">
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center gap-1 pr-4 pl-1">
          {from === 'history' ? (
            <Button variant="ghost" size="icon" className="size-11" nativeButton={false} render={<Link href={home.href} aria-label="Geçmiş detayına dön" />}>
              <CaretLeft weight="bold" className="size-5" />
            </Button>
          ) : (
            <span className="w-3" />
          )}
          <h1 className="flex-1 font-heading text-[1.0625rem] font-semibold">Özet</h1>
          <span className="text-sm text-muted-foreground tabular-nums" aria-hidden>
            {index + 1}/{CARDS.length}
          </span>
        </div>
      </header>

      <Carousel
        setApi={setApi}
        opts={{ align: 'start', duration: 22 }}
        aria-label="Antrenman özeti"
        tabIndex={0}
        className="min-h-0 flex-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>[data-slot=carousel-content]]:h-full">
        <CarouselContent className="h-full">
          {cards.map((card, position) => (
            <CarouselItem key={CARDS[position]} className="h-full" aria-label={`${position + 1} / ${CARDS.length}, ${titles[position]}`} aria-hidden={position !== index}>
              <div className="flex h-full flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-1 pb-4">{card}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <div ref={footer} className="flex shrink-0 flex-col items-stretch gap-1 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex h-4 items-center justify-center gap-1.5" aria-hidden>
          {CARDS.map((card, position) => (
            <span
              key={card}
              className={cn('h-1.5 rounded-full transition-[width,background-color] duration-220', position === index ? 'w-4.5 bg-primary-text' : 'w-1.5 bg-muted')}
            />
          ))}
        </div>
        {last ? (
          <Button size="lg" className="h-14 w-full text-base" nativeButton={false} render={<Link href={home.href} onClick={swallow} />}>
            {home.label}
          </Button>
        ) : (
          <Button size="lg" className="h-14 w-full text-base" onClick={() => api?.scrollNext(reduced)}>
            Sonraki
            <CaretRight data-icon="inline-end" weight="bold" />
          </Button>
        )}
        <Button variant="ghost" className={cn('h-11 self-center text-muted-foreground', last && 'invisible')} nativeButton={false} render={<Link href={home.href} tabIndex={last ? -1 : undefined} />}>
          {home.label}
        </Button>
      </div>
    </div>
  );
}

function FirstCard({ summary, firstName, celebrate }: { summary: SessionSummary; firstName: string; celebrate: boolean }) {
  return (
    <>
      <Eyebrow>{summary.unfinished ? 'Antrenman kaydedildi' : 'Antrenman tamamlandı'}</Eyebrow>
      <h2 className="-mt-2 font-heading text-2xl leading-tight font-semibold">Harika iş, {firstName}!</h2>
      <p className="-mt-1 text-sm text-muted-foreground tabular-nums">
        {summary.dayName} · {summary.when}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <Tile value={summary.minutes} unit="dk" label="süre" />
        <Tile value={summary.volumeKg} unit="kg" label="toplam ağırlık" />
        <Tile value={summary.sets} label="set" />
        <Tile value={summary.muscles} label="kas çalıştı" />
      </div>
      {summary.prs > 0 || summary.versusLast ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {summary.prs > 0 ? (
            <motion.span
              initial={celebrate ? { scale: 0.8, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...tween(DURATION.fast), delay: 0.4 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1.5 font-semibold text-primary-text">
              <Trophy weight="fill" className="size-4" aria-hidden />
              {formatNumber(summary.prs)} rekor
            </motion.span>
          ) : null}
          {summary.versusLast ? <span className="text-muted-foreground tabular-nums">{summary.versusLast}</span> : null}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground tabular-nums">{summary.footer}</p>
    </>
  );
}

function RecordsCard({ summary }: { summary: SessionSummary }) {
  return (
    <>
      <Eyebrow>Rekorlar ve gelişim</Eyebrow>
      {summary.records.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {summary.records.map((record, position) => (
            <li key={`${record.title}-${position}`} className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
                <Trophy weight="fill" className="size-5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{record.title}</span>
                <span className="font-heading text-base font-semibold tabular-nums">{record.value}</span>
                <span className="text-[0.8125rem] text-muted-foreground tabular-nums">{record.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Bu antrenmanda rekor yok. Aynı yükte düzenli kalmak da ilerlemedir.</p>
      )}
      {summary.compare.length > 0 ? (
        <section className="flex flex-col">
          <SectionTitle>Geçen sefere göre</SectionTitle>
          <ul>
            {summary.compare.map((item, position) => (
              <Line
                key={`${item.title}-${position}`}
                lead={
                  <span role="img" aria-label={TRENDS[item.trend].label} className={cn('grid size-6 shrink-0 place-items-center rounded-md [&_svg]:size-3.5', TRENDS[item.trend].className)}>
                    {TRENDS[item.trend].icon}
                  </span>
                }
                name={item.title}
                value={item.text}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {summary.next ? (
        <section className="flex flex-col">
          <SectionTitle>Gelecek sefer</SectionTitle>
          <ul>
            {summary.next.map((item, position) => (
              <Line key={`${item.title}-${position}`} name={item.title} value={item.text} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/**
 * Çalışan kaslar (tasarım §2.8): sayı, harita ve liste tek tanımdan (`summary.worked`): hedef ya da yardımcı
 * olarak çalışan kaslar, aileler tek ad; yalnız dengeleyici olan kas ne sayılır ne listelenir ne boyanır.
 */
function MusclesCard({ summary }: { summary: SessionSummary }) {
  return (
    <>
      <Eyebrow>Çalışan kaslar</Eyebrow>
      <h2 className="-mt-2 font-heading text-2xl font-semibold tabular-nums">{formatNumber(summary.muscles)} kas çalıştı</h2>
      {summary.topMuscle ? <p className="-mt-1 text-sm text-muted-foreground">En çok: {summary.topMuscle.toLocaleLowerCase('tr-TR')}</p> : null}
      {summary.worked.length > 0 ? (
        <TemplateMuscleMap
          load={summary.load}
          legend={summary.worked.map((item) => ({ label: item.label, value: item.sets }))}
          legendLimit={5}
          label="Bu antrenmanın kas yükü"
          bodyClassName="h-60"
        />
      ) : (
        <p className="text-sm text-muted-foreground">Bu antrenmanda sayılan kas yükü yok.</p>
      )}
      <p className="text-[0.8125rem] text-muted-foreground">
        Sayılar kesirli set: hedef kas 1, yardımcı kas 0,5, dengeleyici 0,25. Yalnız dengeleyici olarak çalışan kas sayılmaz.
      </p>
    </>
  );
}

function ExercisesCard({ summary }: { summary: SessionSummary }) {
  return (
    <>
      <Eyebrow>Hareketler</Eyebrow>
      <h2 className="-mt-2 font-heading text-2xl font-semibold tabular-nums">{summary.totals}</h2>
      <ul>
        {summary.exercises.map((line, position) => (
          <Line key={`${line.title}-${position}`} name={line.title} value={line.text} muted={line.state === 'skipped' || line.state === 'missed'} />
        ))}
      </ul>
      {summary.changes.length > 0 ? (
        <section className="flex flex-col">
          <SectionTitle>Program</SectionTitle>
          <ul>
            {summary.changes.map((change, position) => (
              <li key={`${change.text}-${position}`} className="flex flex-col gap-0.5 border-t py-2 text-sm first:border-t-0">
                <span>{change.text}</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {CHANGE_LABELS[change.state]}
                  {change.note ? ` · “${change.note}”` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
