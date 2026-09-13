# Zapp Mobile — Fase 4: App Intents iOS (Siri e Comandi Rapidi). Piano di esecuzione

> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development.
**Spec:** docs/superpowers/specs/2026-09-12-zapp-mobile-design.md (§1.7, §1.3, §2). Piano generale: docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md §3, §5.

**Obiettivo:** "Ehi Siri, segna Dark come visto su Zapp" / "Sto guardando Dark su Zapp" funzionano ad app chiusa, con risposta parlata; "Apri Dark su Zapp" apre l'app sulla ricerca. Le stesse azioni compaiono nell'app Comandi Rapidi.

**Architettura (adeguata ai fatti del codice, 2026-09-13):**
- Nessun "core" senza cookie esiste: le Server Actions di `src/lib/watch/actions.ts` usano la sessione. Si estrae la sola logica pura dei patch (`src/lib/watch/patch.ts`, Vitest) e si crea `src/lib/watch/core.ts` (server-only, service client, `userId` esplicito) che `actions.ts` **non** usa (evita conflitti con altri branch): `actions.ts` cambia solo per importare i patch puri.
- `scrobble_apply` non serve qui: vuole un `provider_id` e non segna "visto" le serie. Per "Sto guardando" si accetta di non scrivere `watch_sessions` (niente presenza per gli amici): e' un'intenzione dichiarata, non una riproduzione.
- Rotta `POST /api/devices/intent` (bearer del dispositivo via `authenticateDevice`, scope `intent`): l'utente e' l'**unico** membro attivo del dispositivo (`device_members`, `paused_until` nullo o passato); altrimenti 409. Ricerca del titolo con `textQuery` + `searchMulti` + `chooseCandidate` (gia' esistenti); risposta `done | choose | none`.
- Guscio: modulo Expo locale `modules/zapp-intents` (solo iOS, Swift): `MarkWatchedIntent`, `NowWatchingIntent` (chiamano la rotta con il token letto dal Keychain scritto da `expo-secure-store`, servizio `zapp`, chiave `zapp.deviceToken`), `OpenTitleIntent` (`openAppWhenRun`, apre `zapp://search?q=…`), `AppShortcutsProvider` con frasi italiane. Base URL da `Info.plist` (`ZappBase`, scritto dal config plugin da `extra.zappBase`). Deployment target ≥ 16 (App Intents).
- **Swift non si compila su Windows**: il primo `eas build` e' il compilatore. Il codice va scritto contro i doc Apple e la sorgente di `expo-secure-store` in `node_modules`, e revisionato riga per riga.

**Vincoli globali:** spec §2. In piu': `/api/devices/intent` come percorso esatto in `PUBLIC_PATHS`; nessun log di token, query solo troncata; validazione a mano; `actions.ts` toccato il minimo (import dei patch); `protocol.ts` non cambia.

## Task (4.1 → 4.2 in sequenza nel worktree Zapp; 4.3 in parallelo nel repo mobile; 4.4 in coda)

### 4.1 (Sonnet) — `src/lib/watch/patch.ts` (puro, TDD) + `core.ts` (`applyWatch` con `userId`) + `actions.ts` usa i patch
### 4.2 (Opus) — `POST /api/devices/intent`, `PUBLIC_PATHS`, prova curl con dispositivo di prova
### 4.3 (Opus) — ZappMobile: modulo Swift `zapp-intents`, config plugin (`ZappBase`, deployment target), LEGGIMI
### 4.4 (Sonnet) — docs (`mobile.md`, `watch-tracking.md` una riga), gate

## Interfacce vincolanti

```ts
// src/lib/watch/patch.ts (puro)
export type WatchAction = "want" | "watching" | "watched";
export type EntryLike = { started_at: string | null } | null;
export function entryPatch(action: WatchAction, existing: EntryLike, now: string): {
  status: "want" | "watching" | "watched"; started_at: string | null; finished_at: string | null; last_watched_at: string;
};
// identico ai patch di actions.ts: want → status want, started_at existing ?? null, finished_at null, last_watched_at now;
// watching → started_at existing ?? now, finished_at null; watched → started_at existing ?? null, finished_at now.

// src/lib/watch/core.ts (server-only, service client)
export async function applyWatch(userId: string, titleId: number, mediaType: "movie" | "tv", action: WatchAction):
  Promise<{ ok: true; title: string } | { ok: false; error: "titolo_sconosciuto" | "db" }>;
// getOrFetchTitle per la FK; upsert watch_entries onConflict user_id,title_id,media_type; nessun revalidatePath (la rotta lo fa).

// POST /api/devices/intent  (bearer dispositivo)
// body { "intent": "mark_watched" | "now_watching" | "want", "query"?: string, "titleId"?: number, "mediaType"?: "movie"|"tv" }  (query oppure titleId+mediaType)
// 200 { "status": "done", "id", "mediaType", "title" } | { "status": "choose", "options": [{ id, mediaType, title, year }] } | { "status": "none" }
// 400 non valido · 401 · 409 { "error": "dispositivo condiviso o senza utente" } · 429 · 503

// Swift: MarkWatchedIntent(titolo) → POST intent mark_watched; NowWatchingIntent → now_watching; choose → ProvidesDialog "Ho trovato piu' titoli: …" + requestDisambiguation se possibile, altrimenti dialogo con i primi 3;
// OpenTitleIntent(titolo) → openAppWhenRun, apre URL zapp://search?q=<titolo>
```

## Verifica di fase
1. `pnpm test` (patch), `typecheck`, `lint`, build isolata al gate.
2. curl con dispositivo di prova: `mark_watched` con `query:"Dark"` → done (o choose) e riga in `watch_entries` con `status watched`; `now_watching` → `watching`; device con 2 membri → 409.
3. Sul telefono (dopo build EAS): "Ehi Siri, segna Dark come visto su Zapp" → risposta parlata e libreria aggiornata.
