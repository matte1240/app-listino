"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { Anagrafica, Quotation, QuotationItem } from "@/types";

const VAT_RATE = 0.22;
const TABLE_BODY_AVAILABLE_MM = 134;
const MIN_FILLER_ROW_MM = 0;

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`).toLocaleDateString("it-IT");
}

function formatCurrency(value: number) {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUnitPrice(value: number) {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function discountedPrice(item: QuotationItem) {
  return item.prezzoListino * (1 - (item.sconto ?? 0) / 100);
}

function quotationTotal(quotation: Quotation) {
  return quotation.items.reduce((sum, item) => sum + discountedPrice(item) * item.qty, 0);
}

function displayDiscount(item: QuotationItem) {
  return item.sconto ? `${item.sconto}` : "*";
}

function estimateWrappedLines(value: string, charsPerLine: number) {
  const lines = value.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return 1;
  return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

function estimateItemRowHeightMm(item: QuotationItem) {
  const descriptionLines = estimateWrappedLines(item.descrizione, 46);
  const codeLines = estimateWrappedLines(item.codice, 22);
  const visibleLines = Math.max(descriptionLines, codeLines, 1);
  return 3 + visibleLines * 4.1;
}

function estimateNotesRowHeightMm(note: string) {
  if (!note.trim()) return 0;
  return 4 + (1 + estimateWrappedLines(note, 115)) * 4.1;
}

function quotationFillerHeightMm(quotation: Quotation) {
  const rowsHeight = quotation.items.reduce(
    (sum, item) => sum + estimateItemRowHeightMm(item),
    0
  );
  return Math.max(MIN_FILLER_ROW_MM, TABLE_BODY_AVAILABLE_MM - rowsHeight - estimateNotesRowHeightMm(quotation.note));
}

export default function QuotationPrintPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [customer, setCustomer] = useState<Anagrafica | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!params?.id || authLoading || !user) return;
    let ignore = false;

    fetch(`/api/quotations/${params.id}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Preventivo non trovato");
        return res.json();
      })
      .then((data) => {
        if (ignore) return;
        const loadedQuotation = data.quotation as Quotation;
        setQuotation(loadedQuotation);

        if (loadedQuotation.clienteId) {
          fetch(`/api/anagrafiche/${loadedQuotation.clienteId}`, { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((customerData) => {
              if (!ignore && customerData?.anagrafica) setCustomer(customerData.anagrafica as Anagrafica);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [params?.id, authLoading, user]);

  const total = useMemo(() => (quotation ? quotationTotal(quotation) : 0), [quotation]);
  const vatTotal = useMemo(() => total * VAT_RATE, [total]);
  const documentTotal = useMemo(() => total + vatTotal, [total, vatTotal]);
  const fillerHeightMm = useMemo(() => (quotation ? quotationFillerHeightMm(quotation) : 0), [quotation]);

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
    <div className="quotation-print-page min-h-dvh bg-background">
      <style jsx global>{`
        .quotation-print-page {
          background: #f0f2f5;
        }

        .metodo-sheet {
          width: 210mm;
          height: 297mm;
          box-sizing: border-box;
          margin: 0 auto;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 9.6pt;
          line-height: 1.12;
          padding: 9mm 6.8mm 6mm;
          overflow: hidden;
        }

        .company-header {
          display: grid;
          grid-template-columns: 86mm 1fr;
          column-gap: 5mm;
          min-height: 39mm;
        }

        .company-logo {
          display: block;
          width: 70mm;
          height: auto;
        }

        .company-legal {
          margin-top: 7mm;
          font-size: 7.3pt;
          line-height: 1.14;
        }

        .company-contacts {
          color: #008dcc;
        }

        .branches {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 3mm;
          font-size: 6.2pt;
          line-height: 1.11;
          padding-top: 0.4mm;
        }

        .branch-label {
          color: #008dcc;
          font-size: 5.6pt;
          font-weight: 700;
          margin-bottom: 0.8mm;
        }

        .branches p {
          overflow-wrap: normal;
        }

        .document-top {
          display: grid;
          grid-template-columns: 102mm 1fr;
          gap: 15mm;
          margin-top: 4mm;
          align-items: start;
        }

        .document-title {
          font-size: 12.5pt;
          font-weight: 800;
          margin: 0 0 0.8mm;
        }

        .meta-grid {
          border: 0.4mm solid #000;
          display: grid;
          grid-template-columns: 29mm 27mm 1fr;
        }

        .meta-cell {
          min-height: 7.2mm;
          border-right: 0.25mm solid #000;
          border-bottom: 0.25mm solid #000;
          padding: 0.45mm 1mm 0.65mm;
        }

        .meta-cell:nth-child(3n) {
          border-right: 0;
        }

        .meta-wide {
          grid-column: span 3;
        }

        .meta-two {
          grid-column: span 2;
        }

        .meta-label,
        .customer-label {
          display: block;
          font-size: 7.2pt;
          font-weight: 800;
          line-height: 1;
        }

        .meta-value {
          display: block;
          margin-top: 1.9mm;
          font-size: 9.8pt;
          font-weight: 800;
        }

        .meta-value-small {
          font-size: 8.7pt;
        }

        .destination-box {
          height: 7.5mm;
        }

        .customer-box {
          padding-top: 0.5mm;
          font-size: 9.6pt;
          font-weight: 800;
        }

        .customer-name {
          margin-top: 3mm;
          font-size: 11.2pt;
        }

        .customer-address {
          margin-top: 4.5mm;
          font-size: 10.5pt;
          line-height: 1.14;
        }

        .customer-vat {
          margin-top: 3.2mm;
          display: flex;
          gap: 7mm;
        }

        .customer-ref {
          margin-top: 4.5mm;
        }

        .page-number {
          margin-top: 5mm;
          text-align: right;
          font-size: 9.8pt;
          font-weight: 800;
        }

        .items-table {
          width: 100%;
          margin-top: 4mm;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 9.4pt;
        }

        .items-table th,
        .items-table td {
          border: 0.25mm solid #000;
          vertical-align: top;
        }

        .items-table th {
          height: 4.4mm;
          padding: 0.5mm 0.8mm;
          text-align: center;
          font-size: 8.8pt;
          font-weight: 800;
          white-space: nowrap;
        }

        .items-table td {
          padding: 1.5mm 1mm;
          overflow-wrap: break-word;
        }

        .code-col { width: 43mm; }
        .description-col { width: 71mm; }
        .um-col { width: 8mm; }
        .qty-col { width: 16mm; }
        .price-col { width: 18mm; }
        .discount-col { width: 14mm; }
        .amount-col { width: 18mm; }
        .vat-col { width: 8mm; }

        .code-cell {
          word-break: break-word;
          overflow-wrap: anywhere;
          padding-right: 1.6mm;
        }

        .discount-header {
          white-space: nowrap;
          font-size: 8.2pt;
        }

        .text-right {
          text-align: right;
        }

        .description-lines {
          white-space: pre-line;
          line-height: 1.22;
        }

        .filler-row td {
          height: var(--quotation-filler-height);
          padding: 0;
          border-top: 0;
        }

        .notes-row td {
          padding: 1.3mm 1.2mm;
          font-size: 9.2pt;
          line-height: 1.22;
        }

        .notes-label {
          display: block;
          margin-bottom: 0.8mm;
          font-weight: 800;
        }

        .notes-content {
          margin: 0;
          white-space: pre-wrap;
        }

        .totals-row td {
          height: 11mm;
          padding: 0.9mm 1.1mm;
          font-size: 8.8pt;
          font-weight: 800;
          vertical-align: middle;
        }

        .totals-label {
          display: block;
          margin-bottom: 2mm;
        }

        .totals-currency {
          margin-right: 5mm;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          html,
          body {
            background: white !important;
          }

          .quotation-print-page {
            background: white !important;
          }

          .quotation-print-main {
            padding: 0 !important;
          }

          .metodo-sheet {
            width: 210mm !important;
            height: 297mm !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <main className="quotation-print-main px-3 sm:px-4 py-5 md:py-8">
        <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold">Preventivo {quotation.numero}</h1>
            <p className="text-sm text-muted-foreground">Layout A4 stile Metodo, pronto per il salvataggio in PDF.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={() => router.push(`/quotations/${quotation.id}`)} className="gap-2 w-full justify-center sm:w-auto">
              <ArrowLeft className="h-4 w-4" />
              Dettaglio
            </Button>
            <Button onClick={() => window.print()} className="gap-2 w-full justify-center sm:w-auto">
              <Printer className="h-4 w-4" />
              Esporta PDF
            </Button>
          </div>
        </div>

        <section className="metodo-sheet shadow-sm">
          <header className="company-header">
            <div>
              <Image
                src="/logo.svg"
                alt="IVICOLORS"
                width={257}
                height={52}
                className="company-logo"
                priority
              />
              <p className="company-legal">
                <strong>IVICOLORS S.R.L.</strong> Cap Soc. € 350.000,00 i.v. — REA n° 38503<br />
                CCIAA PN — Reg.Impr. PN/CF e P.IVA IT 00387760937 —<br />
                codice destinatario: W4KYJ8V<br />
                <span className="company-contacts">pec@pec.ivicolors.it — info@ivicolors.it — www.ivicolors.it</span>
              </p>
            </div>
            <div className="branches">
              <div>
                <p className="branch-label">Sede</p>
                <p><strong>33170 PORDENONE</strong><br />Viale Venezia, 69<br />0434.552886<br />0434.550254</p>
              </div>
              <div>
                <p className="branch-label">Filiali</p>
                <p><strong>33100 UDINE</strong><br />Via Civinina, 23<br />0432.480761<br />0432.851577</p>
              </div>
              <div>
                <p className="branch-label">&nbsp;</p>
                <p><strong>30025 FOSSALTA DI<br />PORTOGRUARO (VE)</strong><br />Via Manzoni, 15/A<br />0421.244079</p>
              </div>
              <div>
                <p className="branch-label">&nbsp;</p>
                <p><strong>34145 TRIESTE</strong><br />Piazzale dei Legnami, 1<br />040.828216</p>
              </div>
            </div>
          </header>

          <section className="document-top">
            <div>
              <h2 className="document-title">Preventivo VALIDO {quotation.validitaGiorni} GIORNI</h2>
              <div className="meta-grid">
                <div className="meta-cell">
                  <span className="meta-label">N.Preventivo</span>
                  <span className="meta-value meta-value-small">{quotation.numero}</span>
                </div>
                <div className="meta-cell">
                  <span className="meta-label">Data Preventivo</span>
                  <span className="meta-value meta-value-small">{formatDate(quotation.dataPreventivo)}</span>
                </div>
                <div className="meta-cell">
                  <span className="meta-label">Agente</span>
                  <span className="meta-value meta-value-small">{quotation.agenteFullName || quotation.agente || "*"}</span>
                </div>
                <div className="meta-cell meta-wide">
                  <span className="meta-label">Condizioni di Pagamento</span>
                  <span className="meta-value">Secondo accordi commerciali</span>
                </div>
                <div className="meta-cell meta-two">
                  <span className="meta-label">Banca d&apos;appoggio</span>
                  <span className="meta-value">&nbsp;</span>
                </div>
                <div className="meta-cell">
                  <span className="meta-label">ABI/CAB</span>
                  <span className="meta-value">&nbsp;</span>
                </div>
                <div className="meta-cell">
                  <span className="meta-label">Consegna prevista</span>
                  <span className="meta-value meta-value-small">{quotation.dataConsegnaPrevista ? formatDate(quotation.dataConsegnaPrevista) : "-"}</span>
                </div>
                <div className="meta-cell">
                  <span className="meta-label">Telefono</span>
                  <span className="meta-value">&nbsp;</span>
                </div>
                <div className="meta-cell">
                  <span className="meta-label">Fax</span>
                  <span className="meta-value">&nbsp;</span>
                </div>
                <div className="meta-cell meta-wide destination-box">
                  <span className="meta-label">Destinazione diversa</span>
                </div>
              </div>
            </div>

            <div className="customer-box">
              <span className="customer-label">Spettabile</span>
              <p className="customer-name">{customer?.ragioneSociale || quotation.cliente}</p>
              {(customer?.indirizzo || customer?.capCitta) && (
                <p className="customer-address">
                  {customer?.indirizzo && <>{customer.indirizzo}<br /></>}
                  {customer?.capCitta}
                </p>
              )}
              {customer?.partitaIva && (
                <p className="customer-vat"><span>P.I.</span><span>{customer.partitaIva}</span></p>
              )}
              <p className="customer-ref">Alla C.A.</p>
              <p className="customer-ref">Ns. Rif.: <span>{quotation.numero}</span></p>
              <p className="page-number">Pagina N. &nbsp;&nbsp;&nbsp;&nbsp; 1</p>
            </div>
          </section>

          <table className="items-table">
            <colgroup>
              <col className="code-col" />
              <col className="description-col" />
              <col className="um-col" />
              <col className="qty-col" />
              <col className="price-col" />
              <col className="discount-col" />
              <col className="amount-col" />
              <col className="vat-col" />
            </colgroup>
            <thead>
              <tr>
                <th>Codice Art.</th>
                <th>Descrizione</th>
                <th>U.M.</th>
                <th>Quantita&apos;</th>
                <th>Prezzo</th>
                <th className="discount-header">% Scon.</th>
                <th>Importo</th>
                <th>Iva</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item, index) => {
                const rowPrice = discountedPrice(item);
                return (
                  <tr key={`${item.codice}-${index}`}>
                    <td className="code-cell">{item.codice}</td>
                    <td className="description-lines">{item.descrizione}</td>
                    <td>{item.um}</td>
                    <td className="text-right">{item.qty % 1 === 0 ? item.qty : item.qty.toLocaleString("it-IT")}</td>
                    <td className="text-right">{formatUnitPrice(item.prezzoListino)}</td>
                    <td className="text-right">{displayDiscount(item)}</td>
                    <td className="text-right">{formatCurrency(rowPrice * item.qty)}</td>
                    <td className="text-right">22</td>
                  </tr>
                );
              })}
              {quotation.note.trim() && (
                <tr className="notes-row">
                  <td colSpan={8}>
                    <span className="notes-label">Note</span>
                    <p className="notes-content">{quotation.note.trim()}</p>
                  </td>
                </tr>
              )}
              <tr className="filler-row" aria-hidden="true" style={{ "--quotation-filler-height": `${fillerHeightMm}mm` } as CSSProperties}>
                <td />
                <td />
                <td />
                <td />
                <td />
                <td />
                <td />
                <td />
              </tr>
              <tr className="totals-row">
                <td colSpan={2} style={{ borderLeft: 0, borderBottom: 0 }} />
                <td colSpan={2}>
                  <span className="totals-label">Totale imponibile</span>
                  <span>{formatCurrency(total)}</span>
                </td>
                <td colSpan={2}>
                  <span className="totals-label">Totale iva</span>
                  <span>{formatCurrency(vatTotal)}</span>
                </td>
                <td colSpan={2}>
                  <span className="totals-label">Totale Documento</span>
                  <span className="totals-currency">EUR</span>
                  <span>{formatCurrency(documentTotal)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}