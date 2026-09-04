# ZConnection — connessione automatica alle piattaforme (spec di design)

Data: 2026-09-04. Approvato in chat con l'utente: perimetro legale, companion su Fire TV,
abbinamento a codice, modalità famiglia. Spike sui metadati in corso (vedi §14).

## 1. Obiettivo

L'utente collega una volta la sua TV a Zapp e da quel momento ciò che guarda su Netflix,
Prime Video, Disney+ e NOW arriva da solo: la serie in corso è l'hero della home con il
progresso in tempo reale, gli episodi finiti si segnano da soli, i film finiti diventano
"visti". Nessuna azione manuale, nessuna credenziale delle piattaforme.

## 2. Perimetro e vincoli non negoziabili

- **Mai credenziali, cookie o sessioni delle piattaforme.** Nessuna API non ufficiale, nessuno
  scraping server-side (regola dura del progetto). Zapp non parla mai con Netflix & co.
- **Sorgente dei dati: il dispositivo dell'utente.** ZConnection è un'app Android che gira
  sulla **Fire TV** (e Android TV / Google TV / telefoni Android) e legge i metadati delle
  `MediaSession` che le app di streaming pubblicano al sistema (titolo, episodio, posizione,
  durata, stato). È lo stesso canale usato da Alexa per "pausa/riprendi" e dagli scrobbler
  musicali. Serve il permesso di sistema "accesso alle notifiche", concesso dall'utente.
- **Whitelist di app.** ZConnection processa solo i package delle piattaforme supportate
  (§9.3); ogni altra notifica o sessione è ignorata e mai trasmessa.
- **Copertura onesta.** Automatico: tutto ciò che passa da un dispositivo Android (Fire TV,
  Android TV, Chromecast con Google TV, telefoni Android). Non coperto: app native su
  iPhone/iPad, Apple TV, smart TV Samsung/LG. Per questi restano il CSV Netflix e, in
  futuro, i Comandi Rapidi iOS (fuori perimetro, §13).
- Nome prodotto: **ZConnection** (package `com.zapp.zconnection`).

## 3. Componenti

| Componente | Dove | Ruolo |
|---|---|---|
| **ZConnection** (app Kotlin) | `D:\PROGETTI\ZConnection` (repo separato) | Abbinamento, lettura MediaSession, invio eventi |
| **API ingest** | `src/app/api/devices/*`, `src/app/api/scrobble/route.ts` | Abbinamento e ricezione eventi (auth a token dispositivo) |
| **Pipeline scrobble** | `src/lib/scrobble/*` (server-only, funzioni pure dove possibile) | package→piattaforma, parsing metadati, matching TMDB, regole di progresso |
| **DB** | migrazione `0006_zconnection.sql` | `devices`, `device_members`, `pairing_codes`, `watch_sessions`, `pending_scrobbles`, RPC SECURITY DEFINER |
| **UI Zapp** | `/devices`, hero home, "Da confermare" | Gestione dispositivi, hero live, conferme |

Flusso: `ZConnection → POST /api/scrobble → pipeline (TS) → RPC scrobble_apply (SQL) →
watch_sessions / watch_entries / episode_watches / pending_scrobbles / notifications →
Realtime → home`.

## 4. Abbinamento (pairing)

Modello "login TV" (come YouTube): la TV mostra un codice, l'utente lo digita in Zapp.

1. **ZConnection, primo avvio.** Genera e salva in locale `install_id` (uuid) e
   `device_token` (32 byte casuali, base64url, prefisso `zc_`). Chiama
   `POST /api/devices/pair` con `{install_id, token_hash: sha256(device_token), name,
   platform}` (`platform` ∈ `fire_tv | android_tv | android`). Risposta: `{code, expires_at}`,
   codice a 6 cifre, valido 10 minuti. La TV mostra codice grande + QR
   (`https://<app>/devices/pair?code=482913`).
2. **Zapp (iPhone).** Profilo → Dispositivi → "Collega una TV" → campo codice (o link del
   QR precompilato). Server Action `claimPairingCode(code)` → RPC `claim_pairing_code`:
   crea `devices` se `install_id` è nuovo (copiando `token_hash`), crea `device_members`
   per l'utente, marca il codice come reclamato. Mostra "Fire TV salotto collegata".
3. **ZConnection** fa polling `GET /api/devices/pair/{code}` ogni 3 s: `pending` finché non
   reclamato, poi `{device_id, members:[{username, avatar_url}]}`. Il token **non viaggia
   mai dal server alla TV**: la TV lo ha generato, il server conosce solo l'hash.
4. **Permesso.** Schermata "Per vedere cosa guardi…" → `ACTION_NOTIFICATION_LISTENER_SETTINGS`
   (lo spike verifica che Fire OS la esponga; §14). Al ritorno, se concesso → schermata
   "Collegata", l'app va in background.
5. **Aggiungi persona (famiglia).** Dalla TV, "Aggiungi persona" → nuovo codice con lo stesso
   `install_id` e `token_hash` → un altro utente Zapp lo reclama → nuovo `device_members`.

Codici: 6 cifre, unici tra i non scaduti, mai riutilizzati entro l'ora; tentativi di claim
limitati a 10/minuto per utente (`rate-limit.ts`). Riga cancellata alla consegna o scadenza.

## 5. Protocollo eventi (heartbeat)

`POST /api/scrobble`, header `Authorization: Bearer zc_…`, body:

```json
{
  "install_id": "…",
  "sent_at": "2026-09-04T21:03:11Z",
  "events": [
    {
      "id": "uuid-evento",
      "at": "2026-09-04T21:03:10Z",
      "package": "com.netflix.ninja",
      "state": "playing",
      "position_ms": 1523000,
      "duration_ms": 3120000,
      "meta": {
        "title": "…", "subtitle": "…", "description": "…", "album": "…", "artist": "…",
        "display_title": "…", "display_subtitle": "…", "display_description": "…",
        "media_id": "…"
      },
      "extras": { "…": "solo chiavi stringa in whitelist, max 2 KB" },
      "notification": { "title": "…", "text": "…" }
    }
  ]
}
```

- `state` ∈ `playing | paused | stopped | buffering`.
- Cadenza: evento immediato a ogni transizione (play, pausa, stop, cambio metadati,
  sessione distrutta); mentre `playing`, heartbeat ogni **30 s**. Nessun evento se non
  cambia nulla e non si sta riproducendo.
- Coda offline sull'app: max 200 eventi persistiti su file, riprovati con backoff (5 s → 5 min).
  Gli eventi sono idempotenti (stato assoluto, non delta): un duplicato riapplicato non
  cambia nulla, quindi il server non tiene un registro degli `id`; l'`id` serve solo ai log.
- Risposta: `{ok: true, applied: n, ignored: n}`; `401` token sconosciuto/revocato → l'app
  torna alla schermata di abbinamento; `429` oltre 240 eventi/minuto per dispositivo.
- Limiti: body ≤ 64 KB, ≤ 50 eventi per richiesta, stringhe ≤ 512 caratteri.

## 6. Modello dati (migrazione `0006_zconnection.sql`)

```sql
create type public.device_platform as enum ('fire_tv', 'android_tv', 'android');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null unique,
  token_hash text not null unique,          -- sha256 hex del token, mai il token
  name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz                     -- nessun membro → revocato
);

create table public.device_members (
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  enabled_providers int[] not null default '{8,119,337,39}',  -- id TMDB delle piattaforme
  paused_until timestamptz,                  -- "pausa 24h"
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);

create table public.pairing_codes (
  code text primary key,                     -- 6 cifre
  install_id uuid not null,
  token_hash text not null,
  device_name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz
);

create table public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,  -- null finché non attribuita
  provider_id int not null,
  title_id bigint not null,
  media_type public.media_type not null,
  season_number int,
  episode_number int,
  state text not null check (state in ('playing', 'paused', 'stopped')),
  position_ms bigint not null default 0,
  duration_ms bigint,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (title_id, media_type) references public.titles (id, media_type)
);
create index watch_sessions_user_live_idx
  on public.watch_sessions (user_id, last_heartbeat_at desc) where ended_at is null;

create table public.pending_scrobbles (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,  -- null = "chi sta guardando?"
  reason text not null check (reason in ('ambiguous_title', 'unknown_title', 'ambiguous_user')),
  provider_id int not null,
  raw jsonb not null,                        -- meta normalizzati dell'evento
  candidates jsonb not null default '[]',    -- [{title_id, media_type, title, year, poster_path, season, episode}]
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
-- una sola pending aperta per titolo grezzo e dispositivo
create unique index pending_scrobbles_open_key_idx
  on public.pending_scrobbles (device_id, provider_id, (raw->>'key'))
  where resolved_at is null;
```

- `notifications.kind` accetta anche `'scrobble_confirm'` (payload: `pending_id`).
- `watch_sessions` entra nella publication `supabase_realtime` (RLS applicata).
- RLS: `devices` select per i membri; `device_members` select/update/delete solo la propria
  riga; `watch_sessions` e `pending_scrobbles` select per `user_id = auth.uid()` oppure, se
  `user_id is null`, per i membri del dispositivo; update di `pending_scrobbles` solo per
  risolverla (tramite Server Action). Insert/update di sessioni e voci solo dalle RPC.
- RPC (SECURITY DEFINER, `search_path = public`, come `import_watch_entries`):
  - `claim_pairing_code(code text, device_name text)` — `authenticated`.
  - `device_touch(token_hash text)` → `{device_id, members:[{user_id, enabled_providers,
    paused}], revoked}` e aggiorna `last_seen_at` — `anon` (validata dall'hash).
  - `scrobble_apply(token_hash text, batch jsonb)` — `anon` (validata dall'hash). Applica le
    regole di §7.4 e §7.5 in una transazione. Scrive `notifications` direttamente (deroga
    documentata: oggi le scrivono solo i trigger).
  - `resolve_pending_scrobble(pending_id uuid, title_id bigint, media_type media_type,
    season int, episode int)` e `dismiss_pending_scrobble(pending_id)` — `authenticated`.
- Nessun uso del service client per dati utente: le scritture per conto del dispositivo
  passano dalle RPC validate dal token. Le RPC `anon` sono le uniche con grant a `anon`;
  migrazione 0005 resta valida per il resto.
- Dopo la migrazione: `supabase gen types` (regola del progetto).

## 7. Pipeline server (`src/lib/scrobble/`)

### 7.1 `platforms.ts` — package → piattaforma
Mappa statica package Android → `provider_id` TMDB: Netflix (`com.netflix.ninja`,
`com.netflix.mediaclient`) → 8; Prime Video (`com.amazon.avod`, `com.amazon.firebat`,
`com.amazon.avod.thirdpartyclient`) → 119; Disney+ (`com.disney.disneyplus`) → 337; NOW →
39 (package confermato dallo spike). Package sconosciuto → evento ignorato (contato in
`ignored`).

### 7.2 `parse.ts` — metadati → richiesta di matching (pura)
Input: `meta`, `extras`, `notification`, `provider_id`. Output:
`{kind: 'movie'|'tv'|'unknown', title, year?, season?, episode?, episodeName?, key}`.
- Riconosce pattern `S2:E4`, `S2 E4`, `Stagione 2: Episodio 4`, `T2 E4`, `2x04`,
  `Episodio 4`, in italiano e inglese, su titolo/sottotitolo/descrizione.
- Serie senza numero ma con nome episodio → `episodeName` (risolto in 7.3).
- `key` = hash stabile di (provider, titolo, stagione, episodio) per deduplicare le pending.
- **La mappatura dei campi per piattaforma viene fissata con i dati dello spike** (§14):
  il modulo ha un adapter per provider, con test su fixture reali.

### 7.3 `match.ts` — richiesta → titolo TMDB
- Cache in `titles` prima (ricerca esatta case-insensitive su `title`/`original_title`
  con `media_type`), poi `searchMulti`/`searchTv`/`searchMovie` (`client.ts`, lingua it-IT).
- Punteggio: uguaglianza normalizzata del titolo, anno se disponibile, presenza della
  piattaforma tra i `title_providers` IT del candidato (segnale forte), popolarità.
- Esito: `auto` (un candidato nettamente sopra soglia) → `getOrFetchTitle` per cache;
  `ambiguous` (≥2 vicini) → pending `ambiguous_title` con i top 3; `none` → pending
  `unknown_title` (l'utente cerca a mano).
- Episodio: numero dal parsing; se solo `episodeName`, lookup nella stagione (`getSeason`,
  confronto nomi it/en); se irrisolvibile → sessione registrata senza episodio, nessun
  avanzamento automatico.
- Memoizzazione per `key` (10 min, in-memory) per non ricalcolare a ogni heartbeat.

### 7.4 Attribuzione (modalità famiglia, in `scrobble_apply`)
Dati i membri attivi del dispositivo (non in pausa, piattaforma abilitata):
1. Un solo membro → suo.
2. Più membri: chi ha già il titolo in `watch_entries` con status `watching` (o una
   `watch_session` sul titolo negli ultimi 30 giorni) → suo; se più d'uno, il più recente.
3. Nessuno → `pending_scrobbles(reason='ambiguous_user', user_id=null)` + una notifica
   `scrobble_confirm` a ogni membro. La sessione viene comunque registrata con
   `user_id=null` e attribuita alla risoluzione.
4. Zero membri attivi (tutti in pausa) → evento ignorato.

### 7.5 Regole di sessione e progresso (in `scrobble_apply`)
- **Sessione**: chiave (`device_id`, `provider_id`, `title_id`, `media_type`, stagione,
  episodio). Se esiste una sessione aperta con `last_heartbeat_at` < 4 h → aggiornamento
  (`state`, `position_ms`, `duration_ms`, `last_heartbeat_at`); altrimenti nuova sessione.
  Un evento su un titolo/episodio diverso chiude la sessione precedente (`ended_at`,
  regola di completamento sotto). `stopped` chiude. Un job leggero (chiamato all'inizio di
  ogni `scrobble_apply`) chiude sessioni orfane > 4 h.
- **Inizio** (prima sessione del titolo o primo evento `playing`): `watch_entries` →
  `watching` se assente, `want` o `dropped`; se `watched` (rewatch) lo stato non cambia.
  `started_at` = ora se nullo. Le serie non toccano `season/episode` all'inizio: in Zapp
  `episode_number` è l'ultimo episodio **visto**, e l'episodio in corso lo racconta la
  `watch_session` (hero "S2E4 · 43%").
- **Completamento**: un heartbeat con `position ≥ 90% duration`, oppure chiusura della
  sessione con ultima posizione ≥ 85%. Durata sconosciuta → mai completamento automatico.
  - Film → `markWatched` (status `watched`, `finished_at`); nessun voto automatico.
  - Episodio → `episode_watches` (upsert) e `watch_entries.season/episode` = max(corrente,
    questo) (mai indietro); se è l'ultimo episodio disponibile (`isLastEpisode` sulle
    stagioni di `titles.raw`) → `watched` + `finished_at` (stessa logica di `setProgress`).
- `watch_entries` viene scritta **solo** a inizio e completamento, mai a ogni heartbeat:
  così il trigger `log_watch_activity` produce un'attività per evento reale, senza rumore.
- L'undo del toast non si applica (nessuna UI che scatena); l'utente corregge dalla scheda.

## 8. Home e aggiornamento live

- `getHomeData` aggiunge `nowPlaying`: l'ultima `watch_session` dell'utente con
  `ended_at is null` e `last_heartbeat_at` ≥ ora − 6 h (join sul titolo con lo stesso
  `ENTRY_SELECT`-style). Hero = `nowPlaying` se esiste (etichetta "Adesso su Netflix ·
  S2E4 · 43%", barra di progresso live, stato pausa), altrimenti `watching[0]` come oggi.
- Componente client `LiveRefresh` (montato solo se l'utente ha almeno un dispositivo):
  sottoscrizione Supabase Realtime `postgres_changes` su `watch_sessions` filtrata per
  `user_id`, `router.refresh()` con throttle 15 s; si sospende con la pagina nascosta.
  Nessun secondo render client dell'hero: la verità resta il Server Component.
- `POST /api/scrobble` chiama `revalidatePath` su `/`, `/library`, `/profile` e la scheda
  quando cambia `watch_entries` (stessa lista di `watch/actions.ts`).

## 9. UI Zapp

### 9.1 `/devices` (da Profilo → "Dispositivi collegati")
Card per dispositivo: nome, piattaforma, "ultima attività", membri (avatar), toggle per
piattaforma (Netflix/Prime/Disney+/NOW), "Pausa 24 h" / "Riprendi", "Cancella la mia
cronologia da questo dispositivo" (elimina `watch_sessions` proprie, non le `watch_entries`),
"Scollega" (rimuove il membro; ultimo membro → revoca il token). CTA "Collega una TV" →
foglio con campo a 6 cifre + istruzioni (Amazon Appstore → ZConnection → codice).
Stile: vocabolario "Cinema" (card `rounded-[20px] bg-surface`, campi `bg-surface-2`).

### 9.2 "Da confermare"
- Sezione in home sopra "In corso" (solo se ci sono pending) e in `/library`: card con
  titolo grezzo, piattaforma, ora, e — per `ambiguous_title` — i 3 candidati con
  locandina; per `unknown_title` un campo di ricerca; per `ambiguous_user` "Sei tu?".
  Un tap risolve (`resolve_pending_scrobble`, che attribuisce la sessione e riapplica §7.5)
  o scarta.
- Notifica in-app `scrobble_confirm` nella campanella. Web push: fuori perimetro (§13).

### 9.3 Piattaforme supportate al lancio
Netflix, Prime Video, Disney+, NOW. Apple TV+, Paramount+, RaiPlay & co. si aggiungono
con una riga in `platforms.ts` dopo verifica dei metadati.

## 10. App ZConnection

- **Stack**: Kotlin, SDK 34, `minSdk 22` (Fire OS 5), zero dipendenze esterne (UI con
  view di sistema, rete con `HttpsURLConnection`, JSON con `org.json`). Leanback launcher
  + launcher normale. Landscape, navigazione a D-pad.
- **Schermate**: `Pairing` (codice + QR + "codice nuovo"), `Permission` (spiegazione +
  bottone impostazioni + stato), `Connected` (membri, ultimo evento inviato, "Aggiungi
  persona", "Scollega questa TV", versione). Stile: nero, viola `#8b5cf6`, Inter di sistema.
- **Servizio**: `NotificationListenerService` (già nel probe) → `SessionProbe` →
  `EventBuilder` (whitelist package, normalizzazione campi) → `EventQueue` (file, max 200)
  → `Sender` (batch ≤ 50, backoff). Heartbeat 30 s con `Handler`. Fire OS mantiene il
  listener legato finché il permesso resta; dopo il riavvio riparte da solo.
- **Archiviazione**: `install_id`, `device_token`, `base_url` in `SharedPreferences`
  privati (`MODE_PRIVATE`, sandbox app). Nessun dato di visione persistito oltre la coda.
- **Configurazione**: `base_url` di produzione compilata; build `debug` accetta un URL
  locale per test (`adb shell am start … --es base_url http://192.168.x.y:3000`).
- **Distribuzione**: Amazon Appstore (Fire TV) e Google Play (Android TV/telefoni). Fino
  all'approvazione: APK firmato scaricabile da Zapp (`/devices` mostra il link, con
  istruzioni Downloader). Il probe attuale resta usa-e-getta: il prodotto ricomincia
  dall'architettura sopra riusando `SessionProbe`.

## 11. Privacy e sicurezza

- Dati raccolti: piattaforma, titolo/episodio, posizione/durata, stato, orario, dispositivo.
  Mai credenziali, mai notifiche di altre app, mai screenshot. Testo informativo in `/devices`
  e nella privacy policy.
- Token dispositivo: solo hash nel DB; revoca immediata da Zapp; `401` → la TV dimentica il
  token. Codici di abbinamento a scadenza breve, claim rate-limited.
- Rate limit per token (`rate-limit.ts`): 240 eventi/min; body e stringhe limitati; package
  fuori whitelist scartati anche lato server.
- Cancellazione: "Cancella cronologia" per dispositivo; l'eliminazione dell'account
  cascade su tutte le tabelle nuove.
- CSP: nessun nuovo origin (le API sono same-origin; l'app parla solo con Zapp).

## 12. Gestione errori

- TMDB giù: `match.ts` usa solo la cache `titles`; se non basta → pending `unknown_title`
  (mai perdere l'evento). `getOrFetchTitle` già ripiega sulla cache stale.
- Sessione per titolo senza `titles` in cache → `getOrFetchTitle` prima della RPC (la FK lo
  richiede).
- Heartbeat duplicati o fuori ordine: `scrobble_apply` accetta solo `at` ≥ ultimo
  heartbeat della sessione; posizione che torna indietro (rewind) è normale e accettata.
- App: coda piena → scarta i più vecchi; rete assente → backoff; permesso revocato →
  schermata `Permission`.

## 13. Fuori perimetro (fasi successive, non in questa spec)

Estensione browser desktop (stesso ingest, `platform='browser_ext'`), Comandi Rapidi iOS,
web push, lettura Cast su rete locale, rilevamento profilo Netflix (solo se lo spike trova
un indizio), attribuzione per profilo Netflix, undo dal toast per eventi automatici.

## 14. Spike in corso: cosa deve confermare

Probe già compilato (`D:\PROGETTI\ZConnection`, activity diagnostica + listener) da
eseguire sulla Fire TV di un amico sulla rete locale. Chiude queste domande, che aggiornano
§7.2 e §4:
1. Campi `MediaMetadata`/extras/notifica esposti da Netflix, Prime Video, Disney+, NOW su
   Fire OS (titolo serie vs nome episodio, numero episodio, durata, posizione).
2. Package esatto di NOW e di Prime Video su Fire OS.
3. Se Fire OS apre `ACTION_NOTIFICATION_LISTENER_SETTINGS` per app di terze parti; in caso
   contrario, quale percorso resta per l'utente finale (rischio principale del progetto).
4. Stabilità del listener in background e dopo il riavvio della stick.
5. Eventuale indizio del profilo attivo nei metadati.

## 15. Fasi di consegna

0. **Spike** (in corso) → aggiorna questa spec con le mappature reali.
1. **Un utente, una TV**: migrazione 0006 + tipi, pairing, ingest, pipeline, hero live,
   `/devices` minimale, ZConnection prodotto (Pairing/Permission/Connected), sideload.
2. **Famiglia**: attribuzione, "Da confermare", notifiche, toggle e pausa.
3. **Store**: Amazon Appstore / Google Play, testi privacy.

## 16. Verifica

- Zapp: `pnpm typecheck && pnpm lint && pnpm build`; **nuovo** `pnpm test` (vitest) limitato
  a `src/lib/scrobble/*` con fixture reali dallo spike: parsing per piattaforma, decisione
  di matching, regole di completamento (funzioni pure, senza DB).
- End-to-end manuale su Fire TV: abbinamento, Netflix 1 episodio (inizio → hero → fine →
  episodio segnato), film Prime fino ai titoli di coda, pausa/riprendi, riavvio stick,
  revoca da Zapp → TV torna al codice.
