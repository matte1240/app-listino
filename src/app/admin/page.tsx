"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Sparkles, Mail, Building2, ArrowRight, Database, FileCode2, Settings2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import UploadExcel from "@/components/UploadExcel";

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
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-4xl mx-auto px-4 sm:px-5 pt-5 pb-6 flex flex-col gap-5">
        <div>
          <h1 className="font-bold text-lg">Pannello Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona l&apos;area amministrativa che vuoi gestire.
          </p>
        </div>

        {/* Upload listino */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-sm">Importa listino</p>
            <p className="text-xs text-muted-foreground mt-0.5">Carica un file Excel per aggiornare il catalogo materiali.</p>
          </div>
          <UploadExcel />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {adminSections.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="flex items-center gap-2">
                  {href === "/admin/approvazioni" && pendingApprovals !== null && pendingApprovals > 0 && (
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-2 text-xs font-bold text-primary">
                      {pendingApprovals}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
                </div>
              </div>
              <h2 className="font-semibold text-sm mt-3">{title}</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
