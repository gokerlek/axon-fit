'use client';

import { useOptionalSortableItem } from '@/components/sortable/sortable-list';
import { cn } from '@/lib/utils';

/**
 * Hareket kartı kabuğu (SPEC §6): şablon ve program günü düzenleyicisi, danışanın antrenman
 * ekranı. 1. satır [rozet-tutamak][başlık + tek satır bilgi][menü]; sonraki satırlar
 * (`ExerciseCardSection`) tam genişlik.
 *
 * Sıralanan öğenin içindeyse kalkınca halka ve hafif gölge alır. `overflow-hidden` yoktur:
 * kalkan içteki kart ve halkası kesilmez, ekran kenarındaki otomatik kaydırma sayfada kalır.
 */
export function ExerciseCard({
  tone = 'default',
  highlighted = false,
  className,
  ...props
}: React.ComponentProps<'div'> & { tone?: 'default' | 'group'; highlighted?: boolean }) {
  const item = useOptionalSortableItem();
  return (
    <div
      data-slot="exercise-card"
      data-lifted={item?.lifted || undefined}
      className={cn(
        'relative flex min-w-0 scroll-mt-24 flex-col rounded-lg border bg-card text-sm motion-safe:transition-shadow motion-safe:duration-160 data-lifted:shadow-sm data-lifted:ring-2 data-lifted:ring-primary/40',
        // Grubun zemini sürüklerken de opak kalır (altındaki kart görünmesin).
        tone === 'group' && 'rounded-xl border-primary/40 bg-[color-mix(in_oklch,var(--primary)_4%,var(--card))]',
        highlighted && 'ring-2 ring-primary/60',
        className,
      )}
      {...props}
    />
  );
}

/** Kartın 1. satırı: tutamak, başlık (en çok iki satır) ve tek satır bilgi, menü. */
export function ExerciseCardHeader({
  handle,
  title,
  meta,
  action,
  titleClassName,
}: {
  handle: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div data-slot="exercise-card-header" className="flex items-start gap-3 p-3">
      {handle}
      <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center">
        <p data-slot="exercise-card-title" className={cn('line-clamp-2 text-sm leading-5 font-medium break-words', titleClassName)}>
          {title}
        </p>
        {meta ? (
          <p data-slot="exercise-card-meta" className="truncate text-xs leading-4 text-muted-foreground">
            {meta}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex h-9 shrink-0 items-center">{action}</div> : null}
    </div>
  );
}

/** Kartın tam genişlikteki bir bölümü (alanlar, set tablosu, ayrıntılar). */
export function ExerciseCardSection({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="exercise-card-section" className={cn('min-w-0 border-t p-3', className)} {...props} />;
}
