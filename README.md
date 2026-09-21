# Ordini Ivicolors

**Applicazione web per la consultazione del listino materiali, creazione ordini e flusso commerciale Ivicolors.**

Costruita con **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS** e **shadcn/ui**. Ottimizzata per tablet e desktop, con supporto **PWA** per l'uso offline.

> Sei un agente commerciale o un amministratore che usa l'app? Vai al manuale d'uso → **[GUIDA.md](GUIDA.md)**

---

## Funzionalità principali

- **Listino** — ricerca veloce su materiali con flag "obsoleto", descrizioni arricchite con AI
- **Ordini** — wizard 4 step (Cliente → Articoli → Dettagli → Riepilogo), bozze salvate sul server con il pulsante **Salva bozza** (tabella `orders` con status `bozza`), modifica di un ordine confermato via bozza-di-modifica (`order_drafts`), cancellazione
- **Righe ordine flessibili** — righe in ordine di inserimento, riordino con drag & drop (dnd-kit) o frecce, righe **nota** posizionabili, **articoli manuali** (descrizione, U.M., prezzo liberi), **spese di trasporto** sempre come ultima riga; stesse righe in email, XML Metodo e PDF preventivo
- **Sconto libero con approvazione** — oltre a 8% e 15% una percentuale libera; ordini, modifiche e preventivi con sconti liberi restano `in_approvazione` finché un admin li approva (pagina **Admin → Approvazioni**, badge nel menu), con email e notifiche push agli admin e all'agente
- **Email automatiche** — invio a email magazzino + CC agente per nuovo ordine, modifica, cancellazione
- **Allegato XML Metodo** — generato e allegato automaticamente alle mail di nuovo ordine e modifica, importabile nel gestionale Metodo
- **Diff visivo nelle mail di modifica** — header e righe con indicatori aggiunto/rimosso/modificato (verde/rosso/giallo)
- **Anagrafiche clienti** — import massivo da Excel con upsert per `Codice` (riconosce header `N.Cli.`, `Codice Cliente`, ecc.)
- **Export Metodo** — XML scaricabile a richiesta dal pannello admin per ogni ordine
- **Luogo di consegna** — autocomplete Google Places + memoria delle ultime destinazioni per cliente
- **AI Enrichment** — rigenerazione descrizioni materiali via OpenAI (modello configurabile)
- **Amministrazione** — gestione utenti, listino Excel, anagrafiche, email per filiale, backup/restore
- **Backup automatici** — scheduler interno + upload su Hetzner Object Storage (S3 compatibile)

---

## Primo avvio

### Credenziali di default
- **Username**: `admin`
- **Password**: `admin123`

> Cambia immediatamente la password dopo il primo accesso da **Admin → Utenti**.

### Sviluppo locale

```bash
npm install
cp .env.example .env.local   # poi modifica i valori reali
npm run dev
```

App disponibile su **http://localhost:3000**.

### Docker (produzione consigliata)

```bash
docker compose up -d
```

I dati (DB SQLite, backup, anagrafiche) vivono in `./data` (volume persistente).

---

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo con hot-reload |
| `npm run build` | Build di produzione |
| `npm run start` | Avvia il build di produzione |
| `npm run lint` | Esegue ESLint |
| `npx tsc --noEmit` | Type-check senza emit |

---

## Variabili d'ambiente

Tutte le chiavi sono documentate in [`.env.example`](.env.example). Sintesi:

| Categoria | Variabili | Obbligatoria? |
|---|---|---|
| Sicurezza | `JWT_SECRET`, `COOKIE_SECURE` | **Sì** in produzione |
| URL pubblico | `APP_URL` | Consigliata (link nelle email/notifiche di approvazione; dietro Docker l'origin della richiesta non è affidabile) |
| Email | `GMAIL_USER`, `GMAIL_FROM_ALIAS`, `GMAIL_FROM_NAME`, `GMAIL_APP_PASSWORD`, `ORDER_EMAIL_TO` | Opzionale (senza credenziali Gmail, l'invio mail è disabilitato) |
| Push PWA | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Opzionale (genera con `npx web-push generate-vapid-keys`; senza chiavi il push è disattivato) |
| Google Places | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Opzionale (autocomplete indirizzi) |
| OpenAI | `OPENAI_API_KEY`, `AI_MODEL` | Opzionale (AI enrichment descrizioni) |
| Backup S3 | `DB_BACKUP_S3_*`, `DB_BACKUP_AUTO_*` | Opzionale (backup remoti) |

`.env.local` è ignorato da git: non committare mai credenziali reali.

---

## Sicurezza e produzione

- Cambia subito la password dell'utente `admin`.
- Genera un `JWT_SECRET` lungo e casuale (`openssl rand -base64 32`).
- `COOKIE_SECURE=true` quando esponi su HTTPS.
- Per produzione: Docker + reverse proxy (Nginx, Traefik, Caddy).
- I backup S3 sono raccomandati: il DB SQLite è un singolo file e una corruzione locale = perdita totale.

---

## Architettura

**Stack runtime**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind + shadcn/ui · Zustand (stato wizard) · dnd-kit (riordino righe) · better-sqlite3 · nodemailer · web-push · OpenAI SDK · `xlsx` · `@aws-sdk/client-s3`.

**Database** — SQLite locale in `data/listino.db`. Tabelle principali:

| Tabella | Cosa contiene |
|---|---|
| `users` | Utenti, ruoli (`admin` / `agente`), credenziali bcrypt |
| `materials` | Catalogo articoli importato da Excel |
| `enriched_materials` | Descrizioni AI generate (chiave: `codice`) |
| `orders` | Ordini (status `bozza`/`in_approvazione`/`confermato`/...) con colonne `approval_*` e righe JSON tipizzate (`articolo`/`manuale`/`commento`/`trasporto`) |
| `order_drafts` | Bozze di modifica di ordini esistenti (uno per ordine), con `approval_status` per le modifiche in attesa |
| `quotations` | Preventivi (status `attivo`/`in_approvazione`/`rifiutato`/`convertito`) con colonne `approval_*` |
| `anagrafiche` | Anagrafica clienti da Excel (chiave applicativa: `codice`) |
| `branch_emails` | Configurazione `email_to` / `email_cc` per magazzino |
| `app_settings` | Impostazioni chiave/valore (codici Metodo per trasporto e righe manuali) |
| `push_subscriptions` | Sottoscrizioni Web Push per utente/dispositivo |

**Struttura cartelle**

```
src/
├── app/             # App Router: pagine + API routes
│   ├── api/         # Endpoint REST (auth, orders, materials, anagrafiche, admin/*)
│   ├── admin/       # Pannello amministrazione
│   ├── orders/      # Cronologia, nuovo ordine, modifica ordine
│   ├── quotations/  # Preventivi e stampa preventivo
│   ├── login/       # Pagina login
│   └── page.tsx     # Listino con esportazione PDF
├── components/      # UI: OrderWizard, MaterialList, MaterialCard, SearchBar, ...
├── lib/             # Domain logic
│   ├── auth.ts          # JWT (jose) + bcrypt
│   ├── db.ts            # better-sqlite3, schema, migrazioni
│   ├── mail.ts          # nodemailer + render HTML/text + email di approvazione
│   ├── order-lines.ts   # Tipi di riga, normalizzazione, regole sconto libero, riordino
│   ├── order-diff.ts    # Diff fra versioni di un ordine (client-safe)
│   ├── approvals.ts     # Stato di invio deciso dal server, elenco approvazioni
│   ├── notifications.ts # Notifiche email + push del flusso di approvazione
│   ├── push.ts          # Web Push (VAPID) e sottoscrizioni
│   ├── settings.ts      # app_settings (codici Metodo)
│   ├── metodo-xml.ts    # Build XML Metodo (con lookup descrizioni originali)
│   ├── excel.ts         # Parser Excel materiali e anagrafiche
│   ├── ai-enrich.ts     # OpenAI enrichment descrizioni
│   └── useOrderStore.ts # Zustand persist per il wizard (righe ordinate)
└── types/           # TypeScript types condivisi
```

**Flussi chiave**

- **Creazione ordine** — POST `/api/orders` → righe normalizzate (`order-lines.ts`) → se ci sono sconti liberi e l'utente non è admin, status `in_approvazione` + notifica agli admin; altrimenti salva `confermato` e invia mail con XML Metodo allegato (best-effort).
- **Approvazione** — POST `/api/orders/[id]/approval`, `/api/orders/[id]/draft/approval`, `/api/quotations/[id]/approval` (solo admin, body `{ action: "approve" | "reject", note }`); GET `/api/admin/approvals` per elenco e conteggio. Un ordine da preventivo già approvato con righe scontate identiche non richiede una seconda approvazione.
- **Modifica ordine confermato** — PUT/POST `/api/orders/[id]/draft` → bozza in `order_drafts` → applicazione (o attesa di approvazione se ci sono sconti liberi) → diff calcolato in `order-diff.ts` → mail "Ordine Modificato" con XML aggiornato.
- **Notifiche push** — GET `/api/push/public-key`, POST/DELETE `/api/push/subscriptions`; il service worker (`public/sw.js`) mostra la notifica e apre l'URL al click.
- **Cancellazione** — DELETE `/api/orders/[id]` → mail "Ordine Cancellato" senza allegato.
- **Import anagrafiche** — POST `/api/anagrafiche/import` → upsert per `codice` normalizzato (case/punteggiatura insensitive).
- **Export Metodo** — GET `/api/admin/orders/[id]/metodo-xml` → XML on-demand per import nel gestionale.

---

## Troubleshooting

- **"Failed to load materials"** — il file `data/listino.db` non esiste o non è scrivibile. Riavvia: la DDL viene applicata in idempotenza.
- **Google Maps non funziona** — chiave mancante o senza Places API abilitata in Google Cloud Console.
- **Email non inviate** — `GMAIL_USER` / `GMAIL_APP_PASSWORD` mancanti o invalidi; controlla i log server (`[mail] Invio email disabilitato: ...`).
- **Mittente Gmail non corretto** — `GMAIL_FROM_ALIAS` deve essere un alias già configurato nell'account `GMAIL_USER` in Gmail → Impostazioni → Account → "Invia messaggio come". `GMAIL_FROM_NAME` controlla solo il nome visibile del mittente.
- **XML Metodo non allegato** — l'ordine non ha cliente collegato a un'anagrafica con `codice`. Log: `[mail] XML Metodo non allegato per ordine #N: no_cliente | no_codice_anagrafica`.
- **Import anagrafiche fallisce con UNIQUE constraint** — risolto: la chiave applicativa è `codice` (normalizzato). Se vedi ancora l'errore, verifica che il file non abbia codici duplicati.
- **Backup S3 fallisce** — verifica `DB_BACKUP_S3_ENDPOINT`, credenziali, `DB_BACKUP_S3_FORCE_PATH_STYLE=true` per Hetzner.
- **Il pulsante "Attiva notifiche" non compare** — mancano `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`. Il push richiede HTTPS (o localhost) e, su iOS, l'app installata in Home.
- **Nessun admin riceve le email di approvazione** — gli utenti admin devono avere l'email compilata in Admin → Utenti (log: `[approvazioni] Nessun admin con email configurata`).
- **Import Metodo rifiuta le righe manuali/trasporto** — imposta in Admin → Impostazioni i codici articolo generici esistenti nel gestionale.
- **Dopo il deploy un'immagine precedente legge `in_approvazione` come `confermato`** — le versioni precedenti dell'app non conoscono il nuovo stato: non fare rollback a un'immagine vecchia con ordini in attesa.

---

**Manuale utente completo: [GUIDA.md](GUIDA.md)**
