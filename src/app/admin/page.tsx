"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, Sparkles, Mail, Building2, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import UploadExcel from "@/components/UploadExcel";

const adminSections = [
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
];

export default function AdminHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 flex flex-col gap-5">
        <div>
          <h1 className="font-bold text-base">Pannello Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona l&apos;area amministrativa che vuoi gestire.
          </p>
        </div>

        {/* Admin tools */}
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-muted/40 border border-border">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strumenti</p>
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
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
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
