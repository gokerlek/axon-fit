"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 touch:group-data-horizontal/tabs:h-11 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

const tabsTriggerClasses = [
  "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
  "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
  "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
  // Telefonda dokunma alanı 44 px (SPEC §6): liste 44 px, görünmez `::before` sekmeyi listenin boyuna uzatır.
  "touch:before:absolute touch:before:inset-x-0 touch:before:top-1/2 touch:before:h-11 touch:before:-translate-y-1/2",
]

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(tabsTriggerClasses, className)}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

/**
 * Sayfalar arası gezinme için sekme görünümü. `Tabs` bir sayfanın içindeki panelleri değiştirir
 * (`role="tablist"`, ok tuşları); her sekmesi ayrı sayfa olan bölümler (Kütüphane, danışan) ise
 * gezinmedir: `nav` içinde bağlantılar, etkin olanda `aria-current="page"`. Görünüm `TabsList`
 * ile aynı. Sığmazsa yatay kayar ve taşan kenar solar; etkin sekme görünür alana kaydırılır.
 */
function TabsNav({
  className,
  listClassName,
  children,
  ...props
}: React.ComponentProps<"nav"> & { listClassName?: string }) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ start: false, end: false })

  React.useEffect(() => {
    const element = scroller.current
    if (!element) return
    const update = () => {
      const start = element.scrollLeft > 1
      const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1
      setEdges((current) => (current.start === start && current.end === end ? current : { start, end }))
    }
    update()
    element.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => {
      element.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [])

  // Etkin sekme görünür alanda değilse ona kaydır (danışan sekmeleri düzende kalır, sayfa değişir).
  const active = React.Children.toArray(children).findIndex(
    (child) => React.isValidElement<{ active?: boolean }>(child) && child.props.active
  )
  React.useEffect(() => {
    const element = scroller.current
    const link = element?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!element || !link) return
    if (link.offsetLeft < element.scrollLeft) element.scrollLeft = link.offsetLeft - 24
    else if (link.offsetLeft + link.offsetWidth > element.scrollLeft + element.clientWidth) {
      element.scrollLeft = link.offsetLeft + link.offsetWidth - element.clientWidth + 24
    }
  }, [active])

  const fade = "1.5rem"
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? `transparent, #000 ${fade}` : "#000"}, ${edges.end ? `#000 calc(100% - ${fade}), transparent` : "#000"})`
      : undefined

  return (
    <nav data-slot="tabs-nav" className={cn("min-w-0 max-w-full", className)} {...props}>
      <div
        ref={scroller}
        className="relative overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>
        <div
          data-slot="tabs-list"
          data-variant="default"
          className={cn(tabsListVariants(), "flex h-8 w-max min-w-full touch:h-11 md:min-w-0", listClassName)}>
          {children}
        </div>
      </div>
    </nav>
  )
}

/**
 * `TabsNav` içindeki bir sayfa. `render` ile bağlantı bileşeni verilir (`<Link href=… />`).
 * `disabled` henüz olmayan bölüm: tıklanmaz, nedeni (`note`, ör. "yakında") görünür yazılır.
 */
function TabsNavLink({
  className,
  active = false,
  disabled = false,
  note,
  render,
  children,
  ...props
}: useRender.ComponentProps<"a"> & { active?: boolean; disabled?: boolean; note?: React.ReactNode }) {
  const content = (
    <>
      {children}
      {disabled && note ? <span className="text-[0.6875rem] font-normal text-muted-foreground">{note}</span> : null}
    </>
  )
  return useRender({
    defaultTagName: "a",
    render: disabled ? <span /> : render,
    props: mergeProps<"a">(
      {
        className: cn(tabsTriggerClasses, "flex-1 px-3 touch:px-2.5", className),
        children: content,
        ...(disabled
          ? { "aria-disabled": true }
          : { "aria-current": active ? ("page" as const) : undefined }),
      },
      props
    ),
    state: { slot: "tabs-trigger", active, disabled },
  })
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsNav, TabsNavLink, tabsListVariants }
