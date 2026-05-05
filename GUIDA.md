# Guida all'uso di App Listino

Manuale d'uso passo-passo per agenti commerciali e amministratori. Questa guida copre tutto quello che serve sapere per usare l'app: dal primo accesso alla creazione di un ordine, dalla gestione delle bozze fino alle funzioni amministrative.

> Se cerchi informazioni tecniche (installazione, variabili d'ambiente, architettura) vai al [README.md](README.md).

---

## Indice

1. [Cos'è App Listino e come accedere](#1-cosè-app-listino-e-come-accedere)
2. [Il listino materiali](#2-il-listino-materiali)
3. [Creare un ordine](#3-creare-un-ordine)
4. [Bozze: salvare e riprendere un ordine](#4-bozze-salvare-e-riprendere-un-ordine)
5. [Modificare un ordine già inviato](#5-modificare-un-ordine-già-inviato)
6. [Cancellare un ordine](#6-cancellare-un-ordine)
7. [Cronologia ordini](#7-cronologia-ordini)
8. [Email automatiche](#8-email-automatiche)
9. [Listino in PDF](#9-listino-in-pdf)
10. [Installare l'app sul telefono (PWA)](#10-installare-lapp-sul-telefono-pwa)
11. [Sezione Admin](#11-sezione-admin)
12. [Domande frequenti](#12-domande-frequenti)

---

## 1. Cos'è App Listino e come accedere

App Listino è lo strumento che usi per:

- consultare il **listino materiali** sempre aggiornato,
- creare **ordini** per i tuoi clienti,
- inviare automaticamente l'ordine al **magazzino di competenza**,
- consultare lo **storico** dei tuoi ordini.

### Accesso

1. Apri l'app dal browser (oppure dall'icona se l'hai installata sul telefono — vedi sezione 10).
2. Inserisci il tuo **username** e la **password** che ti ha fornito l'amministratore.
3. Clicca **Accedi**. Resti loggato per qualche ora; se chiudi e riapri, di norma non devi rifare login.

### Cambiare password

Solo l'amministratore può cambiare la tua password (vedi sezione 11.7). Se l'hai dimenticata, chiedigli un reset.

---

## 2. Il listino materiali

La home dell'app è il **listino**: la lista completa degli articoli disponibili.

### Cercare un articolo

In alto trovi una **barra di ricerca**. Scrivi una parte del codice o della descrizione (anche parole separate): la lista si filtra in tempo reale. La ricerca tiene conto di **codice**, **descrizione originale**, **descrizione AI** (se generata), **categoria**, **raggruppamento** e **unità di misura**.

### Filtri

- **Mostra obsoleti** — di default gli articoli marcati come obsoleti sono nascosti. Attiva l'opzione per vederli.
- Gli articoli sono raggruppati per **categoria**: scorri per esplorarli tutti.

### Descrizione "AI" e descrizione originale

Per molti articoli vedi una descrizione più leggibile (generata dall'intelligenza artificiale) accanto a quella originale. La versione AI è più chiara, ma quella originale resta sempre disponibile e viene usata negli export ufficiali (XML Metodo, importazioni gestionale).

Se per un articolo non c'è ancora la descrizione AI puoi richiederla con il pulsante a fianco del codice (icona "rigenera").

### Aggiungere articoli all'ordine

In ogni riga c'è un pulsante per aggiungere l'articolo all'ordine in corso. Quando lo premi, l'articolo entra nel **carrello** del wizard ordine (vedi sezione 3).

---

## 3. Creare un ordine

Vai su **Nuovo Ordine** dal menu. Si apre il **wizard a 4 step**.

### Step 1 — Cliente

- **Cliente**: digita il nome o il codice. Compaiono i suggerimenti dalle anagrafiche caricate. Se il cliente non è in anagrafica, scegli **Altro / nuovo cliente** e scrivi a mano la ragione sociale.
- **Luogo di consegna (cantiere)**: inizia a digitare l'indirizzo. Se Google Maps è configurato, vedrai i suggerimenti. Se hai già consegnato a quel cliente, in cima trovi le **destinazioni recenti**.
- **Data consegna**: scegli la data desiderata.
- **Note**: testo libero (es. "scarico al 3° piano", "campanello A").

### Step 2 — Articoli

- Usa la barra di ricerca per trovare gli articoli e premi sul pulsante per aggiungerli.
- Per ogni articolo nel carrello imposti:
  - **Quantità** (con i tasti `+` / `−` o digitando il numero),
  - **Sconto a riga**: `0%`, `8%` o `15%`. Lo sconto si applica al prezzo di listino dell'articolo specifico.
- Su mobile in basso compare un'icona **Carrello**: tocca per vedere e modificare gli articoli selezionati.
- Puoi rimuovere un articolo con l'icona del cestino.

### Step 3 — Dettagli

- **Magazzino**: scegli da quale filiale spedire (Pordenone, Udine, Fossalta di Portogruaro, Trieste). La mail dell'ordine andrà alla casella della filiale scelta.
- Conferma o modifica i dati di consegna inseriti nello step 1.

### Step 4 — Riepilogo

Vedi un'anteprima completa dell'ordine: cliente, magazzino, cantiere, data, note, lista articoli con quantità, sconti, prezzo unitario e prezzo effettivo.

Tre azioni possibili:

- **Salva bozza** — l'ordine resta in stato "Bozza" e non parte alcuna mail. Puoi riprenderlo in qualsiasi momento.
- **Invia ordine** — l'ordine viene confermato, salvato e inviato per email al magazzino + a te in CC. Vedi sezione 8.
- **Annulla** — chiude il wizard senza salvare nulla.

> **Suggerimento**: i dati che inserisci nel wizard sono salvati man mano nel browser. Se chiudi la scheda per errore, riapri "Nuovo Ordine" e ritrovi quello che avevi scritto.

---

## 4. Bozze: salvare e riprendere un ordine

Una **bozza** è un ordine ancora in lavorazione, non ancora inviato.

### Quando si crea una bozza

- Quando premi **Salva bozza** nello step 4.
- Automaticamente, mentre compili il wizard, i dati sono ricordati nel tuo browser.

### Riprendere una bozza

Vai su **Cronologia ordini**: le bozze hanno un'etichetta dedicata. Aprila e premi **Modifica** per riaprire il wizard con tutti i dati pre-compilati.

### Scartare una bozza

Dalla cronologia ordini, sulla bozza, c'è il pulsante **Elimina**. La bozza viene cancellata in modo definitivo, senza inviare alcuna mail.

> **Attenzione**: le bozze "in corso di compilazione" (non ancora salvate) vivono solo nel **tuo browser**. Se cambi computer o cancelli i dati di navigazione, le perdi. Le bozze **salvate** invece restano sul server.

---

## 5. Modificare un ordine già inviato

Anche dopo l'invio puoi modificare un ordine. Funziona in modo "sicuro": l'ordine originale resta intatto finché non confermi le modifiche.

### Come funziona

1. Apri l'ordine confermato dalla **Cronologia ordini** e premi **Modifica**.
2. Si apre il wizard pre-compilato. Cambia quello che serve (articoli, quantità, sconto, cantiere, data, note...).
3. Premi **Salva bozza** per parcheggiare le modifiche senza applicarle (l'ordine originale è ancora intatto), oppure **Invia ordine** per applicarle subito.
4. Quando applichi, parte una mail **"Ordine Modificato"** al magazzino + CC a te. La mail mostra **chiaramente cosa è cambiato**:
   - **Verde / `+ AGGIUNTO`** — articoli aggiunti.
   - **Rosso / `− RIMOSSO`** — articoli rimossi (testo barrato).
   - **Giallo / `~ MODIFICATO`** — articoli con quantità, sconto, prezzo o descrizione cambiati. Per ogni campo modificato vedi *valore vecchio → valore nuovo*.
   - **Sezione "Modifiche intestazione"** — se hai cambiato cliente, magazzino, cantiere, data o note, vedi una tabellina *Campo / Prima / Dopo* in cima alla mail.

Allegato: un nuovo file XML Metodo aggiornato.

### Scartare le modifiche

Se hai salvato come bozza la modifica ma poi cambi idea, vai sull'ordine in cronologia e premi **Scarta modifiche** (o equivalente). L'ordine torna come prima e nessuna mail viene inviata.

---

## 6. Cancellare un ordine

Dalla cronologia, apri un ordine confermato e premi **Cancella ordine** (o l'icona del cestino).

- L'ordine viene marcato come **annullato**.
- Parte una mail **"Ordine Cancellato"** al magazzino + CC a te.
- A differenza della modifica, **non c'è allegato XML** (l'ordine non va più importato).

Le **bozze** invece si eliminano senza notifica via mail (vedi sezione 4).

---

## 7. Cronologia ordini

Il menu **Ordini** mostra l'elenco di tutti i tuoi ordini.

- **Ricerca** in alto — cerca per numero ordine, cliente, cantiere o nome agente.
- Ogni riga mostra: numero, cliente, cantiere, data, magazzino, totale articoli, **stato** (badge colorato).
- Tocca una riga per espandere il dettaglio: cliente completo, articoli con quantità/sconto/prezzo, note.

### Stati possibili

| Stato | Significato |
|---|---|
| **Bozza** | Non ancora inviato. Puoi riprenderlo o eliminarlo. |
| **Confermato** | Inviato al magazzino. Mail spedita. |
| **In lavorazione** | Il magazzino sta preparando l'ordine. |
| **Spedito** | In viaggio. |
| **Consegnato** | Concluso. |
| **Annullato** | Cancellato. |

> Gli stati intermedi (in lavorazione, spedito, consegnato) li imposta il magazzino o l'amministratore — non l'agente.

---

## 8. Email automatiche

Ogni volta che invii o modifichi un ordine, parte una mail. Vediamo a chi arriva e cosa contiene.

### Destinatari

- **A**: la casella email del **magazzino** scelto nello step 3 (configurata dall'admin, vedi sezione 11.4).
- **CC**: la tua email (quella registrata sul tuo account agente) + eventuali indirizzi in CC configurati per il magazzino.
- **Reply-to**: la tua email, così se il magazzino risponde la risposta torna a te.

### Tipi di mail

| Quando | Oggetto | Contenuto | Allegato |
|---|---|---|---|
| Nuovo ordine inviato | `Nuovo Ordine #N // Cliente // Cantiere` | Riepilogo completo (cliente, cantiere, data, articoli, totale) | XML Metodo |
| Modifica ordine | `Ordine Modificato #N // ...` | Diff con sezioni intestazione + righe (verde/rosso/giallo) | XML Metodo aggiornato |
| Cancellazione | `Ordine Cancellato #N // ...` | Notifica di cancellazione | — |

### Cos'è l'allegato XML Metodo

È un file `ordine-metodo-N.xml` pronto per essere importato nel gestionale Metodo. Il magazzino lo apre e importa direttamente: niente trascrizione manuale.

> **Quando l'allegato non c'è**: se il cliente dell'ordine non è collegato a un'anagrafica con codice (cioè è un cliente "libero" digitato a mano), l'XML non si può generare. La mail parte comunque, ma senza allegato. Se ti serve l'XML, accerta che il cliente sia stato selezionato dalle anagrafiche.

### Quando le email **non** partono

- Quando salvi una **bozza** — non c'è nessuna mail.
- Quando elimini una bozza — nessuna mail.
- Se il sistema non ha le credenziali Gmail configurate (problema di setup, segnalalo all'admin).

---

## 9. Listino in PDF

Il menu **Listino PDF** (icona stampante) apre una versione del listino pensata per la stampa.

- Tabella desktop / cards mobile con: codice, descrizione (AI se disponibile), prezzo listino, prezzo scontato 8%, prezzo scontato 15%.
- Articoli obsoleti: barrati.
- Pulsante **Esporta PDF** (in alto): apre il dialog di stampa del browser. Scegli "Salva come PDF" per ottenere il file.
- Pulsante **Aggiorna**: ricarica il listino dal server.

> Se hai una stampante puoi stampare direttamente; il layout è ottimizzato per A4.

---

## 10. Installare l'app sul telefono (PWA)

App Listino è una **PWA**: la puoi installare sulla home del telefono e usarla come un'app nativa.

### Su Android (Chrome / Edge)

1. Apri l'app nel browser.
2. Tocca il menu (`⋮`) → **Installa app** (oppure **Aggiungi a schermata Home**).
3. Conferma. L'icona compare in home.

### Su iPhone / iPad (Safari)

1. Apri l'app in Safari.
2. Tocca l'icona **Condividi** (quadrato con freccia in su).
3. Scorri e scegli **Aggiungi alla schermata Home**.
4. Conferma.

### Vantaggi

- Avvio più veloce, niente barra del browser.
- **Funziona anche offline** per consultare il listino già caricato e iniziare a compilare un ordine. L'invio dell'ordine richiede ovviamente connessione.

---

## 11. Sezione Admin

Le voci di questa sezione sono visibili **solo agli utenti con ruolo admin** (tipicamente il responsabile, non gli agenti). Si accede dal menu **Admin** (`/admin`).

### 11.1 Caricare il listino da Excel

In **Admin** trovi un'area di upload Excel.

1. Trascina (o seleziona) il file `.xlsx` con il listino.
2. Il sistema legge le colonne (codice, descrizione, categoria, raggruppamento, UM, prezzi, obsoleto) e aggiorna la tabella `materials`.
3. Articoli esistenti: aggiornati. Articoli nuovi: inseriti.

> Le descrizioni AI generate in precedenza **restano** anche dopo un nuovo upload del listino, salvo che tu le rigeneri.

### 11.2 Anagrafiche clienti

**Admin → Anagrafiche**.

1. Carica il file Excel delle anagrafiche.
2. Le colonne riconosciute sono: **Codice** (anche `N.Cli.`, `Codice Cliente`, ecc.), **Ragione Sociale**, **Indirizzo**, **CAP/Città**, **Partita IVA**.
3. Le righe esistenti vengono **aggiornate per Codice**; quelle nuove inserite. Codice e Ragione Sociale sono obbligatorie; gli altri campi possono essere vuoti.

> Importa anagrafiche aggiornate periodicamente: l'autocomplete del wizard ordine ne dipende, e l'export XML Metodo ha bisogno del codice cliente per generare il file.

### 11.3 Arricchimento AI delle descrizioni

**Admin → AI Enrichment**.

- **Solo nuovi** — genera descrizioni AI solo per gli articoli che non ne hanno una.
- **Rigenera tutti** — riscrive le descrizioni AI di tutti gli articoli (più lento e più costoso).
- Vedi una **barra di avanzamento** e un log live.

> Richiede `OPENAI_API_KEY` configurata. Modello di default: `gpt-4o-mini` (modificabile da `.env`).

### 11.4 Email per filiale

**Admin → Email**.

Per ogni magazzino imposti:
- **Email destinataria** (To) — la casella che riceve gli ordini.
- **Email in CC** (uno o più indirizzi separati da virgola).

Le mail di ordine usano queste impostazioni in base al magazzino scelto. Se per un magazzino non hai configurato il "To", il sistema usa il fallback `ORDER_EMAIL_TO` da `.env`; se manca anche quello, l'email **non viene inviata** (con warning nei log).

### 11.5 Backup database

**Admin → Backup**.

- **Crea backup ora**: snapshot manuale del DB SQLite. Compare nella lista.
- **Scarica**: download del file `.db`.
- **Ripristina**: sostituisci il DB attivo con un backup. **Operazione distruttiva**: i dati attuali vengono sostituiti.
- **Elimina**: cancella un backup.
- **Backup automatici**: se abilitati nella configurazione, lo scheduler crea snapshot a intervalli regolari (default ogni 6 ore) e li carica su Hetzner Object Storage.

> Verifica periodicamente che i backup S3 siano presenti e leggibili.

### 11.6 Export XML per Metodo

**Admin → Export Metodo**.

1. Cerca un ordine (numero, cliente, cantiere).
2. Premi **Scarica XML**: il file si scarica come `ordine-metodo-N.xml`.
3. Importalo nel gestionale Metodo.

> Anche se l'XML viene già allegato in automatico alle mail, qui lo puoi rigenerare in qualsiasi momento (utile se la mail è stata persa o il cliente ha modificato l'anagrafica).

### 11.7 Gestione utenti

**Admin → Utenti**.

- **Crea utente**: username, password, email, ruolo (`agente` o `admin`).
- **Modifica**: cambia email, password, ruolo.
- **Elimina**: rimuove l'account.

Solo gli admin possono creare/eliminare utenti. La password viene salvata cifrata (bcrypt).

---

## 12. Domande frequenti

**L'autocomplete del cantiere non mostra suggerimenti — perché?**
Probabile che la chiave Google Maps non sia configurata o sia esaurita la quota. Puoi sempre digitare l'indirizzo a mano: l'ordine si invia comunque.

**Ho inviato un ordine sbagliato. Posso annullare?**
Sì, dalla Cronologia premi **Cancella ordine**: parte la mail di cancellazione al magazzino. Avvisa anche per telefono se l'ordine era in lavorazione.

**Il magazzino non riceve la mail.**
Verifica con l'admin che l'email di filiale sia configurata correttamente (sezione 11.4) e che non sia in spam.

**L'XML allegato è vuoto / sbagliato.**
Quasi sempre dipende dal codice cliente nell'anagrafica: se manca, l'XML non viene generato. Re-importa le anagrafiche aggiornate (sezione 11.2) e rigenera l'XML dall'export Metodo (sezione 11.6).

**L'app dice "Sessione scaduta", devo rifare login.**
Normale dopo qualche ora di inattività. Rifai login: gli ordini in corso restano salvati come bozze.

**Posso lavorare offline?**
Puoi consultare il listino già scaricato e iniziare a compilare un ordine offline. L'**invio** richiede connessione: se la connessione torna, l'ordine può essere ripreso e inviato.

**Ho perso una bozza dopo aver cambiato browser.**
Le bozze "in corso di compilazione" stanno solo nel browser. Le bozze **salvate** (con il pulsante Salva bozza) restano invece sul server e si vedono in Cronologia da qualsiasi dispositivo.

**Come cambio password?**
Chiedi all'amministratore: dalla sezione Utenti può resettarla.

---

Hai altre domande? Contatta l'amministratore di sistema o apri una segnalazione interna.
