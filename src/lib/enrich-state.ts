/**
 * Server-side singleton that holds the AI enrichment state.
 * Survives across requests within the same Node.js process,
 * so the enrichment can run in the background while the user navigates.
 */

export interface EnrichLog {
  time: string;
  type: "info" | "success" | "error";
  text: string;
}

export interface EnrichmentState {
  status: "idle" | "running" | "done" | "error";
  totalItems: number;
  totalBatches: number;
  currentBatch: number;
  enrichedTotal: number;
  errorCount: number;
  progress: number;
  message: string;
  logs: EnrichLog[];
  startedAt: string | null;
}

const initialState: EnrichmentState = {
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

// Module-level singleton — persists across requests in the same process
let state: EnrichmentState = { ...initialState };

function ts(): string {
  return new Date().toLocaleTimeString("it-IT");
}

export function getEnrichState(): EnrichmentState {
  return state;
}

export function resetEnrichState(): void {
  state = { ...initialState };
}

export function startEnrichState(totalItems: number, totalBatches: number, batchSize: number): void {
  state = {
    ...initialState,
    status: "running",
    totalItems,
    totalBatches,
    startedAt: new Date().toISOString(),
    logs: [{ time: ts(), type: "info", text: `${totalItems} articoli da elaborare in ${totalBatches} batch (${batchSize} per batch)` }],
  };
}

export function batchStart(batch: number, totalBatches: number, itemsInBatch: number, firstCodice: string): void {
  state.currentBatch = batch;
  state.logs.push({
    time: ts(),
    type: "info",
    text: `Batch ${batch}/${totalBatches} — ${itemsInBatch} articoli (${firstCodice}...)`,
  });
}

export function batchDone(batch: number, totalBatches: number, enrichedInBatch: number, enrichedTotal: number, totalItems: number): void {
  const progress = Math.round((enrichedTotal / totalItems) * 100);
  state.enrichedTotal = enrichedTotal;
  state.progress = progress;
  state.logs.push({
    time: ts(),
    type: "success",
    text: `Batch ${batch}/${totalBatches} completato — ${enrichedInBatch} arricchiti (${progress}%)`,
  });
}

export function batchError(batch: number, totalBatches: number, error: string, errorCount: number): void {
  state.errorCount = errorCount;
  state.logs.push({
    time: ts(),
    type: "error",
    text: `Batch ${batch}/${totalBatches} errore: ${error}`,
  });
}

export function enrichDone(enrichedCount: number, errorCount: number, totalCount: number): void {
  const message = errorCount > 0
    ? `Arricchiti ${enrichedCount} articoli (${errorCount} errori)`
    : `Arricchiti ${enrichedCount} articoli con successo`;
  state.status = errorCount > 0 && enrichedCount === 0 ? "error" : "done";
  state.progress = 100;
  state.enrichedTotal = enrichedCount;
  state.errorCount = errorCount;
  state.message = message;
  state.logs.push({ time: ts(), type: "success", text: message });
}

export function enrichError(message: string): void {
  state.status = "error";
  state.message = message;
  state.logs.push({ time: ts(), type: "error", text: message });
}
