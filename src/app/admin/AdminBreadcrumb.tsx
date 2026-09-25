"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { canNavigateTo } from "@/lib/navigation-guard";

const ADMIN_HREF = "/admin";

/**
 * Percorso delle sottopagine admin. Il link "Admin" ha un'area di tocco di 40px (margini negativi,
 * l'impaginazione non cambia) e passa dalla guardia di navigazione come i link della shell.
 */
export default function AdminBreadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Percorso" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link
        href={ADMIN_HREF}
        onClick={(event) => {
          if (!canNavigateTo(ADMIN_HREF)) event.preventDefault();
        }}
        className="-mx-2 -my-2.5 inline-flex items-center rounded-md px-2 py-2.5 transition-colors hover:text-foreground"
      >
        Admin
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground font-medium" aria-current="page">{current}</span>
    </nav>
  );
}
