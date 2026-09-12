# App nativa (iOS/Android)

## Cos'è

Guscio Expo, repo separato `D:\PROGETTI\ZappMobile` (`com.zapp.mobile`, scheme
`zapp`): WebView su `zapp-mu.vercel.app` (o `ZAPP_BASE` locale in sviluppo),
con moduli nativi aggiunti fase per fase (push, condivisione, scrobble, App
Intents). Il sito non sa di girare in un'app se non dai due segnali che il
guscio manda prima del caricamento: user-agent in coda
` ZappMobile/<versione> (<ios|android>)` e `window.ZappNative = { platform,
version }` già iniettato.

`window.ZappNative` oggi **la pagina non lo legge**: `inNativeShell()` guarda
`window.ReactNativeWebView` (che è il trasporto vero, quindi la domanda giusta
è "posso rispondere?"), e piattaforma e versione arrivano dentro `ready`.
Resta iniettato perché è il posto naturale dove leggere la versione del guscio
da un codice che non aspetta un messaggio — quando servirà.

## Ponte

Un solo protocollo, due trasporti (`src/lib/native/protocol.ts` lato Zapp,
`src/bridge/protocol.ts` lato ZappMobile): **web → nativo** con
`window.ReactNativeWebView.postMessage(JSON.stringify(msg))`; **nativo → web**
iniettando `window.dispatchEvent(new CustomEvent("zapp:native", { detail:
msg }))`.

| Direzione | Tipo | Payload | Chi tratta il messaggio |
| --- | --- | --- | --- |
| nativo→web | `ready` | `{platform, version, installId, deviceName?}` | `NativeBridge.tsx` → `pairOwnDevice` |
| nativo→web | `pushToken` | `{token}` | superato: `NativeBridge.tsx` non lo tratta piu' |
| nativo→web | `sharedContent` | `{url?, text?}` | solo annotato per ora (fase 2) |
| nativo→web | `deepLink` | `{path}` | `router.push(path)` |
| web→nativo | `deviceToken` | `{token, deviceId}` | `ZappWebView` → `SecureStore` |
| web→nativo | `openExternal` | `{url}` | `ZappWebView` → `Linking.openURL` |
| web→nativo | `badge` | `{count}` | `Notifications.setBadgeCountAsync` |
| web→nativo | `signedOut` | — | `ZappWebView` → cancella `SecureStore` |

Ogni messaggio attraversa un confine di fiducia e va validato **a mano**,
campo per campo (`parseNativeMessage`/`parseWebMessage`): mai un cast. Lo
user-agent con cui il guscio si riconosce non è una prova (un browser normale
può fingerlo, un guscio può caricare la pagina prima che il ponte sia vivo):
`postToNative` non lancia mai, torna solo `false` se il trasporto non c'è.

**Regola dura**: `protocol.ts` esiste in due copie identiche — Zapp
`src/lib/native/protocol.ts`, ZappMobile `src/bridge/protocol.ts` (con una
riga di intestazione in più che indica la sorgente). **Cambi uno, cambi
l'altro, byte per byte**: due copie che divergono sono un ponte che si rompe
solo in produzione, solo sulle versioni dell'app già installate — nessun
`import` fra i due repo lo impedirebbe in anticipo.

## Una sola autenticazione

La sessione vera è il cookie Supabase nella WebView (`sharedCookiesEnabled` su
iOS, `thirdPartyCookiesEnabled` su Android). Al primo `ready` di ogni pagina la
pagina, già loggata, chiama la Server Action `pairOwnDevice` con `platform`,
`installId` e `name`; il server crea o aggiorna la riga in `devices`
(idempotente su `install_id`, e la ricerca guarda **solo** fra `ios`/`android`:
un telefono non può prendersi una TV o l'estensione del browser, che sono
dispositivi di famiglia con il loro abbinamento) e restituisce un token **una
volta sola** — conserva solo l'hash.

**Un abbinamento per pagina, non per `ready`.** Il guscio manda `ready` due
volte a ogni caricamento (subito e dopo 1,5 s: il primo può arrivare prima che
React sia in ascolto). `NativeBridge` tiene in un `useRef` l'`installId` già
abbinato in questa vita di pagina e alza la bandiera **prima** dell'await,
altrimenti il secondo `ready` entra mentre l'azione è in volo: due
abbinamenti sono due rotazioni di token, e le risposte possono tornare in
ordine invertito lasciando al guscio un token già invalidato. Se l'azione
fallisce la bandiera torna a `null`, così il `ready` successivo riprova.

Il `name` **arriva dal guscio**, letto dal sistema con `expo-device`
(`Device.deviceName`, es. "iPhone di Manuel"); "iPhone" / "Telefono Android"
sono solo il ripiego di quando il sistema non lo dà. Una rinomina da `/devices`
**non esiste ancora**: il nome è quello della prima installazione. Il token torna al guscio via `deviceToken` e finisce nel portachiavi
di sistema (`SecureStore`, `keychainService: "zapp"`), mai in `AsyncStorage`
(file in chiaro). Ogni chiamata nativa senza WebView (scrobble, push, Intents:
fasi successive) userà `Authorization: Bearer <token>`.

`install_id` è un segreto, non un identificatore qualsiasi: chi lo conosce può
riabbinarsi al posto del proprietario e diventa l'unico membro del
dispositivo — un telefono è personale, non condiviso come la TV in modalità
famiglia. Nello stesso senso: **dentro il guscio una XSS sul sito potrebbe
inventarsi un evento `ready`** (basta un `dispatchEvent` con un uuid qualsiasi)
e farsi rispondere con un token dispositivo a vita lunga, revocabile solo da
`/devices`. Non è un buco nuovo — chi esegue JS nella pagina ha già la sessione
— ma è un amplificatore: allunga la durata del furto oltre il cookie, e va
ricordato ogni volta che si allarga la CSP. `pairOwnDevice`, nel riabbinamento, cancella ogni membro diverso
dall'utente che si abbina adesso invece di aggiungersi a chi c'era prima.
`name` si fissa **alla prima installazione** (un riabbinamento non lo
riscrive, altrimenti cancellerebbe quello scelto dall'utente da `/devices`).
`signedOut` cancella solo il token **locale**: la revoca vera passa da
`/devices` (già esistente) — `DELETE /api/devices/self` per il bearer nativo
è prevista in fase 1, non esiste ancora.

## Link alle piattaforme nel guscio

`AppLink` decide come aprire un link piattaforma chiamando `nativeOpen()`
(`src/lib/links/native-app.ts`). Fuori dal guscio dipende da `NATIVE_APPS`
(oggi solo Disney+: intent Android o top-level iOS). **Dentro il guscio vale
sempre il ramo `native-shell`**, per ogni piattaforma: un url `https://` se ne
va fuori dalla WebView via `postToNative({type: "openExternal", url})`, e
`AppLink` fa `preventDefault()` solo se il messaggio è partito davvero —
altrimenti un bottone "Apri" che non apre niente sarebbe peggio del link
normale. La WebView blocca comunque ogni navigazione fuori dalla propria
origine (`onShouldStartLoadWithRequest`) e la passa al sistema: una doppia
rete, non solo `AppLink` a deciderlo.

## Deep link

Due forme, un solo risultato — un percorso interno che passa da
`isInternalPath` (nel `protocol.ts` condiviso: inizia con `/`, mai `//` o
`/\`, niente schema):

- **Universal/app link**: `https://zapp-mu.vercel.app/...`. Servono i due file
  `.well-known` pubblici, esclusi da middleware (niente redirect `/login`),
  CSP e CORP same-origin; le intestazioni le mette `next.config.ts`, **una
  regola per percorso esatto**, e ci sono già entrambe anche se il file iOS
  ancora non c'è.
  - `public/.well-known/assetlinks.json` (Android) sta nel repo **con il
    segnaposto** `SHA256_DA_EAS_CREDENTIALS`: il fingerprint esiste solo dopo
    la prima build EAS (vedi Stato EAS). Un segnaposto qui non fa danno: al
    massimo Android non verifica l'app link e apre il browser.
  - `public/.well-known/apple-app-site-association` (iOS) **non sta nel
    repo**, ed è una scelta: pubblicare `TEAMID` come Team ID vero
    significherebbe servire un file che iOS scarica e scarta in silenzio,
    senza che nulla lo dica — un guasto senza sintomi. Va creato (senza
    estensione), sostituendo `TEAMID` con il Team ID di Apple Developer →
    Membership, **prima della prima build TestFlight**:

    ```json
    {
      "applinks": {
        "apps": [],
        "details": [{ "appID": "TEAMID.com.zapp.mobile", "paths": ["*"] }]
      },
      "webcredentials": { "apps": ["TEAMID.com.zapp.mobile"] }
    }
    ```
- **Schema privato**: `zapp://...`. Con due barre il primo segmento finisce in
  `hostname`, non in `path` (SDK 57 installa come `URL` globale una
  `whatwg-url-minimum` conforme alle specifiche): `App.tsx` ricompone
  `hostname` + `path` prima di validare, altrimenti `zapp://library`
  diventerebbe `/` invece di `/library`.

A ponte vivo il percorso arriva via evento `deepLink` (naviga senza
ricaricare); ad app chiusa passa da `navigate()` (`location.assign`), quindi
la WebView carica prima la home e poi il percorso — un caricamento in più,
visibile ma corretto.

## Come collaudare senza telefono

Chrome desktop, DevTools → aggiungi in coda allo user-agent
` ZappMobile/1.0.0 (ios)`, poi in console:
`window.ReactNativeWebView = { postMessage: (s) => console.log(s) };`. Fai
login: dopo il `ready` che `NativeBridge` intercetta, `pairOwnDevice` risponde
e in console compare `deviceToken` (JSON con `token` e `deviceId`); `/devices`
mostra la riga appena creata.

## Trappole

- `expo install` rigenera un `app.json` minimale se trova un plugin
  dichiarato in `app.config.ts` ma non installato: va cancellato dopo, solo
  `app.config.ts` è la configurazione vera.
- Nello schema SDK 57 non esistono più `splash` top-level (resta solo
  `web.splash`, per la PWA) né `android.usesCleartextTraffic`: passano dai
  plugin `expo-splash-screen` / `expo-build-properties`.
- `next build` con `NEXT_DIST_DIR` riscrive `tsconfig.json`: ripristinare con
  `git checkout tsconfig.json` prima di committare.
- `supabase gen types` fotografa lo schema **live**, che può contenere
  tabelle di altri branch in lavorazione (es. `pairing_codes`): un conflitto
  su `database.ts` al merge è atteso.
- Vitest è node-only: `bridge.ts`/`NativeBridge.tsx` e tutto ciò che tocca
  `window`/React nel guscio si verificano solo con `pnpm typecheck`.

## Stato EAS

`eas build` non è stato ancora lanciato: l'account Expo non è collegato
(`eas whoami` → "Not logged in"). Restano da fare, in ordine, da
`D:\PROGETTI\ZappMobile`:

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
npx eas-cli credentials --platform android   # → fingerprint SHA-256
```

Il fingerprint dell'ultimo comando va in `assetlinks.json` al posto di
`SHA256_DA_EAS_CREDENTIALS`: senza, Android non verifica gli app link e si
apre il sito nel browser invece dell'app.

## I 6 controlli sul dispositivo (TestFlight / APK interno)

1. Login: chiudi l'app dallo switcher e riaprila — resta dentro.
2. Da una scheda titolo, un link piattaforma apre l'app (Netflix, Disney+ via
   intent su Android), mai dentro Zapp.
3. `/devices` mostra una sola voce per il telefono anche dopo più riavvii.
4. Un universal link (`https://zapp-mu.vercel.app/library` in Note) apre
   l'app, non il browser (serve il fingerprint Android).
5. `zapp://library` apre l'app sulla libreria, ad app chiusa e ad app già
   aperta.
6. Modalità aereo → schermata nera "Sei offline"; "Riprova" ricarica.

## Notifiche push

### Da dove nascono

Le notifiche in-app restano righe di `notifications` (vedi `social.md`); il
push le segue con un ritardo minimo. Ogni insert fa scattare il trigger
`notifications_push_wake` (migration `supabase/migrations/0047_push.sql`), che
chiama `call_zapp_job('push-send')` via `pg_net`. Il trigger e' **per
istruzione** (`for each statement`, migration `0048_push_wake_statement.sql`),
non per riga: nato per riga, un insert massivo — le 20 000 notifiche di
`bench_scale`, le notifiche del DSA che ne scrivono diverse in un colpo solo —
accodava una chiamata http per **ogni riga**, e a svegliare il job basta una.
La funzione non legge `NEW` e ritorna `null`, quindi il passaggio non ha
richiesto di riscriverla. La chiamata e' asincrona
(fuori dalla transazione dell'utente) e la funzione e' scritta per non fallire
mai — un `exception when others` assorbe il caso in cui il segreto in Vault o
`pg_net` siano giu', cosi' l'insert della notifica in-app va comunque a buon
fine. Il cron `zapp-push-send` (`*/5 * * * *`) e' la rete di sicurezza per le
righe che il trigger non e' riuscito a svegliare. La colonna
`notifications.pushed_at` segna cosa e' gia' stato **valutato** per il push,
non "consegnato": ci finiscono anche le notifiche scartate (`kind`
sconosciuto) o senza nessun telefono registrato, altrimenti ogni giro
rileggerebbe le stesse righe all'infinito.

La domanda del giorno e' un caso a parte: il job `push-daily`
(`zapp-push-daily`, `0 7 * * *` UTC = le 9 di Roma d'estate) gira una volta al
mattino e manda il push solo a chi **non ha ancora aperto** il popup di oggi
(`daily_question_views`): chi l'ha gia' vista non ha bisogno che il telefono
gliela ricordi. Il tetto di token letti in un giro e' **1000**
(`DAILY_MAX_TOKENS`, `src/lib/push/fanout.ts`), cioe' il tetto di PostgREST:
chiederne di piu' non ne leggeva uno in piu' e rendeva impossibile accendere la
spia `tetto` della risposta, lasciando il taglio in silenzio. Quando i telefoni
registrati supereranno il migliaio la lettura andra' paginata con `.range()`, e
il `tetto` nel registro dei job e' il segnale che quel giorno e' arrivato.

Il messaggio `pushToken` del protocollo (§1.2) e' **superato**: il token push
il guscio lo registra da se' con `POST /api/devices/push-token`, e
`NativeBridge.tsx` non lo tratta piu'. Il messaggio resta nel protocollo (le due
copie di `protocol.ts`) finche' non si fa la pulizia da entrambe le parti.

### Testi

`src/lib/push/compose.ts` (`composePush`) copia, appiattito, lo `switch` di
`src/app/(app)/notifications/page.tsx`: stessi sette `kind`, stesse frasi,
stesso ripiego "Qualcuno" quando manca il mittente. Cambiare un testo li'
senza cambiarlo anche in `compose.ts` fa vedere due frasi diverse per la
stessa notifica sullo stesso telefono. Le due notifiche del DSA
(`content_hidden`, `report_outcome`) non hanno un mittente nella pagina (le
scrive il sistema, non un utente): `compose.ts` non usa il nome del mittente
in quei due `case`, per lo stesso motivo.

### Token e ricevute

`push_tokens` e' appeso al **dispositivo** (`device_id`), non all'utente: per
sapere a chi mandare un push si passa da `device_members → devices (non
revocato) → push_tokens`, e i messaggi si deduplicano per `expo_token` perche'
un dispositivo puo' avere piu' membri (`src/lib/push/fanout.ts`). La
registrazione (`POST /api/devices/push-token`) fa `upsert` sulla chiave
`expo_token`, non su `device_id`: lo stesso token puo' migrare da
un'installazione all'altra (ripristino di un backup), e due righe con lo
stesso token manderebbero la notifica due volte.

Un **4xx di Expo** (400 malformato, 429 troppi messaggi) non e' un'eccezione:
`expo.ts` restituisce il corpo, il lotto si scarta con un messaggio nel log e
`pushed_at` viene scritto lo stesso. Se lanciasse, `drainNotifications`
morirebbe prima di marcare le righe, e il cron ogni 5 minuti rimanderebbe le
stesse 200 notifiche — lotti gia' accettati compresi — avvitandosi proprio
mentre Expo chiede di rallentare. Restano eccezioni i 5xx, la rete e le
risposte non JSON: quelle vanno ritentate davvero. Sulle ricevute, invece, un
4xx lancia: li' non si rispinge niente, e fingere una risposta vuota vorrebbe
dire cancellare biglietti mai controllati.

Dopo l'invio, `push_tickets` tiene il biglietto restituito da Expo; il job
`push-receipts` (cron a `:13` e `:43`) controlla solo i biglietti piu' vecchi
di 15 minuti (`PUSH_RECEIPT_DELAY_MIN`, `src/lib/config.ts`), perche' la
consegna vera ad APNs/FCM avviene dopo che Expo ha gia' risposto. Una ricevuta
`DeviceNotRegistered` cancella subito la riga di `push_tokens`; qualsiasi
altro errore (`MessageRateExceeded`, …) scrive solo `last_error` e lascia il
token al suo posto — non e' detto che il telefono sia sparito.

### Rotte bearer

`authenticateDevice` (`src/lib/devices/auth.ts`) e' la cascata comune a tutte
le rotte del dispositivo: header `Authorization: Bearer`, hash sha256 del
token confrontato con `devices.token_hash`, rate limit 120 richieste/minuto
**per hash del dispositivo** (non per IP). `src/app/api/scrobble/route.ts` ha
ancora **la sua copia inline** della stessa cascata: e' in lavorazione in
altre sessioni, quindi va unificata su `authenticateDevice` solo quando quel
file sara' fermo, non prima. In `PUBLIC_PATHS`
(`src/lib/supabase/middleware.ts`) stanno le **due rotte per esteso**
(`/api/devices/push-token` e `/api/devices/self`), non il prefisso
`/api/devices`: senza, il middleware risponderebbe 401 **prima** della rotta,
cieco alla differenza fra un bearer valido e uno scaduto; col prefisso, invece,
una rotta futura sotto quella cartella nascerebbe pubblica senza che nessuno
l'abbia deciso. `DELETE /api/devices/self` revoca (`devices.revoked_at`) senza
cancellare la riga: `watch_sessions`/`pending_scrobbles` la referenziano.

`POST /api/devices/push-token` risponde **409** (`Token già registrato da un
altro account`) se quell'`expo_token` e' gia' su un altro dispositivo **vivo e
con almeno un membro** che non condivide nessun membro con chi lo presenta: il
telefono reinstallato dalla stessa persona continua a prendersi il token, un
altro account no — altrimenti si farebbe recapitare le notifiche altrui. Le due
eccezioni contano: un token appeso a un dispositivo **revocato** o **senza
membri** e' un residuo di nessuno, e trattarlo come un conflitto bloccava per
sempre quel telefono (un 409 a ogni avvio, senza niente che dicesse perche').
Per questo `disconnectDevice` (`src/app/(app)/devices/actions.ts`) cancella i
`push_tokens` quando revoca il dispositivo, esattamente come
`DELETE /api/devices/self`: la revoca senza la pulizia lasciava in giro proprio
quel residuo.

### Guscio

Il permesso di sistema si chiede solo **dopo l'abbinamento** (dopo il primo
`ready` andato a buon fine), mai all'avvio a freddo di un'installazione nuova.
`registraPush` (`src/App.tsx`) e' un tentativo per avvio: una guardia
(`pushFatto`) evita qualsiasi ciclo di ripetizione, e torna a `false` solo
all'uscita dall'account, perche' un nuovo accesso e' un nuovo abbinamento (un
dispositivo nuovo lato server) e senza reset chi rientra senza riavviare
l'app resterebbe senza notifiche. `projectId` (da `extra.eas.projectId`,
scritto da `eas init`) e' obbligatorio: senza, `ottieniTokenPush()`
(`src/native/push.ts` nel repo mobile) torna `null` **senza errore** — niente
token, e niente che lo dica.

Il tap su una notifica passa da `src/native/push-path.ts`:
`percorsoDaNotifica` valida `data.path` come un deep link (mai `//` o uno
schema, tetto di 2000 caratteri, `isInternalPath` del protocollo condiviso)
prima di passarlo alla stessa `apri()` dei deep link. All'avvio a freddo la
stessa notifica arriva **due volte** da Expo (l'ultima risposta salvata *e* il
listener che si attiva appena qualcuno ascolta): `ascoltaTap` deduplica per
`identificativoDaNotifica` (l'`identifier` della richiesta), leggendo la
risposta salvata **prima** di iscrivere il listener e cancellandola subito
dopo, cosi' un Fast Refresh non la rigioca.

### Credenziali push (a mano dell'utente)

Restano da fare in `D:\PROGETTI\ZappMobile`, nell'ordine: `eas init` (scrive
`extra.eas.projectId`, senza il quale non esiste nessun token push), poi la
chiave APNs (`.p8`) per iOS via `eas credentials --platform ios`, poi le
credenziali FCM V1 (Google Service Account) per Android via
`eas credentials --platform android`. Oggi nessuna delle due esiste: **nessun
build EAS e' mai stato lanciato**, l'account Expo non e' collegato.
`EXPO_ACCESS_TOKEN` (`.env.example`, Vercel) resta facoltativo: serve solo se
sul progetto Expo si accende la "enhanced push security" di Expo, e senza non
degrada nulla.

### Come collaudare senza telefono

Un dispositivo e un `push_tokens` finti (via SQL), un insert in
`notifications` per un `kind` esistente, poi
`POST /api/jobs/push-send` con l'header `x-jobs-secret`: la risposta contiene
`{ inviate, notifiche, senzaToken, scartate, rifiutati, motivi }` (e finisce
tale e quale in `job_runs.detail`). Le unita' sono due e diverse: `notifiche`
sono le **righe** di `notifications` che avevano almeno un telefono, `inviate`
sono i **messaggi** accettati da Expo — chi ha due telefoni e' una notifica e
due messaggi. `rifiutati` sono i messaggi finiti in un lotto che Expo ha
rifiutato in blocco (un 4xx) e `motivi` i primi cinque motivi distinti, con i
token oscurati: prima quel caso viveva solo in un `console.error`, e nel
registro un giro in cui non era partito niente sembrava identico a uno
riuscito. `push-daily` usa la stessa unita' per `inviate` e aggiunge
`saltato: "gia' inviata oggi"` quando in `job_runs` c'e' gia' un giro riuscito
di `push-daily` iniziato nella giornata di Roma corrente: la domanda del giorno
non passa da `notifications`, quindi `pushed_at` non la protegge e senza questo
controllo una seconda chiamata del job avrebbe svegliato ogni telefono due
volte con la stessa domanda. Expo risponde comunque per il token
finto (di solito `DeviceNotRegistered`, che cancella subito la riga), ed e'
proprio quella risposta a dire se il giro ha funzionato — non serve un
telefono vero per vedere il messaggio che Expo restituisce. A fine giro
`pushed_at` sulla notifica non e' piu' `null`.

### Trappole

- Lo `switch` di `notifications/page.tsx` per `content_hidden`/`report_outcome`
  non ha un mittente (sono le notifiche del DSA, le scrive il sistema): un
  `composePush` scritto senza guardare la pagina rischia di infilarci
  "Qualcuno" davanti a un testo che nella pagina non ce l'ha.
- `push_tokens` e' per **dispositivo**, non per utente: la deduplica dei
  messaggi e' per `expo_token`, altrimenti un dispositivo con piu' membri
  farebbe suonare due volte lo stesso telefono per la stessa notifica.
- SDK 57 di `expo-notifications` vuole `shouldShowBanner`/`shouldShowList` nel
  gestore delle notifiche: `shouldShowAlert` esiste ancora ma e' deprecato, e
  anche `getLastNotificationResponseAsync`/`clearLastNotificationResponseAsync`
  lo sono (si usano le gemelle sincrone `getLastNotificationResponse`/
  `clearLastNotificationResponse`).
- Le push remote **non funzionano in Expo Go su Android** da SDK 53: serve una
  development build o l'APK di preview per collaudare qualunque cosa tocchi
  `expo-notifications` su Android.
- Un token Expo compare per intero nei messaggi d'errore che Expo stesso
  restituisce (`"ExponentPushToken[…]" is not a valid Expo push token`):
  `nascondiToken` (`src/lib/push/tickets.ts`) lo oscura prima che finisca in
  `last_error`, in `job_runs.detail` o in un log — un `console.error` sul
  corpo grezzo della risposta lo avrebbe scritto lo stesso.

## Cosa resta (fasi 1-5)

Una riga per fase, dettaglio in
`docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md` §5:

- **Fase 2 Condivisione**: "Condividi" da un'altra app apre Zapp su
  `/share/incoming` con la scheda "Aggiungi" precompilata.
- **Fase 3 Scrobble Android**: modulo Kotlin portato da ZConnection, stesso
  bearer del guscio.
- **Fase 4 App Intents iOS**: "Ehi Siri, segna X come visto su Zapp", modulo
  Swift + keychain condiviso con `SecureStore`.
- **Fase 5 Store**: asset, privacy, TestFlight/Play closed testing,
  `expo-updates`.
