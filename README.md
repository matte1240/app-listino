# Ordini Ivicolors

**Applicazione web per la consultazione del listino materiali, creazione ordini e flusso commerciale Ivicolors.**

Costruita con **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS** e **shadcn/ui**. Ottimizzata per tablet e desktop, con supporto **PWA** per l'uso offline.

> Sei un agente commerciale o un amministratore che usa l'app? Vai al manuale d'uso → **[GUIDA.md](GUIDA.md)**

---

## Funzionalità principali

- **Listino** — ricerca veloce su materiali con flag "obsoleto", descrizioni arricchite con AI
- **Ordini** — wizard 4 step (Cliente → Articoli → Dettagli → Riepilogo), bozze salvate sul server con il pulsante **Salva bozza** (tabella `orders` con status `bozza`), modifica di un ordine confermato via bozza-di-modifica (`order_drafts`), cancellazione
- **Email automatiche** — invio a email magazzino + CC agente per nuovo ordine, modifica, cancellazione
- **Allegato XML Metodo** — generato e allegato automaticamente alle mail di nuovo ordine e modifica, importabile nel gestionale Metodo
- **Diff visivo nelle mail di modifica** — header e righe con indicatori aggiunto/rimosso/modificato (verde/rosso/giallo)
- **Anagrafiche clienti** — import massivo da Excel con upsert per `Codice` (riconosce header `N.Cli.`, `Codice Cliente`, ecc.)
- **Export Metodo** — XML scaricabile a richiesta dal pannello admin per ogni ordine
- **Luogo di consegna** — autocomplete indirizzi via Photon/OpenStreetMap (self-hosted, senza API key) + memoria delle ultime destinazioni per cliente
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
| Email | `GMAIL_USER`, `GMAIL_FROM_ALIAS`, `GMAIL_FROM_NAME`, `GMAIL_APP_PASSWORD`, `ORDER_EMAIL_TO` | Opzionale (senza credenziali Gmail, l'invio mail è disabilitato) |
| Ricerca indirizzi | `PHOTON_BASE_URL` | Opzionale (default `http://photon:2322`, il servizio del docker-compose) |
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

**Stack runtime**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind + shadcn/ui · Zustand (stato wizard) · better-sqlite3 · nodemailer · OpenAI SDK · `xlsx` · `@aws-sdk/client-s3`.

**Database** — SQLite locale in `data/listino.db`. Tabelle principali:

| Tabella | Cosa contiene |
|---|---|
| `users` | Utenti, ruoli (`admin` / `agente`), credenziali bcrypt |
| `materials` | Catalogo articoli importato da Excel |
| `enriched_materials` | Descrizioni AI generate (chiave: `codice`) |
| `orders` | Ordini (status `bozza`/`confermato`/...) e bozze di modifica linkate via `parent_order_id` |
| `order_drafts` | Bozze di modifica di ordini esistenti (uno per ordine) |
| `anagrafiche` | Anagrafica clienti da Excel (chiave applicativa: `codice`) |
| `branch_emails` | Configurazione `email_to` / `email_cc` per magazzino |

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
│   ├── mail.ts          # nodemailer + render HTML/text + diff ordine
│   ├── metodo-xml.ts    # Build XML Metodo (con lookup descrizioni originali)
│   ├── excel.ts         # Parser Excel materiali e anagrafiche
│   ├── ai-enrich.ts     # OpenAI enrichment descrizioni
│   └── useOrderStore.ts # Zustand persist per il wizard
└── types/           # TypeScript types condivisi
```

**Flussi chiave**

- **Creazione ordine** — POST `/api/orders` → salva su `orders` → invia mail con XML Metodo allegato (best-effort).
- **Modifica ordine confermato** — PUT/POST `/api/orders/[id]/draft` → bozza in `order_drafts` → applicazione → diff calcolato in `mail.ts` → mail "Ordine Modificato" con XML aggiornato.
- **Cancellazione** — DELETE `/api/orders/[id]` → mail "Ordine Cancellato" senza allegato.
- **Import anagrafiche** — POST `/api/anagrafiche/import` → upsert per `codice` normalizzato (case/punteggiatura insensitive).
- **Export Metodo** — GET `/api/admin/orders/[id]/metodo-xml` → XML on-demand per import nel gestionale.

---

## Troubleshooting

- **"Failed to load materials"** — il file `data/listino.db` non esiste o non è scrivibile. Riavvia: la DDL viene applicata in idempotenza.
- **Autocomplete indirizzi senza suggerimenti** — il container `photon` non è ancora pronto (al primo avvio scarica il dump OSM italiano e costruisce l'indice, operazione lunga: `docker compose logs -f photon`) oppure `PHOTON_BASE_URL` è errato. Il campo continua ad accettare testo libero, l'ordine si invia comunque. Per una verifica diretta: `curl "http://127.0.0.1:2322/api?q=via+roma+pordenone&lang=it&limit=5"`. In alternativa, per non ospitare nulla, si può puntare `PHOTON_BASE_URL` all'istanza pubblica `https://photon.komoot.io`.
- **Email non inviate** — `GMAIL_USER` / `GMAIL_APP_PASSWORD` mancanti o invalidi; controlla i log server (`[mail] Invio email disabilitato: ...`).
- **Mittente Gmail non corretto** — `GMAIL_FROM_ALIAS` deve essere un alias già configurato nell'account `GMAIL_USER` in Gmail → Impostazioni → Account → "Invia messaggio come". `GMAIL_FROM_NAME` controlla solo il nome visibile del mittente.
- **XML Metodo non allegato** — l'ordine non ha cliente collegato a un'anagrafica con `codice`. Log: `[mail] XML Metodo non allegato per ordine #N: no_cliente | no_codice_anagrafica`.
- **Import anagrafiche fallisce con UNIQUE constraint** — risolto: la chiave applicativa è `codice` (normalizzato). Se vedi ancora l'errore, verifica che il file non abbia codici duplicati.
- **Backup S3 fallisce** — verifica `DB_BACKUP_S3_ENDPOINT`, credenziali, `DB_BACKUP_S3_FORCE_PATH_STYLE=true` per Hetzner.

---

**Manuale utente completo: [GUIDA.md](GUIDA.md)**
