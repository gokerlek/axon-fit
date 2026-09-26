"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"
import { useMediaQuery } from "@/hooks/use-media-query"

/** `touch:` varyantıyla aynı sorgu: kaba işaretçi ya da 40rem'den dar ekran. */
const TOUCH = "(pointer: coarse), (width < 40rem)"

/**
 * Telefonda bildirimler altta, dock'un (ve düzenleyicinin yüzen Kaydet'inin, `--editor-save-space`)
 * hemen üstünde: "Geri al" başparmağın yetiştiği yerde. Masaüstünde verilen konum (üstte ortada).
 */
const TOUCH_OFFSET = { bottom: "calc(var(--dock-clearance) + var(--editor-save-space, 0px))" }

const Toaster = ({ position, offset, mobileOffset, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const touch = useMediaQuery(TOUCH)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <WarningIcon className="size-4" />
        ),
        error: (
          <XCircleIcon className="size-4" />
        ),
        loading: (
          <SpinnerIcon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
      position={touch ? "bottom-center" : position}
      offset={touch ? TOUCH_OFFSET : offset}
      mobileOffset={touch ? TOUCH_OFFSET : mobileOffset}
    />
  )
}

export { Toaster }
