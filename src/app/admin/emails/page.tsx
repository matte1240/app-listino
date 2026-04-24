"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CheckCircle2, Warehouse } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MAGAZZINI } from "@/types";

type BranchConfig = Record<string, { emailTo: string; emailCc: string }>;

const inputClass =
  "w-full h-10 px-3.5 rounded-xl border border-ivi-border bg-ivi-bg text-sm text-ivi-text placeholder:text-ivi-muted/60 outline-none focus:border-ivi-navy focus:bg-white transition-colors";

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
        .then((data) => { if (data?.config) setConfig(data.config); })
        .finally(() => setLoading(false));
    }
  }, [authLoading, user]);

  function updateField(magazzino: string, field: "emailTo" | "emailCc", value: string) {
    setConfig((prev) => ({ ...prev, [magazzino]: { ...prev[magazzino], [field]: value } }));
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
      <div className="min-h-dvh bg-ivi-bg flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-ivi-muted" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ivi-bg">
      <div className="bg-ivi-navy px-4 pt-5 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-white">Email Filiali</div>
            <div className="text-xs text-white/50 mt-0.5">Destinatari per ogni filiale</div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors border-none cursor-pointer disabled:opacity-60"
          >
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" /> Salvato</>
            ) : saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvataggio…</>
            ) : (
              <><Save className="h-4 w-4" /> Salva</>
            )}
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
        <p className="text-sm text-ivi-muted">
          Configura i destinatari per ogni filiale. Gli ordini vengono inviati all&apos;email della filiale selezionata.
        </p>

        {MAGAZZINI.map((magazzino) => {
          const entry = config[magazzino] ?? { emailTo: "", emailCc: "" };
          return (
            <div key={magazzino} className="bg-white rounded-xl border border-ivi-border p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-ivi-text">
                <Warehouse className="h-4 w-4 text-ivi-navy" />
                {magazzino}
              </div>

              <div>
                <label htmlFor={`to-${magazzino}`} className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
                  Destinatario (To)
                </label>
                <input
                  id={`to-${magazzino}`} type="email"
                  placeholder="ordini@filiale.it"
                  value={entry.emailTo}
                  onChange={(e) => updateField(magazzino, "emailTo", e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor={`cc-${magazzino}`} className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
                  Copia (CC) — separare più indirizzi con virgola
                </label>
                <input
                  id={`cc-${magazzino}`} type="text"
                  placeholder="responsabile@filiale.it, admin@azienda.it"
                  value={entry.emailCc}
                  onChange={(e) => updateField(magazzino, "emailCc", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
