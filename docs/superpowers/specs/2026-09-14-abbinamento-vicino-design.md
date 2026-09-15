# Abbinamento vicino — spec di design

Data: 2026-09-14. Ramo: `feat/abbinamento-vicino`.
Repo toccati: **Zapp** (sito), **ZappMobile** (guscio Expo), **ZappTV** (Android).

Sottosistemi esistenti su cui poggia: `docs/architecture/tv.md` (abbinamento,
sessione, `device_commands`), `docs/architecture/mobile.md` (ponte WebView,
token dispositivo), `docs/architecture/zconnection.md`.

## 1. Obiettivo

Togliere le sei cifre digitate col telecomando. Il telefono trova da solo le TV
sulla rete locale; ne tocchi una; la TV chiede conferma; sei abbinato.

Secondo obiettivo, più piccolo: riconoscere una Fire TV **senza ZappTV
installata**, per mostrarla in elenco e offrire l'installazione.

Non obiettivi: controllare TV di terzi (LG, Samsung, Apple TV), mandare il
trailer su un televisore che non esegue ZappTV, installare ZappTV da remoto.
Vedi §11.

## 2. Cosa è stato misurato prima di decidere (2026-09-14)

Spike sulla rete di casa dell'utente, Fire TV Stick 4K reale:

- **Il multicast passa** Wi-Fi ↔ Ethernet: LG, Samsung e Apple TV hanno risposto
  a mDNS e SSDP multicast. Nessun isolamento client sulla rete.
- **La Fire TV non annuncia nulla in multicast**: zero risposte mDNS, zero SSDP
  multicast. Ma **risponde a M-SEARCH unicast**, presentandosi con
  `X-Friendly-Name` in base64 (`Fire TV di Mirko`), `USN` contenente
  `FIRETVSTICK2018-AMAZOAFTMM` e `LOCATION: http://<ip>:9080`. L'unico servizio
  esposto è `urn:mdx-netflix-com:service:target:3` (MDX di Netflix).
- **`mdnsd` gira su Fire OS 6** (Android 7.1.2) e il servizio di sistema
  `servicediscovery` c'è: un'app può registrare un servizio con `NsdManager`.
- **Niente DIAL sulla Fire TV**: `com.amazon.dialservice` è installato ma non in
  esecuzione. `com.amazon.whisperplay.service.install` esiste ma vive sul
  trasporto proprietario Whisperlink/TComm, legato all'account Amazon: chiuso ai
  terzi.
- **DIAL su TV altrui**: la LG ha lanciato YouTube senza alcun accoppiamento
  (`201 Created`, poi `state: running`), la Samsung ha risposto `401`. In
  entrambi i casi il payload `v=<videoId>` è stato **ignorato**: l'app YouTube
  dei televisori moderni usa il protocollo Lounge, non documentato. Da qui la
  decisione di non costruirci sopra.

Conseguenza che ha cambiato il piano: cercare le Fire TV serve solo *prima* di
aver installato ZappTV, cioè proprio quando non la si può installare. Il valore
sta dopo l'installazione, e lì non serve cercare Amazon — **ZappTV si annuncia
da sé**.

## 3. Decisioni prese (utente, 2026-09-14)

1. La lista delle TV trovate vive nella **pagina web `/devices`**, non in una
   schermata nativa. Motivo vincolante: il reclamo è una Server Action che gira
   con la sessione Supabase nei cookie della WebView; una schermata nativa
   quella sessione non ce l'ha.
2. La ricerca parte **su un bottone "Cerca TV"**, non da sola. Su iOS il
   permesso "rete locale" si chiede così nel momento in cui l'utente ha appena
   espresso l'intenzione, non a freddo.
3. Il diritto di reclamare passa da un **consenso registrato sul server**
   (variante B), non dal codice consegnato via LAN (A) né da TLS con impronta
   nel TXT (C). Sulla rete locale non viaggia nessun segreto.

## 4. Le parti

| Parte | Repo | Responsabilità |
| --- | --- | --- |
| Annuncio + server locale | ZappTV | Si annuncia mentre è sulla schermata di abbinamento; riceve la richiesta del telefono; mostra il dialogo; comunica il consenso al server |
| Modulo `zapp-discovery` | ZappMobile | Cerca in rete (NSD + sweep SSDP unicast); parla col server locale della TV |
| Ponte | ZappMobile + Zapp | Due messaggi nuovi, validati a mano campo per campo |
| `CercaTv` | Zapp | Bottone, elenco, tocco, chiamata alla Server Action |
| Consenso e reclamo | Zapp | Rotta per la TV, RPC `security definer` per il telefono |

## 5. Il flusso

```
TV                          Telefono                    Server
─────────────────────────────────────────────────────────────────
apre abbinamento
POST /api/devices/pair ───────────────────────────────▶ codice + riga
annuncia _zapp-tv._tcp
apre server HTTP locale
                            "Cerca TV" ──▶ modulo nativo
                            trova, tocchi
       ◀── POST /pair {nome, deviceId} ──
dialogo di conferma
l'utente preme OK
POST /api/devices/pair/consent ───────────────────────▶ consent_device_id
       ── 200 {installId} ──▶
                            claimPairedByConsent ─────▶ RPC: claimed_by
poll (invariato) ─────────────────────────────────────▶ sessione coniata
```

**Il poll della TV non cambia di una riga.** La TV non sa che il reclamo è
arrivato dalla rete locale invece che dalle dita di qualcuno: trova
`claimed_by` valorizzato e conia la sessione come sempre
(`src/app/api/devices/pair/[code]/route.ts`, `coniaSessione`).

## 6. Annuncio e server locale (ZappTV)

- Servizio: `_zapp-tv._tcp`, registrato con `NsdManager` **solo** mentre
  `AbbinamentoScreen` è in primo piano; deregistrato in `onStop`.
- Record TXT: `v=1`, `id=<install_id>`, `name=<nome TV>`, `plat=fire_tv`.
  **Mai il codice**: chiunque sulla rete leggerebbe il TXT.
- Server HTTP su porta effimera, in ascolto sulla LAN:
  - `POST /pair`, corpo `{ name: string(1..60), deviceId: uuid }`.
  - Mostra il dialogo *"«Telefono di Manuel» vuole collegarsi — OK / Annulla"*.
    Il nome arriva dal telefono: si tronca a 60 caratteri e **si mostra come
    testo**, mai interpretato.
  - OK → la TV chiama `POST /api/devices/pair/consent` col proprio token
    di abbinamento; su `200` risponde al telefono `200 {installId}`.
  - Annulla → `403`. Nessuna risposta entro 60 s → `408`.
  - Un solo dialogo alla volta: mentre uno è aperto le altre richieste
    prendono `409`. Tetto di 10 richieste al minuto per indirizzo, così un
    vicino non può far lampeggiare dialoghi a comando.
  - Accetta solo richieste da indirizzi privati (RFC 1918 / link-local).

## 7. Modulo `zapp-discovery` (ZappMobile)

Nuovo modulo Expo accanto a `zapp-intents` e `zapp-media-session`, stessa forma.

API TypeScript:

```ts
avviaRicerca(): Promise<void>      // NSD + sweep SSDP; emette "trovato"
fermaRicerca(): Promise<void>
chiediAbbinamento(host: string, porta: number, nome: string, deviceId: string):
  Promise<{ ok: true; installId: string } | { ok: false; motivo: Motivo }>
```

`Motivo` = `"rifiutato" | "scaduto" | "occupato" | "rete" | "permesso"`.

- **Android**: `NsdManager.discoverServices("_zapp-tv._tcp")` sotto
  `WifiManager.MulticastLock` (senza, molti dispositivi filtrano il multicast in
  arrivo). Lo sweep SSDP manda una M-SEARCH unicast a ogni indirizzo della /24
  dell'interfaccia attiva: 254 pacchetti UDP, circa un secondo.
- **iOS**: `NWBrowser` per Bonjour. Richiede `NSBonjourServices` con
  `_zapp-tv._tcp` e `NSLocalNetworkUsageDescription` in `Info.plist`, entrambi
  aggiunti via config plugin Expo. Scritto ma **non collaudato** finché non
  esiste un build iOS: va marcato come tale.
- Timeout complessivo della ricerca: 8 s, poi si ferma da sola. Niente ricerche
  che restano accese in sottofondo.

### Riconoscimento Fire TV senza ZappTV

Dalla risposta SSDP si riconosce una Fire TV quando `USN` contiene `AMAZO`
oppure `X-User-Agent` è `NRDP MDX` e `USN` contiene `FIRETV`. Il nome si legge
da `X-Friendly-Name`, decodificando il base64; se manca o non decodifica, si
mostra `Fire TV` e basta.

**Limite dichiarato**: dal telefono non si può sapere se ZappTV è installata —
si annuncia solo quando è aperta sull'abbinamento. Il messaggio in pagina è
quindi *"Fire TV di Mirko — apri Zapp sulla TV, oppure installala"* con il QR
dell'Appstore. E il riconoscimento poggia sul servizio MDX di Netflix: se
Netflix venisse disinstallato potrebbe sparire. Per questo il codice a sei cifre
e il QR **restano sempre in pagina**, mai sostituiti dall'elenco.

## 8. Il ponte

Due messaggi nuovi. Il file `src/lib/native/protocol.ts` (Zapp) e
`src/bridge/protocol.ts` (ZappMobile) sono copie gemelle byte per byte: si
cambiano insieme, nello stesso giro.

```ts
// web → nativo
| { type: "discoverTv"; action: "start" | "stop" }
| { type: "connectTv"; host: string; port: number; name: string; deviceId: string }

// nativo → web
| { type: "tvFound"; devices: TvTrovata[] }
| { type: "tvConsent"; installId: string }
| { type: "tvError"; motivo: Motivo }
```

`TvTrovata` = `{ kind: "zapp" | "firetv"; name: string; host: string; port?: number; installId?: string }`.

Validazione a mano in `bridge/native.ts` (web → nativo) e nel parser lato web
(nativo → web), campo per campo, **mai un cast**: `host` deve essere un IPv4
privato, `port` 1..65535, `name` 1..60, `deviceId` un UUID, `devices` al massimo
16 elementi. È lo stesso rigore già applicato a `deviceToken`.

## 9. Dati e migrazioni (Zapp)

`0058_abbinamento_vicino.sql`:

1. `alter table public.pairing_codes add column consent_device_id uuid
   references public.devices (id) on delete cascade;`
2. Funzione interna `public._claim_pairing_row(p_riga public.pairing_codes,
   p_uid uuid) returns jsonb`, con il corpo che oggi sta dentro
   `claim_pairing_code`: crea il dispositivo se l'`install_id` è nuovo, inserisce
   il membro, marca la riga.
3. `claim_pairing_code` riscritta per chiamarla — **stesso comportamento**, solo
   il corpo spostato. Due copie di quella logica divergerebbero alla prima
   modifica.
4. Nuova `claim_pairing_by_consent(p_install_id uuid, p_device_id uuid)`,
   `security definer`, revocata da `anon` e `public`, eseguibile da
   `authenticated`. Controlla **tre** cose insieme:
   - esiste una riga con quell'`install_id`, non scaduta, con
     `consent_device_id = p_device_id`;
   - chi chiama è membro di quel telefono: esiste `device_members` con
     `device_id = p_device_id` e `user_id = auth.uid()`;
   - poi chiama `_claim_pairing_row`.

   La riga si legge con `for update`, come fa già `claim_pairing_code`: due
   reclami sovrapposti non devono coniare due volte.

   Il secondo controllo è quello che chiude il giro: il `device_id` viaggia in
   chiaro sulla rete locale, quindi da solo non può valere come prova. Senza,
   chi lo intercettasse potrebbe reclamare al posto del legittimo proprietario.

Dopo la migration (applicata con `apply_migration` degli strumenti MCP, **non**
con la CLI), rigenerare `src/types/database.ts` con `generate_typescript_types`.

## 10. Rotte e azioni (Zapp)

### `POST /api/devices/pair/consent`

La chiama **la TV**, non il telefono. Autenticazione identica al poll esistente:
`Authorization: Bearer <token della TV>`, si confronta l'hash con
`pairing_codes.token_hash` della riga trovata per `code`. Corpo:
`{ code: "^[0-9]{6}$", phone_device_id: uuid }`.

- Riga assente o hash diverso → `401` (mai `404`: direbbe a uno sconosciuto che
  quel codice esiste).
- Riga scaduta → `410`.
- `phone_device_id` che non corrisponde a un dispositivo `ios`/`android` → `400`.
- Tetto: 10 al minuto per hash del token.
- Successo → `200 { install_id }`, e `consent_device_id` scritto.

Scrive col service client, come le altre rotte del giro: `pairing_codes` è
chiusa a tutti (§9 di `tv.md`).

**Il codice ruota.** La TV ne chiede uno nuovo ogni dieci minuti, e
`POST /api/devices/pair` cancella la riga precedente per `install_id`: un
consenso concesso proprio mentre il codice ruota finisce su una riga che non
esiste più. La rotta risponde `410`, la TV mostra *"Riprova"* e il telefono
ripropone il tocco. Non si tenta di riportare il consenso sulla riga nuova:
sposterebbe un'autorizzazione da un codice a un altro, cioè esattamente quello
che il consenso deve impedire. Per ridurre la finestra, la TV **rimanda il
rinnovo del codice mentre un dialogo è aperto**.

### `claimPairedByConsent(installId, deviceId)`

Server Action in `src/app/(app)/devices/actions.ts`, accanto a
`claimPairingCode`. Stessa struttura: sessione utente, tetti (10 al minuto per
utente, 20 al minuto per indirizzo), poi `supabase.rpc("claim_pairing_by_consent", …)`.
Il `deviceId` del telefono lo conosce già la pagina: lo restituisce
`pairOwnDevice`.

Messaggi d'errore indistinguibili fra loro **dentro la stessa azione**: chi
sbaglia non deve capire quale dei tre controlli è fallito. Il motivo è che
mostrare "Codice non valido o scaduto" a chi ha toccato il nome di una TV, e non
ha mai visto un codice, sarebbe solo confuso.

### `CercaTv`

Componente client dentro `DevicesClient.tsx`. Visibile **solo dentro il guscio**
(`isNativeShell` sullo user-agent): da browser la scheda resta quella di oggi.
Stati: `fermo` → `cerco` (con indicatore) → `elenco` / `niente`. L'elenco mostra
le TV `zapp` come toccabili e le `firetv` come schede informative con il QR.

## 11. Fuori da questa spec

- **Trailer o titoli su TV che non eseguono ZappTV.** DIAL apre l'app, non il
  contenuto; il deep link per titolo richiede l'id interno del provider, che
  TMDB non fornisce. L'unica strada per YouTube è l'API Lounge, non documentata
  e non supportata: scartata di proposito, non dimenticata.
- **Installazione remota di ZappTV.** Richiederebbe ADB (che l'utente deve
  accendere a mano dalle Opzioni sviluppatore, accettando una chiave RSA col
  telecomando) o il trasporto proprietario di Amazon. Resta il QR verso
  l'Appstore.
- **Controllo di LG, Samsung, Apple TV.** Tre protocolli diversi da mantenere
  per un valore che non tocca lo scopo di Zapp.
- **tvOS.** Il protocollo è progettato perché l'app Apple TV possa adottarlo
  (Bonjour lì è poche righe), ma quell'app non esiste ancora.

## 12. Sicurezza

- **Perché serve la conferma sulla TV.** Oggi il codice a schermo dimostra che
  chi abbina è *davanti* alla TV. In rete quella prova sparisce: coinquilini,
  ospiti e vicini su un wifi condiviso sono "in LAN" quanto il proprietario. Il
  tasto OK sul telecomando ripristina la prova di presenza fisica, ed è lo
  stesso gesto che chiedono Chromecast e Android TV.
- **Sulla LAN non passano segreti**: solo il nome del telefono e il suo
  `device_id`. Chi intercetta non ottiene nulla di spendibile, perché il reclamo
  richiede la sessione Supabase dell'utente.
- **Nessun potere nuovo**: il codice conserva i suoi dieci minuti di vita, il
  reclamo resta `security definer` su una tabella chiusa, `device_commands`
  resta scrivibile solo dal service client.
- **Il server locale sulla TV è una superficie nuova** e va trattata come tale:
  vive solo durante l'abbinamento, un dialogo alla volta, tetto per indirizzo,
  solo indirizzi privati, nessun dato in risposta oltre all'`install_id` — che
  è già nel TXT.
- Il `name` che il telefono manda alla TV finisce in un dialogo: si tronca e si
  mostra come testo.

## 13. Verifica

Con vitest (funzioni pure, l'unica cosa che il progetto prova in automatico):

- parsing dei messaggi nuovi del ponte, **nei due repo**: campi mancanti,
  `host` pubblico, `port` fuori scala, `devices` oltre 16, cast impossibili;
- riconoscimento Fire TV dalla risposta SSDP: `X-Friendly-Name` valido, base64
  rotto, header assente, risposta di un dispositivo non Amazon;
- validazione del corpo di `/api/devices/pair/consent`.

A mano, sull'hardware (Fire TV Stick 4K e telefono Android dell'utente):

1. TV sulla schermata di abbinamento → il telefono la trova col nome giusto;
2. tocco → dialogo sulla TV col nome del telefono → OK → abbinato, e la TV entra
   in home da sola al poll successivo;
3. Annulla sulla TV → il telefono dice "rifiutato", e il codice resta valido per
   un secondo tentativo;
4. TV **non** sulla schermata di abbinamento → non compare fra le `zapp`, ma
   compare come `firetv` con l'invito ad aprire Zapp;
5. wifi ospiti o multicast filtrato → l'elenco resta vuoto e il codice a sei
   cifre continua a funzionare;
6. due telefoni che toccano insieme → il secondo prende `409`.

Su iOS resta da collaudare il permesso "rete locale" al primo build: finché non
c'è, la parte iOS si dichiara non verificata.

## 14. Fasi

1. **Server**: migration, rotta del consenso, Server Action, test. Si prova con
   `curl` senza toccare telefono né TV.
2. **ZappTV**: annuncio, server locale, dialogo. Si prova dal PC con `curl`
   verso la TV.
3. **ZappMobile**: modulo nativo Android, ponte, test puri.
4. **Sito**: `CercaTv` dentro `DevicesClient`.
5. **Collaudo sull'hardware** secondo §13, poi le pagine `tv.md` e `mobile.md`.
6. **iOS**: `NWBrowser` e config plugin, marcato non collaudato.
