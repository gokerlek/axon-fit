'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Hareket kartı kabuğu (SPEC §6): şablon ve program günü düzenleyicisi, danışanın antrenman
 * ekranı. Yukarıdan aşağı: tutamak şeridi (üst ortada tek yatay çizgi), yüz (gerilmiş
 * düğme: [rozet][başlık + meta][⧉]), açıkken gövde bölümleri.
 *
 * `overflow-hidden` yoktur: tutamağın dokunma alanı kartın 16 px üstüne taşar, halkalar
 * kesilmez. Sürüklenen kartın yerinde kesik çizgili bir yer tutucu kalır (`data-dragging`:
 * içerik gizlenir, yükseklik aynı kalır; liste zıplamaz).
 */
export function ExerciseCard({
  tone = 'default',
  highlighted = false,
  className,
  ...props
}: React.ComponentProps<'div'> & { tone?: 'default' | 'group'; highlighted?: boolean }) {
  return (
    <div
      data-slot={tone === 'group' ? 'exercise-group' : 'exercise-card'}
      data-highlighted={highlighted || undefined}
      className={cn(
        'relative flex min-w-0 scroll-mt-24 scroll-mb-32 flex-col rounded-lg border bg-card text-sm motion-safe:transition-[box-shadow,background-color] motion-safe:duration-300',
        // Grubun zemini opak kalır (sürüklenen overlay'in altında kart görünmesin).
        tone === 'group' && 'rounded-xl border-primary/40 bg-[color-mix(in_oklch,var(--primary)_4%,var(--card))]',
        'data-highlighted:ring-2 data-highlighted:ring-primary/60',
        PLACEHOLDER,
        ARMED,
        className,
      )}
      {...props}
    />
  );
}

/** Sürüklenen öğenin yerinde kalan yer tutucu: kesik çizgi, içerik görünmez (yükseklik aynı). */
export const PLACEHOLDER =
  'data-dragging:border-dashed data-dragging:border-muted-foreground/40 data-dragging:bg-transparent data-dragging:shadow-none data-dragging:ring-0 data-dragging:*:invisible';

/** Üstüne bırakma devrede: hedefte halka ve hafif zemin. */
export const ARMED = 'data-armed:ring-2 data-armed:ring-primary data-armed:bg-primary/8';

/** Kartın tam genişlikteki bir bölümü (açık gövde: alanlar, setler, ayrıntılar, alt satır). */
export function ExerciseCardSection({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="exercise-card-section" className={cn('min-w-0 border-t px-3 py-3', className)} {...props} />;
}

/** Sıra rozeti (28 px): yalnız etiket; sürükleme çizgiden başlar. */
export function CardBadge({ tone = 'default', className, children }: { tone?: 'default' | 'group'; className?: string; children: React.ReactNode }) {
  return (
    <span
      data-slot="card-badge"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
        tone === 'group' ? 'bg-primary/15 text-foreground inset-ring-1 inset-ring-primary/50' : 'bg-muted text-foreground',
        className,
      )}>
      {children}
    </span>
  );
}

type GrabberProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  tone?: 'default' | 'group';
  /** Sürükleme sürüyor: çizgi ana renkte. */
  dragging?: boolean;
  /** Seçim modunda çizgi söner (şerit yerinde kalır, kart zıplamaz). */
  inactive?: boolean;
};

/**
 * Tutamak: kartın üst ortasında tek yatay çizgi (bottom-sheet tutamağı gibi). Görsel 32×4,
 * 20 px'lik şeridin ortasında; dokunma alanı 64×44: kartın 16 px üstü, şerit ve yüzün üst
 * boşluğundan 8 px (başlık ve meta metninin üstüne binmez).
 *
 * `touch-action: none`: çizgiye basıp kaydırmak sayfayı kaydırmaz, sürükleme 4 px'te başlar
 * (basılı tutma yok). Klavyede odaklanmaz ve ekran okuyucuya kapalıdır (yol yüzde: Alt + ok).
 * Kalem sayfayı kaydırabildiği için kalem basılıyken `touchmove` engellenir.
 */
export function CardGrabber({ tone = 'default', dragging = false, inactive = false, className, ref, onPointerDown, ...props }: GrabberProps) {
  const own = useRef<HTMLDivElement | null>(null);
  const penDown = useRef(false);

  // Pasif olmayan dinleyici: dokunuştan önce bağlanmalı (iOS ancak öyle iptal edilebilir sayar).
  useEffect(() => {
    const element = own.current;
    if (!element) return;
    const block = (event: TouchEvent) => {
      if (penDown.current && event.cancelable) event.preventDefault();
    };
    element.addEventListener('touchmove', block, { passive: false });
    return () => element.removeEventListener('touchmove', block);
  }, []);

  return (
    <div data-slot="card-grabber" className="relative h-5 shrink-0" aria-hidden>
      <div
        ref={(element) => {
          own.current = element;
          if (typeof ref === 'function') return ref(element);
          if (ref) ref.current = element;
        }}
        tabIndex={-1}
        title={inactive ? undefined : 'Sürükleyerek taşı'}
        data-dragging={dragging || undefined}
        data-inactive={inactive || undefined}
        className={cn(
          'group/grab absolute -top-4 left-1/2 z-10 h-11 w-16 -translate-x-1/2 cursor-grab touch-none outline-none select-none [-webkit-touch-callout:none] data-dragging:cursor-grabbing data-inactive:pointer-events-none',
          className,
        )}
        onPointerDown={(event) => {
          if (event.pointerType === 'pen') {
            penDown.current = true;
            const end = () => {
              window.removeEventListener('pointerup', end, true);
              window.removeEventListener('pointercancel', end, true);
              penDown.current = false;
            };
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
          }
          onPointerDown?.(event);
        }}
        onContextMenu={(event) => event.preventDefault()}
        {...props}>
        <span
          className={cn(
            'absolute top-6 left-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:transition-colors motion-safe:duration-100',
            tone === 'group'
              ? 'bg-primary/50 group-hover/grab:bg-primary/70 group-active/grab:bg-primary/80'
              : 'bg-muted-foreground/40 group-hover/grab:bg-muted-foreground/70 group-active/grab:bg-muted-foreground/80',
            'group-data-dragging/grab:bg-primary group-data-inactive/grab:bg-muted-foreground/15',
          )}
        />
      </div>
    </div>
  );
}

type FaceProps = {
  /** Yüz düğmesinin DOM kimliği (odak buraya döner). */
  id?: string;
  badge: React.ReactNode;
  title: React.ReactNode;
  titleClassName?: string;
  meta?: React.ReactNode;
  /** Yüz düğmesinin erişilebilir adı ("Plank, ayrıntıları aç/kapat"); meta açıklama olarak okunur. */
  label?: string;
  expanded?: boolean;
  /** Açık gövdenin kimliği. */
  controls?: string;
  onToggle?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  /** Yüzdeki klavye kısayolları (`aria-keyshortcuts`). */
  keyShortcuts?: string;
  /** Yüzün üstündeki kardeş düğme (⧉ Kopyala ya da 🗑 Sil), 44×44. */
  action?: React.ReactNode;
  /** ⧉'nin yerine geçen durum (sürüklerken sonuç hapı). */
  status?: React.ReactNode;
  /** Yüzün hemen arkasında (klavyeyle odaklanınca görünen sr-only şerit). */
  after?: React.ReactNode;
  /** Etkileşimsiz kopya (sürüklenen overlay). */
  static?: boolean;
  invalid?: boolean;
  className?: string;
};

/**
 * Kartın yüzü: tamamı gerilmiş bir `<button aria-expanded aria-controls>` (dokununca
 * açılır/kapanır). Açma oku yok (PT kararı 9): açık kartın yüzü koyulaşır, rozeti ana renge
 * döner ve altında gövde durur. ⧉ en sağda, bu düğmenin üstünde duran kardeş bir düğmedir
 * (düğme düğme içinde olmaz); yerini yüz düğmesinde boş bir sütun tutar. Rozet yalnız etiket.
 */
export function CardFace({
  id,
  badge,
  title,
  titleClassName,
  meta,
  label,
  expanded = false,
  controls,
  onToggle,
  onKeyDown,
  keyShortcuts,
  action,
  status,
  after,
  static: isStatic = false,
  invalid = false,
  className,
}: FaceProps) {
  const metaId = useId();
  const content = (
    <>
      {badge}
      <span className="flex min-h-9 min-w-0 flex-1 flex-col justify-center">
        <span data-slot="card-title" className={cn('line-clamp-2 text-sm leading-5 font-medium break-words', titleClassName)}>
          {title}
        </span>
        {meta ? (
          <span id={metaId} data-slot="card-meta" className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </span>
      {/* ⧉'nin yeri (kardeş düğme üstünde durur). */}
      {action ? <span className="-mr-2 w-11 shrink-0" aria-hidden /> : null}
    </>
  );
  const shared = cn(
    'group/face flex w-full min-w-0 items-center gap-3 rounded-[inherit] px-3 pt-2 pb-3 text-left select-none [-webkit-touch-callout:none]',
    invalid && '[&_[data-slot=card-title]]:text-destructive',
  );

  return (
    <div data-slot="card-face" className={cn('group/card', className)}>
      {/* ⧉ ve hap yüz düğmesine göre ortalanır (sr-only şerit açılınca kaymasın). */}
      <div className="relative">
        {isStatic ? (
          <div className={shared}>{content}</div>
        ) : (
          <button
            type="button"
            id={id}
            aria-expanded={expanded}
            aria-controls={controls}
            aria-label={label}
            aria-describedby={label && meta ? metaId : undefined}
            onClick={onToggle}
            onKeyDown={onKeyDown}
            aria-keyshortcuts={keyShortcuts}
            className={cn(
              shared,
              'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset hover:bg-muted/40 aria-expanded:bg-muted/50 motion-safe:transition-colors motion-safe:duration-100',
              // Açık kart: rozet ana renge döner (ok yok, durum buradan okunur).
              'aria-expanded:[&_[data-slot=card-badge]]:bg-primary aria-expanded:[&_[data-slot=card-badge]]:text-primary-foreground',
            )}>
            {content}
          </button>
        )}
        {action ? (
          <div className="absolute top-1/2 right-1 z-10 -translate-y-1/2 group-has-[[data-slot=drop-pill]]/card:invisible">{action}</div>
        ) : null}
        {status}
      </div>
      {after}
    </div>
  );
}
