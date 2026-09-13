# Zapp TV (API per le app native)

Spec: `docs/superpowers/specs/2026-09-12-zapp-tv-design.md`. Le app: repo `D:\PROGETTI\ZappTV`.

## Contratto

- `src/lib/tv/dto.ts` e' l'unica fonte; Kotlin e Swift lo copiano a mano con il commit in
  testa. Cambi qui = cambi nelle due copie nello stesso giro.
- Ogni rotta annota la propria risposta col tipo del DTO (`const body: HomeResponse = ...;
return tvJson(body)`), non un oggetto letterale libero: cosi' il typecheck fallisce da
  solo quando la forma si allontana dal contratto.
- Rotte (`/api/tv/v1`, tutte con bearer salvo dove indicato; `Cache-Control: private, no-store`
  via `tvJson`):

| Metodo e rotta                              | Cosa ritorna                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /home`                                 | `HomeResponse` (`{ continue: ContinueCard[], hero: HeroCard[], shelves: ShelfRef[] }`)         |
| `GET /home/shelf/{key}`                     | `ShelfResponse` (`{ key, items: TitleCard[] }`) per una chiave di scaffale                     |
| `GET /library?status=&type=&offset=&limit=` | `LibraryPage` (limite massimo 60)                                                              |
| `GET /search?q=`                            | `SearchResponse` (`{ results: TitleCard[] }`)                                                  |
| `GET /title/{movie\|tv}/{id}`               | `TitleDetail`                                                                                  |
| `GET /title/tv/{id}/season/{n}`             | `SeasonDetail`                                                                                 |
| `POST /watch`                               | `{titleId, mediaType, action, season?, episode?, rating?}` -> `WatchResult`                    |
| `POST /play`                                | `{titleId, mediaType, providerId, season?, episode?}` -> `LaunchPlan`, scrive la dichiarazione |
| `POST /play/result`                         | `{commandId, result}` -> `{ok:true}`                                                           |
| `GET /me`                                   | `MeResponse` (`{ user, device, listening, tmdbAttribution }`)                                  |
| `GET /providers`                            | `ProvidersResponse` (`{ providers: ProviderInfo[] }`)                                          |
| `POST /auth/refresh` (no bearer)            | `{refresh_token}` -> `{session: Session}`                                                      |
| `POST /auth/signout`                        | `{ok:true}`, revoca                                                                            |

- Immagini: percorsi TMDB (`posterPath`, `backdropPath`, ...); la TV compone
  `https://image.tmdb.org/t/p/<size><path>`.

## Sessione

- Coniata nel poll dell'abbinamento (`coniaSessione`): `generateLink` + `verifyOtp`, mai
  salvata sul server.
- `withBearer`: firma locale del JWT (`getClaims`), tetto 300/min per utente,
  `X-Zapp-Device` obbligatorio; dispositivo non membro = 410 `device_revoked`.
- Il ponte: `AsyncLocalStorage` in `src/lib/supabase/request-session.ts`; `createClient()`
  e `getViewer()` lo leggono. **Trappola**: React `cache()` non memoizza fuori da un
  render, quindi in una rotta `getViewer()` puo' essere chiamato N volte: e' gratis (legge
  il contesto), ma i loader `cache(...)` del sito (hero, rails) ricalcolano se chiamati due
  volte nella stessa rotta — chiamarli una volta e passare il risultato.

## Home

- `/home` = continua + hero + manifesto; gli scaffali si caricano uno alla volta con
  `/home/shelf/{key}` (funzione Vercel, piano Hobby: una sola risposta grande costerebbe
  troppo tempo di esecuzione).
- Le chiavi degli scaffali sono in due famiglie: fisse (`foryou`, `topten`, `want`,
  `toprated`, `comingsoon`, `platform:<id>`) e le rail del motore, `<dimensione>|<chiave>`
  (`persone|...`, `generi|...`, `decenni|...`), dove la chiave dopo il `|` e' opaca e puo'
  contenere `:` e spazi (es. `persone|Regia:Denis Villeneuve`). L'ordine viene da
  `manifest.ts`, che rispecchia `page.tsx` del sito senza cinema/amici/saghe.

## Play e dichiarazione

- `/play` scrive una riga di `device_commands` gia' consegnata (`delivered_at = now()`);
  le regole che decidono se un evento successivo dello scrobble puo' ancora usare quella
  dichiarazione (finestre, riavvolgimenti, continuita') sono in
  `src/lib/scrobble/declared.ts` (`dichiarazioneValida`) e documentate in
  `docs/architecture/zconnection.md` ("La dichiarazione: dare un titolo alle sessioni
  anonime"); l'ingest di `/api/scrobble` la consuma per Netflix e Prime. Cosa NON fa:
  dedurre l'episodio di una serie dal ritorno a zero della posizione (fuori da questa
  fase, spec ZConnection §5.4).
- `PROVIDER_LANCIABILI` (`src/lib/devices/launch.ts`) = Netflix (8), Prime Video (119),
  Disney+ (337). **NOW (39) non si lancia**: misurato sul televisore il 13/09
  (`docs/architecture/zconnection.md`, "Il lancio dalla scheda titolo") — l'app espone
  solo l'activity di avvio, nessun filtro `VIEW`. `/play` risponde 409 per un
  `providerId` fuori da quella lista, prima ancora di risolvere il link.
- tvOS: `LaunchPlan.tvos` resta nullo fino alla sonda su Apple TV (fase C).

## Collaudo

- `scripts/tv-session.mjs <user_id>` -> stampa `ACCESS`/`REFRESH`/`DEVICE`/`DEVICE_TOKEN`
  per un dispositivo di prova; `scripts/tv-session.mjs --pulisci <DEVICE>` lo cancella
  (cascata su `device_members`/`device_commands`, non serve toccarle a mano).
- Istanza: `NEXT_DIST_DIR=.next-tv pnpm build && NEXT_DIST_DIR=.next-tv pnpm exec next start -p 3400`
  (adattare la porta se occupata da un'altra sessione).
- Esempi (con `$ACCESS`, `$DEVICE` dallo script sopra):

```bash
curl -s http://localhost:3400/api/tv/v1/me -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
curl -s http://localhost:3400/api/tv/v1/home -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
curl -s "http://localhost:3400/api/tv/v1/home/shelf/$(node -e 'console.log(encodeURIComponent("persone|Regia:Denis Villeneuve"))')" \
  -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
curl -s "http://localhost:3400/api/tv/v1/search?q=dune" -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
curl -s http://localhost:3400/api/tv/v1/title/tv/1399 -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
curl -s -X POST http://localhost:3400/api/tv/v1/play -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" \
  -H "Content-Type: application/json" -d '{"titleId":66732,"mediaType":"tv","providerId":8}'
```

Le chiavi degli scaffali (`persone|...`, `generi|...`, `decenni|...`) vanno sempre
codificate con `encodeURIComponent` prima di entrare nel percorso: contengono `:` e `|`.

## Trappole trovate in fase A

- Le chiavi delle rail sono `<dimensione>|<chiave>` (non `<chiave>|<dimensione>`) e vanno
  URL-encoded: la chiave dopo il `|` e' opaca e puo' contenere `:` e spazi
  (`persone|Regia:Denis Villeneuve`).
- I campi di `withScores` (`src/lib/ratings/cards.ts`) sono `zappScore`/`zappVotes`, non
  `score`/`votes`: quelli sono i nomi delle colonne sorgente, non del DTO.
- `SearchItem.votes` (`src/lib/search/instant.ts`) si imposta **solo** quando esiste uno
  ZappScore (`riga?.score != null`): senza voto ZappScore, `votes` resta quello di default
  (voti TMDB), non zero.
- Il poll dell'abbinamento (`src/app/api/devices/pair/[code]/route.ts`) consuma la riga di
  `pairing_codes` in un `delete().select()` atomico **prima** di coniare la sessione
  (single-flight: due poll sovrapposti non coniano due sessioni) e la **reinserisce** se il
  conio fallisce, cosi' il codice resta valido per il prossimo tentativo.
- `device_commands` la scrive **solo il service client**: `0048_device_commands_solo_dal_server.sql`
  ha tolto insert/update/delete ad `authenticated` (resta la sola select), perche' PostgREST
  esponeva la tabella a chiunque avesse la sessione — bastava forgiare a mano una
  dichiarazione per un `title_id` qualsiasi. `/play` e `/play/result` scrivono quindi con
  `createServiceClient()`; il controllo di proprieta' non e' piu' una policy ma il codice
  della rotta (`withBearer` per l'appartenenza al dispositivo, `.eq("device_id", ...)` per
  l'update). Le migration del pairing/comandi tengono i nomi del ramo `feat/zconnection-tv`:
  `0045_tv_pairing`, `0046_device_commands`, `0047_device_commands_indice`.
  `0051_device_platform_tvos` e `0052_device_commands_update` (il grant di update per
  colonna qui sopra) vengono da questo ramo (`feat/tv-api`) e sono state applicate sul DB
  **prima** di `0048`, che arriva dall'altro ramo e ne supera i grant — nel repository
  unito la sequenza dei numeri non e' la cronologia reale.
- Un guasto TMDB sulla rotta della stagione e' un 502 (`Non è riuscito, riprova.`); un 404
  vero di TMDB (stagione inesistente) resta un 404 (`Stagione non trovata`). Il codice
  distingue guardando il messaggio d'errore (`TMDB \d+`), non lo stato HTTP di TMDB
  direttamente.
- Un film dichiarato dal Play si completa con `titles.runtime` (minuti, convertito in ms):
  Netflix e Prime non pubblicano mai una durata nei metadati che leggono i listener.
- `parseShelfKey` (`src/lib/tv/shelf-key.ts`) usa una `Map` per le chiavi fisse apposta per
  non accettare chiavi del prototipo (`toString`, `constructor`, ...) che un accesso diretto
  su un oggetto letterale avrebbe restituito.

## Differenze osservate fra il piano e il codice vero

- La spec (§5.2) elencava `because:{id}:{type}` e uno scaffale `saga`: il codice vero usa
  `because:{type}:{id}` (verificato coi curl: `because:movie:550`) e non ha `saga` in v1;
  la spec e' stata corretta di conseguenza.
- Il refresh token di Supabase è corto (12 caratteri, es. `kcz2dgr2c45o`), diverso dal
  JWT access token. Il controllo di lunghezza in `/api/tv/v1/auth/refresh` è `8..500`
  per accettare token brevi e restare futuro-proof; `refreshSession` di Supabase
  rifiuta un token invalido a livello proprio con un 401.

## Cosa resta aperto

- `/home/shelf/{key}` per una rail esegue il motore quattro volte (`getHomeRails`
  movie+tv, ciascuna con `getRankedForYou` movie+tv): da misurare sulla Fire TV in fase
  B prima di scegliere fra `unstable_cache` per (utente, tipo) e una chiamata unica a
  `getRails`.
