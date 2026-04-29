# App Listino

**Applicazione web moderna per la consultazione del listino materiali, creazione ordini e gestione del flusso commerciale.**

Costruita con **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS** e **shadcn/ui**. Ottimizzata per tablet e desktop, con supporto **PWA** per l’uso offline.

---

## ✨ Funzionalità principali

- **Listino** — Ricerca veloce e consultazione materiali (con flag "obsoleto")
- **Ordini** — Wizard multi-step, bozze, modifica, duplicazione, anteprima PDF
- **Luogo di consegna** — Autocomplete intelligente con Google Places
- **Email** — Invio automatico ordini con configurazione per filiale/magazzino
- **AI Enrichment** — Arricchimento automatico descrizioni tramite OpenAI
- **Anagrafiche** — Importazione massiva da Excel
- **Amministrazione** — Gestione utenti, backup/restore DB, configurazione email
- **Backup Automatici** — Scheduler + upload su Hetzner Object Storage (S3)

---

## 🚀 Primo Avvio

### Credenziali di default
- **Username**: `admin`
- **Password**: `admin123`

**Importante**: Cambia immediatamente la password dopo il primo accesso dal pannello Admin → Utenti.

### Sviluppo locale

```bash
# 1. Installa le dipendenze
npm install

# 2. Configura le variabili d'ambiente (copia il template)
cp .env.example .env.local

# 3. Avvia in sviluppo
npm run dev
```

L’app sarà disponibile su **http://localhost:3000**

### Docker (produzione consigliata)

```bash
docker compose up -d
```

I dati (database SQLite, backup e anagrafiche) vengono persistiti nella cartella `./data`.

---

## 🔑 Variabili d’Ambiente

È stato creato il file **`.env.example`** (committato su git) con tutti i valori di esempio e commenti.

**Per iniziare:**

```bash
cp .env.example .env.local
```

Poi modifica `.env.local` con i tuoi valori reali (chiavi, password, endpoint S3, ecc.).

> **Nota**: `.env.local` è ignorato da git per motivi di sicurezza. Non committare mai credenziali reali.

---

## 🔐 Sicurezza e Produzione

- Cambia subito la password dell’utente `admin`
- Usa un `JWT_SECRET` lungo e casuale in produzione
- Imposta `COOKIE_SECURE=true` quando usi HTTPS
- Non esporre mai le chiavi segrete (`.env*` è ignorato da git)
- In produzione si consiglia l’uso di Docker + reverse proxy (Nginx/Traefik)

---

## 📍 Come usare l’applicazione

1. Accedi con `admin` / `admin123`
2. **Listino** → cerca e aggiungi materiali all’ordine
3. **Nuovo Ordine** → compila il wizard (cliente, magazzino, luogo consegna, data, note)
4. Anteprima PDF → Invia email
5. Vai su **/admin** per gestire utenti, anagrafiche, AI enrichment e backup

**Pannello Admin**: `http://localhost:3000/admin`

---

## 🛠️ Tecnologie

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui + Radix
- **Database**: SQLite + better-sqlite3 (con WAL)
- **Auth**: JOSE (JWT) + httpOnly cookies
- **AI**: OpenAI SDK
- **Email**: Nodemailer + Gmail
- **Storage**: AWS SDK S3 (compatibile Hetzner)
- **Excel**: xlsx
- **Mappe**: Google Places Autocomplete
- **Stato**: Zustand
- **PWA**: Service Worker + Web Manifest

---

## 📁 Struttura principale

- `/app` — Pagine e API routes
- `/components` — Componenti UI e business
- `/lib` — Database, auth, AI, email, backup, utils
- `/types` — Definizioni TypeScript
- `/admin/*` — Pannello amministrazione

---

## 🐛 Troubleshooting

- **"Failed to load materials"**: Controlla che `data/listino.db` sia creato
- **Google Maps non funziona**: Verifica la chiave `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **Email non inviate**: Controlla `GMAIL_USER` e `GMAIL_APP_PASSWORD`
- **Backup S3 fallisce**: Verifica le credenziali e l’endpoint Hetzner

---

**Sviluppato con ❤️ per semplificare il processo di vendita e gestione ordini.**


