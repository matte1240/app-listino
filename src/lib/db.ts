import Database from "better-sqlite3";
import path from "path";
import { hashSync } from "bcryptjs";

const DB_PATH = path.join(process.cwd(), "data", "listino.db");

function createDb() {
  const fs = require("fs");
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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
      nota TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      magazzino TEXT NOT NULL,
      luogo_consegna TEXT NOT NULL DEFAULT '',
      data_consegna TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      agente TEXT NOT NULL,
      items TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Seed default admin if table is empty
  const count = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  if (count.c === 0) {
    const hash = hashSync("admin123", 10);
    db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(
      "admin",
      hash,
      "admin"
    );
  }

  return db;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) _db = createDb();
  return _db;
}

export interface DbUser {
  id: number;
  username: string;
  password: string;
  role: "admin" | "agente";
  created_at: string;
}
