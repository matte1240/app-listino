import nodemailer from "nodemailer";
import type { Order, OrderHistoryItem } from "@/types";
import { getDb } from "@/lib/db";
import { buildMetodoOrderXmlForOrder } from "@/lib/metodo-xml";

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

function getTransporter(): nodemailer.Transporter {
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

export interface PreviousOrderSnapshot {
  cliente: string;
  magazzino: string;
  luogoConsegna: string;
  dataConsegna: string;
  note: string;
  items: OrderHistoryItem[];
}

interface ItemFieldChange {
  field: "qty" | "um" | "sconto" | "prezzoListino" | "descrizione";
  before: string;
  after: string;
}

interface ModifiedItem {
  before: OrderHistoryItem;
  after: OrderHistoryItem;
  changes: ItemFieldChange[];
}

interface OrderDiff {
  headerChanges: Array<{ label: string; before: string; after: string }>;
  added: OrderHistoryItem[];
  removed: OrderHistoryItem[];
  modified: ModifiedItem[];
  unchanged: OrderHistoryItem[];
}

function formatScontoLabel(sconto?: number): string {
  return sconto && sconto > 0 ? `-${sconto}%` : "—";
}

function diffItem(before: OrderHistoryItem, after: OrderHistoryItem): ItemFieldChange[] {
  const changes: ItemFieldChange[] = [];
  if (before.qty !== after.qty) {
    changes.push({ field: "qty", before: String(before.qty), after: String(after.qty) });
  }
  if ((before.um ?? "") !== (after.um ?? "")) {
    changes.push({ field: "um", before: before.um ?? "", after: after.um ?? "" });
  }
  if ((before.sconto ?? 0) !== (after.sconto ?? 0)) {
    changes.push({ field: "sconto", before: formatScontoLabel(before.sconto), after: formatScontoLabel(after.sconto) });
  }
  if (before.prezzoListino !== after.prezzoListino) {
    changes.push({
      field: "prezzoListino",
      before: `EUR ${before.prezzoListino.toFixed(2)}`,
      after: `EUR ${after.prezzoListino.toFixed(2)}`,
    });
  }
  if ((before.descrizione ?? "") !== (after.descrizione ?? "")) {
    changes.push({ field: "descrizione", before: before.descrizione ?? "", after: after.descrizione ?? "" });
  }
  return changes;
}

function computeOrderDiff(previous: PreviousOrderSnapshot, order: Order): OrderDiff {
  const headerChanges: OrderDiff["headerChanges"] = [];
  const headerFields: Array<{ label: string; before: string; after: string }> = [
    { label: "Cliente", before: previous.cliente, after: order.cliente },
    { label: "Magazzino", before: previous.magazzino, after: order.magazzino },
    { label: "Luogo consegna", before: previous.luogoConsegna, after: order.luogoConsegna },
    {
      label: "Data consegna",
      before: previous.dataConsegna ? formatDate(previous.dataConsegna) : "—",
      after: order.dataConsegna ? formatDate(order.dataConsegna) : "—",
    },
    { label: "Note", before: previous.note, after: order.note },
  ];
  for (const f of headerFields) {
    if ((f.before ?? "") !== (f.after ?? "")) headerChanges.push(f);
  }

  const beforeByCodice = new Map(previous.items.map((i) => [i.codice, i]));
  const afterByCodice = new Map(order.items.map((i) => [i.codice, i]));

  const added: OrderHistoryItem[] = [];
  const removed: OrderHistoryItem[] = [];
  const modified: ModifiedItem[] = [];
  const unchanged: OrderHistoryItem[] = [];

  for (const after of order.items) {
    const before = beforeByCodice.get(after.codice);
    if (!before) {
      added.push(after);
      continue;
    }
    const changes = diffItem(before, after);
    if (changes.length > 0) modified.push({ before, after, changes });
    else unchanged.push(after);
  }
  for (const before of previous.items) {
    if (!afterByCodice.has(before.codice)) removed.push(before);
  }

  return { headerChanges, added, removed, modified, unchanged };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDiffItemRow(
  item: OrderHistoryItem,
  kind: "added" | "removed" | "unchanged",
): string {
  const bg =
    kind === "added" ? "#e6ffed" : kind === "removed" ? "#ffeef0" : "#ffffff";
  const badge =
    kind === "added"
      ? '<span style="color:#22863a;font-weight:bold;">+ AGGIUNTO</span>'
      : kind === "removed"
        ? '<span style="color:#b31d28;font-weight:bold;">− RIMOSSO</span>'
        : "";
  const decoration = kind === "removed" ? "text-decoration:line-through;color:#6a737d;" : "";
  const prezzoEffettivo = item.sconto && item.sconto > 0
    ? item.prezzoListino * (1 - item.sconto / 100)
    : item.prezzoListino;
  const scontoCell = item.sconto && item.sconto > 0
    ? `<strong>-${item.sconto}%</strong>`
    : `—`;
  const cell = `border:1px solid #cccccc;padding:6px;background:${bg};${decoration}`;
  return `
      <tr>
        <td style="${cell}text-align:left">${badge ? `${badge}<br/>` : ""}${escapeHtml(item.codice)}</td>
        <td style="${cell}text-align:left">${escapeHtml(item.descrizione)}</td>
        <td style="${cell}text-align:center">${item.qty}</td>
        <td style="${cell}text-align:center">${escapeHtml(item.um ?? "")}</td>
        <td style="${cell}text-align:center">${scontoCell}</td>
        <td style="${cell}text-align:right">EUR ${prezzoEffettivo.toFixed(2)}</td>
      </tr>`;
}

function renderDiffModifiedRow(mod: ModifiedItem): string {
  const bg = "#fff5b1";
  const cell = `border:1px solid #cccccc;padding:6px;background:${bg};`;
  const after = mod.after;
  const changedFields = new Set(mod.changes.map((c) => c.field));
  const fmtCell = (field: ItemFieldChange["field"], current: string): string => {
    const change = mod.changes.find((c) => c.field === field);
    if (!change) return current;
    return `<span style="color:#b31d28;text-decoration:line-through;">${escapeHtml(change.before)}</span> &rarr; <strong>${escapeHtml(change.after)}</strong>`;
  };
  const prezzoEffettivo = after.sconto && after.sconto > 0
    ? after.prezzoListino * (1 - after.sconto / 100)
    : after.prezzoListino;
  const prezzoCellContent = changedFields.has("prezzoListino") || changedFields.has("sconto")
    ? `${changedFields.has("prezzoListino") ? fmtCell("prezzoListino", "") : `EUR ${after.prezzoListino.toFixed(2)}`}${changedFields.has("sconto") ? `<br/>Sconto: ${fmtCell("sconto", "")}` : ""}<br/><em>Effettivo: EUR ${prezzoEffettivo.toFixed(2)}</em>`
    : `EUR ${prezzoEffettivo.toFixed(2)}`;
  return `
      <tr>
        <td style="${cell}text-align:left"><span style="color:#b08800;font-weight:bold;">~ MODIFICATO</span><br/>${escapeHtml(after.codice)}</td>
        <td style="${cell}text-align:left">${changedFields.has("descrizione") ? fmtCell("descrizione", "") : escapeHtml(after.descrizione)}</td>
        <td style="${cell}text-align:center">${changedFields.has("qty") ? fmtCell("qty", "") : after.qty}</td>
        <td style="${cell}text-align:center">${changedFields.has("um") ? fmtCell("um", "") : escapeHtml(after.um ?? "")}</td>
        <td style="${cell}text-align:center">${changedFields.has("sconto") ? fmtCell("sconto", "") : formatScontoLabel(after.sconto)}</td>
        <td style="${cell}text-align:right">${prezzoCellContent}</td>
      </tr>`;
}

function renderDiffSection(diff: OrderDiff): string {
  const hasAnyChange =
    diff.headerChanges.length > 0 ||
    diff.added.length > 0 ||
    diff.removed.length > 0 ||
    diff.modified.length > 0;

  if (!hasAnyChange) {
    return `<tr><td style="padding:8px 0;color:#6a737d;"><em>Nessuna differenza rilevata rispetto alla versione precedente.</em></td></tr>`;
  }

  const headerRows = diff.headerChanges
    .map(
      (c) => `
      <tr>
        <td style="border:1px solid #cccccc;padding:6px;background:#f6f8fa;"><strong>${escapeHtml(c.label)}</strong></td>
        <td style="border:1px solid #cccccc;padding:6px;color:#b31d28;text-decoration:line-through;">${escapeHtml(c.before || "—")}</td>
        <td style="border:1px solid #cccccc;padding:6px;color:#22863a;"><strong>${escapeHtml(c.after || "—")}</strong></td>
      </tr>`
    )
    .join("");

  const headerSection = diff.headerChanges.length > 0
    ? `<tr><td style="padding:6px 0 4px 0;font-weight:bold;">Modifiche intestazione</td></tr>
       <tr><td style="padding:0 0 12px 0;">
         <table role="table" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
           <thead>
             <tr>
               <th style="border:1px solid #cccccc;padding:6px;text-align:left;background:#f2f2f2;">Campo</th>
               <th style="border:1px solid #cccccc;padding:6px;text-align:left;background:#f2f2f2;">Prima</th>
               <th style="border:1px solid #cccccc;padding:6px;text-align:left;background:#f2f2f2;">Dopo</th>
             </tr>
           </thead>
           <tbody>${headerRows}</tbody>
         </table>
       </td></tr>`
    : "";

  return headerSection;
}

function buildDiffItemsRows(diff: OrderDiff): string {
  const rows: string[] = [];
  for (const m of diff.modified) rows.push(renderDiffModifiedRow(m));
  for (const a of diff.added) rows.push(renderDiffItemRow(a, "added"));
  for (const r of diff.removed) rows.push(renderDiffItemRow(r, "removed"));
  for (const u of diff.unchanged) rows.push(renderDiffItemRow(u, "unchanged"));
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

  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const mapsUrl = buildGoogleMapsSearchUrl(order.luogoConsegna);
  const agenteDisplayName = order.agenteFullName || order.agente;
  const rows = mode === "updated" && diff
    ? buildDiffItemsRows(diff)
    : order.items
      .map((item) => {
        const prezzoEffettivo = item.sconto && item.sconto > 0
          ? item.prezzoListino * (1 - item.sconto / 100)
          : item.prezzoListino;
        const scontoCell = item.sconto && item.sconto > 0
          ? `<strong>-${item.sconto}%</strong>`
          : `—`;
        return `
      <tr>
        <td style="border:1px solid #cccccc;padding:6px;text-align:left">${item.codice}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:left">${item.descrizione}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:center">${item.qty}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:center">${item.um}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:center">${scontoCell}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:right">EUR ${prezzoEffettivo.toFixed(2)}</td>
      </tr>`;
      })
      .join("");

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
          <tr><td style="padding:3px 0;"><strong>Cliente:</strong> ${order.cliente}</td></tr>
          <tr><td style="padding:3px 0;"><strong>Magazzino:</strong> ${order.magazzino}</td></tr>
          <tr><td style="padding:3px 0;"><strong>Agente:</strong> ${agenteDisplayName}</td></tr>
          ${order.luogoConsegna ? `<tr><td style="padding:3px 0;"><strong>Luogo consegna:</strong> ${order.luogoConsegna}</td></tr>` : ""}
          ${mapsUrl ? `<tr><td style="padding:3px 0;"><strong>Google Maps:</strong> <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Apri indirizzo cantiere</a></td></tr>` : ""}
          ${order.dataConsegna ? `<tr><td style="padding:3px 0;"><strong>Data consegna:</strong> ${formatDate(order.dataConsegna)}</td></tr>` : ""}
          ${order.note ? `<tr><td style="padding:3px 0;"><strong>Note:</strong> ${order.note}</td></tr>` : ""}
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
              <th style="border:1px solid #cccccc;padding:6px;text-align:left;background:#f2f2f2;">Codice</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:left;background:#f2f2f2;">Descrizione</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:center;background:#f2f2f2;">Qta</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:center;background:#f2f2f2;">UM</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:center;background:#f2f2f2;">Sconto</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:right;background:#f2f2f2;">Prezzo</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td colspan="2" style="border:1px solid #cccccc;padding:6px;"><strong>Totale pezzi (attuale)</strong></td>
              <td style="border:1px solid #cccccc;padding:6px;text-align:center;"><strong>${totalQty}</strong></td>
              <td colspan="3" style="border:1px solid #cccccc;padding:6px;"></td>
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
  const prezzoEffettivo = item.sconto && item.sconto > 0
    ? item.prezzoListino * (1 - item.sconto / 100)
    : item.prezzoListino;
  const scontoLabel = item.sconto && item.sconto > 0 ? ` | Sconto: -${item.sconto}%` : "";
  return `${prefix} ${item.codice} | ${item.descrizione} | Qta: ${item.qty} ${item.um}${scontoLabel} | EUR ${prezzoEffettivo.toFixed(2)}`;
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

    lines.push("", "Modifiche righe (legenda: + aggiunto, - rimosso, ~ modificato, =  invariato):");
    for (const m of diff.modified) {
      lines.push(formatItemTextLine(m.after, "~"));
      for (const ch of m.changes) {
        lines.push(`    ${ch.field}: "${ch.before}" -> "${ch.after}"`);
      }
    }
    for (const a of diff.added) lines.push(formatItemTextLine(a, "+"));
    for (const r of diff.removed) lines.push(formatItemTextLine(r, "-"));
    for (const u of diff.unchanged) lines.push(formatItemTextLine(u, "="));

    if (diff.headerChanges.length === 0 && diff.modified.length === 0 && diff.added.length === 0 && diff.removed.length === 0) {
      lines.push("(nessuna differenza rilevata rispetto alla versione precedente)");
    }
  } else {
    lines.push("", "Righe ordine:");
    for (const item of order.items) {
      lines.push(formatItemTextLine(item, "-"));
    }
  }
  lines.push(`Totale pezzi (attuale): ${order.items.reduce((sum, item) => sum + item.qty, 0)}`);
  lines.push("", `Email generata automaticamente da ${APP_NAME}.`);

  return lines.join("\n");
}

export async function sendOrderEmail(order: Order, agenteEmail?: string): Promise<void> {
  const branch = getBranchEmail(order.magazzino);
  if (!branch.to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  await getTransporter().sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
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
  if (!branch.to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  const diff = computeOrderDiff(previous, order);

  await getTransporter().sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
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
  if (!branch.to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  await getTransporter().sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    replyTo: agenteEmail || undefined,
    to: branch.to,
    cc: buildCcValue(branch.cc, agenteEmail),
    subject: buildOrderSubject(order, "cancelled"),
    text: buildOrderText(order, "cancelled"),
    html: buildOrderHtml(order, "cancelled"),
  });
}
