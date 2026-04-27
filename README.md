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
