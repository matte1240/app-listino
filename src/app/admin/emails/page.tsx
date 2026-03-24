"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Save, Loader2, CheckCircle2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { MAGAZZINI } from "@/types";

type BranchConfig = Record<string, { emailTo: string; emailCc: string }>;

export default function EmailsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<BranchConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) router.replace("/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user?.role === "admin") {
      fetch("/api/branch-emails")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.config) setConfig(data.config);
        })
        .finally(() => setLoading(false));
    }
  }, [authLoading, user]);

  function updateField(magazzino: string, field: "emailTo" | "emailCc", value: string) {
    setConfig((prev) => ({
      ...prev,
      [magazzino]: { ...prev[magazzino], [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/branch-emails", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-base flex items-center gap-2">
            <Mail className="h-4.5 w-4.5" />
            Email Filiali
          </h1>
          <Button
            onClick={handleSave}
            disabled={saving || saved}
            size="sm"
            className="gap-1.5 rounded-xl h-9"
          >
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" /> Salvato</>
            ) : saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvataggio…</>
            ) : (
              <><Save className="h-4 w-4" /> Salva</>
            )}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground -mt-2">
          Configura gli indirizzi email destinatari per ogni filiale. Gli ordini verranno inviati all&apos;email della filiale selezionata.
        </p>

        <div className="flex flex-col gap-4">
          {MAGAZZINI.map((magazzino) => {
            const entry = config[magazzino] ?? { emailTo: "", emailCc: "" };
            return (
              <div
                key={magazzino}
                className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3"
              >
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-primary" />
                  {magazzino}
                </h2>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`to-${magazzino}`} className="text-xs font-medium text-muted-foreground">
                    Destinatario (To)
                  </Label>
                  <Input
                    id={`to-${magazzino}`}
                    type="email"
                    placeholder="ordini@filiale.it"
                    value={entry.emailTo}
                    onChange={(e) => updateField(magazzino, "emailTo", e.target.value)}
                    className="h-10 rounded-xl text-sm bg-background"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`cc-${magazzino}`} className="text-xs font-medium text-muted-foreground">
                    Copia conoscenza (CC) — separare più indirizzi con virgola
                  </Label>
                  <Input
                    id={`cc-${magazzino}`}
                    type="text"
                    placeholder="responsabile@filiale.it, admin@azienda.it"
                    value={entry.emailCc}
                    onChange={(e) => updateField(magazzino, "emailCc", e.target.value)}
                    className="h-10 rounded-xl text-sm bg-background"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
