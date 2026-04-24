"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, RotateCw, Package } from "lucide-react";

interface LogEntry {
  time: string;
  type: "info" | "success" | "error";
  text: string;
}

interface EnrichState {
  status: "idle" | "running" | "done" | "error";
  totalItems: number;
  totalBatches: number;
  currentBatch: number;
  enrichedTotal: number;
  errorCount: number;
  progress: number;
  message: string;
  logs: LogEntry[];
  startedAt: string | null;
}

const initialState: EnrichState = {
  status: "idle",
  totalItems: 0,
  totalBatches: 0,
  currentBatch: 0,
  enrichedTotal: 0,
  errorCount: 0,
  progress: 0,
  message: "",
  logs: [],
  startedAt: null,
};

export default function EnrichPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [enrichedCount, setEnrichedCount] = useState(0);
  const [totalMaterials, setTotalMaterials] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<EnrichState>(initialState);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progress.logs.length]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/enrich");
      if (!res.ok) return;
      const data = await res.json();
      setEnrichedCount(data.count ?? 0);
      setTotalMaterials(data.total ?? 0);
      if (data.enrichState) {
        setProgress(data.enrichState);
        // Stop polling when done/error/idle
        if (data.enrichState.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load + start polling if already running
  useEffect(() => {
    setLoading(true);
    pollStatus().finally(() => setLoading(false));

    // Start polling immediately — it will self-stop if not running
    pollRef.current = setInterval(pollStatus, 2000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [pollStatus]);

  async function handleEnrich(onlyMissing: boolean) {
    try {
      const res = await fetch("/api/ai/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyMissing }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Already running — just ensure polling
        if (data.enrichState) setProgress(data.enrichState);
      } else if (res.status === 202) {
        // Started — set initial state and start polling
        if (data.enrichState) setProgress(data.enrichState);
      } else if (res.ok) {
        // Immediate response (e.g. "all already enriched")
        setProgress((p) => ({
          ...p,
          status: "done",
          progress: 100,
          message: data.message,
          logs: [...p.logs, { time: new Date().toLocaleTimeString("it-IT"), type: "success" as const, text: data.message }],
        }));
        pollStatus();
        return;
      } else {
        setProgress((p) => ({
          ...p,
          status: "error",
          message: data.error,
          logs: [...p.logs, { time: new Date().toLocaleTimeString("it-IT"), type: "error" as const, text: data.error }],
        }));
        return;
      }

      // Start polling
      if (!pollRef.current) {
        pollRef.current = setInterval(pollStatus, 2000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      setProgress((p) => ({ ...p, status: "error", message: msg }));
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  const isRunning = progress.status === "running";

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-6 flex flex-col gap-6">
        <h1 className="font-bold text-base">Arricchimento AI</h1>
        {/* Info card */}
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-bold text-sm mb-2">Come funziona</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Questa funzione usa un modello AI (GPT-4o-mini) per correggere e leggibilizzare le descrizioni degli articoli del listino, espandendo le abbreviazioni tipiche del gestionale.
          </p>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-5">
            <li><strong>Descrizione pulita</strong> — abbreviazioni espanse (es. &quot;TRAVERS. SCATTO&quot; → &quot;Traversa a scatto&quot;)</li>
            <li>Solo le abbreviazioni <strong>certe e riconoscibili</strong> vengono espanse — nulla viene inventato</li>
          </ul>
        </div>

        {/* Stats */}
        <div className="rounded-2xl border bg-card p-5 flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Articoli arricchiti</p>
              <p className="text-2xl font-extrabold">
                {enrichedCount}
                {totalMaterials > 0 && (
                  <span className="text-base font-medium text-muted-foreground"> / {totalMaterials}</span>
                )}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => pollStatus()} disabled={isRunning}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Actions */}
        <div className="rounded-2xl border bg-card p-5 flex flex-col gap-3">
          <h2 className="font-bold text-sm">Avvia arricchimento</h2>
          <p className="text-sm text-muted-foreground">
            Richiede che <code className="bg-muted rounded px-1.5 py-0.5 text-xs">OPENAI_API_KEY</code> sia configurata nelle variabili d&apos;ambiente.
          </p>
          <div className="flex gap-3 mt-2">
            <Button
              onClick={() => handleEnrich(true)}
              disabled={isRunning}
              className="flex-1 rounded-xl"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Solo nuovi articoli
            </Button>
            <Button
              variant="outline"
              onClick={() => handleEnrich(false)}
              disabled={isRunning}
              className="flex-1 rounded-xl"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4 mr-2" />
              )}
              Rigenera tutto
            </Button>
          </div>
        </div>

        {/* Progress section */}
        {progress.status !== "idle" && (
          <div className="rounded-2xl border bg-card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm">Avanzamento</h2>
              <span className="text-sm font-bold text-primary tabular-nums">
                {progress.progress}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="relative h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progress.progress}%`,
                  background: progress.status === "error"
                    ? "var(--color-destructive)"
                    : progress.status === "done"
                    ? "linear-gradient(90deg, #22c55e, #16a34a)"
                    : "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
                }}
              />
              {isRunning && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {progress.totalItems > 0 && (
                <span className="tabular-nums">
                  {progress.enrichedTotal}/{progress.totalItems} articoli
                </span>
              )}
              {progress.totalBatches > 0 && (
                <span className="tabular-nums">
                  Batch {Math.min(progress.currentBatch, progress.totalBatches)}/{progress.totalBatches}
                </span>
              )}
              {progress.errorCount > 0 && (
                <span className="text-red-500 font-medium">
                  {progress.errorCount} errori
                </span>
              )}
            </div>

            {/* Log area */}
            <div className="mt-1 max-h-48 overflow-y-auto rounded-xl bg-muted/50 p-3 border text-xs font-mono space-y-1">
              {progress.logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground/50 shrink-0 tabular-nums">{log.time}</span>
                  <span className={
                    log.type === "error" ? "text-red-500" :
                    log.type === "success" ? "text-green-600 dark:text-green-400" :
                    "text-foreground/70"
                  }>
                    {log.type === "error" ? "✗" : log.type === "success" ? "✓" : "›"} {log.text}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Final result */}
        {progress.status === "done" && progress.message && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <p className="text-sm">{progress.message}</p>
          </div>
        )}

        {progress.status === "error" && progress.message && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm">{progress.message}</p>
          </div>
        )}

        {/* Note */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>Nota:</strong> L&apos;arricchimento può richiedere qualche minuto per listini
            con molti articoli. I risultati vengono salvati e non serve rieseguire ogni volta.
            Il costo dipende dal numero di articoli (circa $0.01 ogni 50 articoli con GPT-4o-mini).
          </p>
        </div>
      </main>
    </div>
  );
}
