import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Etichetta a pillola per stati e metadati (stato ordine, magazzino, sconto…). */
const chipVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground/80",
        primary: "bg-secondary text-primary",
        solid: "bg-primary text-primary-foreground",
        success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        warning: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        orange: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
        danger: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
        purple: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
        indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
        info: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
        "warning-outline": "border border-dashed border-amber-500 bg-transparent text-amber-800 dark:text-amber-300",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

const dotTone: Record<NonNullable<VariantProps<typeof chipVariants>["tone"]>, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  solid: "bg-primary-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  orange: "bg-orange-500",
  danger: "bg-red-500",
  purple: "bg-violet-500",
  indigo: "bg-indigo-500",
  info: "bg-sky-500",
  "warning-outline": "bg-amber-500",
}

function Chip({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants> & { dot?: boolean }) {
  return (
    <span data-slot="chip" className={cn(chipVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dotTone[tone ?? "neutral"])} />}
      {children}
    </span>
  )
}

export { Chip, chipVariants }
