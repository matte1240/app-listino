import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendOrderEmail, sendOrderUpdatedEmail, sendOrderCancelledEmail } from "@/lib/mail";
import { normalizeUtcTimestamp } from "@/lib/datetime";
import type { Order, OrderHistoryItem } from "@/types";

interface DbOrder {
  id: number;
  parent_order_id: number | null;
  cliente: string;
  cliente_id: number | null;
  magazzino: string;
  luogo_consegna: string;
  data_consegna: string;
  note: string;
  agente: string;
  items: string;
  status: string;
  created_at: string;
}

function dbToOrder(r: DbOrder): Order {
  return {
    id: r.id,
    parentOrderId: r.parent_order_id ?? null,
    clienteId: r.cliente_id ?? null,
    cliente: r.cliente,
    magazzino: r.magazzino,
    luogoConsegna: r.luogo_consegna,
    dataConsegna: r.data_consegna,
    note: r.note,
    agente: r.agente,
    items: JSON.parse(r.items) as OrderHistoryItem[],
    status: (r.status === 'bozza' ? 'bozza' : 'confermato') as Order['status'],
    createdAt: normalizeUtcTimestamp(r.created_at),
  };
}

/** GET /api/orders/[id] — get single order */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!row) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  // Agents can only see their own orders
  if (payload.role !== "admin" && row.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  return NextResponse.json({ order: dbToOrder(row) });
}

/** PUT /api/orders/[id] — update an existing order */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  // Only admin or the order owner can edit
  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const { clienteId, cliente, magazzino, luogoConsegna, dataConsegna, note, items, status } = body as {
    clienteId?: number | null;
    cliente: string;
    magazzino: string;
    luogoConsegna: string;
    dataConsegna: string;
    note: string;
    items: OrderHistoryItem[];
    status?: 'bozza' | 'confermato';
  };

  const resolvedStatus: 'bozza' | 'confermato' = status === 'bozza' ? 'bozza' : 'confermato';

  const normalizedClienteId = Number(clienteId);
  const hasSelectedCustomer = Number.isInteger(normalizedClienteId) && normalizedClienteId > 0;

  let resolvedClienteId: number | null = null;
  let resolvedCliente = cliente?.trim() ?? "";

  if (hasSelectedCustomer) {
    const selectedCustomer = db
      .prepare("SELECT id, ragione_sociale FROM anagrafiche WHERE id = ?")
      .get(normalizedClienteId) as { id: number; ragione_sociale: string } | undefined;

    if (!selectedCustomer) {
      return NextResponse.json({ error: "Cliente anagrafica non trovato" }, { status: 400 });
    }

    resolvedClienteId = selectedCustomer.id;
    resolvedCliente = selectedCustomer.ragione_sociale;
  }

  if (!resolvedCliente || !magazzino?.trim() || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Dati ordine incompleti" }, { status: 400 });
  }

  const existingStatus: Order["status"] = existing.status === "bozza" ? "bozza" : "confermato";
  const existingParentOrderId = existing.parent_order_id ?? null;
  const isLinkedDraft = existingStatus === "bozza" && existingParentOrderId !== null;

  // Editing a confirmed order and saving as draft creates/updates a linked draft copy.
  if (existingStatus === "confermato" && resolvedStatus === "bozza") {
    const linkedDraft = db
      .prepare(
        "SELECT * FROM orders WHERE parent_order_id = ? AND status = 'bozza' ORDER BY id DESC LIMIT 1"
      )
      .get(orderId) as DbOrder | undefined;

    let linkedDraftId: number;
    if (linkedDraft) {
      db.prepare(
        `UPDATE orders
         SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, agente = ?, items = ?, status = ?, parent_order_id = ?
         WHERE id = ?`
      ).run(
        resolvedCliente,
        resolvedClienteId,
        magazzino,
        luogoConsegna ?? "",
        dataConsegna ?? "",
        note ?? "",
        existing.agente,
        JSON.stringify(items),
        "bozza",
        orderId,
        linkedDraft.id
      );
      linkedDraftId = linkedDraft.id;
    } else {
      const result = db
        .prepare(
          `INSERT INTO orders (cliente, cliente_id, magazzino, luogo_consegna, data_consegna, note, agente, items, status, parent_order_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          resolvedCliente,
          resolvedClienteId,
          magazzino,
          luogoConsegna ?? "",
          dataConsegna ?? "",
          note ?? "",
          existing.agente,
          JSON.stringify(items),
          "bozza",
          orderId
        );
      linkedDraftId = Number(result.lastInsertRowid);
    }

    const savedDraft = db.prepare("SELECT * FROM orders WHERE id = ?").get(linkedDraftId) as DbOrder | undefined;
    if (!savedDraft) {
      return NextResponse.json({ error: "Errore nel salvataggio della bozza" }, { status: 500 });
    }

    return NextResponse.json({ order: dbToOrder(savedDraft), linkedTo: orderId });
  }

  // Confirming a linked draft applies changes to the parent confirmed order and removes the draft.
  if (isLinkedDraft && resolvedStatus === "confermato") {
    const parentId = existingParentOrderId as number;
    const parent = db.prepare("SELECT * FROM orders WHERE id = ?").get(parentId) as DbOrder | undefined;
    if (!parent) {
      return NextResponse.json({ error: "Ordine principale non trovato" }, { status: 409 });
    }
    if (payload.role !== "admin" && parent.agente !== payload.username) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const oldItems = JSON.parse(parent.items) as OrderHistoryItem[];

    db.transaction(() => {
      db.prepare(
        `UPDATE orders
         SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, status = ?, parent_order_id = ?
         WHERE id = ?`
      ).run(
        resolvedCliente,
        resolvedClienteId,
        magazzino,
        luogoConsegna ?? "",
        dataConsegna ?? "",
        note ?? "",
        JSON.stringify(items),
        "confermato",
        null,
        parentId
      );

      db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    })();

    const updatedParent = db.prepare("SELECT * FROM orders WHERE id = ?").get(parentId) as DbOrder | undefined;
    if (!updatedParent) {
      return NextResponse.json({ error: "Ordine principale non trovato" }, { status: 500 });
    }

    const order = dbToOrder(updatedParent);
    sendOrderUpdatedEmail(order, oldItems, payload.email).catch((err) =>
      console.error("[mail] Errore invio email modifica ordine:", err)
    );

    return NextResponse.json({ order, appliedDraftId: orderId });
  }

  const oldItems = JSON.parse(existing.items) as OrderHistoryItem[];
  const nextParentOrderId = isLinkedDraft ? existingParentOrderId : null;

  db.prepare(
    `UPDATE orders
     SET cliente = ?, cliente_id = ?, magazzino = ?, luogo_consegna = ?, data_consegna = ?, note = ?, items = ?, status = ?, parent_order_id = ?
     WHERE id = ?`
  ).run(
    resolvedCliente,
    resolvedClienteId,
    magazzino,
    luogoConsegna ?? "",
    dataConsegna ?? "",
    note ?? "",
    JSON.stringify(items),
    resolvedStatus,
    nextParentOrderId,
    orderId
  );

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!updated) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  const order = dbToOrder(updated);

  if (resolvedStatus === "confermato") {
    if (existingStatus === "bozza" && existingParentOrderId === null) {
      sendOrderEmail(order, payload.email).catch((err) =>
        console.error("[mail] Errore invio email ordine:", err)
      );
    } else {
      sendOrderUpdatedEmail(order, oldItems, payload.email).catch((err) =>
        console.error("[mail] Errore invio email modifica ordine:", err)
      );
    }
  }

  return NextResponse.json({ order });
}

/** DELETE /api/orders/[id] — delete order (owner or admin) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

  const db = getDb();
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DbOrder | undefined;
  if (!existing) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

  // Only admin or the order owner can delete
  if (payload.role !== "admin" && existing.agente !== payload.username) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const order = dbToOrder(existing);
  const shouldSendCancellationEmail = order.status === "confermato" && order.parentOrderId === null;

  if (!shouldSendCancellationEmail) {
    const result = db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    if (result.changes === 0) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deletedLinkedDrafts: 0, cancellationEmailSent: false });
  }

  const txResult = db.transaction(() => {
    const linkedDraftsDelete = db
      .prepare("DELETE FROM orders WHERE parent_order_id = ? AND status = 'bozza'")
      .run(orderId);
    const parentDelete = db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    return {
      parentChanges: parentDelete.changes,
      linkedDraftChanges: linkedDraftsDelete.changes,
    };
  })();

  if (txResult.parentChanges === 0) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  sendOrderCancelledEmail(order, payload.email).catch((err) =>
    console.error("[mail] Errore invio email cancellazione ordine:", err)
  );

  return NextResponse.json({ ok: true, deletedLinkedDrafts: txResult.linkedDraftChanges, cancellationEmailSent: true });
}
