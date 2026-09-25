"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Sparkles, Mail, Building2, ArrowRight, Database, FileCode2, Settings2, ShieldCheck, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import UploadExcel from "@/components/UploadExcel";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";

const adminSections = [
  {
    href: "/admin/approvazioni",
    title: "Approvazioni",
    description: "Ordini, modifiche e preventivi con sconti liberi in attesa di approvazione.",
    icon: ShieldCheck,
  },
  {
    href: "/admin/users",
    title: "Utenti",
    description: "Gestisci account, ruoli e credenziali degli utenti.",
    icon: Users,
  },
  {
    href: "/admin/anagrafiche",
    title: "Anagrafiche",
    description: "Importa e aggiorna l'anagrafica clienti da file Excel.",
    icon: Building2,
  },
  {
    href: "/admin/enrich",
    title: "AI",
    description: "Arricchisci le descrizioni articoli con supporto AI.",
    icon: Sparkles,
  },
  {
    href: "/admin/emails",
    title: "Email",
    description: "Configura i destinatari email per filiale.",
    icon: Mail,
  },
  {
    href: "/admin/backup",
    title: "Backup DB",
    description: "Crea e scarica backup del database SQLite.",
    icon: Database,
  },
  {
    href: "/admin/export-metodo",
    title: "Export Metodo",
    description: "Esporta un ordine in XML per l'import nel gestionale Metodo.",
    icon: FileCode2,
  },
  {
    href: "/admin/impostazioni",
    title: "Impostazioni",
    description: "Codici Metodo per trasporto e articoli manuali.",
    icon: Settings2,
  },
];

export default function AdminHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || user?.role !== "admin") return;
    fetch("/api/admin/approvals?count=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.count === "number") setPendingApprovals(data.count);
      })
      .catch(() => {});
  }, [loading, user]);

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] bg-background">
      <main className="@container mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6 pb-8 lg:max-w-[1200px] lg:px-10 lg:pt-8">
        <PageHeader
          eyebrow="Amministrazione"
          title="Pannello Admin"
          description="Seleziona l'area amministrativa che vuoi gestire."
        />

        {/* Upload listino */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:flex-row sm:items-center sm:gap-5 sm:px-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <FileSpreadsheet className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-foreground">Importa listino</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Carica un file Excel per aggiornare il catalogo materiali.</p>
          </div>
          <UploadExcel />
        </div>

        {/* Colonne in base allo spazio reale (accanto alla sidebar a 1024px ne stanno 3): schede abbastanza larghe per il badge */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4 @2xl:grid-cols-3 @3xl:grid-cols-4">
          {adminSections.map(({ href, title, description, icon: Icon }) => {
            const highlight = href === "/admin/approvazioni" && pendingApprovals !== null && pendingApprovals > 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group flex min-h-40 flex-col gap-3 rounded-2xl border p-5 transition-all",
                  highlight
                    ? "border-primary bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover"
                    : "border-border/80 bg-card text-foreground shadow-card hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      highlight ? "bg-white/15 text-white" : "bg-secondary text-primary"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  {highlight ? (
                    <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-brand-yellow px-2.5 text-xs font-extrabold text-primary">
                      {pendingApprovals} in attesa
                    </span>
                  ) : (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  )}
                </div>
                <h2 className="mt-1 text-base font-bold">{title}</h2>
                <p className={cn("text-[13px] leading-relaxed", highlight ? "text-white/80" : "text-muted-foreground")}>{description}</p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
