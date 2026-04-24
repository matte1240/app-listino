import nodemailer from "nodemailer";
import type { Order, OrderHistoryItem } from "@/types";
import { getDb } from "@/lib/db";

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

function buildOrderHtml(order: Order, mode: "new" | "updated" | "cancelled" = "new", _oldItems?: OrderHistoryItem[]): string {
  const title =
    mode === "updated"
      ? `Ordine Modificato #${order.id}`
      : mode === "cancelled"
        ? `Ordine Cancellato #${order.id}`
        : `Nuovo Ordine #${order.id}`;

  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td style="border:1px solid #cccccc;padding:6px;text-align:left">${item.codice}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:left">${item.descrizione}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:center">${item.qty}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:center">${item.um}</td>
        <td style="border:1px solid #cccccc;padding:6px;text-align:right">EUR ${item.prezzoListino.toFixed(2)}</td>
      </tr>`
    )
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
          <tr><td style="padding:3px 0;"><strong>Agente:</strong> ${order.agente}</td></tr>
          ${order.luogoConsegna ? `<tr><td style="padding:3px 0;"><strong>Luogo consegna:</strong> ${order.luogoConsegna}</td></tr>` : ""}
          ${order.dataConsegna ? `<tr><td style="padding:3px 0;"><strong>Data consegna:</strong> ${formatDate(order.dataConsegna)}</td></tr>` : ""}
          ${order.note ? `<tr><td style="padding:3px 0;"><strong>Note:</strong> ${order.note}</td></tr>` : ""}
        </table>
      </td>
    </tr>
    ${
      mode === "cancelled"
        ? `<tr><td style="padding:8px 0 16px 0;"><strong>Questo ordine e stato cancellato.</strong></td></tr>`
        : `<tr>
      <td style="padding:0 0 8px 0;">
        <table role="table" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #cccccc;padding:6px;text-align:left;background:#f2f2f2;">Codice</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:left;background:#f2f2f2;">Descrizione</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:center;background:#f2f2f2;">Qta</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:center;background:#f2f2f2;">UM</th>
              <th style="border:1px solid #cccccc;padding:6px;text-align:right;background:#f2f2f2;">Prezzo</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td colspan="2" style="border:1px solid #cccccc;padding:6px;"><strong>Totale pezzi</strong></td>
              <td style="border:1px solid #cccccc;padding:6px;text-align:center;"><strong>${totalQty}</strong></td>
              <td colspan="2" style="border:1px solid #cccccc;padding:6px;"></td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>`
    }
    <tr>
      <td style="padding-top:12px;font-size:12px;color:#444444;">Email generata automaticamente da App Listino.</td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOrderText(order: Order, mode: "new" | "updated" | "cancelled" = "new"): string {
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
    `Agente: ${order.agente}`,
  ];

  if (order.luogoConsegna) lines.push(`Luogo consegna: ${order.luogoConsegna}`);
  if (order.dataConsegna) lines.push(`Data consegna: ${formatDate(order.dataConsegna)}`);
  if (order.note) lines.push(`Note: ${order.note}`);

  if (mode === "cancelled") {
    lines.push("", "Questo ordine e stato cancellato.");
    return lines.join("\n");
  }

  lines.push("", "Righe ordine:");
  for (const item of order.items) {
    lines.push(`- ${item.codice} | ${item.descrizione} | Qta: ${item.qty} ${item.um} | EUR ${item.prezzoListino.toFixed(2)}`);
  }
  lines.push(`Totale pezzi: ${order.items.reduce((sum, item) => sum + item.qty, 0)}`);

  return lines.join("\n");
}

export async function sendOrderEmail(order: Order, agenteEmail?: string): Promise<void> {
  const branch = getBranchEmail(order.magazzino);
  if (!branch.to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  await getTransporter().sendMail({
    from: `"App Listino" <${process.env.GMAIL_USER}>`,
    replyTo: agenteEmail || undefined,
    to: branch.to,
    cc: buildCcValue(branch.cc, agenteEmail),
    subject: buildOrderSubject(order, "new"),
    text: buildOrderText(order, "new"),
    html: buildOrderHtml(order, "new"),
  });
}

export async function sendOrderUpdatedEmail(order: Order, oldItems: OrderHistoryItem[], agenteEmail?: string): Promise<void> {
  const branch = getBranchEmail(order.magazzino);
  if (!branch.to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  await getTransporter().sendMail({
    from: `"App Listino" <${process.env.GMAIL_USER}>`,
    replyTo: agenteEmail || undefined,
    to: branch.to,
    cc: buildCcValue(branch.cc, agenteEmail),
    subject: buildOrderSubject(order, "updated"),
    text: buildOrderText(order, "updated"),
    html: buildOrderHtml(order, "updated", oldItems),
  });
}

export async function sendOrderCancelledEmail(order: Order, agenteEmail?: string): Promise<void> {
  const branch = getBranchEmail(order.magazzino);
  if (!branch.to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: credenziali GMAIL mancanti o nessuna email configurata per", order.magazzino);
    return;
  }

  await getTransporter().sendMail({
    from: `"App Listino" <${process.env.GMAIL_USER}>`,
    replyTo: agenteEmail || undefined,
    to: branch.to,
    cc: buildCcValue(branch.cc, agenteEmail),
    subject: buildOrderSubject(order, "cancelled"),
    text: buildOrderText(order, "cancelled"),
    html: buildOrderHtml(order, "cancelled"),
  });
}
