import nodemailer from "nodemailer";
import type { Order, OrderHistoryItem } from "@/types";
import { getDb } from "@/lib/db";
import { buildMetodoOrderXmlForOrder } from "@/lib/metodo-xml";
import { getLineType, lineRequiresApproval } from "@/lib/order-lines";
import {
  computeOrderDiff,
  orderDiffHasChanges,
  type ItemFieldChange,
  type ModifiedItem,
  type OrderDiff,
  type PreviousOrderSnapshot,
} from "@/lib/order-diff";
import {
  calculateOrderDiscountedTotal,
  formatOrderCurrency,
  formatScontoLabel,
  getDiscountedUnitPrice,
} from "@/lib/order-totals";

export type { PreviousOrderSnapshot } from "@/lib/order-diff";

const APP_NAME = "Ordini Ivicolors";

type MailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

function buildMetodoXmlAttachments(order: Order): MailAttachment[] | undefined {
  const result = buildMetodoOrderXmlForOrder(order);
  if (!result.ok) {
    console.warn(`[mail] XML Metodo non allegato per ordine #${order.id}: ${result.reason}`);
    return undefined;
  }
  return [
    {
      filename: result.filename,
      content: result.xml,
      contentType: "application/xml; charset=utf-8",
    },
  ];
}

interface BranchEmail {
  magazzino: string;
  email_to: string;
  email_cc: string;
}

function getBranchEmail(magazzino: string): { to: string; cc: string } {
  const db = getDb();
  const row = db.prepare("SELECT * FROM branch_emails WHERE magazzino = ?").get(magazzino) as BranchEmail | undefined;
  const fallback = process.env.ORDER_EMAIL_TO ?? "";
  return {
    to: row?.email_to || fallback,
    cc: row?.email_cc || "",
  };
}

let _transporter: nodemailer.Transporter | null = null;

export function getMailFromValue(): { name: string; address: string } {
  return {
    name: process.env.GMAIL_FROM_NAME?.trim() || APP_NAME,
    address: process.env.GMAIL_FROM_ALIAS?.trim() || process.env.GMAIL_USER?.trim() || "",
  };
}

export function isMailConfigured(): boolean {
  return !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD;
}

export function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return _transporter;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function buildGoogleMapsSearchUrl(address?: string): string | null {
  const query = (address ?? "").trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function sanitizeSubjectPart(value: string | undefined): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned || "N/D";
}

function buildOrderSubject(order: Order, mode: "new" | "updated" | "cancelled"): string {
  const prefix =
    mode === "updated"
      ? "Ordine Modificato"
      : mode === "cancelled"
        ? "Ordine Cancellato"
        : "Nuovo Ordine";

  const cliente = sanitizeSubjectPart(order.cliente);
  const cantiere = sanitizeSubjectPart(order.luogoConsegna);
  return `${prefix} #${order.id} // ${cliente} // ${cantiere}`;
}

function parseEmailList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildCcValue(branchCc?: string, agenteEmail?: string): string | undefined {
  const unique = new Set<string>();
  const ordered: string[] = [];

  for (const email of [...parseEmailList(branchCc), ...parseEmailList(agenteEmail)]) {
    const key = email.toLowerCase();
    if (!unique.has(key)) {
      unique.add(key);
      ordered.push(email);
    }
  }

  return ordered.length > 0 ? ordered.join(", ") : undefined;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CELL_BORDER = "border:1px solid #cccccc;padding:6px;";

/** Riga nota: occupa tutte le colonne della tabella. */
function renderCommentRow(item: OrderHistoryItem, extra: { bg?: string; badge?: string; decoration?: string } = {}): string {
  const bg = extra.bg ?? "#f6f8fa";
  const decoration = extra.decoration ?? "";
  return `
      <tr>
        <td colspan="7" style="${CELL_BORDER}background:${bg};font-style:italic;color:#333333;${decoration}">${extra.badge ? `${extra.badge}<br/>` : ""}<strong>Nota:</strong> ${escapeHtml(item.descrizione).replace(/\n/g, "<br/>")}</td>
      </tr>`;
}

function renderItemRow(
  item: OrderHistoryItem,
  extra: { bg?: string; badge?: string; decoration?: string } = {},
): string {
  if (getLineType(item) === "commento") return renderCommentRow(item, extra);

  const bg = extra.bg ?? "#ffffff";
  const decoration = extra.decoration ?? "";
  const prezzoEffettivo = getDiscountedUnitPrice(item);
  const scontoCell = item.sconto && item.sconto > 0 ? `<strong>${formatScontoLabel(item.sconto)}</strong>` : `—`;
  const cell = `${CELL_BORDER}background:${bg};${decoration}`;
  const isTrasporto = getLineType(item) === "trasporto";
  const descrizione = isTrasporto ? `<strong>${escapeHtml(item.descrizione)}</strong>` : escapeHtml(item.descrizione);
  return `
      <tr>
        <td style="${cell}text-align:left">${extra.badge ? `${extra.badge}<br/>` : ""}${escapeHtml(item.codice)}</td>
        <td style="${cell}text-align:left">${descrizione}</td>
        <td style="${cell}text-align:center">${escapeHtml(item.um ?? "")}</td>
        <td style="${cell}text-align:center">${item.qty}</td>
        <td style="${cell}text-align:right">EUR ${item.prezzoListino.toFixed(2)}</td>
        <td style="${cell}text-align:center">${scontoCell}</td>
        <td style="${cell}text-align:right">EUR ${prezzoEffettivo.toFixed(2)}</td>
      </tr>`;
}

function renderDiffItemRow(
  item: OrderHistoryItem,
  kind: "added" | "removed" | "unchanged",
): string {
  const bg =
    kind === "added" ? "#e6ffed" : kind === "removed" ? "#ffeef0" : getLineType(item) === "commento" ? "#f6f8fa" : "#ffffff";
  const badge =
    kind === "added"
      ? '<span style="color:#22863a;font-weight:bold;">+ AGGIUNTO</span>'
      : kind === "removed"
        ? '<span style="color:#b31d28;font-weight:bold;">− RIMOSSO</span>'
        : "";
  const decoration = kind === "removed" ? "text-decoration:line-through;color:#6a737d;" : "";
  return renderItemRow(item, { bg, badge, decoration });
}

function renderDiffModifiedRow(mod: ModifiedItem): string {
  const bg = "#fff5b1";
  const cell = `${CELL_BORDER}background:${bg};`;
  const after = mod.after;
  const changedFields = new Set(mod.changes.map((c) => c.field));
  const fmtCell = (field: ItemFieldChange["field"], current: string): string => {
    const change = mod.changes.find((c) => c.field === field);
    if (!change) return current;
    return `<span style="color:#b31d28;text-decoration:line-through;">${escapeHtml(change.before)}</span> &rarr; <strong>${escapeHtml(change.after)}</strong>`;
  };

  if (getLineType(after) === "commento") {
    return `
      <tr>
        <td colspan="7" style="${cell}font-style:italic;"><span style="color:#b08800;font-weight:bold;">~ MODIFICATO</span><br/><strong>Nota:</strong> ${fmtCell("descrizione", escapeHtml(after.descrizione))}</td>
      </tr>`;
  }

  const listPriceCellContent = changedFields.has("prezzoListino")
    ? fmtCell("prezzoListino", "")
    : `EUR ${after.prezzoListino.toFixed(2)}`;
  const scontoCellContent = changedFields.has("sconto")
    ? fmtCell("sconto", "")
    : formatScontoLabel(after.sconto);

  const nettoBefore = getDiscountedUnitPrice(mod.before);
  const nettoAfter = getDiscountedUnitPrice(mod.after);
  const nettoChanged = Math.abs(nettoBefore - nettoAfter) > 0.005;
  const nettoCellContent = nettoChanged
    ? `<span style="color:#b31d28;text-decoration:line-through;">EUR ${nettoBefore.toFixed(2)}</span> &rarr; <strong>EUR ${nettoAfter.toFixed(2)}</strong>`
    : `EUR ${nettoAfter.toFixed(2)}`;

  return `
      <tr>
        <td style="${cell}text-align:left"><span style="color:#b08800;font-weight:bold;">~ MODIFICATO</span><br/>${escapeHtml(after.codice)}</td>
        <td style="${cell}text-align:left">${changedFields.has("descrizione") ? fmtCell("descrizione", "") : escapeHtml(after.descrizione)}</td>
        <td style="${cell}text-align:center">${changedFields.has("um") ? fmtCell("um", "") : escapeHtml(after.um ?? "")}</td>
        <td style="${cell}text-align:center">${changedFields.has("qty") ? fmtCell("qty", "") : after.qty}</td>
        <td style="${cell}text-align:right">${listPriceCellContent}</td>
        <td style="${cell}text-align:center">${scontoCellContent}</td>
        <td style="${cell}text-align:right">${nettoCellContent}</td>
      </tr>`;
}

function renderDiffSection(diff: OrderDiff): string {
  if (!orderDiffHasChanges(diff)) {
    return `<tr><td style="padding:8px 0;color:#6a737d;"><em>Nessuna differenza rilevata rispetto alla versione precedente.</em></td></tr>`;
  }

  const headerRows = diff.headerChanges
    .map(
      (c) => `
      <tr>
        <td style="${CELL_BORDER}background:#f6f8fa;"><strong>${escapeHtml(c.label)}</strong></td>
        <td style="${CELL_BORDER}color:#b31d28;text-decoration:line-through;">${escapeHtml(c.before || "—")}</td>
        <td style="${CELL_BORDER}color:#22863a;"><strong>${escapeHtml(c.after || "—")}</strong></td>
      </tr>`
    )
    .join("");

  const headerSection = diff.headerChanges.length > 0
    ? `<tr><td style="padding:6px 0 4px 0;font-weight:bold;">Modifiche intestazione</td></tr>
       <tr><td style="padding:0 0 12px 0;">
         <table role="table" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
           <thead>
             <tr>
               <th style="${CELL_BORDER}text-align:left;background:#f2f2f2;">Campo</th>
               <th style="${CELL_BORDER}text-align:left;background:#f2f2f2;">Prima</th>
               <th style="${CELL_BORDER}text-align:left;background:#f2f2f2;">Dopo</th>
             </tr>
           </thead>
           <tbody>${headerRows}</tbody>
         </table>
       </td></tr>`
    : "";

  const reorderedSection = diff.reordered
    ? `<tr><td style="padding:0 0 10px 0;color:#b08800;"><strong>L'ordine delle righe è stato modificato.</strong></td></tr>`
    : "";

  return headerSection + reorderedSection;
}

/**
 * Righe della tabella in modalità "modificato": segue l'ordine attuale dell'ordine,
 * poi accoda le righe rimosse.
 */
function buildDiffItemsRows(order: Order, diff: OrderDiff): string {
  const modifiedByAfter = new Map(diff.modified.map((m) => [m.after, m]));
  const added = new Set(diff.added);
  const rows: string[] = [];
  for (const item of order.items) {
    const mod = modifiedByAfter.get(item);
    if (mod) rows.push(renderDiffModifiedRow(mod));
    else if (added.has(item)) rows.push(renderDiffItemRow(item, "added"));
    else rows.push(renderDiffItemRow(item, "unchanged"));
  }
  for (const r of diff.removed) rows.push(renderDiffItemRow(r, "removed"));
  return rows.join("");
}

function buildOrderHtml(
  order: Order,
  mode: "new" | "updated" | "cancelled" = "new",
  diff?: OrderDiff,
): string {
  const title =
    mode === "updated"
      ? `Ordine Modificato #${order.id}`
      : mode === "cancelled"
        ? `Ordine Cancellato #${order.id}`
        : `Nuovo Ordine #${order.id}`;

  const totalImponibile = calculateOrderDiscountedTotal(order.items);
  const mapsUrl = buildGoogleMapsSearchUrl(order.luogoConsegna);
  const agenteDisplayName = order.agenteFullName || order.agente;
  const rows = mode === "updated" && diff
    ? buildDiffItemsRows(order, diff)
    : order.items.map((item) => renderItemRow(item)).join("");

  return `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:12px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:700px;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="padding:8px 0 12px 0;font-size:20px;font-weight:bold;">${title}</td>
    </tr>
    <tr>
      <td style="padding:0 0 10px 0;">Data ordine: ${formatDate(order.createdAt)}</td>
    </tr>
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr><td style="padding:3px 0;"><strong>Cliente:</strong> ${escapeHtml(order.cliente)}</td></tr>
          <tr><td style="padding:3px 0;"><strong>Magazzino:</strong> ${escapeHtml(order.magazzino)}</td></tr>
          <tr><td style="padding:3px 0;"><strong>Agente:</strong> ${escapeHtml(agenteDisplayName)}</td></tr>
          ${order.luogoConsegna ? `<tr><td style="padding:3px 0;"><strong>Luogo consegna:</strong> ${escapeHtml(order.luogoConsegna)}</td></tr>` : ""}
          ${mapsUrl ? `<tr><td style="padding:3px 0;"><strong>Google Maps:</strong> <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Apri indirizzo cantiere</a></td></tr>` : ""}
          ${order.dataConsegna ? `<tr><td style="padding:3px 0;"><strong>Data consegna:</strong> ${formatDate(order.dataConsegna)}</td></tr>` : ""}
          ${order.note ? `<tr><td style="padding:3px 0;"><strong>Note:</strong> ${escapeHtml(order.note)}</td></tr>` : ""}
        </table>
      </td>
    </tr>
    ${mode === "updated" && diff ? renderDiffSection(diff) : ""}
    ${
      mode === "cancelled"
        ? `<tr><td style="padding:8px 0 16px 0;"><strong>Questo ordine e stato cancellato.</strong></td></tr>`
        : `<tr>
      <td style="padding:0 0 8px 0;">
        ${mode === "updated" && diff ? `<div style="font-weight:bold;padding:6px 0 4px 0;">Righe ordine (verde = aggiunto, rosso = rimosso, giallo = modificato)</div>` : ""}
        <table role="table" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th style="${CELL_BORDER}text-align:left;background:#f2f2f2;">Codice</th>
              <th style="${CELL_BORDER}text-align:left;background:#f2f2f2;">Descrizione</th>
              <th style="${CELL_BORDER}text-align:center;background:#f2f2f2;">UM</th>
              <th style="${CELL_BORDER}text-align:center;background:#f2f2f2;">Quantità</th>
              <th style="${CELL_BORDER}text-align:right;background:#f2f2f2;">Prezzo di listino</th>
              <th style="${CELL_BORDER}text-align:center;background:#f2f2f2;">Sconto</th>
              <th style="${CELL_BORDER}text-align:right;background:#f2f2f2;">Netto</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td colspan="6" style="${CELL_BORDER}"><strong>Totale imponibile</strong></td>
              <td style="${CELL_BORDER}text-align:right;"><strong>${formatOrderCurrency(totalImponibile)}</strong></td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>`
    }
    <tr>
      <td style="padding-top:12px;font-size:12px;color:#444444;">Email generata automaticamente da ${APP_NAME}.</td>
    </tr>
  </table>
</body>
</html>`;
}

function formatItemTextLine(item: OrderHistoryItem, prefix: string): string {
  if (getLineType(item) === "commento") {
    return `${prefix} NOTA: ${item.descrizione.replace(/\s*\n\s*/g, " / ")}`;
  }
  const prezzoEffettivo = getDiscountedUnitPrice(item);
  return `${prefix} ${item.codice} | ${item.descrizione} | UM: ${item.um || "—"} | Qta: ${item.qty} | Listino: EUR ${item.prezzoListino.toFixed(2)} | Sconto: ${formatScontoLabel(item.sconto)} | Netto: EUR ${prezzoEffettivo.toFixed(2)}`;
}

function buildOrderText(
  order: Order,
  mode: "new" | "updated" | "cancelled" = "new",
  diff?: OrderDiff,
): string {
  const title =
    mode === "updated"
      ? `Ordine Modificato #${order.id}`
      : mode === "cancelled"
        ? `Ordine Cancellato #${order.id}`
        : `Nuovo Ordine #${order.id}`;

  const lines: string[] = [
    title,
    `Data ordine: ${formatDate(order.createdAt)}`,
    `Cliente: ${order.cliente}`,
    `Magazzino: ${order.magazzino}`,
    `Agente: ${order.agenteFullName || order.agente}`,
  ];
  const mapsUrl = buildGoogleMapsSearchUrl(order.luogoConsegna);

  if (order.luogoConsegna) lines.push(`Luogo consegna: ${order.luogoConsegna}`);
  if (mapsUrl) lines.push(`Google Maps: ${mapsUrl}`);
  if (order.dataConsegna) lines.push(`Data consegna: ${formatDate(order.dataConsegna)}`);
  if (order.note) lines.push(`Note: ${order.note}`);

  if (mode === "cancelled") {
    lines.push("", "Questo ordine e stato cancellato.");
    lines.push("", `Email generata automaticamente da ${APP_NAME}.`);
    return lines.join("\n");
  }

  if (mode === "updated" && diff) {
    if (diff.headerChanges.length > 0) {
      lines.push("", "Modifiche intestazione:");
      for (const c of diff.headerChanges) {
        lines.push(`  ${c.label}: "${c.before || "—"}" -> "${c.after || "—"}"`);
      }
    }
    if (diff.reordered) {
      lines.push("", "L'ordine delle righe e stato modificato.");
    }

    lines.push("", "Righe ordine (legenda: + aggiunto, - rimosso, ~ modificato, =  invariato):");
    const modifiedByAfter = new Map(diff.modified.map((m) => [m.after, m]));
    const added = new Set(diff.added);
    for (const item of order.items) {
      const mod = modifiedByAfter.get(item);
      if (mod) {
        lines.push(formatItemTextLine(mod.after, "~"));
        for (const ch of mod.changes) {
          lines.push(`    ${ch.field}: "${ch.before}" -> "${ch.after}"`);
        }
      } else if (added.has(item)) {
        lines.push(formatItemTextLine(item, "+"));
      } else {
        lines.push(formatItemTextLine(item, "="));
      }
    }
    for (const r of diff.removed) lines.push(formatItemTextLine(r, "-"));

    if (!orderDiffHasChanges(diff)) {
      lines.push("(nessuna differenza rilevata rispetto alla versione precedente)");
    }
  } else {
    lines.push("", "Righe ordine:");
    for (const item of order.items) {
      lines.push(formatItemTextLine(item, "-"));
    }
  }
  lines.push(`Totale imponibile: ${formatOrderCurrency(calculateOrderDiscountedTotal(order.items))}`);
  lines.push("", `Email generata automaticamente da ${APP_NAME}.`);

  return lines.join("\n");
}

export async function sendOrderEmail(order: Order, agenteEmail?: string): Promise<void> {
  const branch = getBranchEmail(order.magazzino);
  if (!branch.to || !isMailConfigured()) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  await getTransporter().sendMail({
    from: getMailFromValue(),
    replyTo: agenteEmail || undefined,
    to: branch.to,
    cc: buildCcValue(branch.cc, agenteEmail),
    subject: buildOrderSubject(order, "new"),
    text: buildOrderText(order, "new"),
    html: buildOrderHtml(order, "new"),
    attachments: buildMetodoXmlAttachments(order),
  });
}

export async function sendOrderUpdatedEmail(
  order: Order,
  previous: PreviousOrderSnapshot,
  agenteEmail?: string,
): Promise<void> {
  const branch = getBranchEmail(order.magazzino);
  if (!branch.to || !isMailConfigured()) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  const diff = computeOrderDiff(previous, order);

  await getTransporter().sendMail({
    from: getMailFromValue(),
    replyTo: agenteEmail || undefined,
    to: branch.to,
    cc: buildCcValue(branch.cc, agenteEmail),
    subject: buildOrderSubject(order, "updated"),
    text: buildOrderText(order, "updated", diff),
    html: buildOrderHtml(order, "updated", diff),
    attachments: buildMetodoXmlAttachments(order),
  });
}

export async function sendOrderCancelledEmail(order: Order, agenteEmail?: string): Promise<void> {
  const branch = getBranchEmail(order.magazzino);
  if (!branch.to || !isMailConfigured()) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  await getTransporter().sendMail({
    from: getMailFromValue(),
    replyTo: agenteEmail || undefined,
    to: branch.to,
    cc: buildCcValue(branch.cc, agenteEmail),
    subject: buildOrderSubject(order, "cancelled"),
    text: buildOrderText(order, "cancelled"),
    html: buildOrderHtml(order, "cancelled"),
  });
}

// ────────────────────────────────────────────
// Email di approvazione (sconti liberi)
// ────────────────────────────────────────────

export type ApprovalDocKind = "ordine" | "preventivo" | "modifica";

export interface ApprovalMailDoc {
  kind: ApprovalDocKind;
  id: number;
  /** Numero preventivo (solo per kind = "preventivo"). */
  numero?: string;
  cliente: string;
  agenteUsername: string;
  agenteFullName: string;
  items: OrderHistoryItem[];
  /** URL pubblico dell'app (per i link); vuoto se non configurato. */
  baseUrl: string;
}

function approvalDocLabel(doc: ApprovalMailDoc): string {
  if (doc.kind === "preventivo") return `Preventivo ${doc.numero || `#${doc.id}`}`;
  if (doc.kind === "modifica") return `Modifica ordine #${doc.id}`;
  return `Ordine #${doc.id}`;
}

function approvalDocPath(doc: ApprovalMailDoc): string {
  return doc.kind === "preventivo" ? `/quotations/${doc.id}` : "/orders";
}

function renderApprovalLinesTable(items: OrderHistoryItem[]): string {
  const rows = items
    .map((item) => renderItemRow(item, { bg: lineRequiresApproval(item) ? "#fff5b1" : undefined }))
    .join("");
  return `
        <table role="table" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th style="${CELL_BORDER}text-align:left;background:#f2f2f2;">Codice</th>
              <th style="${CELL_BORDER}text-align:left;background:#f2f2f2;">Descrizione</th>
              <th style="${CELL_BORDER}text-align:center;background:#f2f2f2;">UM</th>
              <th style="${CELL_BORDER}text-align:center;background:#f2f2f2;">Quantità</th>
              <th style="${CELL_BORDER}text-align:right;background:#f2f2f2;">Prezzo di listino</th>
              <th style="${CELL_BORDER}text-align:center;background:#f2f2f2;">Sconto</th>
              <th style="${CELL_BORDER}text-align:right;background:#f2f2f2;">Netto</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td colspan="6" style="${CELL_BORDER}"><strong>Totale imponibile</strong></td>
              <td style="${CELL_BORDER}text-align:right;"><strong>${formatOrderCurrency(calculateOrderDiscountedTotal(items))}</strong></td>
            </tr>
          </tbody>
        </table>`;
}

function wrapMailHtml(title: string, bodyRows: string): string {
  return `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:12px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:700px;margin:0 auto;border-collapse:collapse;">
    <tr><td style="padding:8px 0 12px 0;font-size:20px;font-weight:bold;">${escapeHtml(title)}</td></tr>
    ${bodyRows}
    <tr><td style="padding-top:12px;font-size:12px;color:#444444;">Email generata automaticamente da ${APP_NAME}.</td></tr>
  </table>
</body>
</html>`;
}

/** Avvisa gli admin che un documento con sconti liberi attende approvazione. */
export async function sendApprovalRequestEmail(to: string[], doc: ApprovalMailDoc): Promise<void> {
  if (to.length === 0 || !isMailConfigured()) {
    console.warn("[mail] Email richiesta approvazione non inviata: nessun admin con email o credenziali GMAIL mancanti");
    return;
  }

  const label = approvalDocLabel(doc);
  const title = `Richiesta di approvazione: ${label}`;
  const approvalsUrl = doc.baseUrl ? `${doc.baseUrl}/admin/approvazioni` : "";
  const approvalLines = doc.items.filter(lineRequiresApproval);

  const html = wrapMailHtml(title, `
    <tr><td style="padding:0 0 10px 0;">${escapeHtml(doc.agenteFullName || doc.agenteUsername)} ha inviato <strong>${escapeHtml(label)}</strong> per <strong>${escapeHtml(doc.cliente)}</strong> con ${approvalLines.length} ${approvalLines.length === 1 ? "riga" : "righe"} a sconto libero (evidenziate in giallo).</td></tr>
    ${approvalsUrl ? `<tr><td style="padding:0 0 14px 0;"><a href="${approvalsUrl}" style="display:inline-block;padding:10px 16px;background:#0C2B57;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Apri le approvazioni</a></td></tr>` : ""}
    <tr><td style="padding:0 0 8px 0;">${renderApprovalLinesTable(doc.items)}</td></tr>`);

  const textLines = [
    title,
    `${doc.agenteFullName || doc.agenteUsername} ha inviato ${label} per ${doc.cliente} con ${approvalLines.length} righe a sconto libero.`,
    approvalsUrl ? `Approvazioni: ${approvalsUrl}` : "",
    "",
    "Righe:",
    ...doc.items.map((item) => formatItemTextLine(item, lineRequiresApproval(item) ? "!" : "-")),
    `Totale imponibile: ${formatOrderCurrency(calculateOrderDiscountedTotal(doc.items))}`,
    "",
    `Email generata automaticamente da ${APP_NAME}.`,
  ].filter((line) => line !== null);

  await getTransporter().sendMail({
    from: getMailFromValue(),
    to: to.join(", "),
    subject: `${title} // ${sanitizeSubjectPart(doc.cliente)}`,
    text: textLines.join("\n"),
    html,
  });
}

/** Avvisa l'agente dell'esito dell'approvazione. */
export async function sendApprovalDecisionEmail(
  to: string,
  doc: ApprovalMailDoc,
  decision: "approvato" | "rifiutato",
  note: string,
  decidedBy: string
): Promise<void> {
  if (!to || !isMailConfigured()) {
    console.warn("[mail] Email esito approvazione non inviata: agente senza email o credenziali GMAIL mancanti");
    return;
  }

  const label = approvalDocLabel(doc);
  const title = `${label} ${decision === "approvato" ? "approvato" : "rifiutato"}`;
  const docUrl = doc.baseUrl ? `${doc.baseUrl}${approvalDocPath(doc)}` : "";
  const outcome =
    decision === "approvato"
      ? doc.kind === "preventivo"
        ? "Il preventivo è ora attivo: puoi stamparlo e trasformarlo in ordine."
        : doc.kind === "modifica"
          ? "La modifica è stata applicata e inviata al magazzino."
          : "L'ordine è stato confermato e inviato al magazzino."
      : doc.kind === "preventivo"
        ? "Il preventivo è stato rifiutato: correggi gli sconti e salvalo di nuovo per una nuova valutazione."
        : doc.kind === "modifica"
          ? "La modifica è stata rifiutata: l'ordine originale resta invariato. Apri la bozza per correggerla."
          : "L'ordine è tornato in bozza: correggi gli sconti e reinvialo.";

  const html = wrapMailHtml(title, `
    <tr><td style="padding:0 0 6px 0;"><strong>${escapeHtml(label)}</strong> per <strong>${escapeHtml(doc.cliente)}</strong> è stato <strong>${decision}</strong> da ${escapeHtml(decidedBy)}.</td></tr>
    <tr><td style="padding:0 0 10px 0;">${escapeHtml(outcome)}</td></tr>
    ${note ? `<tr><td style="padding:0 0 10px 0;"><strong>Motivazione:</strong> ${escapeHtml(note).replace(/\n/g, "<br/>")}</td></tr>` : ""}
    ${docUrl ? `<tr><td style="padding:0 0 14px 0;"><a href="${docUrl}" style="display:inline-block;padding:10px 16px;background:#0C2B57;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Apri nell'app</a></td></tr>` : ""}`);

  const text = [
    title,
    `${label} per ${doc.cliente} è stato ${decision} da ${decidedBy}.`,
    outcome,
    note ? `Motivazione: ${note}` : "",
    docUrl ? `Apri: ${docUrl}` : "",
    "",
    `Email generata automaticamente da ${APP_NAME}.`,
  ].join("\n");

  await getTransporter().sendMail({
    from: getMailFromValue(),
    to,
    subject: `${title} // ${sanitizeSubjectPart(doc.cliente)}`,
    text,
    html,
  });
}
