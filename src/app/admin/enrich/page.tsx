"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  totalItems: 0, totalBatches: 0, currentBatch: 0,
  enrichedTotal: 0, errorCount: 0, progress: 0,
  message: "", logs: [], startedAt: null,
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
    if (!authLoading && (!user || user.role !== "admin")) router.replace("/");
  }, [user, authLoading, router]);

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
        if (data.enrichState.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current); pollRef.current = null;
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    pollStatus().finally(() => setLoading(false));
    pollRef.current = setInterval(pollStatus, 2000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [pollStatus]);

  async function handleEnrich(onlyMissing: boolean) {
    try {
      const res = await fetch("/api/ai/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyMissing }),
      });
      const data = await res.json();
      if (res.status === 409 || res.status === 202) {
        if (data.enrichState) setProgress(data.enrichState);
      } else if (res.ok) {
        setProgress((p) => ({
          ...p, status: "done", progress: 100, message: data.message,
          logs: [...p.logs, { time: new Date().toLocaleTimeString("it-IT"), type: "success" as const, text: data.message }],
        }));
        pollStatus(); return;
      } else {
        setProgress((p) => ({
          ...p, status: "error", message: data.error,
          logs: [...p.logs, { time: new Date().toLocaleTimeString("it-IT"), type: "error" as const, text: data.error }],
        }));
        return;
      }
      if (!pollRef.current) pollRef.current = setInterval(pollStatus, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      setProgress((p) => ({ ...p, status: "error", message: msg }));
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh bg-ivi-bg flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-ivi-muted" />
      </div>
    );
  }

  const isRunning = progress.status === "running";

  return (
    <div className="min-h-dvh bg-ivi-bg">
      <div className="bg-ivi-navy px-4 pt-5 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-white">Arricchimento AI</div>
            <div className="text-xs text-white/50 mt-0.5">Descrizioni prodotti con GPT-4o-mini</div>
          </div>
          <button
            onClick={() => pollStatus()}
            disabled={isRunning}
            className="h-9 w-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center border-none cursor-pointer disabled:opacity-40 transition-colors"
          >
            <RotateCw className={`h-4 w-4 text-white ${isRunning ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Stats */}
        <div className="bg-white rounded-xl border border-ivi-border p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-[10px] bg-ivi-navy/8 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-ivi-navy" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-ivi-muted font-medium">Articoli arricchiti</div>
            <div className="text-2xl font-extrabold text-ivi-text tabular-nums leading-tight">
              {enrichedCount}
              {totalMaterials > 0 && (
                <span className="text-base font-medium text-ivi-muted"> / {totalMaterials}</span>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white rounded-xl border border-ivi-border p-4 flex flex-col gap-2">
          <div className="text-sm font-bold text-ivi-text">Come funziona</div>
          <p className="text-sm text-ivi-muted leading-relaxed">
            Usa GPT-4o-mini per correggere e leggibilizzare le descrizioni, espandendo le abbreviazioni tipiche del gestionale.
          </p>
          <ul className="text-sm text-ivi-muted space-y-1 list-disc pl-5">
            <li><strong className="text-ivi-text">Descrizione pulita</strong> — abbreviazioni espanse (es. &quot;TRAVERS. SCATTO&quot; → &quot;Traversa a scatto&quot;)</li>
            <li>Solo abbreviazioni <strong className="text-ivi-text">certe</strong> vengono espanse — nulla viene inventato</li>
          </ul>
          <p className="text-xs text-ivi-muted mt-1">
            Richiede <code className="bg-ivi-bg rounded px-1.5 py-0.5">OPENAI_API_KEY</code> nelle variabili d&apos;ambiente. Costo: ~$0.01 ogni 50 articoli.
          </p>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl border border-ivi-border p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-ivi-text">Avvia arricchimento</div>
          <div className="flex gap-2.5">
            <button
              onClick={() => handleEnrich(true)}
              disabled={isRunning}
              className="flex-1 flex items-center justify-center gap-2 bg-ivi-navy text-white text-sm font-semibold py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-60 transition-colors hover:bg-ivi-navy-light"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Solo nuovi
            </button>
            <button
              onClick={() => handleEnrich(false)}
              disabled={isRunning}
              className="flex-1 flex items-center justify-center gap-2 border border-ivi-border text-ivi-navy text-sm font-semibold py-2.5 rounded-xl bg-white cursor-pointer disabled:opacity-60 transition-colors hover:bg-ivi-bg"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              Rigenera tutto
            </button>
          </div>
        </div>

        {/* Progress */}
        {progress.status !== "idle" && (
          <div className="bg-white rounded-xl border border-ivi-border p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-ivi-text">Avanzamento</div>
              <span className="text-sm font-bold text-ivi-navy tabular-nums">{progress.progress}%</span>
            </div>

            <div className="relative h-2.5 rounded-full bg-ivi-bg overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progress.progress}%`,
                  background: progress.status === "error"
                    ? "#D4281C"
                    : progress.status === "done"
                    ? "#16A34A"
                    : "#1B3A6B",
                }}
              />
            </div>

            <div className="flex items-center gap-4 text-xs text-ivi-muted">
              {progress.totalItems > 0 && (
                <span className="tabular-nums">{progress.enrichedTotal}/{progress.totalItems} articoli</span>
              )}
              {progress.totalBatches > 0 && (
                <span className="tabular-nums">Batch {Math.min(progress.currentBatch, progress.totalBatches)}/{progress.totalBatches}</span>
              )}
              {progress.errorCount > 0 && (
                <span className="text-ivi-red font-medium">{progress.errorCount} errori</span>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl bg-ivi-bg p-3 border border-ivi-border text-xs font-mono space-y-1">
              {progress.logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-ivi-muted/50 shrink-0 tabular-nums">{log.time}</span>
                  <span className={
                    log.type === "error" ? "text-ivi-red" :
                    log.type === "success" ? "text-ivi-success" :
                    "text-ivi-muted"
                  }>
                    {log.type === "error" ? "✗" : log.type === "success" ? "✓" : "›"} {log.text}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {progress.status === "done" && progress.message && (
          <div className="rounded-xl border border-ivi-success/30 bg-ivi-success-bg p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-ivi-success shrink-0 mt-0.5" />
            <p className="text-sm text-ivi-text">{progress.message}</p>
          </div>
        )}

        {progress.status === "error" && progress.message && (
          <div className="rounded-xl border border-ivi-red/30 bg-ivi-red/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-ivi-red shrink-0 mt-0.5" />
            <p className="text-sm text-ivi-text">{progress.message}</p>
          </div>
        )}
      </main>
    </div>
  );
}
