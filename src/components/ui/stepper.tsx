'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { Minus, Plus } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Sayı adımlayıcı (SPEC §6): [−] değer [+]. Base UI NumberField sarmalayıcısı; ortadaki
 * değer yazılabilir (klavyede ↑/↓ adım, Home/End uçlar), düğmeler basılı tutulunca
 * 400 ms sonra 100 ms'de bir tekrarlar.
 *
 * Boyutlar: `sm` 32 px (masaüstü), `default` 44 px, `lg` 56 px (antrenman); `auto` ince
 * işaretçide 32, dokunmatikte ya da dar ekranda kenarlığın içi 44 px. Ortadaki kutu kendi
 * bölmesinin tamamını kaplar (birim, "sn", üstünde durur): dokunma alanı bölmenin kendisi. Kutunun
 * yazısı dokunmatikte 16 px (iOS daha küçük yazılı kutuya odaklanınca sayfayı yakınlaştırır).
 *
 * Düğmeler Base UI'dakiler gibi sekme durağı değildir (klavyede kutu yeter); dokunmatik ekran
 * okuyucusu onlara ulaşır. Tekrar hızı Base UI'da sabit olduğu için düğmeler buradadır.
 */

export type StepperSource = 'type' | 'step';

type Size = 'sm' | 'default' | 'lg' | 'auto';

/** Kabın yüksekliği. Dokunmatikte kenarlığın içi 44 px kalsın diye `auto` 46 px (düğme ve kutu 44×44). */
const HEIGHT: Record<Size, string> = {
  sm: 'h-8',
  default: 'h-11',
  lg: 'h-14 text-base',
  auto: 'h-8 touch:h-[2.875rem]',
};

const BUTTON: Record<Size, string> = {
  sm: 'w-8',
  default: 'w-11',
  lg: 'w-14 [&_svg]:size-5',
  auto: 'w-8 touch:w-11',
};

/** Ortadaki kutunun genişliği: birimsiz ve birimli ("90 sn"). */
const CENTER: Record<Size, { plain: string; unit: string }> = {
  sm: { plain: 'w-10', unit: 'w-14' },
  default: { plain: 'w-11', unit: 'w-16' },
  lg: { plain: 'w-14', unit: 'w-20' },
  auto: { plain: 'w-10 touch:w-12', unit: 'w-14 touch:w-16' },
};

const REPEAT = { delay: 400, interval: 100 } as const;
/** Parmak bu kadar kayarsa basılı tutma iptal (sayfa kaydırılıyordur). */
const TOUCH_SLOP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Basılı tutunca tekrar: dokunuşta tek adım `click`te; basılı kalırsa 400 ms sonra 100 ms'de
 * bir. `press` basışın başında bir kez çağrılır.
 */
function useRepeat(step: () => boolean, press: () => void) {
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  const timers = useRef<{ start?: number; tick?: number }>({});
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** Basılı tutma tekrarladıysa ardından gelen `click` ikinci kez adımlamasın. */
  const repeated = useRef(false);

  const stop = () => {
    window.clearTimeout(timers.current.start);
    window.clearInterval(timers.current.tick);
    timers.current = {};
    origin.current = null;
  };

  useEffect(() => stop, []);

  return {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      // Fareyle odak kutuda kalsın (düğme odak almaz); dokunmada sayfa kaydırması bozulmasın.
      if (event.pointerType === 'mouse') event.preventDefault();
      press();
      stop();
      repeated.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timers.current.start = window.setTimeout(() => {
        repeated.current = true;
        if (!latest.current()) return stop();
        timers.current.tick = window.setInterval(() => {
          if (!latest.current()) stop();
        }, REPEAT.interval);
      }, REPEAT.delay);
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = origin.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TOUCH_SLOP) stop();
    },
    onPointerUp: () => {
      stop();
      // Tekrarlayan basışın ardından gelen `click` yutulur; ondan sonrakiler (ör. ekran okuyucu) sayılır.
      if (repeated.current) window.setTimeout(() => (repeated.current = false), 0);
    },
    onPointerCancel: stop,
    onPointerLeave: stop,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onClick: () => {
      if (repeated.current) {
        repeated.current = false;
        return;
      }
      latest.current();
    },
  };
}

function StepButton({
  direction,
  label,
  size,
  disabled,
  onStep,
  onPress,
}: {
  direction: 1 | -1;
  label: string;
  size: Size;
  disabled: boolean;
  onStep: () => boolean;
  onPress: () => void;
}) {
  const handlers = useRepeat(onStep, onPress);
  const Icon = direction === 1 ? Plus : Minus;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      disabled={disabled}
      data-slot="stepper-button"
      className={cn(
        'flex h-full shrink-0 touch-manipulation items-center justify-center text-muted-foreground outline-none select-none [-webkit-touch-callout:none] hover:bg-muted hover:text-foreground active:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40 motion-safe:transition-colors motion-safe:duration-100 [&_svg]:size-4',
        direction === -1 ? 'rounded-l-[inherit]' : 'rounded-r-[inherit]',
        BUTTON[size],
      )}
      {...handlers}>
      <Icon weight="bold" aria-hidden />
    </button>
  );
}

export type StepperProps = {
  /** Değer; boşsa `null` (kutu boş görünür). */
  value: number | null;
  /**
   * Yeni değer: `type` yazarak (boşaltılınca `null`), `step` düğme ya da ↑/↓ ile (sınırlar
   * içinde). Yazılan değer sınırların dışında da gelebilir; çağıran doğrular.
   */
  onValueChange: (value: number | null, source: StepperSource) => void;
  min: number;
  max: number;
  step?: number;
  size?: Size;
  /** Değerin arkasındaki birim ("sn"). */
  unit?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Azalt/artır düğmelerinin adı (ör. "Bir set eksilt"). */
  decrementLabel?: string;
  incrementLabel?: string;
  /** Kutunun erişilebilir adı (etiket yoksa). */
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** Kutunun odak olayları ve ref geri çağrısı (form alanı kaydı için). */
  inputRef?: (element: HTMLInputElement | null) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Kutunun tuşları (ör. düzenleyicide Enter formu göndermesin: `keepLineEnter`). */
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  className?: string;
};

export function Stepper({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  size = 'default',
  unit,
  id,
  disabled = false,
  invalid = false,
  decrementLabel = 'Azalt',
  incrementLabel = 'Artır',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  inputRef,
  onFocus,
  onBlur,
  onKeyDown,
  className,
}: StepperProps) {
  const local = useRef<HTMLInputElement>(null);
  // Boşaltılıp bırakılan kutu değere dönsün diye kutu yeniden kurulur (çağıran boşu yazmadıysa).
  const [resetKey, setResetKey] = useState(0);
  const setInput = useCallback(
    (element: HTMLInputElement | null) => {
      local.current = element;
      inputRef?.(element);
    },
    [inputRef],
  );
  const latest = useRef({ value, onValueChange });
  useEffect(() => {
    latest.current = { value, onValueChange };
  });

  /** Bir adım: sınırda `false` (basılı tutma durur). */
  const stepBy = (direction: 1 | -1): boolean => {
    const current = latest.current.value;
    const base = current === null || Number.isNaN(current) ? (direction === 1 ? min - step : max + step) : current;
    // Adımın katına oturur (ör. 15 sn adımda 50 → 60 ya da 45).
    const snapped = direction === 1 ? Math.floor(base / step) * step + step : Math.ceil(base / step) * step - step;
    const next = clamp(snapped, min, max);
    if (next === current) return false;
    latest.current.onValueChange(next, 'step');
    latest.current = { ...latest.current, value: next };
    return next !== (direction === 1 ? max : min);
  };

  /**
   * Fareyle basınca odak kutuda kalır; kutuda yazılmış ama odaktan çıkmamış metin varsa Base UI
   * yeni değeri kutuya yazmaz. Kutu bir kez odaktan çıkıp geri alınır: metin işlenir, adım görünür.
   */
  const commitTyped = () => {
    const input = local.current;
    if (!input || document.activeElement !== input) return;
    input.blur();
    input.focus({ preventScroll: true });
  };

  const atMin = value !== null && value <= min;
  const atMax = value !== null && value >= max;

  return (
    <NumberField.Root
      key={resetKey}
      value={value}
      min={min}
      max={max}
      step={step}
      locale="tr-TR"
      disabled={disabled}
      onValueChange={(next, details) => {
        const source: StepperSource = details.reason === 'keyboard' || details.reason === 'wheel' ? 'step' : 'type';
        onValueChange(next, source);
      }}
      className={cn('min-w-0', className)}>
      <NumberField.Group
        data-slot="stepper"
        data-invalid={invalid || undefined}
        className={cn(
          'inline-flex w-fit max-w-full items-stretch rounded-lg border border-input bg-transparent text-sm shadow-xs transition-colors has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 data-disabled:opacity-50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:bg-input/30',
          HEIGHT[size],
        )}>
        <StepButton direction={-1} label={decrementLabel} size={size} disabled={disabled || atMin} onStep={() => stepBy(-1)} onPress={commitTyped} />
        <span className={cn('relative flex shrink-0 items-center justify-center border-x border-input', unit ? CENTER[size].unit : CENTER[size].plain)}>
          <NumberField.Input
            ref={setInput}
            id={id}
            inputMode="numeric"
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            aria-invalid={invalid || undefined}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            onBlur={() => {
              onBlur?.();
              // Base UI boş kutuyu `null` bildirir; çağıran yazmadıysa (değer duruyorsa) kutu değere döner.
              window.setTimeout(() => {
                if (local.current?.value.trim() === '' && latest.current.value !== null) setResetKey((key) => key + 1);
              }, 0);
            }}
            // Dokunmatikte 16 px: iOS 16 px'ten küçük kutuya odaklanınca sayfayı yakınlaştırır.
            className={cn(
              'h-full w-full min-w-0 bg-transparent px-1 font-medium tabular-nums outline-none touch:text-base',
              unit ? 'pr-5 text-right' : 'text-center',
            )}
          />
          {unit ? (
            <span className="pointer-events-none absolute right-1.5 text-xs text-muted-foreground" aria-hidden>
              {unit}
            </span>
          ) : null}
        </span>
        <StepButton direction={1} label={incrementLabel} size={size} disabled={disabled || atMax} onStep={() => stepBy(1)} onPress={commitTyped} />
      </NumberField.Group>
    </NumberField.Root>
  );
}
