# Zapp Mobile — design dell'app nativa (2026-09-12)

Piano di esecuzione: `docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md`.

## 0. Contesto

Zapp è una PWA Next.js 15 + Supabase. L'utente vuole un'app nativa perché la PWA non dà: (1) presenza sugli store, (2) push affidabili (iOS), (3) funzioni native (share sheet in entrata, Comandi Rapidi/App Intents, apertura vera delle app delle piattaforme), (4) scrobble automatico su Android via MediaSession come già fa ZConnection su Fire TV.

**Decisioni prese con l'utente (2026-09-12):**
- iOS + Android, **niente Mac** → build iOS in cloud (EAS Build, credenziali gestite da EAS). Collaudo iOS su iPhone dell'utente via TestFlight; Android su un telefono prestato + emulatore.
- Architettura: **Expo come guscio** — WebView a schermo intero su `https://zapp-mu.vercel.app` + moduli nativi. Schermate native più avanti, una alla volta, se servono. Scartati: Capacitor (nessun percorso verso UI nativa), riscrittura RN (mesi, API REST per 16 file di Server Actions, due codebase).
- v1 sugli store contiene tutte e quattro le funzioni. Ordine: fondamenta → push → share → scrobble Android → Intents iOS → store.
- Codice in **repo separato** `D:\PROGETTI\ZappMobile` (come `D:\PROGETTI\ZConnection`). Contratto con Zapp = API HTTP + ponte WebView. Le modifiche lato Zapp stanno nel repo Zapp.
- Account: Apple Developer c'è. **Google Play da aprire al giorno 0** (25 €; account personale nuovo = 12 tester × 14 giorni di closed testing prima della produzione). Account Expo (EAS) da creare.

**Fatti del codice che vincolano il design** (verificati 2026-09-12 sul tree root):
- Auth solo email/password, cookie `@supabase/ssr`. Niente OAuth: nessun blocco "Google in WebView".
- Zero push, zero `zapp://`, zero `.well-known`, zero `share_target`. Notifiche = righe in `notifications` (`src/lib/social/actions.ts`).
- `devices` (migration `0033_zconnection.sql`): `token_hash` sha256, enum `device_platform ('fire_tv','android_tv','android','browser_ext')`. `POST /api/scrobble` autentica con `Authorization: Bearer <token>`. Pattern di creazione token: `connectBrowser()` in `src/app/(app)/devices/actions.ts`.
- `/api/devices/pair`, `isAndroidEvent` e il ramo `source:"android"` vivono in `feat/zconnection-tv` (worktree `.claude/worktrees/zconn-tv`), **non in main**.
- Middleware: `PUBLIC_PATHS` in `src/lib/supabase/middleware.ts`; matcher in `src/middleware.ts` esclude asset ma **non** `.well-known`.
- `AppLink` (`src/components/ui/AppLink.tsx`) + `nativeOpen` (`src/lib/links/native-app.ts`): trucco intent/top-level per Disney+. In app nativa si sostituisce con un `openExternal` al guscio.
- Kotlin riusabile in `D:\PROGETTI\ZConnection\app\src\main\java\com\zapp\zconnection\`: `ZListener.kt`, `SessionProbe.kt`, `Sender.kt`, `Api.kt`, `Store.kt`, `Stato.kt`.
- Sonda Expo 57 già in repo: `tools/zconnection-iphone-probe` (usa-e-getta; conferma SDK 57 = React Native 0.86; regola: leggere i doc versionati `https://docs.expo.dev/versions/v57.0.0/`).

## 1. Spec (design approvato)

### 1.1 Struttura ZappMobile
```
ZappMobile/
  app.config.ts            # bundle com.zapp.mobile (iOS e Android), scheme "zapp", associatedDomains, intentFilters
  eas.json                 # profili: development (dev client), preview (internal), production
  src/App.tsx              # WebView + offline + splash
  src/bridge/              # protocollo messaggi (tipi condivisi copiati in Zapp: src/lib/native/protocol.ts)
  src/webview/             # ZappWebView.tsx, cookie, back Android, injected JS
  src/native/              # wrapper JS dei moduli
  modules/zapp-bridge/     # Expo Module: badge, share-in bridge, openExternal (Linking basta: solo se serve)
  modules/zapp-media-session/   # Kotlin (Android only), da ZConnection
  modules/zapp-intents/    # Swift App Intents (iOS only)
  plugins/                 # config plugin: share extension iOS, AASA/AppLinks, permessi
  docs/                    # LEGGIMI.md, RILASCIO.md
```
Dipendenze: `expo@57`, `react-native-webview`, `expo-notifications`, `expo-secure-store`, `expo-linking`, `expo-share-intent` (config plugin; se non compatibile con SDK 57 → share extension custom in `modules/zapp-bridge`), `expo-updates`, `expo-dev-client`.

### 1.2 Ponte web ↔ nativo
Protocollo JSON su `window.ReactNativeWebView.postMessage` (web→nativo) e `webViewRef.injectJavaScript` → `window.dispatchEvent(new CustomEvent('zapp:native', {detail}))` (nativo→web). Il nativo si dichiara con user-agent suffisso ` ZappMobile/<versione> (<ios|android>)` e con `window.ZappNative = { platform, version }` iniettato prima del load.

| Direzione | Tipo | Payload | Chi lo tratta |
|---|---|---|---|
| nativo→web | `ready` | `{platform, version, installId}` | `src/lib/native/bridge.ts` |
| nativo→web | `pushToken` | `{token}` | fase 1 |
| nativo→web | `sharedContent` | `{url?, text?}` | fase 2: naviga a `/share/incoming` |
| nativo→web | `deepLink` | `{path}` | naviga |
| web→nativo | `deviceToken` | `{token, deviceId}` | SecureStore |
| web→nativo | `openExternal` | `{url}` | `Linking.openURL` |
| web→nativo | `badge` | `{count}` | `Notifications.setBadgeCountAsync` |
| web→nativo | `signedOut` | `{}` | cancella SecureStore, chiama `DELETE /api/devices/self` |

### 1.3 Auth: una sola
La WebView tiene i cookie Supabase. Al primo `ready` con utente loggato, la web chiama la Server Action `pairOwnDevice({platform, installId, name})` → riga in `devices` (enum + `'ios'`) e `device_members`, token restituito una volta → `deviceToken` al nativo → SecureStore. Ogni chiamata nativa senza WebView usa `Authorization: Bearer <token>`: `/api/scrobble`, `/api/devices/push-token`, `/api/devices/intent`, `/api/devices/self`. Revoca da `/devices` (già esistente). `install_id` è la chiave di idempotenza: stesso installId → stesso device (nuovo token, vecchio hash sostituito).

### 1.4 Push (fase 1)
Migration: `push_tokens(device_id fk cascade, expo_token text unique, platform, updated_at)`, RLS senza policy per `authenticated` (solo service). `POST /api/devices/push-token` (bearer, upsert). `src/lib/push/send.ts` (server-only): `sendPush(userIds, {title, body, data:{path}})` → `https://exp.host/--/api/v2/push/send`, batch da 100, ricevute dopo 15 min via job `/api/jobs/push-receipts` → `DeviceNotRegistered` cancella la riga. Agganci: `createNotification` in `src/lib/social/actions.ts` (amici, recensioni, commenti), domanda del giorno (job esistente), `pending_scrobbles.reason='ambiguous_user'` → "Stai guardando tu X?" con `path:/devices/pending`. Tap → `deepLink` → WebView naviga.

### 1.5 Share sheet (fase 2)
`expo-share-intent`: iOS Share Extension (URL + testo), Android `ACTION_SEND text/plain`. Nativo → `sharedContent` → web naviga `/share/incoming?url=…&text=…` (route nuova, richiede login: il middleware manda a `/login?next=`). Risoluzione in `src/lib/share/resolve-incoming.ts` (puro + Vitest): (a) URL Netflix `title/<id>`, Prime `detail/<gti>`, Disney+ `entity-<guid>`, NOW → lookup inverso su `title_provider_links.url`; (b) IMDb `tt…` → TMDB `find`; (c) TMDB `movie|tv/<id>`; (d) testo → ricerca esistente (`src/lib/search`) primo risultato con conferma. Redirect alla scheda titolo con `?from=share` → sheet "Aggiungi a…".

### 1.6 Scrobble Android (fase 3)
Expo Module Kotlin `zapp-media-session`: `NotificationListenerService` + `MediaSessionManager.getActiveSessions` da `ZListener.kt`/`SessionProbe.kt`; coda persistente (`Store.kt`), lotti ≤50 a `/api/scrobble` `{source:"android", events}` con bearer da SecureStore (letto via `SharedPreferences` cifrate che Expo SecureStore usa). Pagina web `/devices/connect/android` spiega il permesso e apre `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS` via `openExternal` (scheme `android-settings:` gestito dal guscio). **Prerequisito:** merge di `feat/zconnection-tv` in main.

### 1.7 App Intents iOS (fase 4)
Swift nel target app (`modules/zapp-intents`): `MarkWatchedIntent(title: String)`, `NowWatchingIntent(title: String)`, `OpenTitleIntent(title: String, openAppWhenRun=true)`. I primi due chiamano `POST /api/devices/intent` `{intent:"mark_watched"|"now_watching", query}` (bearer letto dal keychain condiviso con SecureStore) → server: ricerca titolo (`src/lib/search`), applica con funzione server-only nuova `applyWatchIntent()` che riusa la logica di `src/lib/watch/actions.ts` estratta in `src/lib/watch/core.ts` (le Server Actions non si importano da una route). Risposta parlata: "Segnato *Dark* come visto". `AppShortcutsProvider` con frasi "Segna \(.$title) come visto su Zapp".

### 1.8 Deep link e domini
`zapp://` + universal/app links su `zapp-mu.vercel.app`. In Zapp: `public/.well-known/apple-app-site-association` (`applinks` + `webcredentials`, Team ID + `com.zapp.mobile`) e `public/.well-known/assetlinks.json` (sha256 del cert di firma, letto da `eas credentials`). Header `Content-Type: application/json` via `next.config.ts`; middleware matcher escluso per `.well-known`.

### 1.9 Store (fase 5)
Apple 4.2 difesa: push, share extension, App Intents, apertura nativa piattaforme, scrobble. Privacy policy = pagine legali in produzione. Google Play: closed testing 12 tester × 14 giorni; Data Safety (account, cronologia visione, posizione per cinema). Screenshot da TestFlight/emulatore. EAS Submit per entrambi.

### 1.10 Cosa NON si fa in v1
Niente schermate native, niente widget, niente Live Activities, niente login social, niente offline oltre alla schermata "sei offline", niente sync account piattaforme (`docs/zconnection/ACCOUNT-SYNC.md` resta non implementato).

## 2. Vincoli globali
- Italiano nell'UI e nei commenti. Codice normale, niente caveman nel codice.
- Zapp: `import "server-only"` nei moduli server; `actions.ts` = Server Actions; ogni migration → `supabase gen types` → `src/types/database.ts`; regole in `docs/architecture/security.md` (leggerla prima di DB/azioni); nessuna chiamata TMDB dal client; niente librerie UI esterne; `pnpm typecheck && pnpm lint && pnpm build` verdi; build isolata `NEXT_DIST_DIR=.next-<nome>` e **togliere la riga da `tsconfig.json` prima del commit**.
- Zapp si pubblica solo via `origin/main` con `scripts/rilascio.mjs` (memoria `zapp-rilascio-cooperativo`). Mai `vercel --prod` da locale.
- Token dispositivo: il server conserva solo l'hash; il token passa una volta. Rate limit su ogni rotta bearer (`src/lib/rate-limit`). Validazione a mano (`src/lib/validate`), mai cast.
- ZappMobile: TypeScript strict, `npx expo-doctor` verde, `tsc --noEmit` verde, Prettier stesse regole di Zapp (doppi apici, virgole finali, 90 colonne).
- Repo Zapp è pubblico su GitHub: nessun segreto, nessun certificato nel repo. ZappMobile: repo privato.

## 7. Rischi noti
- **Apple 4.2** (app = sito): mitigato da §1.9; se rifiutata, si risponde elencando push/share/Intents/scrobble. Piano B: una schermata nativa "Oggi" (fase 6).
- **`expo-share-intent` vs SDK 57**: verificare al Task 2.3; fallback extension custom (+2 giorni Opus).
- **Cookie WebView Android** persi dopo aggiornamento app: `sharedCookiesEnabled` + test dopo update. 
- **Google Play 14 giorni**: se non parte alla fine della fase 1, la produzione slitta.
- **Nessun Mac**: ogni problema di firma iOS si risolve con `eas credentials`, mai a mano.
