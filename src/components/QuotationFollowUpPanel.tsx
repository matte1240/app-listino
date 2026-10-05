"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, CalendarClock, History, Loader2, MessageSquarePlus, PhoneCall, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Quotation, QuotationFollowUp, QuotationFollowUpKind } from "@/types";

/** Giorni proponibili per il prossimo promemoria (allineati a FOLLOWUP_SNOOZE_DAYS lato server). */
const SNOOZE_OPTIONS = [7, 15, 30, 60] as const;

type FollowUpAction = "trattativa" | "perso" | "riapri";

const KIND_LABEL: Record<QuotationFollowUpKind, string> = {
  promemoria: "Promemoria inviato",
  trattativa: "Ancora in trattativa",
  perso: "Chiuso come perso",
  riaperto: "Riaperto",
};

const KIND_ICON: Record<QuotationFollowUpKind, typeof BellRing> = {
  promemoria: BellRing,
  trattativa: PhoneCall,
  perso: XCircle,
  riaperto: RotateCcw,
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysSince(dateValue: string) {
  const start = new Date(dateValue.includes("T") ? dateValue : `${dateValue}T00:00:00`);
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

interface QuotationFollowUpPanelProps {
  quotation: Quotation;
  onQuotationChange: (quotation: Quotation) => void;
  className?: string;
}

/**
 * Ricontatto del cliente per un preventivo non ancora trasformato in ordine:
 * stato del promemoria, registrazione dell'esito (in trattativa / perso / riapri) e storico.
 */
export default function QuotationFollowUpPanel({ quotation, onQuotationChange, className }: QuotationFollowUpPanelProps) {
  const [followUps, setFollowUps] = useState<QuotationFollowUp[]>([]);
  const [action, setAction] = useState<FollowUpAction | null>(null);
  const [note, setNote] = useState("");
  const [days, setDays] = useState<number>(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAction(null);
    setError(null);
    fetch(`/api/quotations/${quotation.id}/followup`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setFollowUps((data?.followUps as QuotationFollowUp[] | undefined) ?? []);
      })
      .catch(() => {
        if (!cancelled) setFollowUps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [quotation.id, quotation.status]);

  const isActive = quotation.status === "attivo";
  const isLost = quotation.status === "perso";
  if (!isActive && !isLost && followUps.length === 0) return null;

  const lostEntry = isLost ? followUps.find((entry) => entry.kind === "perso") : undefined;

  function openAction(next: FollowUpAction) {
    setAction(next);
    setNote("");
    setDays(30);
    setError(null);
  }

  async function submit() {
    if (!action) return;
    if (action !== "riapri" && !note.trim()) {
      setError(action === "perso" ? "Indica il motivo" : "Scrivi un'osservazione sul ricontatto");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note, days }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.quotation) throw new Error(data?.error ?? "Errore nel salvataggio");
      setFollowUps(data.followUps ?? []);
      setAction(null);
      onQuotationChange(data.quotation as Quotation);
      toast.success(
        action === "perso"
          ? `Preventivo ${quotation.numero} chiuso come perso`
          : action === "riapri"
            ? `Preventivo ${quotation.numero} riaperto`
            : `Esito registrato: nuovo promemoria fra ${days} giorni`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3 border-t border-border/70 py-3.5", className)}>
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Ricontatto cliente</span>
      </div>

      {isActive && quotation.followUpDue && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Da ricontattare:</strong> il preventivo è aperto da {daysSince(quotation.dataPreventivo)} giorni senza ordine.
            Senti il cliente e registra l&apos;esito: ancora in trattativa, perso, trasforma in ordine oppure elimina il preventivo.
          </span>
        </div>
      )}
      {isActive && !quotation.followUpDue && quotation.followUpDueAt && (
        <p className="text-xs text-muted-foreground">
          Promemoria di ricontatto il <strong className="text-foreground">{formatDate(quotation.followUpDueAt)}</strong> se il preventivo non diventa un ordine.
        </p>
      )}
      {isLost && (
        <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-foreground/85">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>
            <strong>Chiuso come perso</strong>
            {lostEntry ? ` il ${formatDate(lostEntry.createdAt)} da ${lostEntry.createdByFullName}` : ""}
            {lostEntry?.note ? `: ${lostEntry.note}` : "."}
          </span>
        </div>
      )}

      {action ? (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-3">
          <p className="text-sm font-semibold">
            {action === "trattativa" ? "Ancora in trattativa" : action === "perso" ? "Chiudi come perso" : "Riapri il preventivo"}
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            autoFocus
            placeholder={
              action === "trattativa"
                ? "Osservazioni: esito della telefonata, richieste del cliente, prossimi passi…"
                : action === "perso"
                  ? "Motivo: prezzo, scelto un concorrente, lavoro rinviato o annullato…"
                  : "Nota (facoltativa)"
            }
          />
          {action !== "perso" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Prossimo promemoria fra</span>
              {SNOOZE_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="xs"
                  variant={days === option ? "default" : "outline"}
                  onClick={() => setDays(option)}
                >
                  {option} gg
                </Button>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button size="sm" variant="outline" onClick={() => setAction(null)} disabled={saving} className="w-full justify-center sm:w-auto">
              Annulla
            </Button>
            <Button
              size="sm"
              variant={action === "perso" ? "destructive" : "default"}
              onClick={submit}
              disabled={saving}
              className="w-full justify-center sm:w-auto"
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              {action === "perso" ? "Chiudi come perso" : action === "riapri" ? "Riapri" : "Salva esito"}
            </Button>
          </div>
        </div>
      ) : isActive ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
          <Button size="sm" variant="outline" onClick={() => openAction("trattativa")} className="w-full justify-center sm:w-auto">
            <MessageSquarePlus /> Ancora in trattativa
          </Button>
          <Button size="sm" variant="outline" onClick={() => openAction("perso")} className="w-full justify-center text-destructive sm:w-auto">
            <XCircle /> Perso
          </Button>
        </div>
      ) : isLost ? (
        <div>
          <Button size="sm" variant="outline" onClick={() => openAction("riapri")} className="w-full justify-center sm:w-auto">
            <RotateCcw /> Riapri
          </Button>
        </div>
      ) : null}

      {followUps.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            <History className="h-3.5 w-3.5" /> Storico
          </p>
          <ol className="flex flex-col gap-2">
            {followUps.map((entry) => {
              const Icon = KIND_ICON[entry.kind];
              return (
                <li key={entry.id} className="flex items-start gap-2 text-xs">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold text-foreground">{KIND_LABEL[entry.kind]}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {formatDate(entry.createdAt)}
                        {entry.createdBy ? ` · ${entry.createdByFullName}` : ""}
                        {entry.nextReminderAt ? ` · prossimo promemoria ${formatDate(entry.nextReminderAt)}` : ""}
                      </span>
                    </p>
                    {entry.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/85">{entry.note}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
