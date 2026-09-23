import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Sovratitolo in maiuscoletto sopra il titolo (es. "Cronologia"). */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Controlli allineati a destra su schermi larghi (ricerca, filtri, pulsanti). */
  actions?: ReactNode;
  className?: string;
}

/** Intestazione di pagina: titolo grande in font display con azioni opzionali. */
export default function PageHeader({ eyebrow, title, description, actions, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0 px-1">
        {eyebrow && (
          <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{eyebrow}</p>
        )}
        <h1 className="font-display text-[32px] leading-[1.05] font-bold text-foreground lg:text-[38px]">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">{actions}</div>}
    </div>
  );
}
