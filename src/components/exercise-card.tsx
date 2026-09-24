'use client';

import { useEffect, useId, useRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * Hareket kartı kabuğu (SPEC §6): şablon ve program günü düzenleyicisi, danışanın antrenman
 * ekranı. Yukarıdan aşağı: yüz (gerilmiş düğme: [rozet][başlık + meta][⧉]; üst ortasında
 * `absolute` tutamak çizgisi, yer kaplamaz), açıkken gövde bölümleri.
 *
 * `overflow-hidden` yoktur: tutamağın dokunma alanı kartın 12 px üstüne taşar, halkalar
 * kesilmez. Sürüklenen kartın yerinde kesik çizgili bir yer tutucu kalır (`data-dragging`:
 * içerik gizlenir, yükseklik aynı kalır; liste zıplamaz). Kaydırırken yüz (çizgisiyle) kayar;
 * kayan yüzün zemini `--face-bg`'dir (kartın zemini; grubun üyeleri grubunkini miras alır).
 * Seçim modunda seçili kartta halka ve hafif zemin (`selected`).
 */
export function ExerciseCard({
  tone = 'default',
  highlighted = false,
  selected,
  className,
  ...props
}: React.ComponentProps<'div'> & { tone?: 'default' | 'group'; highlighted?: boolean; selected?: boolean }) {
  return (
    <div
      data-slot={tone === 'group' ? 'exercise-group' : 'exercise-card'}
      data-highlighted={highlighted || undefined}
      data-selected={selected || undefined}
      className={cn(
        // Vurgulanan ya da odaklanan kart alt çubuğun altında kalmaz (`--editor-bar-clearance`).
        'relative flex min-w-0 scroll-mt-24 scroll-mb-(--editor-bar-clearance) flex-col rounded-lg border bg-card [--face-bg:var(--card)] text-sm motion-safe:transition-[box-shadow,background-color] motion-safe:duration-300',
        // Grubun zemini opak kalır (sürüklenen overlay'in altında kart görünmesin). Karışım oklab: kartın
        // renksiz tonuyla oklch ton açısı karışıp pembeye kaymasın.
        tone === 'group' &&
          'rounded-xl border-primary/40 bg-[color-mix(in_oklab,var(--primary)_4%,var(--card))] [--face-bg:color-mix(in_oklab,var(--primary)_4%,var(--card))]',
        'data-highlighted:ring-2 data-highlighted:ring-primary/60',
        SELECTED,
        PLACEHOLDER,
        ARMED,
        className,
      )}
      {...props}
    />
  );
}

/** Seçim modunda seçili kart: halka ve hafif ana renk zemini. */
export const SELECTED = 'data-selected:ring-2 data-selected:ring-primary data-selected:bg-[color-mix(in_oklab,var(--primary)_6%,var(--card))]';

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
  /** Seçim modunda çizgi söner ve dokunuşu alttaki yüze bırakır. */
  inactive?: boolean;
  /** Kıpırdamadan dokunmak (sürükleme değil): yüze dokunmakla aynı iş (kartı açar/kapatır). */
  onTap?: () => void;
};

/** Bu kadar kayan basış dokunma sayılmaz (sürükleme 4 px'te başlar). */
const TAP_SLOP = 4;

/**
 * Tutamak: kartın üst ortasında tek yatay çizgi (bottom-sheet tutamağı gibi). Ayrı bir şerit
 * değil: yüzün içinde `absolute` durur (yer kaplamaz, yüzle birlikte kayar). Görsel 32×4,
 * kartın üstünden 6 px içeride; dokunma alanı 64×40: kartın 12 px üstünden yüzün 28 px'ine.
 * Başlığın ortasına binen kısmına dokunmak yüze dokunmakla aynıdır (`onTap`), ölü bölge yok.
 *
 * `touch-action: none`: çizgiye basıp kaydırmak sayfayı kaydırmaz, sürükleme 4 px'te başlar
 * (basılı tutma yok). Klavyede odaklanmaz ve ekran okuyucuya kapalıdır (yol yüzde: Alt + ok).
 * Kalem sayfayı kaydırabildiği için kalem basılıyken `touchmove` engellenir.
 */
export function CardGrabber({ tone = 'default', dragging = false, inactive = false, onTap, className, ref, onPointerDown, ...props }: GrabberProps) {
  const own = useRef<HTMLDivElement | null>(null);
  const penDown = useRef(false);
  const down = useRef<{ x: number; y: number } | null>(null);

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
    <div
      ref={(element) => {
        own.current = element;
        if (typeof ref === 'function') return ref(element);
        if (ref) ref.current = element;
      }}
      data-slot="card-grabber"
      aria-hidden
      tabIndex={-1}
      title={inactive ? undefined : 'Sürükleyerek taşı'}
      data-dragging={dragging || undefined}
      data-inactive={inactive || undefined}
      className={cn(
        'group/grab absolute -top-3 left-1/2 z-10 h-10 w-16 -translate-x-1/2 cursor-grab touch-none outline-none select-none [-webkit-touch-callout:none] data-dragging:cursor-grabbing data-inactive:pointer-events-none',
        className,
      )}
      onPointerDown={(event) => {
        down.current = { x: event.clientX, y: event.clientY };
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
      onClick={(event) => {
        // Sürüklemeden sonra gelen click dokunma değildir.
        const start = down.current;
        down.current = null;
        if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) return;
        onTap?.();
      }}
      onContextMenu={(event) => event.preventDefault()}
      {...props}>
      <span
        className={cn(
          'absolute top-4.5 left-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:transition-colors motion-safe:duration-100',
          tone === 'group'
            ? 'bg-primary/50 group-hover/grab:bg-primary/70 group-active/grab:bg-primary/80'
            : 'bg-muted-foreground/40 group-hover/grab:bg-muted-foreground/70 group-active/grab:bg-muted-foreground/80',
          'group-data-dragging/grab:bg-primary group-data-inactive/grab:bg-muted-foreground/15',
        )}
      />
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
  /**
   * Seçim modu: yüz `role="checkbox"` olur (açılıp kapanmaz), rozetin yerinde 28 px onay
   * kutusu durur; ⧉ ve sr-only şerit gizlenir. Seçimi kartın kabı değiştirir (click yukarı çıkar).
   */
  selection?: { checked: boolean };
  /** Üst ortadaki tutamak çizgisi (`CardGrabber`): yüzün içinde `absolute`, yüzle birlikte kayar. */
  grabber?: React.ReactNode;
  /** Yüzü (düğme, çizgi, ⧉, hap) saran katman: kaydırma (`SwipeRow`). Gövde kaymaz. */
  slide?: (face: React.ReactNode) => React.ReactNode;
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
  selection,
  grabber,
  slide,
  className,
}: FaceProps) {
  const metaId = useId();
  const selecting = selection !== undefined;
  const content = (
    <>
      {/* Seçim modunda rozetin yeri boş kalır; onay kutusu üstünde durur (başlık kaymaz). */}
      {selecting ? <span className="size-7 shrink-0" aria-hidden /> : badge}
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
      {action && !selecting ? <span className="-mr-2 w-11 shrink-0" aria-hidden /> : null}
    </>
  );
  const shared = cn(
    'group/face flex w-full min-w-0 items-center gap-3 rounded-[inherit] px-3 pt-4 pb-3.5 text-left select-none [-webkit-touch-callout:none]',
    invalid && '[&_[data-slot=card-title]]:text-destructive',
  );

  const face = (
    // ⧉, hap ve onay kutusu yüz düğmesine göre ortalanır (sr-only şerit açılınca kaymasın).
    <div className="relative">
      {isStatic ? (
        <div className={shared}>{content}</div>
      ) : (
        <button
          type="button"
          id={id}
          role={selecting ? 'checkbox' : undefined}
          aria-checked={selecting ? selection.checked : undefined}
          aria-expanded={selecting ? undefined : expanded}
          aria-controls={selecting ? undefined : controls}
          aria-label={label}
          aria-describedby={label && meta ? metaId : undefined}
          data-invalid={invalid || undefined}
          onClick={selecting ? undefined : onToggle}
          onKeyDown={onKeyDown}
          aria-keyshortcuts={selecting ? undefined : keyShortcuts}
          className={cn(
            shared,
            'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset hover:bg-muted/40 aria-expanded:bg-muted/50 motion-safe:transition-colors motion-safe:duration-100',
            // Açık kart: rozet ana renge döner (ok yok, durum buradan okunur).
            'aria-expanded:[&_[data-slot=card-badge]]:bg-primary aria-expanded:[&_[data-slot=card-badge]]:text-primary-foreground',
          )}>
          {content}
        </button>
      )}
      {selecting ? (
        // Görsel onay kutusu: durum yüz düğmesinde (`aria-checked`); bu kopya odak ve dokunma almaz.
        <span inert className="pointer-events-none absolute inset-y-0 left-3 flex items-center pt-4 pb-3.5">
          <Checkbox checked={selection.checked} className="size-7 rounded-md bg-background [&_svg]:size-4.5!" />
        </span>
      ) : null}
      {grabber}
      {action && !selecting ? (
        <div className="absolute top-1/2 right-1 z-10 -translate-y-1/2 group-has-[[data-slot=drop-pill]]/card:invisible">{action}</div>
      ) : null}
      {status}
    </div>
  );

  return (
    <div data-slot="card-face" className={cn('group/card', className)}>
      {slide ? slide(face) : face}
      {selecting ? null : after}
    </div>
  );
}
