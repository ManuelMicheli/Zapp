# Import multipiattaforma: tutto quello che l'utente ha visto, ovunque

Data: 2026-09-15 — stato: progettato, non implementato.

## Il problema

Zapp importa da Netflix, Letterboxd, TV Time e da un file generico. Disney+, NOW,
Prime Video e Apple TV — cioè la metà di quello che un utente italiano guarda —
non hanno nessuna strada. Chi arriva su Zapp con dieci anni di visioni sparse su
cinque servizi ne recupera uno.

## Cosa esiste già (2026-09-15, verificato su `origin/main`)

- **Lo scrobble continuo è coperto su quattro piattaforme.** ZConnection 1.3.5
  cattura Netflix, Prime Video, Disney+ e NOW (`extension/adapters/*.js`,
  `src/lib/scrobble/providers/{prime,disney,now}.ts`, fixture e test). App Android
  e app Fire TV coprono le app native. **Da qui in avanti** la libreria si riempie
  da sola: questa spec non tocca lo scrobble.
- **Il tubo di import è generico e collaudato**: `ImportCandidate` →
  `match.ts` (TMDB, varianti di query, soglia 0,85, episodio dal nome) →
  `mergeProposals` → RPC `import_watch_entries` (guard anti-degrado, voto
  dell'utente mai sovrascritto), con riconoscimento e scrittura in blocchi corti
  guidati da `ImportProvider` e chip di progresso. **Nulla di tutto questo cambia.**
- **Aggiungere una sorgente costa una voce** in `src/lib/import/sources/registry.ts`
  più un parser `parse(files: SourceFile[]): ParsedSource`.

Il problema è quindi tutto **a monte del tubo**: procurarsi i dati.

## Cosa danno davvero le piattaforme (verificato il 2026-09-15)

| Piattaforma | Cronologia consultabile | Export ufficiale | Attesa |
| --- | --- | --- | --- |
| Netflix | sì, CSV scaricabile | sì | nessuna |
| Prime Video | **sì**, pagina "Cronologia visione" (HTML paginato) | DSAR Amazon, CSV | giorni |
| Apple TV | no | privacy.apple.com → *Apple Media Services* (CSV, include la cronologia di visione) | 3-7 giorni |
| Disney+ | no (solo "Continua a guardare") | solo DSAR portale privacy Disney | fino a 30 giorni |
| NOW | no | solo DSAR Sky | fino a 30 giorni |

Nessuna delle quattro ha un'API pubblica. Simkl, che di mestiere fa questo,
dichiara di non riuscire a importare da Disney+, Prime e HBO "perché non hanno
pagine di cronologia o non danno API". Non esiste una scorciatoia che ci stiamo
perdendo: o si legge la pagina dell'utente nel browser dell'utente, o si aspetta
il DSAR.

## Le tre fasi

Indipendenti fra loro, rilasciabili una alla volta, in ordine di valore su attesa.

1. **Sniffer universale ricco** — una sorgente sola che digerisce qualunque export.
2. **One-shot dall'estensione** — cronologia Prime e "Continua a guardare".
3. **Wizard DSAR con memoria e promemoria** — per Disney/NOW/Apple.

```
  /import (hub, riordinato per attesa crescente)
     │
     ├─ estensione installata? → cronologia Prime + "Continua a guardare"   [fase 2]
     ├─ Netflix CSV (oggi) · Letterboxd · TV Time                           [esiste]
     ├─ /import/export  ← qualunque zip/csv/json di qualunque piattaforma    [fase 1]
     └─ /import/richiesta/[piattaforma] → portale privacy, memoria, push     [fase 3]
                                   ↓ (giorni dopo)  /import/export
     tutte le strade producono ImportCandidate[] → match.ts → import_watch_entries
```

---

## Fase 1 — Sniffer universale ricco

Sorgente nuova, slug `export`, titolo "Export della piattaforma". Una sola
scheda, che accetta **qualunque** zip/csv/json venga da un DSAR, e quattro
schede di sole istruzioni (`apple`, `disney`, `now`, `prime`) che puntano tutte a
questo parser. Niente parser per piattaforma: le particolarità note vivono come
**profili** dentro lo sniffer.

### Perché sniffer e non parser dedicati

Non possiamo vedere un export Apple o Disney prima di averne uno in mano (3-30
giorni), e quel formato cambierà senza avvisarci. Uno sniffer che riconosce le
colonne **per contenuto** funziona il giorno zero e sopravvive ai cambi di
formato; i profili aggiungono precisione dove abbiamo visto un file vero.

### Il parser, passo per passo

`src/lib/import/sources/export.ts`, puro, Vitest. Gli zip li apre già
`archive.ts` prima di arrivare qui.

1. **Selezione dei file.** Un export Apple è una cartella con decine di CSV di
   cui uno solo è la cronologia. Ogni file viene profilato e **tenuto solo se le
   sue colonne sembrano una cronologia** (almeno un titolo e almeno una fra data
   e durata); gli altri finiscono in un avviso, non in un errore. Per il JSON si
   cerca ricorsivamente (profondità max 4) il primo array di oggetti con un campo
   che somiglia a un titolo.
2. **Profilazione delle colonne** (`profileColumns`). Sui primi 200 valori di
   ogni colonna: percentuale di date valide, di interi piccoli (1-100), di durate
   `hh:mm:ss`, di interi grandi (secondi/millisecondi), lunghezza media del testo,
   numero di valori distinti. Poi due passaggi di assegnazione:
   - **per nome**, con dizionario italiano/inglese: titolo (`title`, `titolo`,
     `nome`, `show`, `series`, `programma`, `content`, `item`), data (`date`,
     `data`, `watched`, `played`, `timestamp`, `start time`), stagione, episodio,
     durata (`duration`, `durata`, `runtime`, `playback`, `seconds`, `ms played`),
     voto, tipo, anno, progresso (`progress`, `percent`, `completion`, `position`),
     e una lista di colonne **da ignorare** (profilo, dispositivo, ip, paese);
   - **per contenuto**, quando il nome non dice niente (Apple usa intestazioni
     opache): la colonna con le stringhe più lunghe e più uniche è il titolo;
     quella con più date parsabili è la data; due colonne di interi piccoli
     affiancate sono stagione ed episodio.
   Ogni assegnazione ha un punteggio; sotto soglia la colonna resta non assegnata
   e l'utente vede un avviso ("colonna data non trovata: le date non verranno
   importate"), non un fallimento.
3. **Profili noti** (`PROFILI`): una firma di intestazioni → mappatura esatta più
   le regole proprie di quella piattaforma. Il primo profilo che combacia salta
   il passo 2. Nascono dopo aver visto un export vero — è il "parser dopo" della
   scelta di progetto, ma dentro lo stesso file e senza slug nuovi.
4. **Riga → candidato** (`rowToCandidate`):
   - **Titolo.** `splitTitolo` (pura, Vitest) stacca stagione, episodio e nome
     dell'episodio dai pattern noti — `S01E03`, `1x03`, `Stagione 1: Episodio 3`,
     `Season 1, Episode 3`, `- Ep. 3`, più le forme Netflix già gestite da
     `parseNetflixTitle` — e ciò che resta è il nome della serie. Nessun pattern e
     nessuna colonna di tipo: si comporta come oggi Netflix (due parti → prova
     film, poi serie).
   - **Durata e riproduzioni parziali.** Sotto i **120 secondi** la riga si
     scarta: è la stessa soglia anti-anteprima dello scrobble (`riproduzioneVera`),
     e serve perché il "Continua a guardare" di Prime registra anche i trailer.
     Con una colonna di progresso sotto l'**85%** il candidato diventa
     `status: "watching"` invece di `"watched"` — `watch_entries.status` ha già
     quel valore, e la RPC non degrada mai una entry esistente.
   - **Voto.** Scala riconosciuta dal massimo osservato nel file: 5 → ×2,
     10 → invariato, 100 → ÷10.
   - **Data.** `inferDateOrder` di `sources/netflix.ts` (già pura e testata)
     decide giorno/mese **sull'intero file**, non riga per riga.
   - **Anno**, quando c'è: restringe la ricerca TMDB (campo `year` già previsto).
5. **Raggruppamento.** `groupRows` generalizzato fuori da `netflix.ts`: chiave
   `normalizeTitle(serie) + kind`, tiene la stagione più avanzata, somma gli
   episodi e raccoglie fino a 60 `episodeTitles`. **Questo è il pezzo che rende
   lo sniffer "dettagliato"**: con i nomi degli episodi, `resolveEpisodeNumber`
   (che oggi lavora solo per Netflix) calcola il progresso vero su TMDB per
   qualunque piattaforma, invece di contare le righe.

`ParsedSource` guadagna un campo `avvisi?: string[]`, mostrato da `ImportClient`
sopra il bottone: quali file sono stati ignorati e quali colonne non si sono
capite. Un export che non si capisce deve dire **cosa** non ha capito, altrimenti
l'utente non sa che caricare.

### Il caricamento non passa più dalla Server Action

Oggi i file salgono dentro il corpo di una Server Action: tetto di 5 MB sulla
somma, corpo a 6 MB, zip decompresso a 10 MB. Un export Apple completo li supera,
e **sul telefono non si può chiedere all'utente di aprire lo zip e pescarne un
CSV**: su iOS si può decomprimere in File, su Android spesso no.

Quindi per la sorgente `export` il file va **direttamente su Supabase Storage dal
client**, bucket privato `import-uploads`, percorso `<user_id>/<uuid>/<nome>`, RLS
come per `tickets` e `avatars` (che già fanno esattamente questo da
`TicketImport.tsx` e `AvatarPicker.tsx`, telefono compreso). Tetto **100 MB**.
La Server Action riceve solo il percorso, non i byte.

Lo zip non si decomprime tutto: `archive.ts` legge già la central directory prima
di estrarre, quindi si **scelgono le voci** per nome ed estensione (csv/json/tsv,
scartando media, immagini e PDF) e si decomprimono solo quelle, con il budget di
10 MB applicato alle voci scelte invece che all'archivio. Un export enorme entra
lo stesso, perché di enorme ha gli allegati, non le tabelle.

Il file caricato si cancella appena l'import è stato analizzato: è cronologia
personale, non deve restare in un bucket. Cancellazione anche su errore, e un
job di pulizia per i percorsi più vecchi di 24 ore.

### Prova

Vitest su fixture sintetiche: una per forma di colonna prevista (nomi italiani,
nomi inglesi, intestazioni opache), una con durate in secondi, una con
`hh:mm:ss`, una con progresso percentuale, una con titoli `S01E03`, una JSON
annidata, una con file estranei da ignorare. Le fixture vere si aggiungono quando
arriva un export, insieme al profilo.

---

## Fase 2 — One-shot dall'estensione

Due letture, entrambe **su gesto esplicito dell'utente**, nella sua sessione, sui
suoi dati. Entrambe producono candidati, non eventi di scrobble: passano da un
endpoint nuovo `POST /api/import/estensione`, autenticato col token dispositivo
come `/api/scrobble`, che richiede il consenso `scrobble` già esistente e mette
le righe nella stessa coda di import.

### 2a — Cronologia Prime Video

L'utente apre la pagina "Cronologia visione" di Prime; l'estensione mostra una
barra Zapp con "Importa questa cronologia in Zapp". Premuto il bottone,
l'adapter legge le righe visibili e **preme "Mostra altro" fino in fondo**
(scelta di perimetro presa esplicitamente: automazione consentita solo dopo il
gesto dell'utente, solo su quella pagina, solo su sua richiesta), con un tetto di
sicurezza (200 pagine / 3 minuti) e una barra di avanzamento. Titolo, data e, dove
c'è, l'indicazione di stagione/episodio vanno al server come candidati grezzi: il
parsing del titolo è lo stesso `splitTitolo` della fase 1, **sul server**, come già
vale per lo scrobble.

Servono le host permission per `amazon.it` e `primevideo.com` sulle pagine
impostazioni (lo scrobble ha già i domini) e una riga nella scheda dello store che
spieghi la lettura della cronologia.

### 2b — "Continua a guardare"

Disney+, NOW e Prime espongono in home la fila "Continua a guardare": 20-40
titoli che l'utente sta guardando davvero. Gli adapter la leggono **una volta**,
alla prima apertura dopo l'installazione e poi su richiesta dal popup, e ne fanno
candidati `status: "watching"` senza numero di episodio (che lo scrobble
correggerà appena l'utente riprende). Non è storico profondo: è il modo di avere
qualcosa di vero in libreria **il primo giorno**, senza moduli e senza attese.

---

## Fase 3 — Wizard DSAR con memoria e promemoria

Per Disney+, NOW e Apple TV la richiesta formale è l'unica strada al pregresso.
Il problema non è chiederla: è che l'utente se ne dimentica.

Rotta `/import/richiesta/[piattaforma]` (`apple`, `disney`, `now`, `prime`):
i passi esatti, il link al portale privacy giusto, e un bottone "L'ho richiesta".

Tabella nuova `import_requests`: `user_id`, `platform`, `requested_at`,
`expected_at`, `state` (`requested` | `imported` | `dismissed`), RLS come le altre
tabelle utente (solo il proprietario legge e scrive). `expected_at` =
`requested_at` + ritardo tipico: Apple 7 giorni, Amazon 5, Disney e NOW 30.

L'hub `/import` mostra le richieste aperte in cima ("Apple: richiesta 5 giorni fa,
di solito arriva entro il 22 settembre — caricala qui appena ti arriva"). A
`expected_at` parte **una** notifica push, tramite l'infrastruttura esistente
(`src/lib/push/fanout.ts`) e un job `promemoria-export` dietro `/api/jobs/[job]`
schedulato da `pg_cron` come gli altri. Il testo dice "dovrebbe essere pronto,
controlla la posta", non "è pronto": l'email la riceve l'utente, noi non la
vediamo e non possiamo saperlo. Un secondo sollecito dopo altri 7 giorni se lo
stato è ancora `requested`, poi silenzio. Caricare un export chiude la richiesta
più vecchia di quella piattaforma (`state: "imported"`).

---

## Tutto dal telefono (tranne l'estensione)

Requisito esplicito: chi ha solo il telefono deve poter fare **tutto** — chiedere
l'export, riceverlo, caricarlo, importarlo. L'export arriva per email, e l'email
la si legge sul telefono: se l'import è solo da desktop, la strada si interrompe
proprio dove l'utente si trova.

Cosa serve perché funzioni davvero:

- **Caricamento diretto su Storage** (sopra): senza, un export da telefono non
  passa. È questo il motivo principale del cambio.
- **Niente "apri lo zip ed estrai il CSV"**: lo zip si carica com'è e la selezione
  delle voci la fa il server. Le istruzioni non chiedono mai un'operazione da file
  manager.
- **Il selettore file dentro l'app nativa.** Nella WebView del guscio Expo un
  `<input type="file">` funziona da solo su iOS (WKWebView) ma su Android richiede
  che il guscio implementi `onShowFileChooser`: **da verificare sul dispositivo, e
  se manca va aggiunto nel repo ZappMobile**. Ripiego, se il guscio non lo
  supportasse: il bottone apre `/import/export` nel browser di sistema, dove la
  sessione è già valida.
- **Deep link ai portali privacy** (fase 3): `target="_blank"` con
  `rel="noopener"`, che nel guscio apre il browser di sistema — i portali Apple,
  Amazon, Disney e Sky richiedono login e non devono aprirsi dentro la WebView.
- **L'import gira finché l'app è in primo piano.** `ImportProvider` lavora a
  blocchi nel client: sul telefono, mandare l'app in background sospende il
  JavaScript e l'import si ferma lì dov'è (riprende riaprendo: i blocchi già
  scritti restano). La chip lo dice con una riga — "tieni Zapp aperto, ci vuole
  un minuto" — invece di lasciar credere che stia proseguendo.
- **Layout**: la scheda `export`, il wizard e la chip sono mobile-first come il
  resto dell'app; l'elenco degli avvisi non deve spingere il bottone fuori
  schermo.

Facoltativo, non in questa spec: registrare Zapp come destinazione di
condivisione per `application/zip` su Android e come share extension su iOS, così
dall'email si fa "Condividi → Zapp". Vale un giro solo se il caricamento normale
risultasse scomodo alla prova.

---

## Cosa non facciamo, e perché

- **Niente scraping lato server** di Netflix, Prime o Disney: resta vietato dalle
  regole del progetto. Tutto ciò che si legge, si legge nel browser dell'utente,
  nella sua sessione, dopo un suo gesto.
- **Niente schermata di revisione manuale** dei titoli non riconosciuti: il tubo
  attuale li conta e basta, e non è questa spec a cambiarlo.
- **Niente parser dedicati prima di avere un export vero in mano.**

## Ordine di rilascio

1. **Fase 1** — sblocca subito le quattro piattaforme per chi un export ce l'ha
   già, ed è quella che regge tutte le altre (anche il DSAR finisce qui).
2. **Fase 2** — valore immediato per chi ha l'estensione, zero attesa.
3. **Fase 3** — ha senso solo dopo la 1: manda l'utente a chiedere un file che
   sappiamo digerire.

## Rischi

| Rischio | Mitigazione |
| --- | --- |
| Formato DSAR sconosciuto e illeggibile | Sniffer per contenuto + avvisi espliciti su cosa non si è capito; profilo aggiunto quando arriva un file vero |
| Export troppo grande per una Server Action | Caricamento diretto su Storage (100 MB) e decompressione delle sole voci tabellari |
| Il selettore file non si apre nella WebView Android | Da provare sul dispositivo alla fase 1; se manca, `onShowFileChooser` nel guscio o apertura nel browser di sistema |
| Amazon cambia il DOM della cronologia | Stesso rischio già accettato per lo scrobble: si corregge nell'adapter, e il DSAR resta come strada alternativa |
| Righe parziali/trailer che sporcano la libreria | Soglia 120 s e progresso < 85% → `watching`, mai `watched` |
| Revisione dello store per i nuovi permessi | La lettura è su gesto, documentata nella scheda; i domini dello scrobble ci sono già |
