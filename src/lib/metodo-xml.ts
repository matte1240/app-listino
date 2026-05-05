import type { Order } from "@/types";
import { getDb } from "@/lib/db";

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDateItalian(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(4);
  return fixed.replace(/\.?0+$/, "") || "0";
}

export interface BuildMetodoOrderXmlInput {
  order: Order;
  codiceCliente: string;
}

export function buildMetodoOrderXml({ order, codiceCliente }: BuildMetodoOrderXmlInput): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<dati>");
  lines.push("  <testa>");
  lines.push(`    <numana>${escapeXmlText(codiceCliente)}</numana>`);

  const dataDoc = formatDateItalian(order.createdAt);
  if (dataDoc) lines.push(`    <data>${dataDoc}</data>`);

  const dataCons = formatDateItalian(order.dataConsegna);
  if (dataCons) lines.push(`    <datacons>${dataCons}</datacons>`);

  lines.push(`    <riferimento>${escapeXmlText(`Ordine app #${order.id}`)}</riferimento>`);

  if (order.luogoConsegna) {
    lines.push(`    <destdiv1>${escapeXmlText(order.luogoConsegna)}</destdiv1>`);
  }
  lines.push("  </testa>");

  lines.push("  <righe>");
  for (const item of order.items) {
    const attrs: string[] = [];
    attrs.push(`codice="${escapeXmlAttr(item.codice)}"`);
    if (item.descrizione) attrs.push(`descr="${escapeXmlAttr(item.descrizione)}"`);
    if (item.um) attrs.push(`um="${escapeXmlAttr(item.um)}"`);
    attrs.push(`quant="${formatNumber(item.qty)}"`);
    attrs.push(`prezzo="${formatNumber(item.prezzoListino)}"`);
    if (item.sconto && item.sconto > 0) {
      attrs.push(`sconto1="${formatNumber(item.sconto)}"`);
    }
    lines.push(`    <riga ${attrs.join(" ")}/>`);
  }
  lines.push("  </righe>");
  lines.push("</dati>");
  return lines.join("\n");
}

export type MetodoXmlResult =
  | { ok: true; xml: string; filename: string }
  | { ok: false; reason: "no_cliente" | "no_codice_anagrafica" };

export function buildMetodoOrderXmlForOrder(order: Order): MetodoXmlResult {
  if (!order.clienteId) {
    return { ok: false, reason: "no_cliente" };
  }

  const db = getDb();
  const anagrafica = db
    .prepare("SELECT codice FROM anagrafiche WHERE id = ?")
    .get(order.clienteId) as { codice: string | null } | undefined;

  if (!anagrafica?.codice) {
    return { ok: false, reason: "no_codice_anagrafica" };
  }

  const codici = Array.from(new Set(order.items.map((i) => i.codice).filter(Boolean)));
  let itemsForXml = order.items;
  if (codici.length > 0) {
    const placeholders = codici.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT codice, descrizione FROM materials WHERE codice IN (${placeholders})`)
      .all(...codici) as Array<{ codice: string; descrizione: string }>;
    const descrByCodice = new Map(rows.map((r) => [r.codice, r.descrizione]));
    itemsForXml = order.items.map((item) => {
      const original = descrByCodice.get(item.codice);
      return original ? { ...item, descrizione: original } : item;
    });
  }

  const xml = buildMetodoOrderXml({
    order: { ...order, items: itemsForXml },
    codiceCliente: anagrafica.codice,
  });

  return { ok: true, xml, filename: `ordine-metodo-${order.id}.xml` };
}
