import nodemailer from "nodemailer";
import type { Order } from "@/types";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
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

function buildOrderHtml(order: Order, mode: "new" | "updated" | "cancelled" = "new"): string {
  const headerConfig = {
    new:       { bg: "#1d4ed8", emoji: "📦", label: "Nuovo Ordine" },
    updated:   { bg: "#d97706", emoji: "✏️", label: "Ordine Modificato — Annulla e sostituisce il precedente invio" },
    cancelled: { bg: "#dc2626", emoji: "❌", label: "Ordine Cancellato" },
  }[mode];

  const itemsRows = mode === "cancelled" ? "" : order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-weight:bold">${item.codice}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.descrizione}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.um}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">&euro; ${item.prezzoListino.toFixed(2)}</td>
      </tr>`
    )
    .join("");

  const totalePz = order.items.reduce((s, i) => s + i.qty, 0);

  const itemsSection = mode === "cancelled" ? `
      <div style="text-align:center;padding:32px 0">
        <p style="font-size:16px;color:#dc2626;font-weight:600">Questo ordine è stato cancellato.</p>
        <p style="font-size:13px;color:#71717a;margin-top:8px">L'ordine #${order.id} per ${order.cliente} non è più valido.</p>
      </div>
  ` : `
      <!-- Items table -->
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f4f4f5">
            <th style="padding:10px 12px;text-align:left;font-weight:600;font-size:12px;text-transform:uppercase;color:#71717a">Codice</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;font-size:12px;text-transform:uppercase;color:#71717a">Descrizione</th>
            <th style="padding:10px 12px;text-align:center;font-weight:600;font-size:12px;text-transform:uppercase;color:#71717a">Qtà</th>
            <th style="padding:10px 12px;text-align:center;font-weight:600;font-size:12px;text-transform:uppercase;color:#71717a">UM</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600;font-size:12px;text-transform:uppercase;color:#71717a">Prezzo</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
        <tfoot>
          <tr style="background:#f0f9ff">
            <td colspan="2" style="padding:10px 12px;font-weight:700;font-size:14px">Totale</td>
            <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:14px">${totalePz} pz</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
  `;

  return `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

    <!-- Header -->
    <div style="background:${headerConfig.bg};color:#fff;padding:24px 32px">
      <h1 style="margin:0;font-size:20px">${headerConfig.emoji} ${headerConfig.label} #${order.id}</h1>
      <p style="margin:6px 0 0;opacity:.85;font-size:14px">${formatDate(order.createdAt)}</p>
    </div>

    <!-- Info -->
    <div style="padding:24px 32px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="padding:6px 0;color:#71717a;width:140px;font-size:14px">Cliente</td>
          <td style="padding:6px 0;font-weight:600;font-size:14px">${order.cliente}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#71717a;font-size:14px">Magazzino</td>
          <td style="padding:6px 0;font-weight:600;font-size:14px">${order.magazzino}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#71717a;font-size:14px">Agente</td>
          <td style="padding:6px 0;font-weight:600;font-size:14px">${order.agente}</td>
        </tr>
        ${order.luogoConsegna ? `<tr>
          <td style="padding:6px 0;color:#71717a;font-size:14px">Luogo consegna</td>
          <td style="padding:6px 0;font-size:14px">${order.luogoConsegna}</td>
        </tr>` : ""}
        ${order.dataConsegna ? `<tr>
          <td style="padding:6px 0;color:#71717a;font-size:14px">Data consegna</td>
          <td style="padding:6px 0;font-size:14px">${formatDate(order.dataConsegna)}</td>
        </tr>` : ""}
        ${order.note ? `<tr>
          <td style="padding:6px 0;color:#71717a;font-size:14px;vertical-align:top">Note</td>
          <td style="padding:6px 0;font-size:14px">${order.note}</td>
        </tr>` : ""}
      </table>

      ${itemsSection}
    </div>

    <!-- Footer -->
    <div style="background:#f4f4f5;padding:16px 32px;text-align:center;font-size:12px;color:#a1a1aa">
      Email generata automaticamente da App Listino
    </div>
  </div>
</body>
</html>`;
}

export async function sendOrderEmail(order: Order, agenteEmail?: string): Promise<void> {
  const to = process.env.ORDER_EMAIL_TO;
  if (!to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: variabili GMAIL_USER, GMAIL_APP_PASSWORD o ORDER_EMAIL_TO mancanti");
    return;
  }

  await getTransporter().sendMail({
    from: `"App Listino" <${process.env.GMAIL_USER}>`,
    replyTo: agenteEmail || undefined,
    to,
    subject: `Nuovo Ordine #${order.id} — ${order.cliente} (${order.magazzino})`,
    html: buildOrderHtml(order, "new"),
  });
}

export async function sendOrderUpdatedEmail(order: Order, agenteEmail?: string): Promise<void> {
  const to = process.env.ORDER_EMAIL_TO;
  if (!to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: variabili GMAIL_USER, GMAIL_APP_PASSWORD o ORDER_EMAIL_TO mancanti");
    return;
  }

  await getTransporter().sendMail({
    from: `"App Listino" <${process.env.GMAIL_USER}>`,
    replyTo: agenteEmail || undefined,
    to,
    subject: `Ordine Modificato #${order.id} — Annulla e sostituisce — ${order.cliente} (${order.magazzino})`,
    html: buildOrderHtml(order, "updated"),
  });
}

export async function sendOrderCancelledEmail(order: Order, agenteEmail?: string): Promise<void> {
  const to = process.env.ORDER_EMAIL_TO;
  if (!to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mail] Invio email disabilitato: variabili GMAIL_USER, GMAIL_APP_PASSWORD o ORDER_EMAIL_TO mancanti");
    return;
  }

  await getTransporter().sendMail({
    from: `"App Listino" <${process.env.GMAIL_USER}>`,
    replyTo: agenteEmail || undefined,
    to,
    subject: `Ordine Cancellato #${order.id} — ${order.cliente} (${order.magazzino})`,
    html: buildOrderHtml(order, "cancelled"),
  });
}
