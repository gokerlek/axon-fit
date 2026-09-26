"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Basılı (seçili) durum: vurgunun seçili durum tonu (`--primary-strong`, komşu yüzey ve kenarlıktan
 * ≥3:1) ve üstünde okunur yazı (≥4,5:1). Renk körlüğü için yalnız renk değil şekil de: basılı
 * öğenin içinde zemin renginde 2 px'lik halka (dolu + çift çerçeve); basılı olmayan öğe boş.
 * İçerideki soluk yazı (sayaç gibi `text-muted-foreground`) basılıyken zeminin yazı rengini alır.
 * `aria-*` varyantı `hover:`dan sonra üretildiği için üstüne gelmek basılı rengi ezmez.
 */
const PRESSED =
  "aria-pressed:bg-primary-strong aria-pressed:text-primary-strong-foreground aria-pressed:inset-ring-2 aria-pressed:inset-ring-background aria-pressed:[&_.text-muted-foreground]:text-current"

/**
 * Telefonda (dokunmatik ya da dar ekran) en az 44 × 44 px dokunma alanı (SPEC §6). Görünen boy
 * aynı kalır; alanı görünmez `::before` büyütür (button.tsx ile aynı yol).
 */
const TOUCH_TARGET =
  "touch:before:absolute touch:before:top-1/2 touch:before:left-1/2 touch:before:h-full touch:before:min-h-11 touch:before:w-full touch:before:min-w-11 touch:before:-translate-x-1/2 touch:before:-translate-y-1/2"

const toggleVariants = cva(
  `${TOUCH_TARGET} group/toggle relative inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 ${PRESSED} dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted aria-pressed:border-primary-strong",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
