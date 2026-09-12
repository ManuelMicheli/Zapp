# ZConnection su TV — spec di design

Data: 2026-09-12. Sostituisce le parti di `2026-09-04-zconnection-design.md` che
poggiavano su una premessa falsa. Le misure che giustificano ogni scelta stanno in
`docs/zconnection/FIRETV-SONDA-2026-09-12.md` (sonda su Fire TV Stick 4K, Fire OS
6.7.1.1): **qui non si ripetono**, si citano.

## 1. Obiettivo e limite dichiarato

Cio' che l'utente guarda in salotto arriva in Zapp da solo, e da Zapp si apre un
titolo sul televisore.

Il limite, dichiarato subito perche' governa tutto il resto: **su Fire OS nessuna
app puo' sapere da sola cosa si sta guardando** su Netflix, Prime Video e Apple TV
(sessione senza metadati), e il permesso che serve per leggere le sessioni **non ha
interfaccia**. Quindi il sistema ha **due modalita'**, e la differenza non e' un
interruttore ma un fatto che l'app verifica a ogni ripresa.

## 2. Perimetro

Valgono i vincoli della spec del 4 settembre §2 (mai credenziali, cookie o sessioni
delle piattaforme; nessuna API non ufficiale verso di loro; nessuno scraping), piu':

- **Il deep link e' un'apertura, non un comando di riproduzione occulto.** Si usano
  le forme pubbliche che ogni app dichiara nel proprio manifest.
- **Niente scrittura in libreria senza prova o senza conferma** (§5).
- L'app sulla TV e' **muta**: cattura e spedisce, non riconosce. Titolo, episodio e
  regole di completamento si calcolano sul server, con il codice gia' scritto per
  l'estensione browser (`src/lib/scrobble/*`).

## 3. I pezzi

| Pezzo | Dove | Ruolo |
| --- | --- | --- |
| **ZConnection** | app Kotlin, zero dipendenze, Fire OS + Android TV | abbinamento, ritiro comandi, apertura titoli, invio eventi |
| **Ingest** | `POST /api/scrobble` (esiste) | riceve gli eventi, identico all'estensione |
| **Comandi** | `GET/POST /api/devices/commands` (nuovo) | coda dei "apri questo titolo" |
| **Abbinamento** | `/api/devices/pair`, `/api/devices/pair/{code}` (nuovi) | codice a 6 cifre |
| **Pipeline** | `src/lib/scrobble/*` (esiste) | package -> piattaforma, metadati -> titolo, progresso |
| **DB** | `devices`, `device_members`, `watch_sessions`, `pending_scrobbles` (esistono) + `pairing_codes`, `device_commands` (nuove) | |
| **UI Zapp** | scheda titolo, `/devices` | tondo "sulla TV", elenco e revoca dispositivi |

Flusso di lettura: `ZConnection -> /api/scrobble -> pipeline -> scrobble_apply ->
watch_entries / watch_sessions / pending_scrobbles`.

Flusso di scrittura: `Zapp -> device_commands -> sondaggio della TV -> Intent`.

## 4. Abbinamento e permesso: due cose separate

### 4.1 Abbinamento (obbligatorio)

Modello "login TV", invariato dalla spec del 4 settembre §4. Al primo avvio
ZConnection genera `install_id` e `device_token` (32 byte casuali, prefisso `zc_`),
chiama `POST /api/devices/pair` mandando **l'hash** del token, e mostra codice a 6
cifre + QR. L'utente lo digita in Zapp; la RPC `claim_pairing_code` crea `devices` e
`device_members`. La TV scopre di essere stata reclamata sondando
`GET /api/devices/pair/{code}`.

**Il token non viaggia mai dal server alla TV**: l'ha generato la TV, il server ne
conosce solo l'hash. Codici: 6 cifre, unici fra i non scaduti, vita 10 minuti,
cancellati alla consegna; claim limitato per utente.

### 4.2 Permesso (facoltativo, sblocca la modalita' completa)

La schermata Permesso non chiede: **dice cosa manca, cosa sbloccherebbe, e quali vie
sono disponibili**. Su Fire OS la schermata di sistema non esiste e l'app **non puo'
concedersi il permesso da sola** (sonda §2: adbd non serve i chiamanti locali,
verificato anche dalla shell con lo stesso uid di adbd). Serve che la connessione
nasca da un **altro** dispositivo sulla rete.

**La concessione e' un ruolo con piu' attuazioni**, ed e' l'unico punto di questa
spec pensato per cambiare senza toccare l'architettura:

| Attuazione | Stato | Note |
| --- | --- | --- |
| **PC** | disponibile | guida passo-passo in `/devices`, con l'indirizzo mostrato dalla TV |
| **App Zapp nativa** (Android, poi iOS) | futura | parla ADB dalla rete di casa; progetto suo, non questo |
| **Android TV / Google TV** | disponibile su quell'hardware | la schermata di sistema esiste: un bottone la apre |

Da **iPhone via PWA e' impossibile**, e non e' aggirabile: un browser non apre socket
TCP grezzi. Per questo l'app nativa e' l'unica strada Apple.

ZConnection **verifica lo stato del permesso a ogni ripresa** e passa da sola fra le
due modalita': non c'e' un interruttore, c'e' un fatto.

## 5. Le due modalita'

### 5.1 Completa (permesso concesso)

ZConnection legge le `MediaSession` delle sole app in elenco e spedisce eventi
grezzi. Il server decide:

- **NOW e Disney+ pubblicano titolo e durata** (sonda §1): riconoscimento TMDB con
  il codice dell'estensione. NOW da' il nome dell'**episodio**, non della serie: e'
  il caso che `providers/declared-episode.ts` gia' tratta.
- **Netflix, Prime e Apple TV danno una sessione anonima.** Se quel titolo l'ha
  aperto Zapp (§6), la sessione **e'** quel titolo: dichiarato da noi pochi secondi
  prima, sulla stessa piattaforma, sullo stesso dispositivo. Altrimenti una riga in
  `pending_scrobbles` (`unknown_title`), che diventa un "Da confermare".
- **Soglia anti-anteprima: due minuti di riproduzione continua** con posizione
  monotona prima di toccare la libreria. Netflix e Prime riproducono le anteprime
  del catalogo come sessioni vere, indistinguibili da un film (sonda §4). Su Disney+
  il problema non si pone — niente sessione mentre si sfoglia — ma la regola vale
  per tutti.
- **"Finito"** = posizione >= durata meno margine. La durata viene dai metadati dove
  ci sono, da TMDB dove conosciamo il titolo. Senza ne' l'una ne' l'altro non si
  dichiara finito niente.
- **Il minutaggio si estrapola** da `position` + istante dell'aggiornamento +
  `speed`: Prime notifica solo ai cambi di stato (sonda §4), e aspettare le sue
  callback lascerebbe la barra ferma per mezz'ora.

### 5.2 Base (nessun permesso)

Zapp sa **solo** cosa ha aperto e quando. Il titolo compare subito in "Continua a
guardare"; passata la sua durata TMDB diventa un **"Da confermare"**, e alla prima
apertura dell'app basta un tocco. **Nessuna scrittura silenziosa**: l'errore tipico
(spento dopo dieci minuti) non deve sporcare la libreria.

**Sulle serie il lancio non dice l'episodio**: il link e' quello della serie e
l'episodio lo sceglie la piattaforma (§6). Quindi in modalita' base la domanda e'
"hai guardato <serie>?" e la risposta, se si', avanza di **un** episodio da quello
gia' segnato in libreria — che e' anche quello da cui la piattaforma riprende. Se
l'utente ne ha visti tre di fila lo corregge dalla scheda serie, come fa oggi.
Il tempo trascorso non si usa per indovinare quante puntate: sarebbe una stima
sopra una stima.

### 5.3 Attribuzione

- **Da un lancio**: e' di chi l'ha lanciato. Nessuna ambiguita' da risolvere.
- **Passiva**: resta la regola che `scrobble_apply` gia' applica — un solo membro
  attivo sul dispositivo, e' suo; zero o piu' d'uno, la sessione si registra ma
  **`watch_entries` non si tocca**.

## 6. Il lancio

Nella scheda titolo, accanto a ogni bottone di piattaforma, un tondo con l'icona
della TV. Tocco -> Server Action -> riga in `device_commands` -> risposta immediata.
ZConnection ritira al sondaggio successivo, esegue, e **riferisce l'esito**
(consegnato / app non installata / fallito), cosi' Zapp dice "Aperto su Fire TV
salotto" o "La TV non risponde" invece di un successo inventato.

**Ogni comando scade dopo due minuti**: senza scadenza una TV accesa la sera
farebbe partire da sola il film chiesto a pranzo.

**Con piu' TV abbinate** il tondo apre un foglio con l'elenco e si sceglie; con una
sola parte diretto, senza chiedere. L'ultima usata resta la prima della lista. Il
tondo **non compare affatto** se non ci sono dispositivi abbinati o se quella
piattaforma non ha un link per quel titolo: un bottone che non puo' funzionare e'
peggio di un bottone assente.

Forme verificate (sonda §3). **Il componente va sempre indicato**: col solo URL
compare il selettore "apri con" di Android, che col telecomando e' un vicolo cieco.

| Piattaforma | Cosa si manda | Effetto |
| --- | --- | --- |
| Netflix | componente + extra **`amzn_deeplink_data`** = id Netflix | **avvia il titolo** |
| Disney+ | `https://www.disneyplus.com/play/<uuid>` | **avvia il titolo** |
| Prime Video | `https://app.primevideo.com/detail?gti=<gti>` | apre la scheda |
| Apple TV | `https://tv.apple.com/...` | apre la scheda |
| NOW | avvio dell'app | NOW riferisce da se' cosa si guarda (§5.1) |

Gli id sono gia' in `title_provider_links` (fonte `justwatch`): **nessuna fonte
nuova**. Su Netflix si usa l'extra e non l'URL anche perche' a freddo il selettore
profili si mangia il deep link nella forma URL, mentre con l'extra il titolo parte
dopo la scelta del profilo.

**Trasporto: sondaggio HTTP**, 3 s a schermo acceso e 30 s a schermo spento. Scelto
contro la richiesta lunga (ogni TV terrebbe occupata una funzione Vercel, che sul
piano Hobby e' la risorsa che finisce per prima) e contro il push ADM di Amazon
(gratuito e istantaneo, ma richiede credenziali dedicate e **funziona solo su Fire
OS**, quindi su Android TV servirebbe comunque un secondo meccanismo). Il protocollo
non cambia se un domani si passa a push o websocket: cambia il trasporto.

**Due vincoli noti:**

- **Risveglio.** Su Fire OS 6 aprire un'attivita' da un servizio in background
  accende lo stick e, via HDMI-CEC, di solito il televisore. **Da Android 10 l'avvio
  di attivita' in background e' vietato**: su Google TV recenti servira' una notifica
  a schermo intero o un permesso apposito. Il gesto "dal divano parte il film" non si
  promette su tutto l'hardware finche' non e' verificato li'.
- **Selettore profili.** A freddo Netflix e Disney+ lo mostrano prima di onorare il
  link.

## 7. Dati

**`pairing_codes`**: `code` (6 cifre), `install_id`, `token_hash`, `name`,
`platform`, `created_at`, `expires_at`, `claimed_by`, `claimed_at`. **Nessuna
policy**: ci arriva solo il service client dalle rotte; il reclamo passa dalla RPC
`claim_pairing_code(code)`, `security definer`, **revocata da `anon` e `public`**,
concessa a `authenticated`. Un codice a sei cifre leggibile da chiunque sarebbe un
dispositivo regalato a uno sconosciuto.

**`device_commands`**: `id`, `device_id`, `requested_by`, `media_type`, `tmdb_id`,
`provider_id`, `payload` (la forma dell'Intent), `created_at`, `expires_at`,
`delivered_at`, `status`. Policy `to authenticated` per i soli membri del dispositivo
(`device_id in (select device_id from device_members where user_id = (select
auth.uid()))`); la TV ci arriva dalla rotta col suo token, non dalla RLS. **Indice
parziale** sui comandi non ancora consegnati per dispositivo: e' la query che ogni TV
fa ogni tre secondi.

Regole di progetto applicate senza sconti: `anon` non tocca niente; ogni `auth.uid()`
dentro una policy e' `(select auth.uid())`; ogni chiave esterna nasce col suo indice;
ogni UPDATE ha un `with check` che ripete la proprieta'.

## 8. Sicurezza

- **Token del dispositivo**: nel DB solo l'hash; confronto a tempo costante; revoca
  immediata da `/devices`; `401` -> la TV dimentica il token e torna al codice.
- **Il controllo di proprieta' si fa anche nel codice**: la Server Action che scrive
  un comando verifica che chi chiede sia membro di quel dispositivo, non si fida solo
  delle policy.
- **Validazione**: `isUuid`, `isTmdbId`, `isMediaType` sugli argomenti;
  `isSafeExternalUrl` sul link sia quando si salva sia prima di mandarlo.
- **Limiti di frequenza** per token sull'ingest e sulla coda; claim dei codici
  limitato per utente.
- **Whitelist dei package anche lato server**: un evento di un'app fuori elenco si
  scarta, non ci si fida del client.
- Verso il client **sempre un messaggio generico**; il dettaglio nei log.
- Dati raccolti: piattaforma, titolo/durata/posizione/stato, orario, dispositivo. Mai
  credenziali, mai notifiche di altre app, mai schermate. Testo informativo in
  `/devices` e nella privacy policy; "cancella cronologia" per dispositivo.

## 9. Errori

- TMDB giu': si usa la cache `titles`; se non basta, `pending_scrobbles`
  (`unknown_title`) — **mai perdere l'evento**.
- App non installata sulla TV: esito riportato, Zapp lo dice.
- Comando non ritirato entro due minuti: scade, e Zapp lo dichiara.
- Permesso revocato a caldo: ZConnection se ne accorge alla ripresa e scende in
  modalita' base senza rompersi.
- Eventi fuori ordine o duplicati: `scrobble_apply` accetta solo `at` piu' recenti, e
  il riavvolgimento voluto dall'utente resta legittimo.

## 10. Verifica

- **Vitest sulle parti pure**: package -> piattaforma; metadati -> `ParsedMedia` per
  NOW e Disney+; regola dei due minuti; costruttore dei deep link per piattaforma
  (e' il pezzo che sbaglia piu' facilmente in silenzio).
- `node scripts/security-check.mjs` dopo ogni modifica a rotte, header o CORS.
- `get_advisors` di Supabase dopo le migration.
- **A mano sulla TV** — Playwright non riproduce contenuti protetti: abbinamento; un
  lancio per ciascuna delle cinque piattaforme; una visione passiva su NOW e una su
  Disney+; un "Da confermare" in modalita' base; revoca da Zapp che riporta la TV al
  codice.

## 11. Fuori da questa spec

App Zapp nativa (Android e iOS) — progetto suo, di cui questa spec usa solo il
**ruolo** di concessore del permesso. Sonda su Google TV (dove il permesso e' un
bottone e il provider `content://android.media.tv` e' vivo, con titolo, episodio e
posizione). Modalita' famiglia oltre la regola del membro unico ("Non sono io",
`device_profiles`), che resta fase 3 della spec del 4 settembre.
