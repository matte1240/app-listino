# Guida all'uso di Ordini Ivicolors

Manuale d'uso passo-passo per agenti commerciali e amministratori. Questa guida copre tutto quello che serve sapere per usare l'app: dal primo accesso alla creazione di un ordine, dalla gestione delle bozze fino alle funzioni amministrative.

> Se cerchi informazioni tecniche (installazione, variabili d'ambiente, architettura) vai al [README.md](README.md).

---

## Indice

1. [Cos'è Ordini Ivicolors e come accedere](#1-cosè-ordini-ivicolors-e-come-accedere)
2. [Installare l'app sul telefono (PWA)](#2-installare-lapp-sul-telefono-pwa)
3. [Il listino materiali](#3-il-listino-materiali)
4. [Creare un ordine](#4-creare-un-ordine)
5. [Bozze: salvare e riprendere un ordine](#5-bozze-salvare-e-riprendere-un-ordine)
6. [Modificare un ordine già inviato](#6-modificare-un-ordine-già-inviato)
7. [Cancellare un ordine](#7-cancellare-un-ordine)
8. [Cronologia ordini](#8-cronologia-ordini)
9. [Email automatiche](#9-email-automatiche)
10. [Listino in PDF](#10-listino-in-pdf)
11. [Sezione Admin](#11-sezione-admin)
12. [Domande frequenti](#12-domande-frequenti)

---

## 1. Cos'è Ordini Ivicolors e come accedere

Ordini Ivicolors è lo strumento che usi per:

- consultare il **listino materiali** sempre aggiornato,
- creare **ordini** per i tuoi clienti,
- inviare automaticamente l'ordine al **magazzino di competenza**,
- consultare lo **storico** dei tuoi ordini.

### Accesso

1. Apri l'app dal browser (oppure dall'icona se l'hai installata sul telefono — vedi sezione 2).
2. Inserisci il tuo **username** e la **password** che ti ha fornito l'amministratore.
3. Clicca **Accedi**. Resti loggato per qualche ora; se chiudi e riapri, di norma non devi rifare login.

### Cambiare password

Solo l'amministratore può cambiare la tua password (vedi sezione 11.7). Se l'hai dimenticata, chiedigli un reset.

---

## 2. Installare l'app sul telefono (PWA)

Ordini Ivicolors è una **PWA**: la puoi installare sulla home del telefono e usarla come un'app nativa. Conviene farlo subito, prima di iniziare a usarla quotidianamente.

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
- **Notifiche sul telefono** per le approvazioni degli sconti liberi (vedi sotto).

### Attivare le notifiche

Dal menu utente (le tue iniziali in alto a destra) premi **Attiva notifiche** e accetta la richiesta del browser. Da quel momento su questo dispositivo ricevi:

- se sei **admin**: una notifica per ogni ordine, modifica o preventivo con sconti liberi da approvare (tocca la notifica per aprire la pagina Approvazioni);
- se sei **agente**: l'esito delle tue richieste di approvazione.

Note pratiche:

- Su **iPhone/iPad** le notifiche funzionano solo con l'app **installata nella schermata Home** (iOS 16.4 o successivo) e aperta da lì.
- Le notifiche sono legate al dispositivo e all'utente collegato: al **logout** vengono scollegate, così su un tablet condiviso le riceve chi è loggato in quel momento.
- Se il pulsante non compare, l'amministratore non ha ancora configurato le chiavi di notifica sul server: arrivano comunque le email.

---

## 3. Il listino materiali

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

In ogni riga c'è un pulsante per aggiungere l'articolo all'ordine in corso. Quando lo premi, l'articolo entra nel **carrello** del wizard ordine (vedi sezione 4).

---

## 4. Creare un ordine

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
  - **Sconto a riga**: `0%`, `8%`, `15%` oppure **Libero** (digiti tu la percentuale). Lo sconto si applica al prezzo di listino dell'articolo specifico.
- Sotto la barra di ricerca, sempre visibile anche scorrendo la lista, c'è la casella **Articolo manuale / Nota** (vedi sotto): serve per aggiungere righe non presenti a listino senza aprire il carrello.
- Su mobile la barra in basso mostra **articoli e totale**: toccala (o tocca **Carrello** in alto) per aprire il carrello dal basso e vedere, riordinare o modificare le righe.
- Puoi rimuovere un articolo con l'icona **X**.

> **Sconto libero = approvazione dell'amministratore.** Qualsiasi percentuale diversa da 0, 8 e 15 fa passare l'ordine (o il preventivo) da un amministratore prima dell'invio: vedi la sezione 4.1.

#### Righe ordine: ordine di inserimento, note, articoli manuali

Il corpo dell'ordine (pannello **Righe ordine** nel carrello e nel riepilogo) mostra le righe **nell'ordine in cui le hai inserite**, non per codice.

- **Riordinare**: trascina una riga con la maniglia `⋮⋮` (su tablet tieni premuto un attimo, poi trascina) oppure usa le frecce **▲ ▼**.
- **Nota**: nella casella sotto la barra di ricerca tocca **Nota**, scrivi il testo e premi **Aggiungi nota**: la riga va in fondo all'ordine. L'icona "nota sopra" su ogni riga del carrello apre la stessa casella e inserisce la nota sopra quella riga. Serve per intitolare un gruppo di articoli (es. *Materiale per il piano terra*) o dare istruzioni al magazzino. Le note compaiono nella mail, nell'XML Metodo (come sola descrizione) e nel PDF del preventivo.
- **Articolo manuale**: nella stessa casella tocca **Articolo manuale**, compila **descrizione, U.M. (menu a tendina: PZ, ML, MQ, KG — di default PZ), quantità e prezzo** (con lo stesso selettore sconto degli articoli) e premi **Aggiungi**. La quantità non è precompilata: se la lasci vuota (o manca la descrizione) compare un avviso in rosso e la riga non viene inserita. Se cerchi un articolo che non esiste a listino, sotto "Nessun risultato" trovi **Inseriscilo come articolo manuale** con la descrizione già compilata. Nell'XML Metodo la riga usa il codice generico configurato dall'admin (sezione 11.9).
- **Modificare** una riga manuale o una nota: nel carrello e nel riepilogo le righe sono di sola lettura, come gli articoli; il pulsante **Modifica** riapre la casella sotto la barra di ricerca già compilata (premi **Salva modifica** per confermare).
- Le righe vuote (nota senza testo, articolo manuale senza descrizione o quantità) non vengono salvate.

### Step 3 — Dettagli

- **Magazzino**: scegli da quale filiale spedire (Pordenone, Udine, Fossalta di Portogruaro, Trieste). La mail dell'ordine andrà alla casella della filiale scelta.
- Conferma o modifica i dati di consegna inseriti nello step 1.
- **CIG** e **CUP** (sotto il luogo di consegna, facoltativi): per gli ordini legati a lavori pubblici o a clienti della Pubblica Amministrazione. Il **CIG** (Codice Identificativo Gara) ha **10 caratteri**, il **CUP** (Codice Unico di Progetto) **15 caratteri**: lettere e numeri vengono messi in maiuscolo e spazi o trattini tolti in automatico. Se il codice è incompleto compare un avviso in rosso e non si passa al riepilogo. I codici compaiono nel riepilogo, nella mail e nell'XML Metodo (campi di testata `<cig>` e `<cup>`).

### Step 4 — Riepilogo

Vedi un'anteprima completa dell'ordine: cliente, magazzino, cantiere, data, note, lista articoli con quantità, sconti, prezzo unitario e prezzo effettivo. Anche qui puoi riordinare le righe, aggiungere note e articoli manuali.

- **Spese di trasporto**: spunta la casella e inserisci l'importo. Il trasporto compare come **ultima riga** dell'ordine (in mail, XML e PDF) e rientra nel totale imponibile.

Tre azioni possibili:

- **Salva bozza** — l'ordine resta in stato "Bozza" e non parte alcuna mail. Puoi riprenderlo in qualsiasi momento.
- **Invia a magazzino** — l'ordine viene confermato, salvato e inviato per email al magazzino + a te in CC. Vedi sezione 9.
- **Invia per approvazione** — compare al posto di "Invia a magazzino" quando ci sono sconti liberi (vedi 4.1).
- **Annulla** — chiude il wizard senza salvare nulla.

### 4.1 Sconti liberi e approvazione dell'amministratore

Se almeno una riga ha uno **sconto libero** (diverso da 0, 8% e 15%):

1. Nel riepilogo compare un avviso giallo e il pulsante diventa **Invia per approvazione**.
2. L'ordine viene salvato nello stato **In approvazione**: il magazzino **non** riceve nulla.
3. Gli amministratori ricevono una **email** e, se attivate, una **notifica sul telefono** (sezione 2).
4. Quando un admin decide, ricevi email/notifica con l'esito:
   - **Approvato** → l'ordine diventa *Confermato* e parte la mail al magazzino come per un ordine normale.
   - **Rifiutato** → l'ordine torna in **Bozza** con la motivazione dell'admin visibile in cronologia. Correggi gli sconti e reinvialo.
5. Finché è in approvazione puoi ancora modificarlo (torna in valutazione) o eliminarlo.

Regole utili:

- Un **preventivo** con sconti liberi segue lo stesso percorso: resta *In approvazione* e finché non è approvato non puoi stamparlo né trasformarlo in ordine. Se viene rifiutato, correggi gli sconti e salvalo di nuovo.
- Un ordine creato da un **preventivo già approvato** parte subito, purché le righe scontate siano identiche a quelle approvate. Se cambi prezzo o sconto, torna in approvazione.
- Anche la **modifica** di un ordine già confermato con sconti liberi passa dall'approvazione: l'ordine originale resta quello inviato al magazzino finché l'admin non approva la modifica.
- Gli amministratori non hanno bisogno di approvazione: i loro sconti liberi partono subito.

> **Suggerimento**: se non vuoi perdere quello che hai compilato, premi **Salva bozza** prima di chiudere. Il wizard non salva da solo: chiudendo la scheda senza salvare, i dati vanno persi.

### 4.2 Preventivi

Il wizard dei preventivi ha gli stessi step dell'ordine (cliente, articoli, dati, riepilogo). Nello step **Dati** trovi:

- **Data consegna prevista** e **validità** (7, 15 o 30 giorni).
- **Destinazione cantiere** (opzionale): scegli una destinazione recente del cliente o digita l'indirizzo, come nell'ordine. Se la lasci vuota, nel PDF la casella *Destinazione diversa* riporta **STESSA** (la sede del cliente). Trasformando il preventivo in ordine la destinazione viene ricopiata nel luogo di consegna.
- **Note** che compaiono nel PDF.

Il PDF (pulsante **PDF** nel dettaglio del preventivo) è un foglio A4 in stile Metodo: le righe articolo sono separate solo dalle colonne, le note di riga in corsivo nella colonna Descrizione, le spese di trasporto per ultime.

---

## 5. Bozze: salvare e riprendere un ordine

Una **bozza** è un ordine ancora in lavorazione, non ancora inviato.

### Quando si crea una bozza

Quando premi **Salva bozza** nello step 4 del wizard. La bozza viene salvata sul server e diventa visibile in Cronologia ordini da qualsiasi dispositivo.

### Riprendere una bozza

Vai su **Cronologia ordini**: le bozze hanno un'etichetta dedicata. Aprila e premi **Modifica** per riaprire il wizard con tutti i dati pre-compilati.

### Scartare una bozza

Dalla cronologia ordini, sulla bozza, c'è il pulsante **Elimina**. La bozza viene cancellata in modo definitivo, senza inviare alcuna mail.

> **Attenzione**: il wizard non ha auto-save. Se chiudi la scheda o vai su un'altra pagina prima di premere **Salva bozza** o **Invia ordine**, perdi quello che hai compilato. Una volta salvata, la bozza è sicura sul server e la ritrovi da qualsiasi dispositivo.

---

## 6. Modificare un ordine già inviato

Anche dopo l'invio puoi modificare un ordine. Funziona in modo "sicuro": l'ordine originale resta intatto finché non confermi le modifiche.

### Come funziona

1. Apri l'ordine confermato dalla **Cronologia ordini** e premi **Modifica**.
2. Si apre il wizard pre-compilato. Cambia quello che serve (articoli, quantità, sconto, cantiere, data, note...).
3. Premi **Salva bozza** per parcheggiare le modifiche senza applicarle (l'ordine originale è ancora intatto), oppure **Invia modifica** per applicarle subito. Se la modifica contiene **sconti liberi**, resta in attesa dell'amministratore (badge *Modifica in approvazione*): l'ordine inviato al magazzino resta quello originale finché non viene approvata.
4. Quando applichi, parte una mail **"Ordine Modificato"** al magazzino + CC a te. La mail mostra **chiaramente cosa è cambiato**:
   - **Verde / `+ AGGIUNTO`** — articoli aggiunti.
   - **Rosso / `− RIMOSSO`** — articoli rimossi (testo barrato).
   - **Giallo / `~ MODIFICATO`** — articoli con quantità, sconto, prezzo o descrizione cambiati. Per ogni campo modificato vedi *valore vecchio → valore nuovo*.
   - **Sezione "Modifiche intestazione"** — se hai cambiato cliente, magazzino, cantiere, data o note, vedi una tabellina *Campo / Prima / Dopo* in cima alla mail.

Allegato: un nuovo file XML Metodo aggiornato.

### Scartare le modifiche

Se hai salvato come bozza la modifica ma poi cambi idea, vai sull'ordine in cronologia e premi **Scarta modifiche** (o equivalente). L'ordine torna come prima e nessuna mail viene inviata.

---

## 7. Cancellare un ordine

Dalla cronologia, apri un ordine confermato e premi **Cancella ordine** (o l'icona del cestino).

- L'ordine viene marcato come **annullato**.
- Parte una mail **"Ordine Cancellato"** al magazzino + CC a te.
- A differenza della modifica, **non c'è allegato XML** (l'ordine non va più importato).

Le **bozze** invece si eliminano senza notifica via mail (vedi sezione 5).

---

## 8. Cronologia ordini

Il menu **Ordini** mostra l'elenco di tutti i tuoi ordini.

- **Ricerca** in alto — cerca per numero ordine, cliente, cantiere o nome agente.
- Ogni riga mostra: numero, cliente, cantiere, data, magazzino, totale articoli, **stato** (badge colorato).
- Tocca una riga per espandere il dettaglio: cliente completo, articoli con quantità/sconto/prezzo, note.

### Stati possibili

| Stato | Significato |
|---|---|
| **Bozza** | Non ancora inviato. Puoi riprenderlo o eliminarlo. Se è stato rifiutato dall'admin, vedi la motivazione nel dettaglio. |
| **In approvazione** | Contiene sconti liberi: in attesa di un amministratore. Il magazzino non l'ha ancora ricevuto. |
| **Confermato** | Inviato al magazzino. Mail spedita. |
| **In lavorazione** | Il magazzino sta preparando l'ordine. |
| **Spedito** | In viaggio. |
| **Consegnato** | Concluso. |
| **Annullato** | Cancellato. |

> Gli stati intermedi (in lavorazione, spedito, consegnato) li imposta il magazzino o l'amministratore — non l'agente.

---

## 9. Email automatiche

Ogni volta che invii o modifichi un ordine, parte una mail. Vediamo a chi arriva e cosa contiene.

### Destinatari

- **A**: la casella email del **magazzino** scelto nello step 3 (configurata dall'admin, vedi sezione 11.4).
- **CC**: la tua email (quella registrata sul tuo account agente) + eventuali indirizzi in CC configurati per il magazzino.
- **Reply-to**: la tua email, così se il magazzino risponde la risposta torna a te.
- **Da**: il mittente configurato dall'admin nelle variabili `.env` (`GMAIL_FROM_NAME` + `GMAIL_FROM_ALIAS`).

### Tipi di mail

| Quando | Oggetto | Contenuto | Allegato |
|---|---|---|---|
| Nuovo ordine inviato | `Nuovo Ordine #N // Cliente // Cantiere` | Riepilogo completo (cliente, cantiere, data, articoli, note, trasporto, totale) | XML Metodo |
| Modifica ordine | `Ordine Modificato #N // ...` | Diff con sezioni intestazione + righe (verde/rosso/giallo), avviso se le righe sono state riordinate | XML Metodo aggiornato |
| Cancellazione | `Ordine Cancellato #N // ...` | Notifica di cancellazione | — |
| Sconto libero (agli admin) | `Richiesta di approvazione: Ordine #N // Cliente` | Righe con le scontistiche libere evidenziate e link alla pagina Approvazioni | — |
| Esito approvazione (all'agente) | `Ordine #N approvato // Cliente` oppure `... rifiutato` | Esito, motivazione dell'admin e link all'app | — |

Le righe **nota** compaiono nella mail come riga a tutta larghezza; le **spese di trasporto** come ultima riga.

### Cos'è l'allegato XML Metodo

È un file `ordine-metodo-N.xml` pronto per essere importato nel gestionale Metodo. Il magazzino lo apre e importa direttamente: niente trascrizione manuale.

Se nell'ordine sono indicati **CIG** e/o **CUP**, il file li riporta nei campi di testata `<cig>` e `<cup>` previsti dal tracciato Metodo per l'acquisizione ordini da XML. Perché vengano importati, i campi CIG e CUP devono esistere nel tracciato delle testate ordini di Metodo (configurazione a cura dell'assistenza Metodo).

> **Quando l'allegato non c'è**: se il cliente dell'ordine non è collegato a un'anagrafica con codice (cioè è un cliente "libero" digitato a mano), l'XML non si può generare. La mail parte comunque, ma senza allegato. Se ti serve l'XML, accerta che il cliente sia stato selezionato dalle anagrafiche.

### Quando le email **non** partono

- Quando salvi una **bozza** — non c'è nessuna mail.
- Quando elimini una bozza — nessuna mail.
- Se il sistema non ha le credenziali Gmail configurate (problema di setup, segnalalo all'admin).

---

## 10. Listino in PDF

Nella pagina **Listino** usa il pulsante **Esporta PDF** per aprire una versione del listino pensata per la stampa.

- Tabella desktop / cards mobile con: codice, descrizione (AI se disponibile), prezzo listino, prezzo scontato 8%, prezzo scontato 15%.
- Articoli obsoleti: barrati.
- Pulsante **Esporta PDF** (in alto nella pagina Listino): apre il dialog di stampa del browser. Scegli "Salva come PDF" per ottenere il file.

> Se hai una stampante puoi stampare direttamente; il layout è ottimizzato per A4.

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

Il mittente visibile non si configura qui: usa `GMAIL_FROM_NAME` per il nome (es. `Ordini App`) e `GMAIL_FROM_ALIAS` per l'indirizzo alias già abilitato in Gmail. L'account `GMAIL_USER` resta quello usato per autenticarsi.

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

### 11.8 Approvazioni (sconti liberi)

**Admin → Approvazioni** (la voce **Admin** nel menu mostra un contatore giallo quando c'è qualcosa in attesa).

La pagina elenca ordini, modifiche di ordini confermati e preventivi che contengono sconti liberi, dal più vecchio al più recente. Per ognuno vedi cliente, agente, data della richiesta, totale e tutte le righe, con quelle a sconto libero **evidenziate in giallo**; per le modifiche anche un riassunto delle differenze rispetto all'ordine già inviato.

- **Approva**: l'ordine viene confermato e parte la mail al magazzino (con l'agente in CC); la modifica viene applicata e parte la mail "Ordine Modificato"; il preventivo diventa attivo (stampabile e trasformabile in ordine).
- **Rifiuta**: scrivi una motivazione (consigliata). L'ordine torna in bozza all'agente, la modifica resta in bozza come "rifiutata" e il preventivo diventa "rifiutato". L'agente riceve email/notifica con la motivazione.

Gli admin ricevono una email (all'indirizzo impostato sul loro utente) e una notifica push per ogni nuova richiesta: assicurati che ogni admin abbia l'**email** compilata in **Admin → Utenti**.

### 11.9 Impostazioni

**Admin → Impostazioni**.

- **Codice per "Spese di trasporto"** e **Codice per gli articoli inseriti manualmente**: sono i codici articolo usati nell'XML Metodo per le righe non presenti a listino. Devono corrispondere ad articoli generici esistenti nel gestionale, altrimenti l'import del file fallisce. Le righe **nota** vengono esportate con la sola descrizione.

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

**Ho compilato un ordine, sono uscito dalla pagina e ho perso tutto.**
Il wizard non salva automaticamente: prima di lasciare la pagina premi **Salva bozza**. Le bozze salvate restano sul server e si ritrovano in Cronologia da qualsiasi dispositivo.

**Come cambio password?**
Chiedi all'amministratore: dalla sezione Utenti può resettarla.

---

Hai altre domande? Contatta l'amministratore di sistema o apri una segnalazione interna.
