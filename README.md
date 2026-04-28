# App Listino

Applicazione Next.js per consultazione listino, creazione ordini e invio notifiche email.

## Setup locale

1. Installa le dipendenze:

```bash
npm install
```

2. Crea il file ambiente partendo dal template:

```bash
cp .env.example .env
```

3. Avvia in sviluppo:

```bash
npm run dev
```

L'app e disponibile su http://localhost:3000.

## Variabili ambiente

Variabili principali (vedi anche `.env.example`):

- `JWT_SECRET`: chiave JWT per autenticazione.
- `COOKIE_SECURE`: `true` in produzione HTTPS, `false` in locale.
- `GMAIL_USER` / `GMAIL_APP_PASSWORD`: credenziali SMTP Gmail per invio email ordini.
- `ORDER_EMAIL_TO`: fallback destinatario email se non configurato per magazzino.
- `OPENAI_API_KEY`: chiave per funzionalita enrich AI.
- `AI_MODEL`: modello OpenAI usato dall'enrich (default `gpt-4o-mini`).
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: chiave Google Maps JS usata nel campo "Luogo di consegna" con compilazione guidata.
- `DB_BACKUP_MAX_FILES`: numero massimo di backup DB mantenuti in `data/backups` (default `30`).
- `DB_BACKUP_AUTO_ENABLED`: abilita scheduler backup automatico (default `true`).
- `DB_BACKUP_AUTO_INTERVAL_MINUTES`: frequenza backup automatico in minuti (default `360`).
- `DB_BACKUP_AUTO_RUN_ON_START`: esegue un ciclo backup all'avvio processo (default `true`).
- `DB_BACKUP_AUTO_UPLOAD_TO_S3`: durante il ciclo automatico carica anche su S3 se configurato (default `true`).
- `DB_BACKUP_S3_ENDPOINT`: endpoint S3 compatibile Hetzner Object Storage.
- `DB_BACKUP_S3_REGION`: regione S3 (default `us-east-1`).
- `DB_BACKUP_S3_BUCKET`: bucket remoto dei backup.
- `DB_BACKUP_S3_PREFIX`: prefisso cartella oggetti backup (default `db-backups`).
- `DB_BACKUP_S3_ACCESS_KEY_ID` / `DB_BACKUP_S3_SECRET_ACCESS_KEY`: credenziali accesso bucket.
- `DB_BACKUP_S3_FORCE_PATH_STYLE`: path style per provider S3 compatibili (default `true`).
- `DB_BACKUP_S3_MAX_FILES`: massimo backup mantenuti su bucket (default `120`).

## Google Places Autocomplete (Luogo di consegna)

Per abilitare la compilazione guidata indirizzi nello step Dettagli ordine:

1. Crea una key in Google Cloud.
2. Abilita `Maps JavaScript API` e `Places API` sul progetto Google Cloud.
3. Inserisci la key in `.env` con `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...`.
4. Applica restrizioni consigliate alla key:
- Restrizione applicazione: HTTP referrers (domini dell'app).
- Restrizione API: solo Maps JavaScript API e Places API.

Se la variabile non e presente o la API non e raggiungibile, il campo resta utilizzabile come input manuale (fallback automatico).

## Deploy Docker

Con `docker-compose.yml`:

```bash
docker compose up -d
```

Il servizio legge le variabili da `.env` e monta i dati persistenti nella cartella `data/`.

## Backup database (SQLite)

Dal pannello admin e disponibile la pagina `Admin > Backup DB` (`/admin/backup`) per:

- creare un nuovo backup consistente del file SQLite;
- creare un backup locale e upload immediato su S3;
- visualizzare lo storico backup disponibili;
- scaricare o eliminare un backup specifico;
- ripristinare il database da backup locale o da backup remoto S3.

I backup vengono salvati in `data/backups/` con nome `listino-YYYYMMDD-HHMMSS-xxxxxx.db`.
La retention automatica mantiene al massimo `DB_BACKUP_MAX_FILES` file locali e `DB_BACKUP_S3_MAX_FILES` file remoti.

### Restore DB

Ogni restore crea automaticamente un backup di sicurezza prima della sostituzione del database attivo.
In caso di errore durante il restore, viene tentato rollback automatico al database precedente.

### Backup automatico su Hetzner S3

Lo scheduler parte automaticamente al primo accesso al DB e lancia un ciclo ogni `DB_BACKUP_AUTO_INTERVAL_MINUTES` minuti.
Ogni ciclo crea un backup locale e, se la configurazione S3 e presente e `DB_BACKUP_AUTO_UPLOAD_TO_S3=true`, esegue upload su Hetzner Object Storage.
