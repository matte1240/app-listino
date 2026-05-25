import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { hashSync } from "bcryptjs";

export const DB_PATH = path.join(process.cwd(), "data", "listino.db");

function createDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'agente')),
      full_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add email column if missing (existing DBs)
  const userCols = db.pragma("table_info(users)") as { name: string }[];
  if (!userCols.some((c) => c.name === "email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");
  }
  if (!userCols.some((c) => c.name === "full_name")) {
    db.exec("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS enriched_materials (
      codice TEXT PRIMARY KEY,
      descrizione_ai TEXT NOT NULL DEFAULT '',
      produttore TEXT NOT NULL DEFAULT '',
      pz_bancale INTEGER,
      pz_scatola INTEGER,
      mq_lastra REAL,
      confezione_originale TEXT NOT NULL DEFAULT '',
      peso_unitario TEXT NOT NULL DEFAULT '',
      url_produttore TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      codice TEXT PRIMARY KEY,
      descrizione TEXT NOT NULL DEFAULT '',
      categoria TEXT NOT NULL DEFAULT '',
      raggr TEXT NOT NULL DEFAULT '',
      um TEXT NOT NULL DEFAULT '',
      prezzo_listino REAL NOT NULL DEFAULT 0,
      prezzo_riservato REAL NOT NULL DEFAULT 0,
      prezzo_pubblico REAL NOT NULL DEFAULT 0,
      pz_confezione REAL NOT NULL DEFAULT 0,
      mq_confezione REAL,
      pz_bancale REAL,
      mq_bancale REAL,
      nota TEXT NOT NULL DEFAULT '',
      obsoleto INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add obsoleto column if missing (existing DBs)
  const materialCols = db.pragma("table_info(materials)") as { name: string }[];
  if (!materialCols.some((c) => c.name === "obsoleto")) {
    db.exec("ALTER TABLE materials ADD COLUMN obsoleto INTEGER NOT NULL DEFAULT 0");
  }
  if (!materialCols.some((c) => c.name === "mq_confezione")) {
    db.exec("ALTER TABLE materials ADD COLUMN mq_confezione REAL");
  }
  if (!materialCols.some((c) => c.name === "pz_bancale")) {
    db.exec("ALTER TABLE materials ADD COLUMN pz_bancale REAL");
  }
  if (!materialCols.some((c) => c.name === "mq_bancale")) {
    db.exec("ALTER TABLE materials ADD COLUMN mq_bancale REAL");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      cliente_id INTEGER,
      magazzino TEXT NOT NULL,
      luogo_consegna TEXT NOT NULL DEFAULT '',
      data_consegna TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      agente TEXT NOT NULL,
      items TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confermato',
      parent_order_id INTEGER,
      quotation_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cancelled_at TEXT,
      cancelled_by TEXT,
      cancelled_from_status TEXT
    )
  `);

  // Migration: add cliente_id column if missing (existing DBs)
  const orderCols = db.pragma("table_info(orders)") as { name: string }[];
  if (!orderCols.some((c) => c.name === "cliente_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN cliente_id INTEGER");
  }
  if (!orderCols.some((c) => c.name === "status")) {
    db.exec("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'confermato'");
  }
  if (!orderCols.some((c) => c.name === "parent_order_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN parent_order_id INTEGER");
  }
  if (!orderCols.some((c) => c.name === "quotation_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN quotation_id INTEGER");
  }
  if (!orderCols.some((c) => c.name === "updated_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    db.exec("UPDATE orders SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL");
  }
  if (!orderCols.some((c) => c.name === "cancelled_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN cancelled_at TEXT");
  }
  if (!orderCols.some((c) => c.name === "cancelled_by")) {
    db.exec("ALTER TABLE orders ADD COLUMN cancelled_by TEXT");
  }
  if (!orderCols.some((c) => c.name === "cancelled_from_status")) {
    db.exec("ALTER TABLE orders ADD COLUMN cancelled_from_status TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id ON orders(parent_order_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_quotation_id ON orders(quotation_id)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_drafts (
      order_id INTEGER PRIMARY KEY,
      cliente TEXT NOT NULL,
      cliente_id INTEGER,
      magazzino TEXT NOT NULL,
      luogo_consegna TEXT NOT NULL DEFAULT '',
      data_consegna TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      items TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_order_drafts_updated_at ON order_drafts(updated_at)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE DEFAULT '',
      cliente TEXT NOT NULL,
      cliente_id INTEGER,
      data_preventivo TEXT NOT NULL DEFAULT '',
      data_consegna_prevista TEXT NOT NULL DEFAULT '',
      validita_giorni INTEGER NOT NULL DEFAULT 30,
      note TEXT NOT NULL DEFAULT '',
      agente TEXT NOT NULL DEFAULT '',
      items TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'attivo',
      converted_order_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const quotationCols = db.pragma("table_info(quotations)") as { name: string }[];
  if (!quotationCols.some((c) => c.name === "numero")) {
    db.exec("ALTER TABLE quotations ADD COLUMN numero TEXT NOT NULL DEFAULT ''");
  }
  if (!quotationCols.some((c) => c.name === "cliente_id")) {
    db.exec("ALTER TABLE quotations ADD COLUMN cliente_id INTEGER");
  }
  if (!quotationCols.some((c) => c.name === "data_preventivo")) {
    db.exec("ALTER TABLE quotations ADD COLUMN data_preventivo TEXT NOT NULL DEFAULT ''");
  }
  if (!quotationCols.some((c) => c.name === "data_consegna_prevista")) {
    db.exec("ALTER TABLE quotations ADD COLUMN data_consegna_prevista TEXT NOT NULL DEFAULT ''");
  }
  if (!quotationCols.some((c) => c.name === "validita_giorni")) {
    db.exec("ALTER TABLE quotations ADD COLUMN validita_giorni INTEGER NOT NULL DEFAULT 30");
  }
  if (!quotationCols.some((c) => c.name === "note")) {
    db.exec("ALTER TABLE quotations ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  if (!quotationCols.some((c) => c.name === "agente")) {
    db.exec("ALTER TABLE quotations ADD COLUMN agente TEXT NOT NULL DEFAULT ''");
  }
  if (!quotationCols.some((c) => c.name === "updated_at")) {
    db.exec("ALTER TABLE quotations ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
  if (!quotationCols.some((c) => c.name === "status")) {
    db.exec("ALTER TABLE quotations ADD COLUMN status TEXT NOT NULL DEFAULT 'attivo'");
  }
  if (!quotationCols.some((c) => c.name === "converted_order_id")) {
    db.exec("ALTER TABLE quotations ADD COLUMN converted_order_id INTEGER");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_numero ON quotations(numero)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quotations_agente_created_at ON quotations(agente, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quotations_converted_order_id ON quotations(converted_order_id)");

  type LegacyLinkedDraftRow = {
    id: number;
    parent_order_id: number;
    cliente: string;
    cliente_id: number | null;
    magazzino: string;
    luogo_consegna: string;
    data_consegna: string;
    note: string;
    items: string;
    created_at: string;
  };

  const legacyLinkedDrafts = db.prepare(
    `SELECT d.id, d.parent_order_id, d.cliente, d.cliente_id, d.magazzino, d.luogo_consegna, d.data_consegna, d.note, d.items, d.created_at
     FROM orders d
     INNER JOIN orders p ON p.id = d.parent_order_id
     WHERE d.status = 'bozza' AND d.parent_order_id IS NOT NULL
     ORDER BY d.parent_order_id, datetime(d.created_at) DESC, d.id DESC`
  ).all() as LegacyLinkedDraftRow[];

  if (legacyLinkedDrafts.length > 0) {
    const seenParentIds = new Set<number>();
    const upsertDraft = db.prepare(
      `INSERT INTO order_drafts (order_id, cliente, cliente_id, magazzino, luogo_consegna, data_consegna, note, items, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         cliente = excluded.cliente,
         cliente_id = excluded.cliente_id,
         magazzino = excluded.magazzino,
         luogo_consegna = excluded.luogo_consegna,
         data_consegna = excluded.data_consegna,
         note = excluded.note,
         items = excluded.items,
         updated_at = excluded.updated_at`
    );
    const deleteLegacyDraft = db.prepare("DELETE FROM orders WHERE id = ?");

    db.transaction(() => {
      for (const draft of legacyLinkedDrafts) {
        if (!seenParentIds.has(draft.parent_order_id)) {
          const timestamp = draft.created_at || new Date().toISOString();
          upsertDraft.run(
            draft.parent_order_id,
            draft.cliente,
            draft.cliente_id,
            draft.magazzino,
            draft.luogo_consegna,
            draft.data_consegna,
            draft.note,
            draft.items,
            timestamp,
            timestamp
          );
          seenParentIds.add(draft.parent_order_id);
        }

        deleteLegacyDraft.run(draft.id);
      }
    })();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS anagrafiche (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codice TEXT NOT NULL DEFAULT '',
      ragione_sociale TEXT NOT NULL DEFAULT '',
      indirizzo TEXT NOT NULL DEFAULT '',
      cap_citta TEXT NOT NULL DEFAULT '',
      piva TEXT NOT NULL DEFAULT '',
      piva_norm TEXT NOT NULL DEFAULT '',
      search_text TEXT NOT NULL DEFAULT '',
      rap INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add missing anagrafiche columns if table already existed
  const anagraficheCols = db.pragma("table_info(anagrafiche)") as { name: string }[];
  if (!anagraficheCols.some((c) => c.name === "codice")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN codice TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "ragione_sociale")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN ragione_sociale TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "indirizzo")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN indirizzo TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "cap_citta")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN cap_citta TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "piva")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN piva TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "piva_norm")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN piva_norm TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "search_text")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN search_text TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "updated_at")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
  if (!anagraficheCols.some((c) => c.name === "rap")) {
    db.exec("ALTER TABLE anagrafiche ADD COLUMN rap INTEGER");
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_anagrafiche_codice_piva ON anagrafiche(codice, piva_norm)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_anagrafiche_ragione ON anagrafiche(ragione_sociale)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_anagrafiche_search ON anagrafiche(search_text)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_anagrafiche_rap ON anagrafiche(rap)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS rap_assignments (
      rap INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_rap_assignments_user_id ON rap_assignments(user_id)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS branch_emails (
      magazzino TEXT PRIMARY KEY,
      email_to TEXT NOT NULL DEFAULT '',
      email_cc TEXT NOT NULL DEFAULT ''
    )
  `);

  // Seed default admin if table is empty
  const count = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  if (count.c === 0) {
    const hash = hashSync("admin123", 10);
    db.prepare("INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)").run(
      "admin",
      hash,
      "admin",
      "Admin"
    );
  }

  return db;
}

let _db: Database.Database | null = null;
let _backupSchedulerStarted = false;

function ensureBackupSchedulerStarted() {
  if (_backupSchedulerStarted) return;
  _backupSchedulerStarted = true;

  void import("@/lib/db-backup-scheduler")
    .then(({ ensureDatabaseBackupSchedulerStarted }) => {
      ensureDatabaseBackupSchedulerStarted();
    })
    .catch((error) => {
      console.error("[db-backup] Impossibile inizializzare lo scheduler:", error);
    });
}

export function getDb(): Database.Database {
  if (!_db) {
    _db = createDb();
    ensureBackupSchedulerStarted();
  }

  return _db;
}

export function closeDbConnection() {
  if (!_db) return;
  _db.close();
  _db = null;
}

export interface DbUser {
  id: number;
  username: string;
  password: string;
  role: "admin" | "agente";
  full_name: string;
  email: string;
  created_at: string;
}
