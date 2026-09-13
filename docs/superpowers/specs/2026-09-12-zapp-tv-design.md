# Zapp TV — spec di design

Data: 2026-09-12. Stato: approvata dall'utente in chat (perimetro, piattaforme,
approccio, schermate). Sostituisce, per la parte "app sulla TV", il piano 1 di
`2026-09-12-zconnection-fire-tv-design.md`: quel documento resta valido per
abbinamento, ascolto e lancio, che qui vengono **inglobati** nell'app Zapp TV.

## 1. Obiettivo

Zapp **intera** sul televisore: home con le stesse file dell'algoritmo, libreria,
ricerca, scheda titolo con "Dove vederlo", **Play che apre la piattaforma sulla TV
stessa**, trailer, segna visto / da vedere. Sulle TV Android (Fire TV, Android TV,
Google TV) l'app include anche l'ascolto di ZConnection: NOW e Disney+ si seguono
da soli, Netflix e Prime si attribuiscono perche' li ha lanciati Zapp.

Limite dichiarato, come sempre: Zapp non riproduce contenuti e non entra nelle
piattaforme. Apre la loro app e, dove il sistema lo consente, ascolta cosa dicono.

## 2. Decisioni prese (utente, 2026-09-12)

| Domanda              | Scelta                                                                             |
| -------------------- | ---------------------------------------------------------------------------------- |
| Perimetro            | Zapp intera + ascolto, un'app sola sulla TV                                        |
| Piattaforme e ordine | Fire TV -> Android/Google TV -> Apple TV. Samsung/LG fuori                         |
| Approccio            | **Nativo puro**: Kotlin (Compose for TV) + Swift (SwiftUI tvOS) + API JSON di Zapp |
| Hardware             | Fire TV Stick 4K (Fire OS 6, API 25), Apple TV e Mac disponibili                   |
| Schermate v1         | Nucleo (Home, Libreria, Ricerca, Scheda, Play, Impostazioni) + trailer             |
| Repo                 | Nuovo monorepo `D:\PROGETTI\ZappTV` (`android/`, `tvos/`)                          |

Scartati: guscio WebView (tvOS non ha WebView; la WebView di Fire OS 6 e' un
Chromium vecchio per Tailwind 4), React Native TV (riscrittura senza il vantaggio
del nativo).

## 3. Le parti

```
ZappTV/android  (Kotlin)  ─┐
                           ├─ HTTPS bearer ─> zapp-mu.vercel.app/api/tv/v1/*  ─> query e action esistenti
ZappTV/tvos     (Swift)   ─┘                 /api/devices/pair*  (abbinamento)
                                             /api/scrobble       (ascolto, token dispositivo)
```

- **Zapp** (questo repo): fusione di `feat/zconnection-tv` (abbinamento, comandi,
  ascolto Android), sessione utente per la TV, API `/api/tv/v1`, pagina
  `docs/architecture/tv.md`, contratto in `src/lib/tv/dto.ts`.
- **ZappTV/android**: app Compose for TV. Il codice di `D:\PROGETTI\ZConnection`
  (listener, abbinamento, invio eventi) migra qui con package `com.zapp.tv`;
  ZConnection resta come archivio (mai pubblicato, nessun utente da migrare).
- **ZappTV/tvos**: app SwiftUI. Stesse schermate, stesso contratto, niente ascolto.

**Un fatto sta in un posto solo**: il contratto dell'API vive in Zapp
(`src/lib/tv/dto.ts` + `docs/architecture/tv.md`). I modelli Kotlin e Swift sono
copie a mano, con in testa il commit di Zapp da cui derivano. Cambia il DTO = si
aggiornano le due copie nello stesso giro.

## 4. Autenticazione sulla TV

La TV e' un **utente Supabase vero** (sessione con access + refresh token), non
solo un dispositivo. Serve perche' tutte le letture (`watch_entries`, profilo di
gusto, liste) passano dalla RLS con `auth.uid()`: un token dispositivo darebbe
solo la via `security definer` dello scrobble, che non si vuole allargare a tutto.

### 4.1 Flusso

1. La TV genera `install_id` (uuid) e `token` (32 byte casuali) e chiama
   `POST /api/devices/pair` `{install_id, token, name, platform}` -> `{code, expires_at, qr_url}`.
   (Gia' scritto in `feat/zconnection-tv`; `platform` accetta anche `tvos`.)
2. Sullo schermo: codice a sei cifre + QR verso `https://zapp-mu.vercel.app/devices/pair?code=…`.
3. Dal telefono, loggato, l'utente conferma: Server Action `claimPairingCode(code)`
   -> RPC `claim_pairing_code` (dispositivo + membro, come oggi).
4. La TV sonda `GET /api/devices/pair/{code}` col proprio token (rate limit 120/min
   per token). Quando `claimed_by` e' valorizzato il server **conia la sessione in
   quella stessa richiesta** e la consegna una volta sola:
   - `auth.admin.getUserById(claimed_by)` -> email;
   - `auth.admin.generateLink({type: "magiclink", email})` -> `hashed_token`
     (nessuna mail parte: il link non viene spedito);
   - client anon: `auth.verifyOtp({token_hash, type: "magiclink"})` -> `{access_token, refresh_token, expires_at}`;
   - risposta `{status: "claimed", device_id, user: {id, username, avatar_url}, session: {...}}`;
   - la riga di `pairing_codes` viene cancellata: il codice non si ripesca.
     **Niente token in tabella**: si conia al momento della consegna, nella richiesta
     autenticata dal token della TV.
5. La TV salva sessione e token dispositivo nel deposito cifrato del sistema
   (`EncryptedSharedPreferences` / Keychain) e da qui in poi chiama `/api/tv/v1/*`
   con `Authorization: Bearer <access_token>` e `/api/scrobble` col token dispositivo.
6. Rinnovo: `POST /api/tv/v1/auth/refresh` `{refresh_token}` -> il server chiama
   `auth.refreshSession` con client anon e ritorna la sessione nuova. La TV rinnova
   quando mancano meno di 5 minuti alla scadenza e su ogni `401`. **Nessun SDK
   Supabase sulla TV**: solo HTTP, identico su Kotlin e Swift.
7. Uscita dalla TV: `POST /api/tv/v1/auth/signout` (revoca il refresh token
   della sessione) + la TV cancella il deposito e torna al codice.
8. Revoca dal telefono (`/devices`, gia' esistente): cancella la riga di
   `devices` (cascata su membri e comandi). La sessione Supabase della TV non si
   puo' revocare da sola senza toccare lo schema `auth`, quindi **la revoca la
   fa l'API**: ogni rotta `/api/tv/v1/*` richiede l'header `X-Zapp-Device:
<device_id>` e, dentro `withBearer`, verifica con una query indicizzata che il
   dispositivo esista e che l'utente del bearer ne sia membro. Se no: `410
device_revoked`, la TV cancella tutto e torna al codice. Un refresh token
   sopravvissuto non apre piu' niente.

### 4.2 Un utente per TV

L'app mostra un utente alla volta: chi ha confermato il codice. "Cambia utente" in
Impostazioni = disconnessione + nuovo codice. I **membri** del dispositivo restano
piu' d'uno (famiglia): servono all'attribuzione dello scrobble, non alla UI.
Regola dura in `claim_pairing_code`: un secondo reclamo dello stesso `install_id`
da un altro utente aggiunge il membro e **non** cambia la sessione gia' consegnata.

### 4.3 Middleware

`/api/tv` e `/api/devices/pair` entrano in `PUBLIC_PATHS` di
`src/lib/supabase/middleware.ts`: si autenticano da soli (bearer). Rispondono
`401` JSON, mai redirect.

## 5. API `/api/tv/v1`

### 5.1 Il ponte: sessione bearer nelle query esistenti

Tutto il valore di Zapp sta in `src/lib/**/queries.ts`, `src/lib/home/*`,
`src/lib/watch/actions.ts`, `src/lib/tmdb/*`, che leggono l'utente da
`createClient()` (cookie) e `getViewer()`. Non si riscrivono: si aggiunge una
via d'ingresso.

- `src/lib/supabase/request-session.ts`: `AsyncLocalStorage<{ accessToken: string }>`
  - `withBearer(request, fn)` che estrae il bearer, verifica la firma con
    `getClaims(token)` (JWKS in cache, zero viaggi verso Auth) e corre `fn` dentro
    il contesto. Bearer assente o non valido -> `401` prima di eseguire nulla.
- `createClient()` in `src/lib/supabase/server.ts`: se il contesto e' attivo,
  ritorna un client con `global.headers.Authorization` e senza cookie
  (`persistSession: false`); altrimenti il client a cookie di sempre.
- `getViewer()`: se il contesto e' attivo, `getClaims(accessToken)`.
- Le Server Action (`"use server"`) si importano dalle rotte come funzioni
  normali; `revalidatePath` dentro un route handler e' consentito da Next 15.

Effetto: ogni rotta TV e' un adattatore sottile "parametri -> funzione esistente
-> DTO". Chi tocca una query del sito cambia anche la TV, senza saperlo: e' voluto.

### 5.2 Rotte

Tutte con bearer utente salvo dove indicato. Risposte JSON `Cache-Control: private, no-store`.
Errori: `{error: string}` generico (come le action: mai `error.message` di PostgREST).

| Metodo e rotta                              | Cosa fa                                                                                                                                                                                               | Riusa                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /home`                                 | `{ continue: ContinueItem[], hero: HeroItem[], shelves: ShelfRef[] }`. `shelves` e' il **manifesto** (chiave, titolo, sottotitolo), nell'ordine della home web (profilo ricco/povero, `MASSA_MINIMA`) | `getHomeData`, `getContinueItems`, `getHomeHero`, `getTasteProfile`                                         |
| `GET /home/shelf/{key}`                     | Items di uno scaffale: `foryou`, `persone`, `because:{type}:{id}`, `generi`, `decenni`, `topten`, `want`, `platform:{id}`, `toprated`, `comingsoon`                                                   | `src/lib/home/shelves.ts`, `src/lib/rank/*`, `getBecauseShelf`, `getPlatformShelves`, `getComingSoon`       |
| `GET /providers`                            | `{ providers: ProviderInfo[] }`, catalogo piattaforme IT (nome, logo)                                                                                                                                 | `getProviderList`                                                                                           |
| `GET /library?status=&type=&offset=&limit=` | `LibraryPage` (limite massimo 60)                                                                                                                                                                     | `getLibraryPage`                                                                                            |
| `GET /search?q=`                            | `{ results: TitleCard[] }`                                                                                                                                                                            | logica di `src/app/api/search/route.ts` estratta in `src/lib/search/instant.ts`                             |
| `GET /title/{movie\|tv}/{id}`               | `TitleDetail`                                                                                                                                                                                         | `getTitleCached`, `resolveProviderLinks`, `parseTrailers`, `readSimilar`/`personalizeSimilar`, entry utente |
| `GET /title/tv/{id}/season/{n}`             | `SeasonDetail` con episodi e visto/da riprendere                                                                                                                                                      | loader della pagina stagione, `nextEpisode`, `resumeEpisode`                                                |
| `POST /watch`                               | `{titleId, mediaType, action, season?, episode?, rating?}` con `action` in `want\|watching\|watched\|drop\|remove\|episode\|rate` -> `ActionResult`                                                   | `addWant`, `startWatching`, `markWatched`, `dropTitle`, `removeEntry`, `setProgress`, `setRating`           |
| `POST /play`                                | `{titleId, mediaType, providerId, season?, episode?}` -> `LaunchPlan` **e** scrive la dichiarazione in `device_commands` (`delivered_at = now()`, `created_by` = utente)                              | risolutore di lancio di `feat/zconnection-tv`, `resolvePlayback`                                            |
| `POST /play/result`                         | `{commandId, result: ok\|assente\|errore}`                                                                                                                                                            | aggiorna `device_commands.result`                                                                           |
| `GET /me`                                   | `{ user, device, listening: boolean, tmdbAttribution }`                                                                                                                                               | `profiles`, `devices`                                                                                       |
| `POST /auth/refresh` (no bearer)            | `{refresh_token}` -> `Session`                                                                                                                                                                        | `auth.refreshSession`                                                                                       |
| `POST /auth/signout`                        | revoca                                                                                                                                                                                                | `auth.signOut({scope: "local"})` sul client bearer                                                          |

Header **obbligatorio** `X-Zapp-Device: <device_id>` su ogni chiamata con bearer:
e' la revoca (§4.1 punto 8) ed e' il dispositivo a cui `/play` attribuisce la
dichiarazione. Le sole rotte senza sono `/auth/refresh` e l'abbinamento.

### 5.3 DTO (`src/lib/tv/dto.ts`, tipi TypeScript, un file solo)

```ts
type MediaType = "movie" | "tv";
interface TitleCard {
  id: number;
  mediaType: MediaType;
  name: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  zappScore: number | null;
  zappVotes: number;
  affinity: number | null; /* 0..1 dal ranking, solo scaffali personali */
  providerIds: number[]; /* flatrate IT gia' in cache */
}
interface ProviderInfo {
  id: number;
  name: string;
  logoPath: string | null;
}
interface ContinueItem extends TitleCard {
  entryId: number;
  status: WatchStatus;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  stillPath: string | null;
  positionMs: number | null;
  durationMs: number | null;
  live: boolean; /* un dispositivo lo sta riproducendo adesso */
}
interface HeroItem extends TitleCard {
  tagline: string | null;
  overview: string | null;
  trailerId: string | null;
}
interface ShelfRef {
  key: string;
  title: string;
  subtitle: string | null;
  layout: "poster" | "backdrop" | "numbered";
}
interface Shelf extends ShelfRef {
  items: TitleCard[];
}
interface LibraryPage {
  items: (TitleCard & { rating: number | null })[];
  total: number;
}
interface TitleDetail extends TitleCard {
  originalName: string | null;
  overview: string | null;
  tagline: string | null;
  genres: string[];
  runtimeMin: number | null;
  releaseDate: string | null;
  tmdbRating: number | null;
  certification: string | null;
  cast: { name: string; character: string | null; profilePath: string | null }[];
  trailer: { youtubeId: string; bars: { top: number; bottom: number } | null } | null;
  providers: ProviderOffer[];
  entry: UserEntry | null;
  seasons: SeasonSummary[];
  similar: TitleCard[];
  palette: { primary: string; secondary: string } | null;
}
interface ProviderOffer extends ProviderInfo {
  kind: "flatrate" | "rent" | "buy" | "free" | "ads";
  canLaunch: boolean;
  expected: "avvia" | "scheda" | "app" | null;
}
interface UserEntry {
  status: WatchStatus;
  rating: number | null;
  season: number | null;
  episode: number | null;
  next: { season: number; episode: number } | null;
}
interface SeasonSummary {
  number: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  watched: number;
}
interface SeasonDetail {
  number: number;
  name: string;
  overview: string | null;
  episodes: {
    number: number;
    name: string;
    overview: string | null;
    stillPath: string | null;
    airDate: string | null;
    runtimeMin: number | null;
    watched: boolean;
    resumeMs: number | null;
  }[];
}
interface LaunchPlan {
  commandId: string;
  android: {
    packages: string[];
    dataUri: string | null;
    extraDeeplink: string | null;
  } | null;
  tvos: { url: string } | null;
  expected: "avvia" | "scheda" | "app";
}
interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
```

Immagini: la TV compone `https://image.tmdb.org/t/p/{w342|w780|original}{path}`
(CDN pubblica, non e' l'API TMDB: la regola "niente TMDB dal client" resta intera).
Loghi provider: `w92`.

### 5.4 Forme di lancio

Android (dalla sonda del 12/09, gia' in `device_commands`):

| Piattaforma  | `packages` (ordine)                                                 | Forma                                         | `expected` |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| Netflix      | `com.netflix.ninja`, `com.netflix.mediaclient`                      | extra `amzn_deeplink_data` = id               | `avvia`    |
| Disney+      | `com.disney.disneyplus`                                             | `https://www.disneyplus.com/play/<uuid>`      | `avvia`    |
| Prime Video  | `com.amazon.firebat`, `com.amazon.amazonvideo.livingroom`           | `https://app.primevideo.com/detail?gti=<gti>` | `scheda`   |
| Apple TV app | `com.apple.atve.amazon.appletv`, `com.apple.atve.androidtv.appletv` | `https://tv.apple.com/…`                      | `scheda`   |
| NOW          | `com.nowtv.it`                                                      | avvio app                                     | `app`      |

tvOS: **da sondare sull'Apple TV dell'utente prima di scrivere il risolutore**
(`nflx://`, universal link Disney+, `com.apple.tv://`, `primevideo://`): la
colonna `tvos` di `LaunchPlan` nasce `null` e si riempie in fase C con i risultati
della sonda, esattamente come e' stato fatto per Fire OS.

## 6. App Android TV / Fire TV (`ZappTV/android`)

- Kotlin 2.0, AGP 8.5, `minSdk 25` (Fire OS 6), `targetSdk 34`, package `com.zapp.tv`.
  Dipendenze: `androidx.tv:tv-material`, `androidx.tv:tv-foundation`, Compose,
  Coil (immagini), OkHttp, kotlinx.serialization, `androidx.security:security-crypto`.
  Niente Leanback (view-based, deprecato).
- Toolchain del PC: JDK 17 Temurin, SDK in `%LOCALAPPDATA%\Android\Sdk`,
  `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` (AVG), build
  fuori sandbox. `-PzappBase=http://<ip-pc>:3400` in debug (`usesCleartextTraffic`
  solo nel manifest di debug).
- **Schermate**: `Pairing` (codice grande + QR + "Vai su zapp-mu.vercel.app/devices/pair");
  `Home` (barra laterale a sinistra: Home, Cerca, Libreria, Impostazioni; in alto
  il carosello hero con fondale; sotto "Continua a guardare" e gli scaffali, caricati
  a scorrimento uno alla volta); `Title` (fondale cinematico, poster, sinossi, riga
  azioni: **Guarda su <provider>** per ogni offerta lanciabile, Trailer, Da vedere /
  Visto / In corso, Stagioni; sotto: cast, simili); `Season` (lista episodi con spunta);
  `Search` (tastiera di sistema, risultati a griglia); `Library` (tab stato +
  Film/Serie, griglia con "carica altri"); `Settings` (utente, nome TV, stato
  dell'ascolto + bottone al permesso notifiche, versione, "Cambia utente", TMDB
  attribution: obbligatoria anche qui).
- **Fuoco**: ogni riga e' una `TvLazyRow` con `focusRestorer`; la tessera a fuoco
  scala 1,08 con bordo bianco; Indietro dalla barra laterale chiude l'app come le
  app di sistema. Testi >= 24 sp a 10 piedi.
- **Stile**: stessi token del sito (`--bg`, `--accent`, `--glass`, palette da
  `globals.css`) e stessi font self-hosted (copiati da `public/fonts`). Dark only.
- **Trailer**: intent verso l'app YouTube (`vnd.youtube:<id>`, poi
  `https://www.youtube.com/watch?v=` come ripiego): niente player nostro, niente
  chiave.
- **Ascolto**: `ZListener` (NotificationListenerService) + `SessionProbe` di
  ZConnection, invariati nella logica; `Sender` con coda e retry verso
  `/api/scrobble` (`source: "android"`). Dopo un `POST /play`, `LaunchService`
  esegue l'intent e riferisce `POST /play/result`. Le anteprime di Netflix non
  contano: niente scrittura prima di due minuti continui (regola gia' in
  `riproduzioneVera`).
- **Sondaggio comandi dal telefono** (tondo TV nella scheda web, piano 1 di
  ZConnection): resta, 3 s a schermo acceso / 30 s spento. La TV che riceve un
  comando **apre la scheda del titolo su Zapp TV e lancia**: cosi' anche il
  gesto dal telefono passa dalla stessa via del Play locale.

## 7. App Apple TV (`ZappTV/tvos`)

- SwiftUI, tvOS 17+, Swift 5.10, zero dipendenze (URLSession, Keychain, `AsyncImage`
  con cache propria). Bundle `com.zapp.tv`, Team ID dell'utente.
- Stesse schermate della §6, con i pattern tvOS (`focusable`, `.focusSection`,
  `NavigationStack`, `TabView` laterale).
- **Niente ascolto**: tvOS non espone le sessioni di altre app. Il tracciamento e'
  Play + dichiarazione; al ritorno in app dopo un Play, un foglio "Hai finito
  <titolo>?" (Visto / Ancora no) — e' l'unico segnale che tvOS puo' dare.
- Build: sul Mac dell'utente con Xcode (progetto generato da un `project.yml`
  XcodeGen o creato a mano una volta e committato); TestFlight sull'Apple TV. Il
  codice si scrive da Windows, la compilazione la lancia l'utente: ogni task della
  fase C termina con "compila e prova", non con un test automatico.

## 8. Dati e migrazioni (Zapp)

Da `feat/zconnection-tv`, rinumerate perche' `0045`/`0046` esistono gia' su main:

- `0047_tv_pairing.sql` = `pairing_codes` + `claim_pairing_code` (invariata).
- `0048_device_commands.sql` = `device_commands` (invariata) + `alter type
device_platform add value 'tvos'`.
  Nessuna tabella nuova oltre a queste: la sessione non si salva, la verifica di
  appartenenza al dispositivo usa `device_members` (indice `(device_id, user_id)`
  del 0033). `supabase gen types` dopo le due. Nessun dato nuovo raccolto rispetto a
  ZConnection.

## 9. Sicurezza

- Bearer verificato per firma (`getClaims`) prima di ogni lettura; RLS fa il resto.
  **Mai il service client per dati utente** nelle rotte TV: solo per `pairing_codes`
  e per coniare la sessione (`auth.admin.*`), come oggi per lo scrobble.
- Il magic link non e' mai spedito ne' restituito: si consuma nella stessa richiesta.
  Rate limit del poll per token (120/min) e del reclamo per utente (10/10 min).
- Token dispositivo: nel DB solo l'hash, confronto a tempo costante, come oggi.
- Validazione con `isTmdbId`, `isMediaType`, `isIntInRange`, `isUuid`; `action`
  di `/watch` in un elenco chiuso; `limit` di `/library` con tetto.
- Whitelist dei package lato server (`siteFromPackage`), invariata.
- Deposito cifrato sulla TV; `401` -> rinnovo; secondo `401` -> disconnessione.
- Log server senza token; verso il client sempre il messaggio generico.
- `node scripts/security-check.mjs` dopo ogni modifica al middleware o a `/api/scrobble`.

## 10. Errori

- Rete assente sulla TV: schermata "Zapp non raggiunge il server" con Riprova, i
  dati gia' caricati restano a schermo.
- `401` non recuperabile: torna al codice, spiegando "L'accesso e' stato revocato".
- App della piattaforma non installata: `result: assente` e messaggio "Netflix non
  e' installata su questa TV"; il bottone resta (l'utente puo' installarla).
- Titolo senza link per quel provider: bottone assente, non disabilitato.
- TMDB giu': la scheda esce dalla cache `titles` (come sul sito); cast/simili vuoti.

## 11. Verifica

- **Vitest** sui puri nuovi: mapper DTO (`src/lib/tv/map.ts`), risolutore di lancio
  (`src/lib/tv/launch.ts`), ordine del manifesto degli scaffali, `parseAndroidEvent`
  gia' coperto.
- **Rotte**: `curl` con una sessione coniata a mano (magic link di un utente di
  prova) + token dispositivo inserito in `devices` con hash noto, come gia' fatto
  per lo scrobble; pulizia finale con `delete from devices`.
- **Android**: `./gradlew assembleDebug -PzappBase=http://<pc>:3400`, istanza
  `next start -H 0.0.0.0 -p 3400` dal worktree (`NEXT_DIST_DIR` proprio), adb via
  rete sulla Fire TV (IP da rileggere). Collaudo: abbinamento, home, scheda, Play
  su Netflix (titolo che parte), Disney+ (parte), Prime (scheda), trailer su
  YouTube, segna visto, ascolto NOW.
- **tvOS**: build sul Mac, TestFlight, stessi passi meno l'ascolto.
- `pnpm typecheck && pnpm lint && pnpm test` prima di ogni commit; rilascio solo
  via `scripts/rilascio.mjs`.

## 12. Fasi

| Fase  | Contenuto                                                                                                                | Repo                    | Piano                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------ |
| **A** | Fusione `feat/zconnection-tv` (migrazioni rinumerate), sessione TV, `withBearer`, API v1, DTO, `docs/architecture/tv.md` | Zapp, worktree `tv-api` | `2026-09-12-zapp-tv-fase-a.md` |
| **B** | App Android TV / Fire TV completa, listener migrato, collaudo su Fire TV                                                 | ZappTV/android          | fase B                         |
| **C** | Sonda lanci tvOS, app Apple TV, `LaunchPlan.tvos`                                                                        | ZappTV/tvos + Zapp      | fase C                         |
| **D** | Store: Amazon Appstore, Google Play (TV), App Store; icone/banner; privacy                                               | ZappTV + Zapp legale    | fase D                         |

A e' prerequisito di B e C. B e C possono correre in parallelo dopo A. Ogni fase
ha il suo piano `writing-plans`; gli agenti leggono solo il piano della loro fase.

## 13. Fuori da questa spec

Cinema, social (amici, feed, recensioni), commenti, liste condivise, domanda del
giorno, chicche, import, onboarding, registrazione (si fa sul sito), profili
multipli sulla stessa TV con cambio rapido, Samsung Tizen / LG webOS, push verso
la TV (resta il sondaggio), riproduzione di qualunque contenuto.
