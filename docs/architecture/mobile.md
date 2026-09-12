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
| nativo→web | `pushToken` | `{token}` | solo annotato per ora (fase 1) |
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

## Cosa resta (fasi 1-5)

Una riga per fase, dettaglio in
`docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md` §5:

- **Fase 1 Push**: token Expo, `POST /api/devices/push-token` bearer, invio
  su amicizie/domanda del giorno, tap → deep link.
- **Fase 2 Condivisione**: "Condividi" da un'altra app apre Zapp su
  `/share/incoming` con la scheda "Aggiungi" precompilata.
- **Fase 3 Scrobble Android**: modulo Kotlin portato da ZConnection, stesso
  bearer del guscio.
- **Fase 4 App Intents iOS**: "Ehi Siri, segna X come visto su Zapp", modulo
  Swift + keychain condiviso con `SecureStore`.
- **Fase 5 Store**: asset, privacy, TestFlight/Play closed testing,
  `expo-updates`.
