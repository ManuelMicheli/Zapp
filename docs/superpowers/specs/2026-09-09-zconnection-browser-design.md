# ZConnection per il browser — estensione desktop (spec di design)

Data: 2026-09-09. Approvato in chat con l'utente: perimetro, sorgente dei dati, funzioni
della v1, presenza in pagina, passo zero. Completa e affianca
`2026-09-04-zconnection-design.md` (companion Android/Fire TV), di cui riusa ingest,
modello dati e regole di sessione.

## 1. Perche' questa spec esiste adesso

La spec del 4 settembre dava per scontato un dispositivo Android in casa. **Non c'e':** la
Fire TV e' di un amico, la TV di casa e' una Samsung/LG. Verificato il 2026-09-09 che
nessuna delle due smart TV puo' dire cosa sta riproducendo:

- **Samsung (Tizen)**: `/api/v2/` sulla 8001, WebSocket remoto sulla 8002, DIAL, SmartThings
  (`mediaPlayback`, `custom.launchapp`) danno **quale app e' in primo piano, mai il titolo**.
- **LG (webOS)**: SSAP `com.webos.applicationManager/getForegroundAppInfo` idem, ed e'
  riservata alle app di sistema.
- Un'app **nostra** pubblicata sui due store non risolve: su entrambe le TV **una sola app e'
  attiva per volta** (la nostra viene terminata quando parte Netflix), non esiste servizio in
  background per terze parti, e non esiste API di media di terze parti. Fire OS funziona solo
  perche' e' Android e Android espone le `MediaSession` con un permesso pubblico.
- L'unico canale che il titolo ce l'ha e' il protocollo companion proprietario di Netflix:
  **fuori perimetro** (§2), non solo difficile.

Anche Apple e' stata verificata: su **iPhone/iPad non esiste alcuna strada**. `MediaRemote` e'
privata (rifiuto in App Store, e comunque bloccata per terze parti); `DeviceActivity`/Screen
Time da' minuti per app e **la sua estensione non ha accesso alla rete**, per progetto di
Apple, quindi quei dati non possono nemmeno essere trasmessi; una `NEPacketTunnelProvider`
vede l'SNI ma il titolo e' dentro TLS con certificate pinning; Handoff e' vincolato al team ID
del publisher; su iOS non esiste l'Accessibility API di terze parti. **Apple TV**: nessuna
esecuzione in background su tvOS, quindi nessuna app puo' osservarne un'altra; resterebbe il
Media Remote Protocol sulla LAN (stile `pyatv`), che pero' richiede un host sempre acceso in
rete — l'utente non ne ha, e non possiede un'Apple TV. **Escluso.**

Conclusione: **il browser e' l'unica superficie automatica disponibile oggi** per questo
utente, e copre meta' del suo consumo (PC Windows e Mac). L'altra meta' (smart TV) si chiude
con una chiavetta Fire TV o un Chromecast con Google TV, e allora vale la spec del 4 settembre
senza modifiche.

## 2. Perimetro e vincoli non negoziabili

Valgono integralmente i vincoli della spec ZConnection §2, piu':

- **Mai credenziali, cookie o sessioni delle piattaforme verso i nostri server.** Nessuna API
  non ufficiale, nessuno scraping server-side.
- **Nessun permesso oltre il necessario**: `host_permissions` limitati ai quattro domini di
  streaming piu' l'origine di Zapp. Mai `<all_urls>`, mai `tabs`, mai `webRequest`.
- **Se il riconoscimento fallisce, non si manda niente.** Mai un titolo inventato.
- **Una sola deroga, dichiarata**: il recupero della cronologia Netflix (§10), che avviene nel
  browser dell'utente, nella sua sessione, su suo click.
- Nome: la famiglia resta **ZConnection**; questa e' *ZConnection per il browser*.

## 3. Copertura reale (da scrivere nella UI, non solo qui)

| Dove | Coperto | Come |
|---|---|---|
| PC Windows, Chrome/Edge/Brave/Arc | si', automatico | estensione MV3 |
| Mac, Chrome-family | si', automatico | stessa estensione |
| Mac, Safari | si', automatico | stessa estensione convertita (§16) |
| iPad in Safari | si' | estensione Safari (conversione, App Store) |
| iPad/iPhone nelle app native | **no** | nessuna strada, vedi §1 |
| Smart TV Samsung/LG | **no** | nessuna strada, vedi §1 |
| Fire TV / Android TV | si' | companion Android, spec del 2026-09-04 |

Recuperabile *a posteriori* per Netflix, TV compresa: §10.

## 4. Componenti

| Componente | Dove | Ruolo |
|---|---|---|
| **Estensione MV3** | `extension/` nel repo Zapp | cattura, coda, invio; UI popup/opzioni/toast |
| **API ingest** | `src/app/api/scrobble/route.ts` | gia' prevista dalla spec ZConnection |
| **Pipeline scrobble** | `src/lib/scrobble/*` | package/dominio -> piattaforma, parsing, matching, regole |
| **DB** | migrazione `0025_zconnection.sql` + `0026_scrobble_profiles_progress.sql` | vedi §9 |
| **UI Zapp** | `/devices` | collega questo browser, pause, revoca |

`extension/` sta **nel repo di Zapp** e non in un repo separato: condivide il contratto
dell'ingest e si versiona con esso. Va escluso da `tsconfig.json` e da `eslint.config.mjs`
(e' JS piano, non passa dal build di Next; Vercel lo ignora perche' non e' sotto `src/`).

## 5. La decisione che regge tutto: l'estensione e' muta

**L'estensione non interpreta niente.** Cattura i metadati grezzi e li spedisce; **titolo,
stagione, episodio, corrispondenza TMDB e regole di completamento si calcolano sul server**,
con lo stesso codice che serve il companion Android.

Tre conseguenze, tutte volute:

1. **Un solo parser** (`src/lib/scrobble/parse.ts`, puro, Vitest) per browser e TV. Il giorno
   della chiavetta il lavoro e' gia' fatto.
2. **Il parser si corregge senza ripubblicare l'estensione.** Netflix cambia il formato di una
   stringa: si aggiorna Zapp, non si aspetta la review dello store.
3. L'estensione resta piccola e verificabile: nessuna logica di dominio dentro un artefatto
   che gira nel browser dell'utente.

## 6. Da dove arrivano i dati

**Riscritta il 2026-09-09 con i dati veri della sonda.** La prima stesura metteva
`navigator.mediaSession.metadata` al primo posto, per simmetria con le `MediaSession` di
Android. **Sulla Netflix web non funziona**: undici righe di sonda, `title`, `artist`,
`album` e `artwork` **nulli in tutte**, `playbackState` sempre `"none"`. Netflix non usa la
Media Session API. La simmetria col companion Android era un'idea, non un fatto: e' esistita
per tre ore ed e' costata dieci minuti di sonda invece di un prodotto da riscrivere.

Quello che la sonda ha dimostrato affidabile, per ogni scheda su un dominio in whitelist:

1. **L'elemento `<video>`** — `currentTime`, `duration`, `paused`, `ended`. Presente e
   preciso in ogni riga. E' la sorgente di posizione e durata, sempre, su tutti i siti:
   nessun sito puo' cambiarla.
2. **L'URL** — su Netflix `/watch/<id>` identifica l'**episodio** esatto, e **cambia da solo
   quando parte l'episodio successivo** (visto nella sonda: `81771560` -> `81771561`). E' la
   chiave stabile della sessione, e va spedita com'e'.
3. **L'adapter DOM per sito** (`extension/adapters/{netflix,prime,disney,now}.js`) — **non
   e' piu' un ripiego: e' l'unica sorgente del titolo.** Un file per sito, pochi selettori
   in cascata, e se si rompe cade solo quel sito. I selettori veri li fissa il secondo giro
   della sonda (§7), non un'ipotesi.

`navigator.mediaSession` resta letta, per due motivi: costa niente, e sugli altri tre siti
potrebbe esserci davvero. Se c'e', e' la sorgente migliore; se manca, si scende al DOM.
Va letta da uno script nel **main world** (`content_scripts` con `"world": "MAIN"`,
Chrome 111+): nello isolated world `navigator.mediaSession` e' un altro oggetto e non vede i
metadati della pagina. Il main world parla con lo isolated via `window.postMessage`, e lo
isolated **controlla `e.origin`** prima di credergli: siamo dentro la pagina di un terzo.

**Si guarda solo dentro `/watch/`.** La sonda ha catturato anche le anteprime che partono da
sole sfogliando il catalogo (`/browse/genre/34399`, un `<video>` da 70 secondi): senza questa
regola l'estensione avrebbe segnato come visto un trailer. Vale per tutti i siti: fuori dalla
pagina di riproduzione non si manda niente.

## 7. Passo zero: la sonda (throwaway)

Prima del prodotto, **un'estensione diagnostica usa-e-getta**, un file, non distribuita: sui
quattro siti registra in `chrome.storage.local` e mostra in una pagina cosa espone ciascuno —
`mediaSession.metadata` completo (`title`, `artist`, `album`, `artwork`), stato del `<video>`,
URL, e il nome del profilo se leggibile. Esporta un JSON.

Chiude queste domande, che riscrivono §6 e §8:

1. Quali dei quattro siti popolano davvero `mediaSession.metadata`, e con quale forma (serie in
   `title` o in `artist`? "S4:E1" dove? nome episodio?).
2. Per quali serve un adapter DOM, e su quali selettori.
3. Come si legge il profilo attivo su Netflix (e se Prime/Disney+ espongono il loro).
4. Se `duration` e' affidabile su tutti (Netflix la cambia durante il pre-roll?).
5. Cosa succede all'autoplay dell'episodio successivo: la mediaSession cambia? il `<video>` e'
   lo stesso nodo?

Output: le **fixture reali** per i test del parser. Il codice della sonda non entra nel
prodotto, esattamente come il probe Android.

## 8. Riconoscimento e corrispondenza (server)

`src/lib/scrobble/parse.ts` (puro): da `{title, artist, album, url, site}` a
`{kind: 'movie'|'tv'|'unknown', title, season?, episode?, episodeName?, key}`. Riconosce
`S2:E4`, `S2 E4`, `Stagione 2: Episodio 4`, `T2 E4`, `2x04`, `Episodio 4`, in italiano e
inglese. `key` = hash stabile di (sito, titolo, stagione, episodio), per deduplicare.

`src/lib/scrobble/match.ts`: prima la cache `titles` (uguaglianza normalizzata su
`title`/`original_title`), poi `searchTv`/`searchMovie`. Punteggio: titolo normalizzato, anno,
**presenza della piattaforma tra i `title_providers` IT del candidato** (segnale forte: se
stiamo guardando su Netflix, il candidato giusto e' offerto da Netflix), popolarita'. Riusa
`titleSimilarity` e `normalizeTitle` di `src/lib/import/netflix.ts`, gia' testati.
Esito `auto` / `ambiguous` / `none` come nella spec ZConnection §7.3, con le stesse
`pending_scrobbles`.

## 9. Abbinamento, protocollo, modello dati

**Abbinamento — niente codice a sei cifre.** L'utente e' gia' loggato in Zapp nello stesso
browser: in `/devices` preme **"Collega questo browser"**, la pagina di Zapp chiama
`chrome.runtime.sendMessage(EXTENSION_ID, {token})`. Richiede
`"externally_connectable": {"matches": ["https://<host di Zapp>/*"]}` nel manifest: **solo**
l'origine di Zapp puo' parlare con l'estensione. Il token e' generato da una Server Action e
salvato lato server come hash, come per il companion.

**Protocollo eventi**: identico alla spec ZConnection §5 (`POST /api/scrobble`, eventi assoluti
e idempotenti, batch <= 50, heartbeat 30 s mentre `playing`, evento immediato a ogni
transizione), con `platform = 'browser_ext'` e, al posto di `package`, il campo `site`
(`netflix|prime|disney|now`). In piu' l'evento porta `url` e `profile` (nome del profilo, se
letto).

**La risposta dell'ingest torna anche l'artwork**: `{title, poster_path, backdrop_path,
season, episode, episodeName}` della sessione riconosciuta. **Il dispositivo non chiama mai
l'API TMDB** (regola del progetto): carica solo l'immagine da `image.tmdb.org`. Vale identico
per il companion Android.

**DB**: la migrazione `0025_zconnection.sql` della spec precedente non cambia, se non per
`device_platform` che acquisisce il valore `browser_ext`. Serve una migrazione nuova,
`0026_scrobble_profiles_progress.sql`, per la mappatura profilo -> utente:

```sql
create table public.device_profiles (
  device_id uuid not null references public.devices (id) on delete cascade,
  site text not null,                       -- netflix | prime | disney | now
  profile_name text not null,               -- come letto dalla pagina
  user_id uuid references public.profiles (id) on delete cascade,  -- null = ignora
  created_at timestamptz not null default now(),
  primary key (device_id, site, profile_name)
);
```

RLS: select/insert/update/delete solo ai membri del dispositivo. Grant revocati ad `anon`.

La stessa migrazione aggiunge a `watch_entries` il **punto esatto** in cui si e' arrivati
(§11-bis):

```sql
alter table public.watch_entries
  add column position_ms bigint,             -- posizione nell'episodio/film
  add column position_duration_ms bigint,    -- durata dello stesso, per la percentuale
  add column position_season int,            -- a quale episodio si riferisce
  add column position_episode int,
  add column position_at timestamptz;        -- quando e' stata registrata
```

Nessun indice nuovo: si legge sempre insieme alla riga, mai da sola.
Dopo la migrazione: `supabase gen types` (regola del progetto).

## 10. Recupero della cronologia Netflix (la deroga, dichiarata)

**Cosa fa**: su click dell'utente, un content script sulla pagina
`netflix.com/viewingactivity` — che l'utente ha aperto — legge l'href del pulsante "Scarica
tutto" presente in pagina, ne recupera il CSV nella sessione dell'utente e lo passa
all'import che Zapp ha gia' (`src/lib/import/netflix-rows.ts`, il matcher, la RPC
`import_watch_entries` con il guard sul progresso).

**Perche' e' dentro il perimetro**: nessun server di Zapp parla con Netflix; non escono cookie
ne' credenziali dal dispositivo; e' un pulsante che Netflix stessa mette in pagina per
l'esportazione dei propri dati; l'azione parte da un click esplicito. **Perche' e' comunque
una deroga**: la regola scritta e' "mai scraping", e questo e' l'unico punto in cui
l'estensione legge una pagina che non e' un player.

**Perche' vale la pena**: la cronologia Netflix contiene **anche quello che e' stato guardato
sulla smart TV**. E' l'unico modo, oggi, di recuperare la meta' scoperta.

Non copre Disney+ (nessuna pagina di cronologia). Prime Video ha una pagina cronologia senza
CSV: si legge dal DOM, **fase 2**, non in v1.

## 11. Regole di sessione, completamento, voto

Valgono le regole della spec ZConnection §7.5, senza modifiche (chiave di sessione, inizio,
completamento a >= 90% o chiusura a >= 85%, durata sconosciuta -> mai completamento,
`watch_entries` toccata solo a inizio e fine). In piu', specifico del browser:

- **Autoplay dell'episodio successivo**: il cambio di metadati senza ricaricare la pagina
  chiude la sessione precedente e la completa se ha passato la soglia, poi ne apre una nuova.
- **Scheda chiusa di colpo**: l'ultimo evento parte da `visibilitychange`/`pagehide`; se si
  perde, la sessione viene chiusa dalla regola del server sulle sessioni orfane (> 4 h)
  all'ultima posizione nota.
- **Coda offline**: `chrome.storage.local`, max 200 eventi, backoff 5 s -> 5 min. Gli eventi
  sono stato assoluto: un duplicato riapplicato non cambia nulla.

**Voto al volo** (deciso 2026-09-09): a completamento, **solo per i film**, una card compatta
sopra il player con i voti 1-10 e "Salta il voto" — stessa scala e stessa forma di
`PostShowCard` del cinema. Una volta sola per titolo; il voto viaggia sull'ingest come campo
dell'evento di completamento. **Gli episodi non chiedono niente**: sarebbe assillante.

**Attribuzione** (deciso 2026-09-09): l'evento porta il nome del profilo del sito; il server
lo risolve con `device_profiles`. Profilo non mappato -> l'evento si registra ma come
`pending_scrobbles` con `reason='ambiguous_user'`, meccanismo gia' progettato. "Non sono io"
nel popup riassegna e crea la mappatura.

**Regola dura: finche' l'utente non e' certo, `watch_entries` non si tocca.** La
`watch_session` viene registrata con `user_id = null` e nessuna scrittura raggiunge la
libreria di nessuno; alla risoluzione della pending la sessione viene attribuita e **le regole
di §11 si riapplicano dall'inizio** su quella sessione, cosi' un episodio guardato e
attribuito dopo arriva completo, minuto compreso. Un dispositivo con un solo membro attivo e'
certo per definizione e scrive subito.

## 11-bis. Il minutaggio

Il progresso non e' solo "visto / non visto": **si conserva il punto esatto**.

- Ogni heartbeat aggiorna `watch_sessions.position_ms` / `duration_ms` (dati live, gia' nella
  spec del 4 settembre).
- **Alla chiusura della sessione** — pausa lunga, stop, cambio titolo, scheda chiusa, sessione
  orfana — il punto viene consolidato su `watch_entries`: `position_ms`,
  `position_duration_ms`, `position_season`, `position_episode`, `position_at`. E' la
  differenza fra "dov'e' adesso" (sessione, effimera) e "dov'era rimasto" (entry, persistente).
- **Non torna mai indietro da solo**: si scrive solo se l'evento e' piu' recente di
  `position_at`. Un riavvolgimento voluto dall'utente e' invece legittimo e viene registrato:
  e' l'ordine temporale a decidere, non il valore.
- **A completamento il punto si azzera** (l'episodio e' finito, non c'e' piu' un "riprendi") e
  si scrive `season`/`episode` come sempre.
- **Serie**: il minuto si riferisce all'episodio indicato da `position_season`/`position_episode`,
  che puo' essere **piu' avanti** di `season`/`episode` (l'ultimo *finito*). Sono due cose
  diverse e vanno tenute separate: "hai finito S4E1, sei a 18 minuti di S4E2".
- **Durata sconosciuta** -> si salva `position_ms` senza percentuale; la UI mostra i minuti,
  non la barra.

**Cosa cambia in pagina**: `ContinueCard` in home mostra la barra col minuto vero e "18 min di
43" invece di una stima, e la scheda titolo dice "Riprendi da 18:04". Mentre stai guardando, la
sessione live aggiorna la home in tempo reale (Realtime su `watch_sessions`, spec ZConnection
§8); quando smetti, resta il punto consolidato. La colonna serve anche a chi non usa
ZConnection: resta semplicemente nulla, e la UI ripiega su quello che mostra oggi.

## 12. UI

**Deciso 2026-09-09: durante la visione in pagina non c'e' nulla.** Niente pillola
persistente. Compare **solo il toast** quando un episodio o un film viene segnato — copertina,
"Episodio segnato su Zapp", titolo, "Annulla" — e sparisce da solo. L'unico segnale sempre
presente e' il pallino sull'icona della barra.

- **Popup** (400x620): "Stai guardando" con la copertina, titolo, `S4:E1`, barra di
  avanzamento, pillola della piattaforma **col logo** (loghi provider di TMDB, gli stessi di
  "Dove guardarlo"), "Segna come visto" e "Non sono io"; sotto, cosa e' arrivato oggi; in
  fondo "Pausa 1 ora" e "Apri Zapp".
- **Opzioni**: dispositivi collegati, i quattro siti con toggle e sfumatura del marchio
  (`providerTint`), mappatura dei profili, "Recupera la cronologia Netflix", riga privacy con
  "Cancella la cronologia".
- Mockup: `docs/design/mockups/zconnection/*.dc.html` (canvas pubblicato). Token dal codice
  vero: `#c5baf4`, `.glass` / `.glass-accent`, surface `#0e0e12`, Inter, la Z di
  `src/app/icon.svg`.

## 13. Sicurezza e privacy

- Permessi: `storage`, `scripting`, `alarms`; `host_permissions` sui quattro domini + Zapp.
  Nessun altro.
- Dati raccolti: sito, titolo/episodio, posizione/durata, stato, orario, profilo. **Mai**
  password, mai le altre schede, mai la cronologia di navigazione.
- Token in `chrome.storage.local`, revocabile da Zapp; `401` -> l'estensione si scollega e
  mostra "ricollega".
- **CORS**: `/api/scrobble` deve accettare l'origine `chrome-extension://<ID>` — con l'ID
  fissato in configurazione, non un wildcard. E' un confine di sicurezza: va scritto esplicito
  e verificato in `scripts/security-check.mjs`.
- Rate limit per token: 240 eventi/minuto, come per il companion.
- CSP di Zapp invariata: l'estensione parla con Zapp, non viceversa.

## 14. Errori

- Sito che cambia il DOM -> resta la mediaSession; cadono entrambe -> **non si manda niente**.
- TMDB giu' -> solo cache `titles`; se non basta -> `pending_scrobbles`, mai perdere l'evento.
- Titolo non in cache -> `getOrFetchTitle` prima della RPC (la FK lo richiede).
- Verso il client sempre un messaggio generico; il dettaglio resta nei log.

## 15. Collaudo

- **Vitest** in Zapp su `src/lib/scrobble/parse.ts` con le fixture reali del passo zero, e
  sulle regole di completamento (funzioni pure, senza DB).
- **Playwright** sull'estensione caricata su una **pagina finta** con un `<video>` e una
  `mediaSession` simulata: copre coda, invio, toast, popup.
- **A mano su Chrome installato** per il resto: **Playwright non riproduce contenuti DRM** (il
  suo Chromium non ha Widevine), quindi i quattro siti veri non sono automatizzabili. Percorso
  manuale: collega, un episodio Netflix (inizio -> home aggiornata -> fine -> episodio
  segnato), un film Prime fino ai titoli di coda con voto al volo, pausa/riprendi, autoplay
  dell'episodio successivo, revoca da Zapp -> l'estensione si scollega.
- `pnpm typecheck && pnpm lint && pnpm build` come sempre; `node scripts/security-check.mjs`
  dopo la modifica CORS.

## 16. Distribuzione

Chrome Web Store (copre Chrome, Edge, Brave, Arc, Opera). Conversione Safari con
`xcrun safari-web-extension-converter` sullo **stesso codice**, firmata con l'account
sviluppatore Apple dell'utente, per macOS. Durante lo sviluppo: "Carica estensione non
pacchettizzata".

## 17. Fasi

0. **Sonda** (§7) -> fixture reali, e riscrittura di §6 e §8 con i formati veri.
1. **Un sito, un utente**: Netflix, cattura + ingest + regole + **minutaggio consolidato** +
   popup + toast, `/devices` con "Collega questo browser".
2. **Gli altri tre siti** (adapter dove servono) + opzioni + pausa + revoca.
3. **Le tre funzioni decise**: recupero cronologia Netflix, voto al volo, profili e "Non sono
   io".
4. **Store**: Chrome Web Store, poi conversione Safari.

## 18. Fuori perimetro (per ora)

Badge di "gia' visto"/voto sulle copertine dentro i siti (rimandato dall'utente il
2026-09-09); lettura della cronologia Prime dal DOM; Disney+ retroattivo; iOS/iPadOS nelle app
native; smart TV Samsung/LG; app Zapp su Tizen/webOS come lanciatore con deep link (idea
valida, valutata e rimandata: costa due prodotti e traccia solo cio' che si avvia da dentro).
