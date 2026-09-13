# Zapp TV (API per le app native)

Spec: `docs/superpowers/specs/2026-09-12-zapp-tv-design.md`. Le app: repo `D:\PROGETTI\ZappTV`.

## Contratto

- `src/lib/tv/dto.ts` e' l'unica fonte; Kotlin e Swift lo copiano a mano con il commit in
  testa. Cambi qui = cambi nelle due copie nello stesso giro.
- Rotte (`/api/tv/v1`, tutte con bearer salvo dove indicato; `Cache-Control: private, no-store`
  via `tvJson`):

| Metodo e rotta                              | Cosa ritorna                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /home`                                 | `{ continue: ContinueCard[], hero: HeroCard[], shelves: ShelfRef[] }`                          |
| `GET /home/shelf/{key}`                     | `{ items: TitleCard[] }` per una chiave di scaffale                                            |
| `GET /library?status=&type=&offset=&limit=` | `LibraryPage` (limite massimo 60)                                                              |
| `GET /search?q=`                            | `{ results: TitleCard[] }`                                                                     |
| `GET /title/{movie\|tv}/{id}`               | `TitleDetail`                                                                                  |
| `GET /title/tv/{id}/season/{n}`             | `SeasonDetail`                                                                                 |
| `POST /watch`                               | `{titleId, mediaType, action, season?, episode?, rating?}` -> `ActionResult`                   |
| `POST /play`                                | `{titleId, mediaType, providerId, season?, episode?}` -> `LaunchPlan`, scrive la dichiarazione |
| `POST /play/result`                         | `{commandId, result}` -> `{ok:true}`                                                           |
| `GET /me`                                   | `{ user, device, listening, tmdbAttribution }`                                                 |
| `GET /providers`                            | `{ providers: ProviderInfo[] }`                                                                |
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
  `src/lib/scrobble/declared.ts` (`dichiarazioneValida`, finestra `FINESTRA_MS` = 30 minuti
  dall'ultimo evento attribuito o dalla consegna) decide se un evento successivo dello
  scrobble puo' ancora usarla; l'ingest di `/api/scrobble` la consuma per Netflix e Prime
  (Task 13). Cosa NON fa: dedurre l'episodio di una serie dal ritorno a zero della
  posizione (fuori da questa fase, spec ZConnection §5.4).
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
- I grant di update su `device_commands` sono per colonna: la TV puo' scrivere solo
  `result` (`/play/result`), l'ingest dello scrobble solo `last_position_ms`/`last_seen_at`
  (Task 13) — non un update libero della riga.
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
- `POST /api/tv/v1/auth/refresh` valida il refresh token con `refreshToken.length < 20` come
  requisito minimo, ma il refresh token che Supabase conia davvero in questo progetto e'
  lungo 12 caratteri (es. `kcz2dgr2c45o`): la richiesta di collaudo con un token appena
  coniato da `coniaSessione`/`scripts/tv-session.mjs` viene rifiutata con 400 "Richiesta non
  valida" **prima** di arrivare a `rinnovaSessione`. Non corretto in questa fase (la
  correzione del codice non e' compito del collaudo): da sistemare abbassando la soglia o
  togliendola, visto che `refreshSession` di Supabase gia' rifiuta un token invalido con un
  401 proprio.
