"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2, Clock, FileText, Hourglass, MapPin, Package, Pencil, Printer, ShieldAlert, ShoppingCart, Trash2, Truck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import OrderLineRow from "@/components/OrderLineRow";
import { countArticleLines } from "@/lib/order-lines";
import { calculateOrderDiscountedTotal, formatOrderCurrency } from "@/lib/order-totals";
import type { Quotation } from "@/types";

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const formatCurrency = formatOrderCurrency;

function quotationTotal(quotation: Quotation) {
  return calculateOrderDiscountedTotal(quotation.items);
}

export default function QuotationDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!params?.id || authLoading || !user) return;
    setLoading(true);
    fetch(`/api/quotations/${params.id}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Preventivo non trovato");
        return res.json();
      })
      .then((data) => setQuotation(data.quotation as Quotation))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params?.id, authLoading, user]);

  async function handleDelete() {
    if (!quotation) return;
    if (!window.confirm(`Vuoi eliminare il preventivo ${quotation.numero}?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Errore nella cancellazione del preventivo");
        return;
      }
      router.push("/quotations");
    } finally {
      setDeleting(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-destructive">{error ?? "Preventivo non trovato"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => router.push("/quotations")} aria-label="Torna ai preventivi">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl leading-tight font-bold">Preventivo {quotation.numero}</h1>
                <Badge variant="outline">{formatDate(quotation.dataPreventivo)}</Badge>
                {quotation.status === "convertito" && <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Ordine creato</Badge>}
                {quotation.status === "in_approvazione" && (
                  <Badge variant="outline" className="gap-1 text-orange-700 border-orange-300 bg-orange-50"><Hourglass className="h-3.5 w-3.5" /> In approvazione</Badge>
                )}
                {quotation.status === "rifiutato" && (
                  <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50"><ShieldAlert className="h-3.5 w-3.5" /> Rifiutato</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{quotation.cliente}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {quotation.status === "convertito" && quotation.convertedOrderId ? (
              <Button className="gap-2" onClick={() => router.push(`/orders`)}>
                <ShoppingCart className="h-4 w-4" />
                Apri ordine
              </Button>
            ) : quotation.status === "attivo" ? (
              <Button className="gap-2" onClick={() => router.push(`/orders/new?fromQuotationId=${quotation.id}`)}>
                <ShoppingCart className="h-4 w-4" />
                Trasforma in ordine
              </Button>
            ) : null}
            {(quotation.status === "attivo" || quotation.status === "convertito" || user?.role === "admin") && (
              <Button variant="outline" className="gap-2" onClick={() => router.push(`/quotations/${quotation.id}/print`)}>
                <Printer className="h-4 w-4" />
                PDF
              </Button>
            )}
            {quotation.status !== "convertito" && (
              <Button variant="outline" className="gap-2" onClick={() => router.push(`/quotations/${quotation.id}/edit`)}>
                <Pencil className="h-4 w-4" />
                Modifica
              </Button>
            )}
            <Button variant="destructive" className="gap-2" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4" />
              Elimina
            </Button>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="font-semibold text-sm truncate">{quotation.cliente}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data</p>
              <p className="font-semibold text-sm">{formatDate(quotation.dataPreventivo)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Consegna</p>
              <p className="font-semibold text-sm">{quotation.dataConsegnaPrevista ? formatDate(quotation.dataConsegnaPrevista) : "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Destinazione cantiere</p>
              <p className="font-semibold text-sm truncate" title={quotation.luogoConsegna || undefined}>{quotation.luogoConsegna || "Stessa del cliente"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Validità</p>
              <p className="font-semibold text-sm">{quotation.validitaGiorni} giorni</p>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Totale</p>
              <p className="font-semibold text-sm">{formatCurrency(quotationTotal(quotation))}</p>
            </div>
          </div>
        </section>

        {quotation.status === "in_approvazione" && (
          <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 flex items-start gap-2">
            <Hourglass className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Il preventivo contiene sconti liberi ed è in attesa di approvazione di un amministratore
              {quotation.approvalRequestedAt ? ` (richiesta il ${formatDate(quotation.approvalRequestedAt)})` : ""}. PDF e trasformazione in ordine saranno disponibili dopo l&apos;approvazione.
            </span>
          </section>
        )}
        {quotation.status === "rifiutato" && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Rifiutato{quotation.approvalDecidedBy ? ` da ${quotation.approvalDecidedBy}` : ""}:</strong> {quotation.approvalNote || "nessuna motivazione"}. Modifica gli sconti e salva per una nuova valutazione.
            </span>
          </section>
        )}

        {quotation.note && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Note</p>
            <p className="text-sm whitespace-pre-wrap">{quotation.note}</p>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Articoli</span>
            <Badge className="ml-auto rounded-full px-2.5 text-xs">{countArticleLines(quotation.items)}</Badge>
          </div>
          <div className="divide-y divide-border/60">
            {quotation.items.map((item, index) => (
              <OrderLineRow key={item.id ?? `${item.codice}-${index}`} item={item} variant="quotation" />
            ))}
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between text-sm">
            <span className="font-semibold">Totale imponibile</span>
            <span className="font-bold text-base">{formatCurrency(quotationTotal(quotation))}</span>
          </div>
        </section>
      </main>
    </div>
  );
}