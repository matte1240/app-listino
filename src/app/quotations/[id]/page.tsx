"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Clock, FileText, Package, Pencil, Printer, ShoppingCart, Trash2, Truck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { Quotation, QuotationItem } from "@/types";

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function discountedPrice(item: QuotationItem) {
  return item.prezzoListino * (1 - (item.sconto ?? 0) / 100);
}

function quotationTotal(quotation: Quotation) {
  return quotation.items.reduce((sum, item) => sum + discountedPrice(item) * item.qty, 0);
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
                <h1 className="text-lg font-bold">Preventivo {quotation.numero}</h1>
                <Badge variant="outline">{formatDate(quotation.dataPreventivo)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{quotation.cliente}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="gap-2" onClick={() => router.push(`/orders/new?fromQuotationId=${quotation.id}`)}>
              <ShoppingCart className="h-4 w-4" />
              Trasforma in ordine
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => router.push(`/quotations/${quotation.id}/print`)}>
              <Printer className="h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => router.push(`/quotations/${quotation.id}/edit`)}>
              <Pencil className="h-4 w-4" />
              Modifica
            </Button>
            <Button variant="destructive" className="gap-2" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4" />
              Elimina
            </Button>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <Badge className="ml-auto rounded-full px-2.5 text-xs">{quotation.items.length}</Badge>
          </div>
          <div className="divide-y divide-border/60">
            {quotation.items.map((item) => (
              <div key={item.codice} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-xs font-bold font-mono text-foreground">{item.codice}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.descrizione}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs sm:justify-end">
                  <span className="font-bold text-foreground">{item.qty}</span>
                  <span className="text-muted-foreground">{item.um}</span>
                  <span>{formatCurrency(item.prezzoListino)}</span>
                  {(item.sconto ?? 0) > 0 && <span className="bg-primary/10 text-primary rounded px-1 font-semibold">-{item.sconto}%</span>}
                  <span className="font-semibold text-foreground">{formatCurrency(discountedPrice(item) * item.qty)}</span>
                </div>
              </div>
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