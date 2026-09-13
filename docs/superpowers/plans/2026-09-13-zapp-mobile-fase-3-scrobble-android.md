# Zapp Mobile — Fase 3: scrobble automatico su Android (MediaSession). Piano di esecuzione

> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development.
**Spec:** docs/superpowers/specs/2026-09-12-zapp-mobile-design.md (§1.6, §1.2, §2). Piano generale: docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md §3, §5.

**Obiettivo:** sul telefono Android, con l'app Zapp installata e il permesso "accesso alle notifiche" concesso, guardare Netflix/Prime/Disney+/NOW aggiorna "Continua a guardare" da solo, come fa ZConnection sulla Fire TV.

**Architettura (adeguata ai fatti del codice, 2026-09-13, `origin/main` 6d793c3 con `feat/zconnection-tv`):**
- **Server invariato**: `POST /api/scrobble` con `{ source: "android", events: AndroidEvent[] }` e bearer del dispositivo; consenso `scrobble` obbligatorio (403 `consent_required`); pacchetti telefono gia' in whitelist (`com.netflix.mediaclient`, `com.amazon.avod.thirdpartyclient`, `com.disney.disneyplus`, `com.nowtv.it`). Netflix/Prime non pubblicano il titolo: le sessioni anonime finiscono in `pending_scrobbles` o vengono attribuite dalla dichiarazione di `/api/tv/v1/play` (gia' esistente). Nessun pairing a codice: il token viene da `pairOwnDevice`.
- **Ponte**: due messaggi nuovi in `protocol.ts` (entrambe le copie): web→nativo `openSettings { which: "notificationListener" }`; nativo→web `scrobbleStatus { granted: boolean }` (mandato dopo `ready` e ogni volta che l'app torna in primo piano).
- **Web**: pagina `/devices/connect/android` (stesso schema di `devices/connect/page.tsx`): consenso scrobble se manca, spiegazione, bottone "Apri le impostazioni" (solo nel guscio Android), stato ✓/✗ da `scrobbleStatus`; link dalla pagina `/devices`.
- **Guscio (Android)**: modulo Expo locale `modules/zapp-media-session` in Kotlin, portato da `D:\PROGETTI\ZConnection` (`ZListener`, `SessionProbe`, `Sender`, `Api.manda`, `Store` ridotto a deposito) senza pairing, senza Fire OS, pacchetti telefono. JS: `configure(token, base)` dopo `deviceToken` e all'avvio se il token c'e'; `clear()` a `signedOut`; `hasAccess()`, `openSettings()`, `rebind()`. Il token vive nelle `SharedPreferences` private del modulo (expo-secure-store cifra col Keystore: non si rilegge da Kotlin).
- **Compilazione locale possibile**: toolchain Android sul PC (JDK 17 Temurin, SDK in `%LOCALAPPDATA%\Android\Sdk`, `JAVA_TOOL_OPTIONS` per l'antivirus, vedi memoria `zconnection-companion`): `expo prebuild --platform android` + `gradlew assembleDebug` verifica il Kotlin prima del build EAS.

**Vincoli globali:** spec §2; `protocol.ts` identico nelle due copie; nessun log del token; nessun permesso Android oltre `INTERNET` e il listener; nessuna libreria oltre Expo; italiano.

## Task (3.1 → 3.2 in sequenza: 3.2 copia il protocollo aggiornato; 3.3 in coda)

### 3.1 (Sonnet) — protocollo (+test, entrambe le copie), pagina `/devices/connect/android`, link da `/devices`
### 3.2 (Opus) — modulo Kotlin `zapp-media-session`, manifest, wiring in `App.tsx`/`ZappWebView.tsx`, build locale
### 3.3 (Sonnet) — docs (`mobile.md`, `zconnection.md` una riga), gate

## Interfacce vincolanti

```ts
// protocol.ts (aggiunte, identiche nelle due copie)
NativeToWeb |= { type: "scrobbleStatus"; granted: boolean }
WebToNative |= { type: "openSettings"; which: "notificationListener" }
// parseNativeMessage: scrobbleStatus richiede granted boolean; (parseWebMessage lato mobile: openSettings richiede which === "notificationListener")

// modules/zapp-media-session/index.ts (Android; su iOS ogni funzione e' no-op / false)
export function configure(token: string, base: string): void; // salva in SharedPreferences "zapp-scrobble"; token vuoto = cancella
export function clear(): void;
export function hasAccess(): boolean;   // enabled_notification_listeners contiene il nostro ComponentName
export function openSettings(): void;   // Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
export function rebind(): void;         // NotificationListenerService.requestRebind (API 24+)

// AndroidEvent inviato (snake_case, come SessionProbe di ZConnection):
// { id, at, package, state: "playing"|"paused"|"stopped", position_ms, duration_ms|null, title|null }
// lotti ≤ 50, coda su file ≤ 200, retry 5/15/60 s, 403 → svuota e segna consensoMancante, 401 → svuota
```

## Verifica di fase
1. Zapp: `pnpm test` (protocol), `typecheck`, `lint`, build al gate. Pagina `/devices/connect/android` visibile e con consenso.
2. Mobile: `npm test`, `typecheck`, `expo-doctor`, **`gradlew assembleDebug` verde** (Kotlin compilato in locale).
3. Telefono (build EAS Android nuovo): permesso concesso dalla pagina → ✓; Netflix 3 minuti → riga in `watch_sessions` → "Continua a guardare".
