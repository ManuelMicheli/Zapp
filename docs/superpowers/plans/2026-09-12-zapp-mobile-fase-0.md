> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development.
**Spec:** docs/superpowers/specs/2026-09-12-zapp-mobile-design.md

## 3. Protocollo di orchestrazione

**Ruoli**
| Chi | Cosa |
|---|---|
| Fable 5.1 (orchestratore) | Scrive i piani di fase, spacchetta in task, scrive i brief, rivede ogni diff (dopo il reviewer), decide sui dubbi, tiene i gate, aggiorna memoria e `docs/architecture/mobile.md`. Non scrive codice se non per sbloccare un agente (< 20 righe). |
| Opus 5 | Task con ragionamento nativo o di sicurezza: moduli Kotlin/Swift, ponte auth, `send.ts` push, rotte bearer, risolutore share, App Intents, config plugin. |
| Sonnet 5 | Scaffold Expo, `eas.json`, migrazioni + tipi, rotte semplici, `.well-known`, test Vitest, docs, screenshot, pratiche store. |
| `everything-claude-code:code-reviewer` (Sonnet) | Prima revisione di ogni task: correttezza, sicurezza, aderenza al brief. |
| `everything-claude-code:security-reviewer` (Opus) | Solo su task che toccano rotte bearer, token, RLS. |

**Brief di un task (template, va copiato per ogni task)**
```
Contesto (5 righe max) · Obiettivo · File da creare/modificare · Interfacce (firme esatte) ·
Passi (TDD dove c'è logica pura) · Vincoli (§2 + specifici) · Verifica (comandi + esito atteso) ·
Commit (messaggio) · Cosa NON fare · Riporta: diff riassunto, comandi lanciati e output, dubbi.
```
Regole per risparmiare token: l'agente riceve percorsi precisi, non "esplora"; mai allegare docs interi, solo il paragrafo che serve; un agente per task, mai due sullo stesso file; Opus solo dove la tabella lo dice; il reviewer riceve il diff, non il repo.

**Gate di fase** (tutti veri prima di aprire la fase dopo):
1. Zapp: `pnpm typecheck && pnpm lint && pnpm test && NEXT_DIST_DIR=.next-mobile pnpm build`.
2. ZappMobile: `npx expo-doctor && npx tsc --noEmit && eas build --profile preview --platform all`.
3. Collaudo su dispositivo: iPhone via TestFlight (utente), Android via APK internal testing sul telefono prestato.
4. Docs: `docs/architecture/mobile.md` aggiornata; memoria aggiornata.
5. Merge in `main` via `scripts/rilascio.mjs` (lato Zapp); tag `v0.<fase>` su ZappMobile.

**Worktree**: ogni task lato Zapp in un worktree `.claude/worktrees/mobile-<task>` su branch `feat/mobile-<fase>`; lato ZappMobile branch `feat/<fase>` nel repo suo.

**Ordine e dipendenze**
```
Fase 0 Fondamenta ──► Fase 1 Push ──► Fase 2 Share ──► Fase 5 Store
        │                                   ▲
        ├──► Fase 3 Scrobble Android (dopo merge feat/zconnection-tv) ──┤
        └──► Fase 4 App Intents iOS ───────────────────────────────────┘
```
Fasi 1, 3, 4 sono indipendenti fra loro: si possono far correre in parallelo con agenti diversi (repo/file disgiunti). Fase 2 dopo 1 solo per il pattern deep link.

**Cose da fare a mano dall'utente (giorno 0)**: aprire Google Play Console (25 €); creare account Expo e `eas login`; App Store Connect: creare l'app `com.zapp.mobile`; dare a EAS l'accesso Apple (App Store Connect API key, la chiede `eas build` la prima volta); aggiungere il proprio iPhone come tester TestFlight; trovare un telefono Android per la fase 3.

## 4. Fase 0 — Fondamenta (piano a livello di task)

Esito: app iOS/Android che apre Zapp, tiene il login, ha il ponte, si abbina da sola come dispositivo, apre le piattaforme via `Linking`, gestisce universal link e `zapp://`; build TestFlight sul telefono dell'utente.

### Task 0.1 (Sonnet) — Spec e piano nei repo
**File:** Create `docs/superpowers/specs/2026-09-12-zapp-mobile-design.md` (= §0-§1 di questo file), `docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md` (= §4), riga in `CLAUDE.md` tabella sottosistemi → `docs/architecture/mobile.md` (stub con la mappa §1.1-1.3).
- [ ] Copiare, commit `docs(mobile): spec e piano fase 0 dell'app nativa`.

### Task 0.2 (Sonnet) — Migration piattaforma `ios` + azione `pairOwnDevice`
**File:** Create `supabase/migrations/0044_mobile_devices.sql`; Modify `src/app/(app)/devices/actions.ts`, `src/types/database.ts` (rigenerato). Niente Vitest: l'azione non è pura, si collauda con lo script del passo Verifica.
**Interfacce — Produce:**
```ts
export async function pairOwnDevice(input: {
  platform: "ios" | "android";
  installId: string;   // uuid generato dal guscio, stabile per installazione
  name: string;        // "iPhone di Manuel", ≤ 60 char
}): Promise<{ ok: true; token: string; deviceId: string } | { ok: false; error: string }>;
```
- [ ] Migration:
```sql
alter type public.device_platform add value if not exists 'ios';
-- l'app mobile si ri-abbina allo stesso install_id ad ogni reinstallazione del token:
-- serve poter sostituire token_hash e riattivare un dispositivo revocato dallo stesso install.
```
(`android` esiste già.) Nota: `alter type ... add value` non può stare in una transazione con usi del valore: migration separata da tutto il resto.
- [ ] `pairOwnDevice`: come `connectBrowser()` ma: valida `platform ∈ {ios,android}`, `isUuid(installId)`, `name` stringa 1..60; rate limit `devices:pair:${user.id}` 10/60s; upsert: se esiste `devices.install_id = installId` → `update token_hash, name, revoked_at = null, last_seen_at = now()`, altrimenti insert; `device_members` insert `on conflict do nothing`; `revalidatePath("/devices")`.
- [ ] `supabase db push` (via MCP `apply_migration`) + `supabase gen types` → `src/types/database.ts`.
- [ ] Verifica: script in scratchpad che chiama l'azione via cookie di test (come i test E2E del progetto) due volte con lo stesso installId → una sola riga in `devices`, `token_hash` diverso. `pnpm typecheck && pnpm lint`.
- [ ] Commit `feat(mobile): l'app si abbina da sola come dispositivo (pairOwnDevice)`.

### Task 0.3 (Opus) — Ponte web: protocollo + `bridge.ts` + `AppLink` nativo
**File:** Create `src/lib/native/protocol.ts` (tipi puri, copiati identici in ZappMobile), `src/lib/native/protocol.test.ts`, `src/lib/native/bridge.ts` (client), `src/components/native/NativeBridge.tsx` (client, montato in `src/app/(app)/layout.tsx`); Modify `src/components/ui/AppLink.tsx`, `src/lib/links/native-app.ts`.
**Interfacce — Produce:**
```ts
// protocol.ts (puro)
export type NativeToWeb =
  | { type: "ready"; platform: "ios" | "android"; version: string; installId: string }
  | { type: "pushToken"; token: string }
  | { type: "sharedContent"; url?: string; text?: string }
  | { type: "deepLink"; path: string };
export type WebToNative =
  | { type: "deviceToken"; token: string; deviceId: string }
  | { type: "openExternal"; url: string }
  | { type: "badge"; count: number }
  | { type: "signedOut" };
export function parseNativeMessage(raw: unknown): NativeToWeb | null; // valida a mano, null se non conforme
export function isNativeShell(ua: string): boolean; // /ZappMobile\/\d/.test(ua)
// bridge.ts (client)
export function postToNative(msg: WebToNative): boolean; // false se non in guscio
export function onNativeMessage(handler: (m: NativeToWeb) => void): () => void; // ascolta 'zapp:native'
```
- [ ] Test puri per `parseNativeMessage` (payload validi, tipo sconosciuto, campi mancanti, `path` non relativo → null) e `isNativeShell`.
- [ ] `NativeBridge.tsx`: su `ready` chiama `pairOwnDevice` (una volta per installId: memo in `sessionStorage`? **no localStorage per dati utente** → si chiama sempre, l'upsert è idempotente e il rate limit copre) e risponde `deviceToken`; su `deepLink` → `router.push(path)` solo se `path` inizia con `/` e non con `//`.
- [ ] `nativeOpen()`: nuovo `mode: "native-shell"` quando `isNativeShell(ua)` → `AppLink` fa `postToNative({type:"openExternal", url})` e `preventDefault()`. Test aggiornati in `native-app.test.ts`.
- [ ] Logout: dove Zapp fa `signOut` (cercare `auth.signOut(` in `src/`) aggiungere `postToNative({type:"signedOut"})`.
- [ ] Verifica: `pnpm test`, `typecheck`, `lint`; in Chrome desktop con UA modificato (`ZappMobile/0.0 (ios)`) e `window.ReactNativeWebView = {postMessage: console.log}` si vede `deviceToken` in console dopo il login.
- [ ] Commit `feat(mobile): ponte WebView, abbinamento automatico, link esterni al guscio`.

### Task 0.4 (Sonnet) — `.well-known`, header, middleware
**File:** Create `public/.well-known/apple-app-site-association` (senza estensione), `public/.well-known/assetlinks.json`; Modify `next.config.ts` (`headers()`: `source: "/.well-known/(.*)"`, `Content-Type: application/json`, CORP `cross-origin`; escludere `.well-known` dalla regola generale come già fatto per `email/`), `src/middleware.ts` (aggiungere `.well-known` al negative lookahead).
- [ ] AASA: `{"applinks":{"apps":[],"details":[{"appID":"<TEAMID>.com.zapp.mobile","paths":["*"]}]},"webcredentials":{"apps":["<TEAMID>.com.zapp.mobile"]}}` — TEAMID lo dà l'utente (Apple Developer → Membership).
- [ ] assetlinks: `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"com.zapp.mobile","sha256_cert_fingerprints":["<da eas credentials>"]}}]` — il fingerprint arriva dal Task 0.6; il file si committa con un placeholder documentato e si completa nel 0.6 (unica eccezione ammessa, con issue aperta).
- [ ] Verifica: `NEXT_DIST_DIR=.next-mobile pnpm build && next start -p 3402` → `curl -I http://localhost:3402/.well-known/apple-app-site-association` = 200, `application/json`, nessun redirect a `/login`.
- [ ] Commit `feat(mobile): universal link e app link (.well-known)`.

### Task 0.5 (Sonnet) — Scaffold ZappMobile
**File:** nuovo repo `D:\PROGETTI\ZappMobile` (`git init`, `.gitignore` Expo, privato).
- [ ] `npx create-expo-app@latest ZappMobile --template blank-typescript` (SDK 57), rimuovere il boilerplate.
- [ ] `app.config.ts`: `name: "Zapp"`, `slug: "zapp"`, `scheme: "zapp"`, `ios.bundleIdentifier: "com.zapp.mobile"`, `ios.associatedDomains: ["applinks:zapp-mu.vercel.app","webcredentials:zapp-mu.vercel.app"]`, `android.package: "com.zapp.mobile"`, `android.intentFilters` con `autoVerify: true` su `https://zapp-mu.vercel.app`, `userInterfaceStyle: "dark"`, `backgroundColor: "#000000"`, icone dalle `public/icons` di Zapp, `extra.zappBase` da env `ZAPP_BASE` (default produzione; in dev `http://<ip-pc>:3400` con `usesCleartextTraffic` solo in debug come fa ZConnection).
- [ ] `eas.json`: `development` (developmentClient, internal), `preview` (internal, `ios.simulator: false`), `production` (autoIncrement).
- [ ] Prettier + `tsc` config; `docs/LEGGIMI.md` (come si builda, come si punta a un'istanza locale).
- [ ] Verifica: `npx expo-doctor`, `npx tsc --noEmit`, `npx expo export --platform ios` compila.
- [ ] Commit `chore: scaffold Expo 57 per Zapp Mobile`.

### Task 0.6 (Opus) — WebView, cookie, ponte, deep link, offline
**File:** `src/App.tsx`, `src/webview/ZappWebView.tsx`, `src/webview/injected.ts`, `src/bridge/protocol.ts` (copia byte-per-byte di Zapp `src/lib/native/protocol.ts` + commento "sorgente: Zapp"), `src/bridge/native.ts`, `src/native/storage.ts`, `src/screens/Offline.tsx`.
**Interfacce — Consuma:** protocollo §1.2. **Produce:** `sendToWeb(msg: NativeToWeb)`, `getDeviceToken(): Promise<string|null>` (SecureStore chiave `zapp.deviceToken`), `getInstallId(): Promise<string>` (SecureStore, uuid generato al primo avvio).
- [ ] `ZappWebView`: `source={{uri: zappBase}}`, `applicationNameForUserAgent="ZappMobile/<version> (<platform>)"`, `sharedCookiesEnabled`, `thirdPartyCookiesEnabled` (Android), `allowsBackForwardNavigationGestures`, `setSupportMultipleWindows={false}`, `onShouldStartLoadWithRequest`: stessa origine → carica; altra origine → `Linking.openURL` e blocca (le piattaforme si aprono fuori, mai dentro la WebView); `injectedJavaScriptBeforeContentLoaded` = `window.ZappNative={platform,version}`; `onMessage` → `JSON.parse` → switch su `WebToNative` (`deviceToken` → SecureStore; `openExternal` → `Linking.openURL`, con `android-settings:notification-listener` mappato a `IntentLauncher` più avanti; `badge`; `signedOut` → cancella token).
- [ ] Al `onLoadEnd` della prima pagina: `sendToWeb({type:"ready", platform, version, installId})`.
- [ ] Deep link: `Linking.getInitialURL()` + `addEventListener('url')`: `zapp://<path>` e `https://zapp-mu.vercel.app/<path>` → `sendToWeb({type:"deepLink", path})` se la WebView è pronta, altrimenti apri direttamente quell'URL.
- [ ] Android: tasto indietro → `webView.goBack()` se `canGoBack`, altrimenti default. Offline: `NetInfo` non serve, basta `onError` → schermata `Offline` con "Riprova".
- [ ] `eas build --profile preview --platform all` (prima volta: EAS crea cert/profili Apple, chiede la API key; Android: keystore gestito). Leggere `eas credentials --platform android` → SHA-256 → completare `assetlinks.json` in Zapp (Task 0.4) e committare.
- [ ] Verifica: TestFlight sull'iPhone dell'utente: login, navigazione, un link Disney+/Netflix apre l'app della piattaforma; in Zapp `/devices` compare "iPhone di …"; universal link `https://zapp-mu.vercel.app/title/movie/…` da Note apre Zapp; `zapp://library` idem. Android: APK internal testing sul telefono prestato o emulatore, stesse prove.
- [ ] Commit `feat: guscio WebView con ponte, abbinamento e deep link`.

### Task 0.7 (Sonnet) — Docs + gate di fase
- [ ] `docs/architecture/mobile.md` in Zapp: protocollo ponte, auth unica, come collaudare con UA finto, dipendenza da ZappMobile; sezione "trappole" vuota da riempire dagli agenti delle fasi dopo.
- [ ] Gate §3 completo; memoria orchestratore aggiornata (`zapp-mobile-fase-0`).

## 5. Fasi 1-5 — task list (ogni fase riceve il proprio piano `writing-plans` alla sua apertura)

**Fase 1 Push** — 1.1 (Sonnet) migration `push_tokens` + tipi; 1.2 (Opus) `POST /api/devices/push-token` bearer + `PUBLIC_PATHS` + rate limit + `src/lib/push/send.ts` con test puri su batching/ricevute; 1.3 (Opus) agganci in `social/actions.ts`, domanda del giorno, `ambiguous_user`; job `push-receipts`; 1.4 (Opus) ZappMobile: `expo-notifications` permesso, `getExpoPushTokenAsync` → il nativo chiama direttamente `POST /api/devices/push-token` con bearer (non dipende dalla WebView; il messaggio `pushToken` al web resta solo diagnostico); tap → `deepLink`; 1.5 (Sonnet) docs + gate. Collaudo: notifica reale a app chiusa su iPhone.

**Fase 2 Share** — 2.1 (Opus) `src/lib/share/resolve-incoming.ts` puro + Vitest (URL delle 4 piattaforme, IMDb, TMDB, testo); 2.2 (Sonnet) route `/share/incoming` + sheet "Aggiungi" con `?from=share`; 2.3 (Opus) ZappMobile `expo-share-intent` (o extension custom) → `sharedContent`; 2.4 docs + gate. Collaudo: da Netflix iOS "Condividi" → Zapp scheda titolo.

**Fase 3 Scrobble Android** — 3.0 (orchestratore) merge `feat/zconnection-tv` in main; 3.1 (Opus) Expo Module Kotlin da ZConnection (`ZListener`, `SessionProbe`, `Store`, `Sender`) con token da SecureStore; 3.2 (Sonnet) pagina `/devices/connect/android` + `openExternal` `android-settings:`; 3.3 (Sonnet) docs + gate. Collaudo: Netflix sul telefono prestato → `watch_sessions` → "Continua a guardare".

**Fase 4 App Intents iOS** — 4.1 (Opus) `src/lib/watch/core.ts` estratto da `actions.ts` (server-only, senza `"use server"`) + `POST /api/devices/intent` bearer; 4.2 (Opus) modulo Swift `AppIntent` ×3 + `AppShortcutsProvider` + keychain condiviso con SecureStore (stesso `keychainService`); 4.3 docs + gate. Collaudo: "Ehi Siri, segna Dark come visto su Zapp".

**Fase 5 Store** — 5.1 (Sonnet) asset (icone, screenshot, testi IT), privacy URL, Data Safety, App Privacy; 5.2 (Sonnet) `eas submit` TestFlight esterno + Play closed testing (12 tester, 14 giorni: si avvia **già alla fine della fase 1** con la build di allora); 5.3 (orchestratore) risposta a eventuali rifiuti Apple 4.2 con l'elenco delle funzioni native; 5.4 `expo-updates` per gli aggiornamenti JS senza review.

## 6. Verifica end-to-end del progetto
1. Sul telefono: installa da TestFlight → login → home Zapp → tocca Netflix su un titolo → si apre Netflix. Ricevi push "X ti ha chiesto l'amicizia" ad app chiusa → tap → pagina notifiche. Da Netflix condividi un titolo → Zapp lo apre → "Aggiungi". "Ehi Siri, segna X come visto su Zapp" → segnato.
2. Su Android prestato: guarda 2 minuti di Netflix → in Zapp "Continua a guardare" mostra il titolo.
3. Server: `pnpm test` verde (protocol, resolve-incoming, push batching); rotte bearer rispondono 401 senza token, 429 oltre soglia; `security-check.mjs` (memoria `zapp-sicurezza`) verde.

