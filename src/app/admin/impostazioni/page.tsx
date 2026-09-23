"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronRight, FileCode2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

interface SettingsForm {
  metodoCodiceTrasporto: string;
  metodoCodiceManuale: string;
}

const EMPTY_FORM: SettingsForm = { metodoCodiceTrasporto: "", metodoCodiceManuale: "" };

export default function AdminSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) router.replace("/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || user?.role !== "admin") return;
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.settings) setForm({ ...EMPTY_FORM, ...data.settings });
      })
      .catch(() => setError("Impossibile caricare le impostazioni"))
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data?.settings) setForm({ ...EMPTY_FORM, ...data.settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Errore nel salvataggio delle impostazioni");
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
      <main className="max-w-4xl mx-auto px-4 sm:px-5 lg:px-10 pt-6 lg:pt-8 pb-6 flex flex-col gap-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground transition-colors">Admin</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Impostazioni</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[28px] leading-tight font-bold">Impostazioni</h1>
          <Button onClick={handleSave} disabled={saving || saved} size="sm" className="w-full justify-center sm:w-auto">
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" /> Salvato</>
            ) : saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvataggio…</>
            ) : (
              <><Save className="h-4 w-4" /> Salva</>
            )}
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-primary" />
              Codici articolo per l&apos;export Metodo
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Le righe non presenti a listino vengono esportate nell&apos;XML Metodo con questi codici. Devono corrispondere ad
              articoli generici esistenti nel gestionale, altrimenti l&apos;import fallisce. Le righe di nota vengono esportate
              con la sola descrizione.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codice-trasporto" className="text-xs font-medium text-muted-foreground">
              Codice per &quot;Spese di trasporto&quot;
            </Label>
            <Input
              id="codice-trasporto"
              type="text"
              placeholder="TRASPORTO"
              value={form.metodoCodiceTrasporto}
              onChange={(e) => setForm((prev) => ({ ...prev, metodoCodiceTrasporto: e.target.value }))}
              className="text-sm bg-background font-mono uppercase"
              maxLength={40}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codice-manuale" className="text-xs font-medium text-muted-foreground">
              Codice per gli articoli inseriti manualmente
            </Label>
            <Input
              id="codice-manuale"
              type="text"
              placeholder="MANUALE"
              value={form.metodoCodiceManuale}
              onChange={(e) => setForm((prev) => ({ ...prev, metodoCodiceManuale: e.target.value }))}
              className="text-sm bg-background font-mono uppercase"
              maxLength={40}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
